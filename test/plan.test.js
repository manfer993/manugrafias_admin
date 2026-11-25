import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildPublished, hasUnpublishedChanges, mediaPath, nextVersion, unusedPaths } from '../js/plan.js';
import { readMp4Codecs } from '../js/mp4.js';

const url = (p) => `https://x.supabase.co/storage/v1/object/public/media/${p}`;
const art = (id, t, extra = {}) => ({
  id,
  uploadedAt: new Date(t),
  imagePath: `photographers/ana/artworks/${id}/target-1.jpg`,
  videoPath: `photographers/ana/artworks/${id}/video-1.mp4`,
  aspectRatio: 0.75,
  dirty: false,
  ...extra,
});

test('FR-13: published map follows upload order, with absolute URLs', () => {
  const published = buildPublished({
    artworks: [art('b', 2000), art('a', 1000)],
    version: 3,
    targetsUrl: url('photographers/ana/published/v3/targets.mind'),
    publicUrl: url,
  });
  assert.equal(published.version, 3);
  assert.equal(published.targetsPath, url('photographers/ana/published/v3/targets.mind'));
  assert.deepEqual(published.artworks.map((a) => [a.id, a.targetIndex]), [['a', 0], ['b', 1]]);
  assert.equal(published.artworks[0].videoPath, url('photographers/ana/artworks/a/video-1.mp4'));
});

test('FR-13: publishing with no artworks clears them and has no targets.mind (ERR-10)', () => {
  const published = buildPublished({ artworks: [], version: 2, targetsUrl: 'x', publicUrl: url });
  assert.deepEqual(published, { version: 2, artworks: [] });
  assert.equal(nextVersion(undefined), 1);
  assert.equal(nextVersion({ version: 4 }), 5);
});

test('unpublished changes: new, replaced, deleted or reordered artworks', () => {
  const live = { artworks: [{ id: 'a' }, { id: 'b' }] };
  assert.equal(hasUnpublishedChanges(live, [art('a', 1), art('b', 2)]), false);
  assert.equal(hasUnpublishedChanges(live, [art('a', 1), art('b', 2, { dirty: true })]), true);
  assert.equal(hasUnpublishedChanges(live, [art('a', 1)]), true);
  assert.equal(hasUnpublishedChanges(undefined, []), false);
  assert.equal(hasUnpublishedChanges(undefined, [art('a', 1)]), true);
});

test('cleanup keeps current files and the live targets.mind only', () => {
  const unused = unusedPaths({
    slug: 'ana',
    version: 3,
    artworks: [art('a', 1)],
    listedPaths: [
      'photographers/ana/artworks/a/target-1.jpg',
      'photographers/ana/artworks/a/video-1.mp4',
      'photographers/ana/artworks/a/video-0.mp4',
      'photographers/ana/artworks/gone/video-1.mp4',
      'photographers/ana/published/v2/targets.mind',
      'photographers/ana/published/v3/targets.mind',
      'photographers/other/artworks/z/video-1.mp4',
    ],
  });
  assert.deepEqual(unused, [
    'photographers/ana/artworks/a/video-0.mp4',
    'photographers/ana/artworks/gone/video-1.mp4',
    'photographers/ana/published/v2/targets.mind',
  ]);
});

test('media paths: per artwork folder, timestamped, extension from type', () => {
  assert.equal(mediaPath('ana', 'a', 'image', { type: 'image/png' }, 5), 'photographers/ana/artworks/a/target-5.png');
  assert.equal(mediaPath('ana', 'a', 'image', { type: 'image/jpeg' }, 5), 'photographers/ana/artworks/a/target-5.jpg');
  assert.equal(mediaPath('ana', 'a', 'video', { type: 'video/mp4' }, 5), 'photographers/ana/artworks/a/video-5.mp4');
});

test('SRS 5.2: reads H.264 / AAC from a real MP4', () => {
  const file = readFileSync(new URL('./fixtures/sample.mp4', import.meta.url));
  const codecs = readMp4Codecs(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
  assert.deepEqual(codecs, { videoCodec: 'avc1', audioCodec: 'mp4a' });
  assert.deepEqual(readMp4Codecs(new ArrayBuffer(16)), { videoCodec: null, audioCodec: null });
});
