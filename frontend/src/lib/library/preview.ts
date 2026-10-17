export type PreviewKind = 'pdf' | 'image' | 'none';

const IMAGE_EXTENSIONS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'avif',
  'bmp',
  'svg',
]);

const PDF_TYPES = new Set(['application/pdf', 'application/x-pdf']);

function extensionOf(fileName: string | undefined): string {
  if (!fileName) return '';
  const dot = fileName.lastIndexOf('.');
  if (dot < 0 || dot === fileName.length - 1) return '';
  return fileName.slice(dot + 1).toLowerCase();
}

function kindFromMime(mimeType: string): PreviewKind {
  const type = (mimeType.split(';')[0] ?? '').trim().toLowerCase();
  if (PDF_TYPES.has(type)) return 'pdf';
  if (type.startsWith('image/')) return 'image';
  return 'none';
}

export function isPdfFileName(fileName: string | undefined): boolean {
  return extensionOf(fileName) === 'pdf';
}

function kindFromName(fileName: string | undefined): PreviewKind {
  if (isPdfFileName(fileName)) return 'pdf';
  if (IMAGE_EXTENSIONS.has(extensionOf(fileName))) return 'image';
  return 'none';
}

export function previewKindFor(asset: {
  mime_type?: string;
  file_name?: string;
  status?: string;
}): PreviewKind {
  if (asset.status !== 'ready') return 'none';
  const declared = asset.mime_type ? kindFromMime(asset.mime_type) : 'none';
  if (declared !== 'none') return declared;
  return kindFromName(asset.file_name);
}
