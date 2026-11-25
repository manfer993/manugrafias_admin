# ManuGrafias AR - Content panel (MVP 2)

Static web panel where the administrator manages photographers and artworks and publishes them to the AR
experience ([manugrafias](https://github.com/manfer993/manugrafias)). Requirements: SRS v1.4 FR-10 to FR-14,
ERR-11 to ERR-13 (`../SRS_manugrafias.md`). Hosted on GitHub Pages: `https://manfer993.github.io/manugrafias_admin/`.

## Structure

```
index.html            login + panel (single page, Spanish UI)
css/styles.css
js/config.js          public configuration: Firebase web config, Supabase publishable key, limits (SRS 5)
js/main.js            UI: session, photographers, artworks, publishing, QR
js/services.js        Firebase Auth + Firestore, Supabase Storage
js/validate.js        FR-11 / FR-12 / SRS 5 rules (unit tested)
js/mp4.js             reads the MP4 codecs (H.264 / AAC) without decoding (unit tested)
js/plan.js            publishing plan, unpublished changes, cleanup (unit tested)
js/media.js           reads image / video properties of the selected files
js/compile.js         compiles targets.mind in the browser with the MindAR 1.2.5 compiler
js/qr.js              QR code PNG
.github/workflows/    Supabase keep-alive (twice a week)
test/                 npm test
```

## How it works

| Piece | Where |
| ----- | ----- |
| Login (FR-10) | Firebase Authentication, **Google** provider only. New sign-ups are disabled in the project, and the panel and every rule require the custom claim `admin: true` |
| Data | Cloud Firestore: `photographers/{slug}` (public contract read by the AR experience) and `artworks/{id}` (panel only: title, author, upload date, source files). Rules: `manugrafias/firebase/firestore.rules` |
| Media | Supabase Storage, bucket `media` (public read, admin-only write through Supabase third-party auth with the Firebase ID token). Rules: `manugrafias/supabase/storage.sql` |
| Publishing (FR-13) | The panel compiles `targets.mind` from the target images (upload order = `targetIndex`), uploads it under `published/v{n}/`, then swaps `published` in **one** Firestore batch. If anything fails before that write, the live version is untouched (ERR-11, ERR-12). Unused files are removed afterwards |

Media paths in the bucket:

```
photographers/{slug}/artworks/{artworkId}/target-{time}.jpg|png
photographers/{slug}/artworks/{artworkId}/video-{time}.mp4
photographers/{slug}/published/v{version}/targets.mind
```

`published.targetsPath` and `published.artworks[].videoPath` hold absolute Supabase public URLs; the AR
experience uses absolute URLs as they are.

## Differences from SRS v1.4 (decided for the no-cost plan)

- FR-10 / NFR-02: Google sign-in instead of email and password, so there is no "Forgot password" (AC-10.3 does not
  apply). The administrator account is the only one: sign-ups are disabled.
- NFR-02: media in Supabase Storage (free plan) instead of Cloud Storage for Firebase (needs the Blaze plan).
- Editing the photographer's name or links updates the AR experience on save (only artworks wait for "Publish").

## Administrator setup (done once)

1. Firebase > Authentication: Google provider enabled; Settings > User actions: sign-up disabled;
   authorized domains include `manfer993.github.io`.
2. The administrator signed in once with Google, then got the custom claims
   `{ role: 'authenticated', admin: true }` (see `manugrafias/scripts/set-admin-claim.mjs`).
3. Supabase > Authentication > Third-Party Auth: Firebase, project `manugrafias-2026`.

## Deploy

Repository > Settings > Pages > Deploy from a branch > `main` / root. The repository must be public on the free
GitHub plan; it holds no secrets (only public web keys).

## Supabase keep-alive

Free Supabase projects are paused after 7 days of low database activity, which would stop serving the videos.
`.github/workflows/supabase-keep-alive.yml` runs a small query twice a week. GitHub disables scheduled workflows
after 60 days without commits: check the Actions tab now and then (or run it by hand with "Run workflow").

## Develop

```bash
npm test     # unit tests
npm start    # http://localhost:8080 (localhost is an authorized Firebase domain)
```
