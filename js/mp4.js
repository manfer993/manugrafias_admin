// Reads the codecs of an MP4 file (SRS 5.2: H.264 video, AAC audio) without decoding it.
// Walks the ISO BMFF boxes: moov > trak > mdia > (hdlr: track type) + minf > stbl > stsd (first sample entry).
// Pure function over an ArrayBuffer, unit tested.

function* boxes(view, start, end) {
  let offset = start;
  while (offset + 8 <= end) {
    let size = view.getUint32(offset);
    const type = fourcc(view, offset + 4);
    let header = 8;
    if (size === 1) {
      if (offset + 16 > end) return;
      size = Number(view.getBigUint64(offset + 8));
      header = 16;
    } else if (size === 0) {
      size = end - offset;
    }
    if (size < header || offset + size > end) return;
    yield { type, start: offset + header, end: offset + size };
    offset += size;
  }
}

function fourcc(view, offset) {
  return String.fromCharCode(
    view.getUint8(offset),
    view.getUint8(offset + 1),
    view.getUint8(offset + 2),
    view.getUint8(offset + 3),
  );
}

function find(view, box, type) {
  for (const child of boxes(view, box.start, box.end)) if (child.type === type) return child;
  return null;
}

// Returns { videoCodec, audioCodec }: sample entry types such as 'avc1' and 'mp4a', or null when missing.
export function readMp4Codecs(buffer) {
  const view = new DataView(buffer);
  const result = { videoCodec: null, audioCodec: null };
  const moov = [...boxes(view, 0, view.byteLength)].find((b) => b.type === 'moov');
  if (!moov) return result;

  for (const trak of boxes(view, moov.start, moov.end)) {
    if (trak.type !== 'trak') continue;
    const mdia = find(view, trak, 'mdia');
    if (!mdia) continue;
    const hdlr = find(view, mdia, 'hdlr');
    // hdlr: version/flags (4) + pre_defined (4) + handler_type (4)
    const handler = hdlr && hdlr.start + 12 <= hdlr.end ? fourcc(view, hdlr.start + 8) : null;
    const minf = find(view, mdia, 'minf');
    const stbl = minf && find(view, minf, 'stbl');
    const stsd = stbl && find(view, stbl, 'stsd');
    // stsd: version/flags (4) + entry_count (4), then the first sample entry box: size (4) + type (4)
    if (!stsd || stsd.start + 16 > stsd.end) continue;
    const codec = fourcc(view, stsd.start + 12);
    if (handler === 'vide' && !result.videoCodec) result.videoCodec = codec;
    if (handler === 'soun' && !result.audioCodec) result.audioCodec = codec;
  }
  return result;
}
