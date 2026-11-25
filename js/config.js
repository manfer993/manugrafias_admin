// ManuGrafias content panel - single configuration file.
// Only public values: the Firebase web config and the Supabase publishable key are meant for browsers.

export const config = {
  firebase: {
    apiKey: 'AIzaSyB8tY6_12ZzPDWZc-i7FNlgOjSnYA21Y5E',
    authDomain: 'manugrafias-2026.firebaseapp.com',
    projectId: 'manugrafias-2026',
  },

  // MVP 2 media storage (Firebase Cloud Storage needs the Blaze plan). See README.
  supabase: {
    url: 'https://hdajccuxsqteijcodyxg.supabase.co',
    publishableKey: 'sb_publishable_Q7rIfG9J6Li6fap22SoHYQ_iMeG9nkf',
    bucket: 'media',
  },

  // AR experience: the photographer URL (and QR code) is `${arAppUrl}?p=<slug>` (FR-01, FR-14).
  arAppUrl: 'https://manfer993.github.io/manugrafias/',

  // Phase 1 limit per photographer (AC-12.3).
  maxArtworks: 10,

  // SRS section 5: the panel rejects any file that breaks a MUST rule (FR-12).
  limits: {
    image: {
      types: ['image/jpeg', 'image/png'],
      maxBytes: 5 * 1024 * 1024,
      minShortSide: 1000,
    },
    video: {
      types: ['video/mp4'],
      maxBytes: 10 * 1024 * 1024,
      maxSeconds: 20,
      // 720p: at most 720 px on the short side and 1280 px on the long side (portrait or landscape).
      maxShortSide: 720,
      maxLongSide: 1280,
      videoCodecs: ['avc1', 'avc3'], // H.264
      audioCodecs: ['mp4a'], // AAC
    },
    aspectTolerance: 0.01, // ±1 % between the target image and its video
  },

  // Third-party libraries, pinned to exact versions (Firebase 11.0.2 and supabase-js 2.45.4 are imported
  // in js/services.js, since static imports need literal URLs).
  libs: {
    mindar: 'https://cdn.jsdelivr.net/npm/mind-ar@1.2.5/dist/mindar-image.prod.js',
    qrcode: 'https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js',
  },
};
