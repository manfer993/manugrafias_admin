// FR-14: the photographer's QR code as a PNG download, encoding the photographer's URL.

import { config } from './config.js';

let library = null;

function loadLibrary() {
  library ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = config.libs.qrcode;
    script.onload = () => resolve(window.qrcode);
    script.onerror = () => {
      library = null;
      reject(new Error('No se pudo cargar la librería de QR.'));
    };
    document.head.append(script);
  });
  return library;
}

// Black on white, quiet zone of 4 modules, about 1024 px wide: sharp enough for print.
export async function qrPngBlob(text, targetPx = 1024) {
  const qrcode = await loadLibrary();
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const modules = qr.getModuleCount();
  const quiet = 4;
  const scale = Math.ceil(targetPx / (modules + quiet * 2));
  const size = (modules + quiet * 2) * scale;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = '#000';
  for (let r = 0; r < modules; r++) {
    for (let c = 0; c < modules; c++) {
      if (qr.isDark(r, c)) ctx.fillRect((c + quiet) * scale, (r + quiet) * scale, scale, scale);
    }
  }
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
