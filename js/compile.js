// FR-13: compiles the photographer's targets.mind in the browser with the MindAR compiler (NFR-02),
// from the target images in recognition order.

import { config } from './config.js';
import { loadImage } from './media.js';

// The compiler works on the image pixels; very large photos only make it slower, so they are scaled down.
const MAX_SIDE = 2000;

let compilerModule = null;

function scaled(img) {
  const side = Math.max(img.naturalWidth, img.naturalHeight);
  if (side <= MAX_SIDE) return img;
  const k = MAX_SIDE / side;
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.naturalWidth * k);
  canvas.height = Math.round(img.naturalHeight * k);
  canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas;
}

// onProgress(percent 0..100). Returns the targets.mind bytes (Uint8Array).
export async function compileTargets(imageUrls, onProgress = () => {}) {
  compilerModule ??= import(config.libs.mindar).catch((error) => {
    compilerModule = null;
    throw error;
  });
  const { Compiler } = await compilerModule;
  const images = (await Promise.all(imageUrls.map((url) => loadImage(url)))).map(scaled);
  const compiler = new Compiler();
  await compiler.compileImageTargets(images, (percent) => onProgress(Math.max(0, Math.min(100, percent))));
  const data = await compiler.exportData();
  if (!data || !data.byteLength) throw new Error('The compiler returned an empty targets.mind');
  return data;
}
