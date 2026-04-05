import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';

function which(cmd: string): boolean {
  try {
    execFileSync('which', [cmd], { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function readClipboardText(): string {
  const os = platform();
  if (os === 'linux') {
    if (process.env.WAYLAND_DISPLAY && which('wl-paste')) {
      return execFileSync('wl-paste', ['--no-newline'], { encoding: 'utf8' });
    }
    if (which('xclip')) {
      return execFileSync('xclip', ['-selection', 'clipboard', '-o'], { encoding: 'utf8' });
    }
    if (which('xsel')) {
      return execFileSync('xsel', ['--clipboard', '--output'], { encoding: 'utf8' });
    }
    throw new Error('No clipboard tool found. Install wl-clipboard or xclip.');
  }
  if (os === 'darwin') {
    return execFileSync('pbpaste', { encoding: 'utf8' });
  }
  if (os === 'win32') {
    return execFileSync('powershell.exe', ['-Command', 'Get-Clipboard'], { encoding: 'utf8' }).trimEnd();
  }
  throw new Error(`Unsupported platform: ${os}`);
}

export function writeClipboardText(text: string): void {
  const os = platform();
  if (os === 'linux') {
    if (process.env.WAYLAND_DISPLAY && which('wl-copy')) {
      execFileSync('wl-copy', { input: text });
      return;
    }
    if (which('xclip')) {
      execFileSync('xclip', ['-selection', 'clipboard'], { input: text });
      return;
    }
    if (which('xsel')) {
      execFileSync('xsel', ['--clipboard', '--input'], { input: text });
      return;
    }
    throw new Error('No clipboard tool found. Install wl-clipboard or xclip.');
  }
  if (os === 'darwin') {
    execFileSync('pbcopy', { input: text });
    return;
  }
  if (os === 'win32') {
    execFileSync('powershell.exe', ['-Command', `Set-Clipboard -Value '${text.replace(/'/g, "''")}'`]);
    return;
  }
  throw new Error(`Unsupported platform: ${os}`);
}
