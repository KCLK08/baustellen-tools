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

export async function bufferToBase64(buffer) {
  const blob = new Blob([buffer], { type: 'application/octet-stream' });
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const commaIndex = dataUrl.indexOf(',');
      if (commaIndex === -1) {
        reject(new Error('Base64-Konvertierung fehlgeschlagen.'));
        return;
      }
      resolve(dataUrl.slice(commaIndex + 1));
    };
    reader.onerror = () => reject(reader.error || new Error('Base64-Konvertierung fehlgeschlagen.'));
    reader.readAsDataURL(blob);
  });
}

export function getXlsxMime() {
  return XLSX_MIME;
}
