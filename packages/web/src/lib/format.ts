export function timeAgo(iso: string, now: number): string {
  const seconds = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

export function timeUntil(iso: string, now: number): string {
  const seconds = Math.floor((new Date(iso).getTime() - now) / 1000);
  if (seconds <= 0) return 'now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `${hours}h`;
  return `${Math.round(hours / 24)}d`;
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}M`;
}

export function fileIcon(mime: string): string {
  if (mime.startsWith('image/')) return '🖼️';
  if (mime.startsWith('video/')) return '🎬';
  if (mime.startsWith('audio/')) return '🎵';
  if (mime === 'application/pdf') return '📕';
  if (/zip|tar|gzip|7z|rar|compressed/.test(mime)) return '📦';
  if (mime.startsWith('text/') || /json|xml|javascript/.test(mime)) return '📝';
  return '📄';
}

export function platformIcon(platform: string): string {
  switch (platform) {
    case 'ios': return '📱';
    case 'android': return '🤖';
    case 'windows': return '🪟';
    case 'macos': return '🍎';
    case 'linux': return '🐧';
    default: return '🌐';
  }
}
