import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir, platform } from 'node:os';
import { join } from 'node:path';

// wl-copy / xclip / xsel fork a background process that owns the selection.
// If it inherits our stdout/stderr pipes, execFileSync blocks until the
// selection is replaced. Only feed stdin; discard output.
const WRITE_STDIO: ['pipe', 'ignore', 'ignore'] = ['pipe', 'ignore', 'ignore'];

// Images come back hex/base64-encoded from osascript/PowerShell; allow large output
const MAX_BUFFER = 512 * 1024 * 1024;

// PowerShell defaults to the OEM codepage on stdio; force UTF-8 both ways.
const PS_UTF8 = '[Console]::InputEncoding=[Text.Encoding]::UTF8;[Console]::OutputEncoding=[Text.Encoding]::UTF8;';
// System.Windows.Forms.Clipboard needs an STA thread (-STA is the default on Windows PowerShell 5,
// but pwsh 7 defaults to MTA, so pass it explicitly).
const PS_FORMS = 'Add-Type -AssemblyName System.Windows.Forms;Add-Type -AssemblyName System.Drawing;';

const whichCache = new Map<string, boolean>();

function which(cmd: string): boolean {
  const cached = whichCache.get(cmd);
  if (cached !== undefined) return cached;
  let found: boolean;
  try {
    execFileSync('which', [cmd], { stdio: 'pipe' });
    found = true;
  } catch {
    found = false;
  }
  whichCache.set(cmd, found);
  return found;
}

type Backend = 'wayland' | 'xclip' | 'xsel' | 'macos' | 'windows';

function backend(): Backend {
  const os = platform();
  if (os === 'linux') {
    if (process.env.WAYLAND_DISPLAY && which('wl-paste')) return 'wayland';
    if (which('xclip')) return 'xclip';
    if (which('xsel')) return 'xsel';
    throw new Error('No clipboard tool found. Install wl-clipboard (Wayland) or xclip (X11).');
  }
  if (os === 'darwin') return 'macos';
  if (os === 'win32') return 'windows';
  throw new Error(`Unsupported platform: ${os}`);
}

function powershell(script: string, input?: string): string {
  return execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-STA', '-Command', script], {
    encoding: 'utf8',
    input,
    maxBuffer: MAX_BUFFER,
    stdio: ['pipe', 'pipe', 'ignore'],
    windowsHide: true,
  });
}

function osascript(script: string): string {
  return execFileSync('osascript', ['-e', script], { encoding: 'utf8', maxBuffer: MAX_BUFFER, stdio: ['ignore', 'pipe', 'ignore'] });
}

// ── Text ──

export function readClipboardText(): string {
  switch (backend()) {
    case 'wayland':
      return execFileSync('wl-paste', ['--no-newline'], { encoding: 'utf8', maxBuffer: MAX_BUFFER });
    case 'xclip':
      return execFileSync('xclip', ['-selection', 'clipboard', '-o'], { encoding: 'utf8', maxBuffer: MAX_BUFFER });
    case 'xsel':
      return execFileSync('xsel', ['--clipboard', '--output'], { encoding: 'utf8', maxBuffer: MAX_BUFFER });
    case 'macos':
      return execFileSync('pbpaste', { encoding: 'utf8', maxBuffer: MAX_BUFFER, env: { ...process.env, LANG: 'en_US.UTF-8' } });
    case 'windows': {
      const out = powershell(`${PS_UTF8}Get-Clipboard -Raw`);
      // Console output appends a trailing CRLF
      return out.replace(/\r?\n$/, '');
    }
  }
}

export function writeClipboardText(text: string): void {
  switch (backend()) {
    case 'wayland':
      execFileSync('wl-copy', { input: text, stdio: WRITE_STDIO });
      return;
    case 'xclip':
      execFileSync('xclip', ['-selection', 'clipboard'], { input: text, stdio: WRITE_STDIO });
      return;
    case 'xsel':
      execFileSync('xsel', ['--clipboard', '--input'], { input: text, stdio: WRITE_STDIO });
      return;
    case 'macos':
      execFileSync('pbcopy', { input: text, stdio: WRITE_STDIO, env: { ...process.env, LANG: 'en_US.UTF-8' } });
      return;
    case 'windows':
      // Pass text via stdin: no quoting pitfalls, no command-line length limit
      powershell(`${PS_UTF8}Set-Clipboard -Value ([Console]::In.ReadToEnd())`, text);
      return;
  }
}

// ── Types ──

const TEXT_TYPES = ['text/plain', 'text/plain;charset=utf-8', 'UTF8_STRING', 'STRING', 'TEXT'];

/**
 * MIME types currently on the clipboard. Non-MIME targets (X11 atoms such as
 * UTF8_STRING) are normalised so callers only need to check `image/*` and `text/plain`.
 */
export function clipboardMimeTypes(): string[] {
  try {
    switch (backend()) {
      case 'wayland': {
        const out = execFileSync('wl-paste', ['--list-types'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        return normaliseTypes(out.trim().split('\n').filter(Boolean));
      }
      case 'xclip': {
        const out = execFileSync('xclip', ['-selection', 'clipboard', '-t', 'TARGETS', '-o'], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'ignore'],
        });
        return normaliseTypes(out.trim().split('\n').filter(Boolean));
      }
      case 'xsel':
        // xsel can't list targets or handle images
        return ['text/plain'];
      case 'macos': {
        // e.g. "«class PNGf», 1234, «class TIFF», 5678, «class utf8», 5, string, 5"
        const info = osascript('clipboard info');
        const types: string[] = [];
        if (/PNGf|TIFF|JPEG|GIFf/.test(info)) types.push('image/png');
        if (/utf8|ut16|\bstring\b|Unicode text/i.test(info)) types.push('text/plain');
        return types;
      }
      case 'windows': {
        const out = powershell(
          `${PS_FORMS}$t=@();if([Windows.Forms.Clipboard]::ContainsImage()){$t+='image/png'};` +
          `if([Windows.Forms.Clipboard]::ContainsText()){$t+='text/plain'};$t -join [char]10`,
        );
        return out.trim().split('\n').map((s) => s.trim()).filter(Boolean);
      }
    }
  } catch {
    return [];
  }
}

function normaliseTypes(types: string[]): string[] {
  const out = types.filter((t) => t.includes('/'));
  if (types.some((t) => TEXT_TYPES.includes(t) || t.startsWith('text/plain'))) out.push('text/plain');
  return [...new Set(out)];
}

/** Check if clipboard contains an image */
export function clipboardHasImage(): boolean {
  return clipboardMimeTypes().some((t) => t.startsWith('image/'));
}

// ── Images ──

const PREFERRED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

function pickImageType(types: string[]): string {
  const mime = PREFERRED_IMAGE_TYPES.find((p) => types.includes(p)) || types.find((t) => t.startsWith('image/'));
  if (!mime) throw new Error('No image in clipboard');
  return mime;
}

/** Read image from clipboard as Buffer. Returns { data, mimeType } */
export function readClipboardImage(): { data: Buffer; mimeType: string } {
  switch (backend()) {
    case 'wayland': {
      const mime = pickImageType(clipboardMimeTypes());
      return { data: execFileSync('wl-paste', ['-t', mime], { maxBuffer: MAX_BUFFER }), mimeType: mime };
    }
    case 'xclip': {
      const mime = pickImageType(clipboardMimeTypes());
      return {
        data: execFileSync('xclip', ['-selection', 'clipboard', '-t', mime, '-o'], { maxBuffer: MAX_BUFFER }),
        mimeType: mime,
      };
    }
    case 'xsel':
      throw new Error('xsel does not support images — install xclip');
    case 'macos': {
      // AppleScript coerces TIFF/JPEG clipboard contents to PNG; output looks like «data PNGf89504E47...»
      const out = osascript('the clipboard as «class PNGf»');
      const hex = /«data PNGf([0-9A-Fa-f]*)»/.exec(out)?.[1];
      if (!hex) throw new Error('No image in clipboard');
      return { data: Buffer.from(hex, 'hex'), mimeType: 'image/png' };
    }
    case 'windows': {
      // GetImage() returns a GDI+ bitmap; always re-encoded as PNG
      const b64 = powershell(
        `${PS_FORMS}$img=[Windows.Forms.Clipboard]::GetImage();if($img){$ms=New-Object IO.MemoryStream;` +
        `$img.Save($ms,[Drawing.Imaging.ImageFormat]::Png);[Console]::Out.Write([Convert]::ToBase64String($ms.ToArray()))}`,
      ).trim();
      if (!b64) throw new Error('No image in clipboard');
      return { data: Buffer.from(b64, 'base64'), mimeType: 'image/png' };
    }
  }
}

// AppleScript clipboard classes for the formats macOS can hold natively
const MAC_IMAGE_CLASS: Record<string, string> = {
  'image/png': 'PNGf',
  'image/jpeg': 'JPEG',
  'image/gif': 'GIFf',
  'image/tiff': 'TIFF',
};

/**
 * Write image to clipboard.
 * Limits: macOS supports PNG/JPEG/GIF/TIFF only; Windows decodes via GDI+
 * (PNG/JPEG/GIF/BMP — not WebP/SVG) and stores a bitmap, so the format is not preserved.
 */
export function writeClipboardImage(data: Buffer, mimeType: string): void {
  switch (backend()) {
    case 'wayland':
      execFileSync('wl-copy', ['-t', mimeType], { input: data, stdio: WRITE_STDIO });
      return;
    case 'xclip':
      execFileSync('xclip', ['-selection', 'clipboard', '-t', mimeType, '-i'], { input: data, stdio: WRITE_STDIO });
      return;
    case 'xsel':
      throw new Error('xsel does not support images — install xclip');
    case 'macos': {
      const cls = MAC_IMAGE_CLASS[mimeType];
      if (!cls) throw new Error(`macOS clipboard cannot hold ${mimeType}`);
      const dir = mkdtempSync(join(tmpdir(), 'lan-paste-'));
      const file = join(dir, 'clip');
      try {
        writeFileSync(file, data);
        osascript(`set the clipboard to (read (POSIX file "${file}") as «class ${cls}»)`);
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
      return;
    }
    case 'windows':
      powershell(
        `${PS_FORMS}$b=[Convert]::FromBase64String([Console]::In.ReadToEnd());$ms=New-Object IO.MemoryStream(,$b);` +
        `[Windows.Forms.Clipboard]::SetImage([Drawing.Image]::FromStream($ms))`,
        data.toString('base64'),
      );
      return;
  }
}

