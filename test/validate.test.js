import { test } from 'node:test';
import assert from 'node:assert/strict';
import { config } from '../js/config.js';
import {
  cleanLinks,
  slugify,
  uniqueSlug,
  validateArtworkCount,
  validateAspect,
  validateImage,
  validatePhotographer,
  validateTitle,
  validateVideo,
} from '../js/validate.js';

const { image: IMG, video: VID, aspectTolerance } = config.limits;
const okVideo = { type: 'video/mp4', size: 3e6, duration: 11.1, width: 720, height: 960, videoCodec: 'avc1', audioCodec: 'mp4a' };
const okImage = { type: 'image/jpeg', size: 5e5, width: 1500, height: 2000 };

test('FR-11: name required, links optional but https://', () => {
  assert.deepEqual(validatePhotographer({ name: 'Ana', links: { instagram: 'https://instagram.com/ana' } }), []);
  assert.equal(validatePhotographer({ name: '  ' }).length, 1);
  const errors = validatePhotographer({ name: 'Ana', links: { behance: 'http://behance.net/ana', portfolio: 'ana.com' } });
  assert.equal(errors.length, 2);
  assert.match(errors[0], /Behance/);
  assert.deepEqual(cleanLinks({ instagram: ' https://i.com/a ', behance: '', portfolio: undefined }), { instagram: 'https://i.com/a' });
});

test('FR-11: slug from the name, unique with -2, -3', async () => {
  assert.equal(slugify('Manuel Muñoz'), 'manuel-munoz');
  assert.equal(slugify('  José   Ángel / Studio! '), 'jose-angel-studio');
  const taken = new Set(['manuel-munoz', 'manuel-munoz-2']);
  assert.equal(await uniqueSlug('Manuel Muñoz', async (s) => taken.has(s)), 'manuel-munoz-3');
  assert.equal(await uniqueSlug('¡!', async () => false), 'fotografo');
});

test('AC-12.3 / AC-12.4: artwork limit and title', () => {
  assert.equal(validateArtworkCount(10, 10).length, 1);
  assert.deepEqual(validateArtworkCount(9, 10), []);
  assert.equal(validateTitle('  ').length, 1);
  assert.deepEqual(validateTitle('Bailarina'), []);
});

test('AC-12.6: image format, size and shortest side', () => {
  assert.deepEqual(validateImage(okImage, IMG), []);
  assert.match(validateImage({ ...okImage, type: 'image/webp' }, IMG)[0], /jpg o \.png/);
  assert.match(validateImage({ ...okImage, size: 6 * 1024 * 1024 }, IMG)[0], /máximo es 5\.0 MB/);
  assert.match(validateImage({ ...okImage, width: 999 }, IMG)[0], /999 px/);
});

test('AC-12.2: video duration, size, resolution and codecs', () => {
  assert.deepEqual(validateVideo(okVideo, VID), []);
  assert.deepEqual(validateVideo({ ...okVideo, width: 1280, height: 720 }, VID), []);
  assert.match(validateVideo({ ...okVideo, duration: 21 }, VID)[0], /20 s/);
  assert.match(validateVideo({ ...okVideo, size: 11 * 1024 * 1024 }, VID)[0], /10\.0 MB/);
  assert.match(validateVideo({ ...okVideo, width: 1080, height: 1440 }, VID)[0], /720p/);
  assert.match(validateVideo({ ...okVideo, videoCodec: 'hvc1' }, VID)[0], /H\.264/);
  assert.match(validateVideo({ ...okVideo, audioCodec: null }, VID)[0], /AAC/);
});

test('AC-12.2: image and video aspect ratio within ±1 %', () => {
  assert.deepEqual(validateAspect(0.75, 720 / 960, aspectTolerance), []);
  assert.deepEqual(validateAspect(3901 / 5201, 0.75, aspectTolerance), []);
  assert.equal(validateAspect(0.75, 9 / 16, aspectTolerance).length, 1);
});
