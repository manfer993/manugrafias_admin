// Reads what the validation rules need from the selected files, in the browser (FR-12, SRS section 5).

import { readMp4Codecs } from './mp4.js';

const TIMEOUT_MS = 15000;

function withTimeout(promise, message) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => (timer = setTimeout(() => reject(new Error(message)), TIMEOUT_MS))),
  ]).finally(() => clearTimeout(timer));
}

// { type, size, width, height }
export async function readImageInfo(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await withTimeout(loadImage(url, false), 'Imagen: no se pudo leer el archivo.');
    return { type: file.type, size: file.size, width: img.naturalWidth, height: img.naturalHeight };
  } catch {
    return { type: file.type, size: file.size, width: 0, height: 0 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

// { type, size, duration, width, height, videoCodec, audioCodec }
export async function readVideoInfo(file) {
  const url = URL.createObjectURL(file);
  try {
    const meta = await withTimeout(
      new Promise((resolve, reject) => {
        const video = document.createElement('video');
        video.preload = 'metadata';
        video.muted = true;
        video.onloadedmetadata = () => resolve({ duration: video.duration, width: video.videoWidth, height: video.videoHeight });
        video.onerror = () => reject(new Error('Video: no se pudo leer el archivo.'));
        video.src = url;
      }),
      'Video: no se pudo leer el archivo.',
    );
    const codecs = file.size <= 64 * 1024 * 1024 ? readMp4Codecs(await file.arrayBuffer()) : { videoCodec: null, audioCodec: null };
    return { type: file.type, size: file.size, ...meta, ...codecs };
  } catch {
    return { type: file.type, size: file.size, duration: 0, width: 0, height: 0, videoCodec: null, audioCodec: null };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function loadImage(src, crossOrigin = true) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    if (crossOrigin) img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`No se pudo cargar la imagen ${src}`));
    img.src = src;
  });
}
