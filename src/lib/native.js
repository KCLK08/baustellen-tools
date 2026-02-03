import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

export function isNativePlatform() {
  return Capacitor.isNativePlatform();
}

export async function saveXlsxToFiles({ filename, base64Data }) {
  const result = await Filesystem.writeFile({
    path: filename,
    data: base64Data,
    directory: Directory.Documents
  });
  return result.uri;
}

export async function shareXlsx({ filename, base64Data }) {
  const uri = await saveXlsxToFiles({ filename, base64Data });
  await Share.share({
    title: filename,
    text: 'Baustellen-Protokoll',
    url: uri,
    dialogTitle: 'Protokoll teilen'
  });
}

export function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function getXlsxMime() {
  return XLSX_MIME;
}
