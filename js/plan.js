// Publishing plan (FR-13): what the AR experience will read, and which files are no longer needed.
// Pure functions, unit tested.
//
// Firestore (contract shared with the AR experience, see manugrafias/docs/architecture.md):
//   photographers/{slug}  { name, links, published: { version, targetsPath, artworks[] } }   public get
//   artworks/{id}         { photographerSlug, title, author, uploadedAt, imagePath, videoPath,
//                           aspectRatio, videoAspectRatio, dirty }                            panel only
// Media paths (Supabase Storage bucket `media`):
//   photographers/{slug}/artworks/{id}/target-{time}.{jpg|png}
//   photographers/{slug}/artworks/{id}/video-{time}.mp4
//   photographers/{slug}/published/v{version}/targets.mind

export const artworkFolder = (slug, id) => `photographers/${slug}/artworks/${id}`;
export const targetsPath = (slug, version) => `photographers/${slug}/published/v${version}/targets.mind`;

export function mediaPath(slug, id, kind, file, now = Date.now()) {
  const ext = kind === 'video' ? 'mp4' : file.type === 'image/png' ? 'png' : 'jpg';
  return `${artworkFolder(slug, id)}/${kind === 'video' ? 'video' : 'target'}-${now}.${ext}`;
}

const time = (a) => (a.uploadedAt instanceof Date ? a.uploadedAt.getTime() : Number(a.uploadedAt) || 0);

// Recognition order = upload order (oldest first); this is the order of the images inside targets.mind.
export function sortArtworks(artworks) {
  return [...artworks].sort((a, b) => time(a) - time(b) || String(a.id).localeCompare(String(b.id)));
}

export function nextVersion(published) {
  return (Number(published?.version) || 0) + 1;
}

// The `published` map written in one Firestore update. Media URLs are absolute (Supabase public URLs).
export function buildPublished({ artworks, version, targetsUrl, publicUrl }) {
  const sorted = sortArtworks(artworks);
  const published = {
    version,
    artworks: sorted.map((a, index) => ({
      id: a.id,
      targetIndex: index,
      videoPath: publicUrl(a.videoPath),
      aspectRatio: a.aspectRatio,
    })),
  };
  if (sorted.length > 0) published.targetsPath = targetsUrl;
  return published;
}

// True when publishing would change what the AR experience shows.
export function hasUnpublishedChanges(published, artworks) {
  if (artworks.some((a) => a.dirty)) return true;
  const live = (published?.artworks || []).map((a) => a.id);
  const current = sortArtworks(artworks).map((a) => a.id);
  return live.length !== current.length || live.some((id, i) => id !== current[i]);
}

// Files under the photographer's folder that nothing uses any more after a successful publication:
// old versions of replaced files, files of deleted artworks, and older targets.mind versions.
export function unusedPaths({ slug, listedPaths, artworks, version }) {
  const keep = new Set([targetsPath(slug, version)]);
  for (const a of artworks) {
    keep.add(a.imagePath);
    keep.add(a.videoPath);
  }
  const prefix = `photographers/${slug}/`;
  return listedPaths.filter((path) => path.startsWith(prefix) && !keep.has(path));
}
