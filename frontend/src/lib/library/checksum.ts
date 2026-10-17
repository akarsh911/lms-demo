export function isDigestible(): boolean {
  return typeof crypto !== 'undefined' && crypto.subtle !== undefined;
}

export async function sha256Hex(file: Blob): Promise<string> {
  if (!isDigestible()) {
    throw new Error(
      'This browser will not compute a checksum on an insecure connection, and ' +
        'the file store will not accept an upload without one.',
    );
  }
  const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function fileSizeLine(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
