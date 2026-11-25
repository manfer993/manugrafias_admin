// Validation rules of the content panel (FR-11, FR-12, SRS section 5). Pure functions, unit tested.
// Every function returns a list of messages (Spanish, shown to the administrator); an empty list means valid.

export const LINK_TYPES = ['instagram', 'behance', 'portfolio'];
export const LINK_LABELS = { instagram: 'Instagram', behance: 'Behance', portfolio: 'Portafolio' };

const MB = 1024 * 1024;
const formatMb = (bytes) => `${(bytes / MB).toFixed(1)} MB`;

export function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

// FR-11: name is required; each link is optional but must start with https://.
export function validatePhotographer({ name, links = {} }) {
  const errors = [];
  if (!String(name || '').trim()) errors.push('Escribe el nombre del fotógrafo.');
  for (const type of LINK_TYPES) {
    const value = String(links[type] || '').trim();
    if (value && !(value.startsWith('https://') && isHttpsUrl(value))) {
      errors.push(`${LINK_LABELS[type]}: escribe una URL válida que empiece por https://`);
    }
  }
  return errors;
}

// Keeps only the links that were filled in, trimmed.
export function cleanLinks(links = {}) {
  const out = {};
  for (const type of LINK_TYPES) {
    const value = String(links[type] || '').trim();
    if (value) out[type] = value;
  }
  return out;
}

// AC-12.4
export function validateTitle(title) {
  return String(title || '').trim() ? [] : ['Escribe el título de la obra.'];
}

// AC-12.3
export function validateArtworkCount(count, max) {
  return count >= max ? [`Límite de la fase 1: un fotógrafo puede tener como máximo ${max} obras.`] : [];
}

// AC-12.6 - info: { type, size, width, height }
export function validateImage(info, limits) {
  const errors = [];
  if (!limits.types.includes(info.type)) errors.push('Imagen: el formato debe ser .jpg o .png.');
  if (info.size > limits.maxBytes) {
    errors.push(`Imagen: pesa ${formatMb(info.size)}; el máximo es ${formatMb(limits.maxBytes)}.`);
  }
  const shortSide = Math.min(info.width || 0, info.height || 0);
  if (shortSide < limits.minShortSide) {
    errors.push(`Imagen: el lado más corto mide ${shortSide} px; el mínimo es ${limits.minShortSide} px.`);
  }
  return errors;
}

// AC-12.2 - info: { type, size, duration, width, height, videoCodec, audioCodec }
export function validateVideo(info, limits) {
  const errors = [];
  if (!limits.types.includes(info.type)) errors.push('Video: el formato debe ser .mp4.');
  if (!limits.videoCodecs.includes(info.videoCodec)) {
    errors.push(`Video: el códec de video debe ser H.264 (encontrado: ${info.videoCodec || 'ninguno'}).`);
  }
  if (!limits.audioCodecs.includes(info.audioCodec)) {
    errors.push(`Video: el códec de audio debe ser AAC (encontrado: ${info.audioCodec || 'sin audio'}).`);
  }
  if (!(info.duration > 0) || info.duration > limits.maxSeconds + 0.05) {
    errors.push(`Video: dura ${(info.duration || 0).toFixed(1)} s; el máximo es ${limits.maxSeconds} s.`);
  }
  if (info.size > limits.maxBytes) {
    errors.push(`Video: pesa ${formatMb(info.size)}; el máximo es ${formatMb(limits.maxBytes)}.`);
  }
  const shortSide = Math.min(info.width, info.height);
  const longSide = Math.max(info.width, info.height);
  if (shortSide > limits.maxShortSide || longSide > limits.maxLongSide) {
    errors.push(`Video: mide ${info.width}×${info.height}; el máximo es 720p (720×1280 o 1280×720).`);
  }
  return errors;
}

// AC-12.2 - same width / height ratio for the image and its video, ±tolerance (relative).
export function validateAspect(imageRatio, videoRatio, tolerance) {
  if (!(imageRatio > 0) || !(videoRatio > 0)) return [];
  const diff = Math.abs(videoRatio - imageRatio) / imageRatio;
  return diff > tolerance
    ? [
        `La proporción del video (${videoRatio.toFixed(3)}) no coincide con la de la imagen (${imageRatio.toFixed(3)}); ` +
          `la diferencia máxima es ±${Math.round(tolerance * 100)} %.`,
      ]
    : [];
}

// ---- Slug (FR-11: unique and permanent) ----

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugify(name) {
  return String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
    .replace(/-+$/g, '');
}

export function isValidSlug(slug) {
  return SLUG_PATTERN.test(slug);
}

// Returns the first free slug: base, base-2, base-3, ... `exists` is async (slug) => boolean.
export async function uniqueSlug(name, exists) {
  const base = slugify(name) || 'fotografo';
  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? base : `${base}-${n}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error('No se pudo generar un identificador único.');
}
