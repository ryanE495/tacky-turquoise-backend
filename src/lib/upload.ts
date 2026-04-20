// Shared upload helpers for product images.
const EXT_RE = /\.([a-z0-9]+)$/i;

export function inferExt(file: File): string {
  const m = file.name.match(EXT_RE);
  if (m) return m[1].toLowerCase();
  switch (file.type) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'image/gif':
      return 'gif';
    case 'image/avif':
      return 'avif';
    default:
      return 'bin';
  }
}

export const MAX_BYTES = 10 * 1024 * 1024;
export const MAX_SLOT_INDEX = 4;

export function isValidSlot(n: unknown): n is number {
  return Number.isInteger(n) && (n as number) >= 0 && (n as number) <= MAX_SLOT_INDEX;
}

export function isUuid(v: unknown): v is string {
  return typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}
