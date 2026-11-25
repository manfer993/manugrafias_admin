// Backend access: Firebase Authentication (Google, administrator only), Cloud Firestore (data) and
// Supabase Storage (media files, signed in with the Firebase ID token through Supabase third-party auth).

import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'https://www.gstatic.com/firebasejs/11.0.2/firebase-firestore.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { config } from './config.js';

const app = initializeApp(config.firebase);
const auth = getAuth(app);
const db = getFirestore(app);
const supabase = createClient(config.supabase.url, config.supabase.publishableKey, {
  accessToken: async () => (await auth.currentUser?.getIdToken()) ?? null,
});
const bucket = () => supabase.storage.from(config.supabase.bucket);

// ---- Errors ----

// The session is gone or the account is not the administrator (ERR-13): the UI goes back to the login.
export class SessionError extends Error {}

export function isNetworkError(error) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (error?.code === 'unavailable') return true;
  const text = `${error?.message || ''} ${error?.originalError?.message || ''}`;
  return /network|failed to fetch|load failed|offline/i.test(text);
}

function firestoreError(error) {
  if (error?.code === 'permission-denied' || error?.code === 'unauthenticated') return new SessionError(error.message);
  return error;
}

function storageError(error) {
  const status = Number(error?.statusCode || error?.status);
  if (status === 401 || status === 403) return new SessionError(error.message);
  return error instanceof Error ? error : new Error(error?.message || 'Storage error');
}

async function fs(promise) {
  try {
    return await promise;
  } catch (error) {
    throw firestoreError(error);
  }
}

// ---- Session (FR-10) ----

// onChange({ state: 'signed-out' | 'admin' | 'denied', user?, email? })
export function watchSession(onChange) {
  return onAuthStateChanged(auth, async (user) => {
    if (!user) return onChange({ state: 'signed-out' });
    const token = await user.getIdTokenResult();
    if (token.claims.admin === true && token.claims.role === 'authenticated') {
      onChange({ state: 'admin', user });
    } else {
      await signOut(auth);
      onChange({ state: 'denied', email: user.email });
    }
  });
}

export const signIn = () => signInWithPopup(auth, new GoogleAuthProvider());
export const logOut = () => signOut(auth);

// ---- Photographers (FR-11) ----

export async function listPhotographers() {
  const snap = await fs(getDocs(collection(db, 'photographers')));
  return snap.docs
    .map((d) => ({ slug: d.id, ...d.data() }))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'es'));
}

export async function getPhotographer(slug) {
  const snap = await fs(getDoc(doc(db, 'photographers', slug)));
  return snap.exists() ? { slug, ...snap.data() } : null;
}

export async function photographerExists(slug) {
  return (await getPhotographer(slug)) !== null;
}

export function createPhotographer(slug, { name, links }) {
  return fs(setDoc(doc(db, 'photographers', slug), { name, links }));
}

// Never touches `published`: editing the name keeps the URL, the QR code and the live version (AC-11.2).
export function updatePhotographer(slug, { name, links }) {
  return fs(updateDoc(doc(db, 'photographers', slug), { name, links }));
}

// Removes the photographer and all its artworks in one batch: the AR experience stops showing it at once.
export async function deletePhotographer(slug) {
  const snap = await fs(getDocs(query(collection(db, 'artworks'), where('photographerSlug', '==', slug))));
  const batch = writeBatch(db);
  for (const d of snap.docs) batch.delete(d.ref);
  batch.delete(doc(db, 'photographers', slug));
  return fs(batch.commit());
}

// ---- Artworks (FR-12), panel-only collection ----

export async function listArtworks(slug) {
  const snap = await fs(getDocs(query(collection(db, 'artworks'), where('photographerSlug', '==', slug))));
  return snap.docs.map((d) => {
    const data = d.data();
    return { id: d.id, ...data, uploadedAt: data.uploadedAt?.toDate?.() ?? new Date() };
  });
}

export function newArtworkId() {
  return doc(collection(db, 'artworks')).id;
}

export function createArtwork(id, data) {
  return fs(setDoc(doc(db, 'artworks', id), { ...data, uploadedAt: serverTimestamp(), dirty: true }));
}

export function updateArtwork(id, patch) {
  return fs(updateDoc(doc(db, 'artworks', id), patch));
}

export function deleteArtwork(id) {
  return fs(deleteDoc(doc(db, 'artworks', id)));
}

// FR-13, ERR-11, ERR-12: the AR experience only changes with this single atomic write.
export function commitPublication(slug, published, artworkIds) {
  const batch = writeBatch(db);
  batch.update(doc(db, 'photographers', slug), { published });
  for (const id of artworkIds) batch.update(doc(db, 'artworks', id), { dirty: false });
  return fs(batch.commit());
}

// ---- Media files (Supabase Storage) ----

export function publicUrl(path) {
  return bucket().getPublicUrl(path).data.publicUrl;
}

// Paths are timestamped, so a file never changes once uploaded and can be cached for a long time.
export async function uploadFile(path, body, contentType) {
  const { error } = await bucket().upload(path, body, { contentType, upsert: true, cacheControl: '31536000' });
  if (error) throw storageError(error);
}

export async function removeFiles(paths) {
  if (paths.length === 0) return;
  const { error } = await bucket().remove(paths);
  if (error) throw storageError(error);
}

// Every file path under `prefix` (folders are listed recursively).
export async function listFiles(prefix) {
  const { data, error } = await bucket().list(prefix, { limit: 1000 });
  if (error) throw storageError(error);
  const paths = [];
  for (const item of data) {
    const path = `${prefix}/${item.name}`;
    if (item.id === null) paths.push(...(await listFiles(path)));
    else paths.push(path);
  }
  return paths;
}
