// ManuGrafias content panel (MVP 2): FR-10 to FR-14, ERR-11 to ERR-13.

import { config } from './config.js';
import * as api from './services.js';
import { compileTargets } from './compile.js';
import { readImageInfo, readVideoInfo } from './media.js';
import {
  buildPublished,
  hasUnpublishedChanges,
  mediaPath,
  nextVersion,
  sortArtworks,
  targetsPath,
  unusedPaths,
} from './plan.js';
import { confirmDialog } from './dialog.js';
import { downloadBlob, qrPngBlob } from './qr.js';
import {
  cleanLinks,
  LINK_LABELS,
  LINK_TYPES,
  uniqueSlug,
  validateArtworkCount,
  validateAspect,
  validateImage,
  validatePhotographer,
  validateTitle,
  validateVideo,
} from './validate.js';

const $ = (id) => document.getElementById(id);
const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESCAPES[c]);
const LIMITS = config.limits;

const state = {
  photographers: [],
  slug: null,
  creating: false,
  photographer: null,
  artworks: [],
  busy: 0, // uploads or publishing in progress
  flash: null, // { target, kind, text } shown once after the next render
};

const arUrl = (slug) => `${config.arAppUrl}?p=${encodeURIComponent(slug)}`;
const formatDate = (date) => date.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' });

// ---- Views and messages ----

function show(view) {
  for (const name of ['loading', 'login', 'app']) $(`view-${name}`).hidden = name !== view;
}

// Message text with some parts in bold: rich('Se subió ', { strong: title }, '.') -> { html } (escaped).
const rich = (...parts) => ({
  html: parts.map((p) => (typeof p === 'string' ? esc(p) : `<strong>${esc(p.strong)}</strong>`)).join(''),
});

function setMessage(el, kind, content) {
  if (!el) return;
  if (content?.html) {
    el.className = `message ${kind}`;
    el.innerHTML = content.html;
    el.hidden = false;
    return;
  }
  if (!content || (Array.isArray(content) && content.length === 0)) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  el.className = `message ${kind}`;
  el.innerHTML = Array.isArray(content)
    ? content.length === 1
      ? esc(content[0])
      : `<ul>${content.map((m) => `<li>${esc(m)}</li>`).join('')}</ul>`
    : esc(content);
  el.hidden = false;
}

// Short notice at the bottom of the screen, not tied to any section (e.g. after deleting a photographer).
function toast(kind, content, ms = 6000) {
  const el = document.createElement('div');
  el.setAttribute('role', 'status');
  document.body.append(el);
  setMessage(el, kind, content);
  el.classList.add('toast');
  const close = () => {
    el.classList.add('toast-out');
    setTimeout(() => el.remove(), 250);
  };
  el.addEventListener('click', close);
  setTimeout(close, ms);
}

// AC-13.3: warn before leaving while uploading or publishing.
window.addEventListener('beforeunload', (event) => {
  if (state.busy > 0) {
    event.preventDefault();
    event.returnValue = '';
  }
});

async function busy(task) {
  state.busy++;
  try {
    return await task();
  } finally {
    state.busy--;
  }
}

// ERR-13: any action without a valid administrator session goes back to the login.
async function guarded(task, onError) {
  try {
    return await task();
  } catch (error) {
    if (error instanceof api.SessionError) return sessionLost();
    console.error(error);
    if (onError) onError(error);
    else alert(`Algo falló: ${error.message || error}`);
  }
}

function sessionLost() {
  state.busy = 0;
  api.logOut();
  setMessage($('login-message'), 'error', 'Tu sesión expiró o no tiene permisos. Inicia sesión de nuevo.');
}

// ---- FR-10: session ----

api.watchSession(async (session) => {
  if (session.state === 'admin') {
    $('user-email').textContent = session.user.email;
    setMessage($('login-message'));
    show('app');
    await guarded(() => loadPhotographers());
    return;
  }
  Object.assign(state, { photographers: [], slug: null, photographer: null, artworks: [], creating: false });
  $('content').innerHTML = '';
  $('photographer-list').innerHTML = '';
  show('login');
  if (session.state === 'denied') {
    setMessage($('login-message'), 'error', `La cuenta ${session.email} no tiene acceso al panel.`);
  }
});

$('btn-login').addEventListener('click', async () => {
  setMessage($('login-message'));
  try {
    await api.signIn();
  } catch (error) {
    if (['auth/popup-closed-by-user', 'auth/cancelled-popup-request'].includes(error.code)) return;
    const text =
      error.code === 'auth/admin-restricted-operation'
        ? 'Esta cuenta no tiene acceso al panel (no se permite crear cuentas nuevas).'
        : `No se pudo iniciar sesión: ${error.message}`;
    setMessage($('login-message'), 'error', text);
  }
});

$('btn-logout').addEventListener('click', () => {
  if (state.busy > 0 && !confirm('Hay una subida o publicación en curso. ¿Cerrar sesión de todos modos?')) return;
  api.logOut();
});

// ---- FR-11: photographers ----

async function loadPhotographers(select = state.slug) {
  state.photographers = await api.listPhotographers();
  const target = state.photographers.find((p) => p.slug === select) || state.photographers[0];
  if (target) await openPhotographer(target.slug);
  else openNew();
}

function renderList() {
  $('photographer-list').innerHTML = state.photographers
    .map(
      (p) => `<li><button type="button" data-slug="${esc(p.slug)}" aria-current="${p.slug === state.slug}">
        ${esc(p.name)}<small>${esc(p.slug)}</small></button></li>`,
    )
    .join('');
}

$('photographer-list').addEventListener('click', (event) => {
  const button = event.target.closest('button[data-slug]');
  if (!button || button.dataset.slug === state.slug) return;
  if (state.busy > 0 && !confirm('Hay una subida o publicación en curso. ¿Cambiar de fotógrafo de todos modos?')) return;
  guarded(() => openPhotographer(button.dataset.slug));
});

$('btn-new-photographer').addEventListener('click', () => {
  if (state.busy > 0 && !confirm('Hay una subida o publicación en curso. ¿Continuar de todos modos?')) return;
  openNew();
});

async function openPhotographer(slug) {
  Object.assign(state, { creating: false, slug });
  renderList();
  $('content').innerHTML = '<p class="muted">Cargando…</p>';
  const [photographer, artworks] = await Promise.all([api.getPhotographer(slug), api.listArtworks(slug)]);
  state.photographer = photographer;
  state.artworks = sortArtworks(artworks);
  renderContent();
}

function openNew() {
  Object.assign(state, { creating: true, slug: null, photographer: null, artworks: [] });
  renderList();
  renderContent();
}

// ---- Rendering ----

function renderContent() {
  const p = state.photographer;
  if (!state.creating && !p) {
    $('content').innerHTML = '<div class="card empty muted">Elige un fotógrafo o crea uno nuevo.</div>';
    return;
  }
  $('content').innerHTML = state.creating
    ? photographerFormHtml(null)
    : [photographerFormHtml(p), linkHtml(p), publishHtml(p), artworksHtml(p), addArtworkHtml(), dangerHtml(p)].join('');
  bindContent();
  if (state.flash) {
    setMessage($(state.flash.target), state.flash.kind, state.flash.text);
    state.flash = null;
  }
}

function photographerFormHtml(p) {
  const links = p?.links || {};
  const linkFields = LINK_TYPES.map(
    (type) => `<label class="field"><span>${LINK_LABELS[type]} (opcional)</span>
      <input type="url" name="${type}" value="${esc(links[type])}" placeholder="https://…" autocomplete="off" /></label>`,
  ).join('');
  return `<section class="card section">
    <div class="section-head"><h1>${p ? esc(p.name) : 'Nuevo fotógrafo'}</h1></div>
    <form id="photographer-form" class="section" novalidate>
      <label class="field"><span>Nombre</span>
        <input type="text" name="name" value="${esc(p?.name)}" required autocomplete="off" /></label>
      <div class="grid-2">${linkFields}</div>
      <div id="photographer-message" class="message" hidden></div>
      <div class="actions">
        <button type="submit" class="btn btn-primary">${p ? 'Guardar cambios' : 'Crear fotógrafo'}</button>
        <small class="muted">${
          p
            ? 'El nombre y los enlaces se actualizan en la app al guardar. La URL no cambia.'
            : 'La URL se genera a partir del nombre y no cambia aunque edites el nombre después.'
        }</small>
      </div>
    </form>
  </section>`;
}

function linkHtml(p) {
  const url = arUrl(p.slug);
  return `<section class="card section">
    <div class="section-head"><h2>Enlace y código QR</h2></div>
    <p>URL del fotógrafo: <code>${esc(url)}</code></p>
    <div class="actions">
      <button type="button" id="btn-copy-url" class="btn btn-secondary btn-small">Copiar enlace</button>
      <a class="btn btn-secondary btn-small" href="${esc(url)}" target="_blank" rel="noopener">Abrir</a>
      <button type="button" id="btn-qr" class="btn btn-secondary btn-small">Descargar QR (PNG)</button>
      <span id="link-feedback" class="muted"></span>
    </div>
    <small class="muted">La URL y el QR no cambian nunca: solo necesitas descargar el QR una vez.</small>
  </section>`;
}

function publishHtml(p) {
  const live = p.published;
  const changes = hasUnpublishedChanges(live, state.artworks);
  const managed = new Set(state.artworks.map((a) => a.id));
  const legacy = (live?.artworks || []).filter((a) => !managed.has(a.id)).length;
  const liveText = live
    ? `Publicado: versión ${esc(live.version)}, ${live.artworks?.length || 0} obra(s).`
    : 'Aún no hay nada publicado.';
  const status = changes
    ? '<span class="status-dot warn"></span>Hay cambios sin publicar.'
    : live
      ? '<span class="status-dot ok"></span>Todo está publicado.'
      : '<span class="status-dot"></span>Añade obras y publica.';
  return `<section class="card section">
    <div class="section-head">
      <h2>Publicación</h2>
      <button type="button" id="btn-publish" class="btn btn-primary" ${changes ? '' : 'disabled'}>Publicar</button>
    </div>
    <p>${status} <span class="muted">${liveText}</span></p>
    ${
      legacy
        ? `<p class="message info">La versión publicada tiene ${legacy} obra(s) cargada(s) a mano que no están en este panel.
           Al publicar, la app mostrará solo las obras de la lista de abajo.</p>`
        : ''
    }
    <div id="publish-progress" class="section" hidden>
      <div class="progress"><div id="publish-bar"></div></div>
      <p id="publish-step" class="muted"></p>
      <p class="muted">No cierres esta página hasta que veas <strong>Publicado</strong>.</p>
    </div>
    <div id="publish-message" class="message" hidden></div>
    <div class="actions"><button type="button" id="btn-retry" class="btn btn-secondary btn-small" hidden>Reintentar</button></div>
  </section>`;
}

function artworkStatus(a) {
  const live = (state.photographer.published?.artworks || []).some((x) => x.id === a.id);
  return a.dirty || !live ? '<span class="badge warn">Sin publicar</span>' : '<span class="badge ok">Publicada</span>';
}

function artworksHtml() {
  const cards = state.artworks
    .map(
      (a) => `<article class="card artwork" data-id="${esc(a.id)}">
        <div class="artwork-media">
          <img src="${esc(api.publicUrl(a.imagePath))}" alt="Imagen objetivo de ${esc(a.title)}" loading="lazy" />
          <video src="${esc(api.publicUrl(a.videoPath))}" muted loop playsinline controls preload="metadata"></video>
        </div>
        <form class="title-row" data-form="title" novalidate>
          <label class="field"><span>Título</span><input type="text" name="title" value="${esc(a.title)}" autocomplete="off" /></label>
          <button type="submit" class="btn btn-secondary btn-small" style="align-self:end">Guardar</button>
        </form>
        <p class="artwork-meta">${artworkStatus(a)} · Autor: ${esc(a.author)} · Subida: ${esc(formatDate(a.uploadedAt))}</p>
        <div class="message" data-role="message" hidden></div>
        <details>
          <summary class="muted">Reemplazar archivos</summary>
          <form class="section" data-form="replace" novalidate style="margin-top:10px">
            <label class="field"><span>Nueva imagen objetivo</span><input type="file" name="image" accept=".jpg,.jpeg,.png,image/jpeg,image/png" /></label>
            <label class="field"><span>Nuevo video</span><input type="file" name="video" accept=".mp4,video/mp4" /></label>
            <small class="muted">Puedes reemplazar uno o ambos. Se ve en la app cuando publiques.</small>
            <div class="actions"><button type="submit" class="btn btn-secondary btn-small">Reemplazar</button></div>
          </form>
        </details>
        <div class="actions"><button type="button" class="btn btn-danger btn-small" data-action="delete">Eliminar</button></div>
      </article>`,
    )
    .join('');
  return `<section class="section">
    <div class="section-head"><h2>Obras (${state.artworks.length}/${config.maxArtworks})</h2>
      <small class="muted">El orden es el de subida.</small></div>
    ${cards ? `<div class="artworks">${cards}</div>` : '<p class="card muted">Todavía no hay obras.</p>'}
  </section>`;
}

function addArtworkHtml() {
  const full = state.artworks.length >= config.maxArtworks;
  return `<section class="card section">
    <h2>Añadir obra</h2>
    ${
      full
        ? `<p class="message info">${esc(validateArtworkCount(state.artworks.length, config.maxArtworks)[0])}</p>`
        : `<form id="artwork-form" class="section" novalidate>
      <label class="field"><span>Título (solo se ve en el panel)</span><input type="text" name="title" autocomplete="off" /></label>
      <div class="grid-2">
        <label class="field"><span>Imagen objetivo</span>
          <input type="file" name="image" accept=".jpg,.jpeg,.png,image/jpeg,image/png" />
          <small>JPG o PNG, mínimo 1000 px en el lado corto, máximo 5 MB. Mismo encuadre que la foto impresa.</small></label>
        <label class="field"><span>Video</span>
          <input type="file" name="video" accept=".mp4,video/mp4" />
          <small>MP4 (H.264 + AAC), máximo 20 s, 10 MB y 720p. Misma proporción que la imagen.</small></label>
      </div>
      <div id="artwork-message" class="message" hidden></div>
      <div class="actions">
        <button type="submit" class="btn btn-primary">Subir obra</button>
        <span id="artwork-step" class="muted"></span>
      </div>
      <small class="muted">La obra se ve en la app cuando publiques.</small>
    </form>`
    }
  </section>`;
}

function dangerHtml(p) {
  return `<section class="card section danger-zone">
    <h2>Eliminar fotógrafo</h2>
    <p class="muted">Borra a ${esc(p.name)}, sus ${state.artworks.length} obra(s) y todos sus archivos. La app deja de mostrarlo
      en el acto y su enlace y QR dejan de funcionar. No se puede deshacer.</p>
    <div id="delete-message" class="message" hidden></div>
    <div class="actions"><button type="button" id="btn-delete-photographer" class="btn btn-danger">Eliminar fotógrafo</button></div>
  </section>`;
}

// ---- Event binding ----

function bindContent() {
  $('photographer-form').addEventListener('submit', onSavePhotographer);
  if (state.creating) return;
  $('btn-copy-url').addEventListener('click', onCopyUrl);
  $('btn-qr').addEventListener('click', onDownloadQr);
  $('btn-publish').addEventListener('click', onPublish);
  $('btn-retry').addEventListener('click', onPublish);
  $('btn-delete-photographer').addEventListener('click', onDeletePhotographer);
  $('artwork-form')?.addEventListener('submit', onAddArtwork);
  for (const card of document.querySelectorAll('.artwork')) {
    const artwork = state.artworks.find((a) => a.id === card.dataset.id);
    card.querySelector('[data-form="title"]').addEventListener('submit', (e) => onSaveTitle(e, artwork, card));
    card.querySelector('[data-form="replace"]').addEventListener('submit', (e) => onReplace(e, artwork, card));
    card.querySelector('[data-action="delete"]').addEventListener('click', () => onDelete(artwork));
  }
}

function setFormDisabled(form, disabled) {
  for (const el of form.querySelectorAll('input, button')) el.disabled = disabled;
}

// ---- FR-11 handlers ----

async function onSavePhotographer(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const name = String(data.get('name') || '').trim();
  const links = Object.fromEntries(LINK_TYPES.map((t) => [t, data.get(t)]));
  const errors = validatePhotographer({ name, links });
  const message = $('photographer-message');
  setMessage(message, 'error', errors);
  if (errors.length) return;

  setFormDisabled(form, true);
  await guarded(
    () =>
      busy(async () => {
        if (state.creating) {
          const slug = await uniqueSlug(name, api.photographerExists);
          await api.createPhotographer(slug, { name, links: cleanLinks(links) });
          await loadPhotographers(slug);
          toast('ok', rich({ strong: name }, ' creado. Su URL es ', { strong: arUrl(slug) }), 8000);
        } else {
          await api.updatePhotographer(state.slug, { name, links: cleanLinks(links) });
          state.flash = { target: 'photographer-message', kind: 'ok', text: 'Cambios guardados.' };
          await loadPhotographers(state.slug);
        }
      }),
    (error) => {
      setFormDisabled(form, false);
      setMessage(message, 'error', `No se pudo guardar: ${error.message}`);
    },
  );
}

async function onDeletePhotographer() {
  const { slug, photographer } = state;
  const message = $('delete-message');
  if (state.busy > 0) return setMessage(message, 'error', 'Espera a que termine la subida o publicación en curso.');
  const confirmed = await confirmDialog({
    title: ['¿Eliminar a ', { strong: photographer.name }, '?'],
    message: 'Esta acción no se puede deshacer. Se borrará:',
    details: [
      `El fotógrafo, su nombre y sus enlaces.`,
      `Sus ${state.artworks.length} obra(s), con sus fotos y videos.`,
      'Su enlace y su código QR dejarán de funcionar en la app de inmediato.',
    ],
    confirmLabel: 'Eliminar fotógrafo',
    danger: true,
    requireText: slug,
  });
  if (!confirmed) return;

  const button = $('btn-delete-photographer');
  button.disabled = true;
  setMessage(message, 'info', 'Eliminando…');
  await guarded(
    () =>
      busy(async () => {
        await api.deletePhotographer(slug);
        const parts = [{ strong: photographer.name }, ' eliminado.'];
        try {
          await api.removeFiles(await api.listFiles(`photographers/${slug}`));
        } catch (error) {
          console.warn('File cleanup failed', error);
          parts.push(' Algunos archivos no se pudieron borrar del almacenamiento (no afecta a la app).');
        }
        state.slug = null;
        await loadPhotographers(null);
        toast(parts.length > 2 ? 'info' : 'ok', rich(...parts));
      }),
    (error) => {
      button.disabled = false;
      setMessage(message, 'error', api.isNetworkError(error) ? 'Se perdió la conexión, intenta de nuevo.' : `No se pudo eliminar: ${error.message}`);
    },
  );
}

// ---- FR-14 ----

async function onCopyUrl() {
  const url = arUrl(state.slug);
  try {
    await navigator.clipboard.writeText(url);
    $('link-feedback').textContent = 'Enlace copiado.';
  } catch {
    $('link-feedback').textContent = url;
  }
}

async function onDownloadQr() {
  try {
    downloadBlob(await qrPngBlob(arUrl(state.slug)), `qr-${state.slug}.png`);
  } catch (error) {
    $('link-feedback').textContent = error.message;
  }
}

// ---- FR-12 handlers ----

async function checkFiles({ image, video, imageRatio, videoRatio }) {
  const errors = [];
  let imageInfo = null;
  let videoInfo = null;
  if (image) {
    imageInfo = await readImageInfo(image);
    errors.push(...validateImage(imageInfo, LIMITS.image));
  }
  if (video) {
    videoInfo = await readVideoInfo(video);
    errors.push(...validateVideo(videoInfo, LIMITS.video));
  }
  const iRatio = imageInfo?.width ? imageInfo.width / imageInfo.height : imageRatio;
  const vRatio = videoInfo?.width ? videoInfo.width / videoInfo.height : videoRatio;
  errors.push(...validateAspect(iRatio, vRatio, LIMITS.aspectTolerance));
  return { errors, imageRatio: iRatio, videoRatio: vRatio };
}

async function onAddArtwork(event) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const title = String(data.get('title') || '').trim();
  const image = data.get('image')?.size ? data.get('image') : null;
  const video = data.get('video')?.size ? data.get('video') : null;
  const message = $('artwork-message');
  const step = $('artwork-step');

  const errors = [...validateTitle(title), ...validateArtworkCount(state.artworks.length, config.maxArtworks)];
  if (!image) errors.push('Elige la imagen objetivo.');
  if (!video) errors.push('Elige el video.');
  setMessage(message);
  setFormDisabled(form, true);
  step.textContent = 'Revisando archivos…';
  const checked = image && video ? await checkFiles({ image, video }) : { errors: [] };
  errors.push(...checked.errors);
  if (errors.length) {
    step.textContent = '';
    setFormDisabled(form, false);
    return setMessage(message, 'error', errors);
  }

  const slug = state.slug;
  const id = api.newArtworkId();
  const now = Date.now();
  const imagePath = mediaPath(slug, id, 'image', image, now);
  const videoPath = mediaPath(slug, id, 'video', video, now);
  await guarded(
    () =>
      busy(async () => {
        step.textContent = 'Subiendo imagen…';
        await api.uploadFile(imagePath, image, image.type);
        step.textContent = 'Subiendo video…';
        await api.uploadFile(videoPath, video, 'video/mp4');
        step.textContent = 'Guardando…';
        try {
          await api.createArtwork(id, {
            photographerSlug: slug,
            title,
            author: state.photographer.name,
            imagePath,
            videoPath,
            aspectRatio: checked.imageRatio,
            videoAspectRatio: checked.videoRatio,
          });
        } catch (error) {
          api.removeFiles([imagePath, videoPath]).catch(() => {});
          throw error;
        }
        state.flash = { target: 'publish-message', kind: 'info', text: rich({ strong: title }, ' se subió. Publica para que se vea en la app.') };
        await openPhotographer(slug);
      }),
    (error) => {
      step.textContent = '';
      setFormDisabled(form, false);
      setMessage(message, 'error', api.isNetworkError(error) ? 'Se perdió la conexión, intenta de nuevo.' : `No se pudo subir: ${error.message}`);
    },
  );
}

async function onSaveTitle(event, artwork, card) {
  event.preventDefault();
  const form = event.currentTarget;
  const title = String(new FormData(form).get('title') || '').trim();
  const message = card.querySelector('[data-role="message"]');
  const errors = validateTitle(title);
  setMessage(message, 'error', errors);
  if (errors.length || title === artwork.title) return;
  setFormDisabled(form, true);
  await guarded(
    async () => {
      await api.updateArtwork(artwork.id, { title }); // AC-12.5: the AR experience does not change
      artwork.title = title;
      setFormDisabled(form, false);
      setMessage(message, 'ok', 'Título guardado.');
    },
    (error) => {
      setFormDisabled(form, false);
      setMessage(message, 'error', `No se pudo guardar: ${error.message}`);
    },
  );
}

async function onReplace(event, artwork, card) {
  event.preventDefault();
  const form = event.currentTarget;
  const data = new FormData(form);
  const image = data.get('image')?.size ? data.get('image') : null;
  const video = data.get('video')?.size ? data.get('video') : null;
  const message = card.querySelector('[data-role="message"]');
  if (!image && !video) return setMessage(message, 'error', 'Elige una imagen, un video o ambos.');

  setFormDisabled(form, true);
  setMessage(message, 'info', 'Revisando archivos…');
  const checked = await checkFiles({
    image,
    video,
    imageRatio: artwork.aspectRatio,
    videoRatio: artwork.videoAspectRatio,
  });
  if (checked.errors.length) {
    setFormDisabled(form, false);
    return setMessage(message, 'error', checked.errors);
  }

  const now = Date.now();
  const patch = { dirty: true };
  await guarded(
    () =>
      busy(async () => {
        if (image) {
          setMessage(message, 'info', 'Subiendo imagen…');
          patch.imagePath = mediaPath(state.slug, artwork.id, 'image', image, now);
          patch.aspectRatio = checked.imageRatio;
          await api.uploadFile(patch.imagePath, image, image.type);
        }
        if (video) {
          setMessage(message, 'info', 'Subiendo video…');
          patch.videoPath = mediaPath(state.slug, artwork.id, 'video', video, now);
          patch.videoAspectRatio = checked.videoRatio;
          await api.uploadFile(patch.videoPath, video, 'video/mp4');
        }
        // The previous files stay until the next publication: the live version may still use them.
        await api.updateArtwork(artwork.id, patch);
        state.flash = { target: 'publish-message', kind: 'info', text: rich('Archivos de ', { strong: artwork.title }, ' reemplazados. Publica para que se vea en la app.') };
        await openPhotographer(state.slug);
      }),
    (error) => {
      setFormDisabled(form, false);
      setMessage(message, 'error', api.isNetworkError(error) ? 'Se perdió la conexión, intenta de nuevo.' : `No se pudo reemplazar: ${error.message}`);
    },
  );
}

async function onDelete(artwork) {
  const confirmed = await confirmDialog({
    title: ['¿Eliminar ', { strong: artwork.title }, '?'],
    message: ['¿Estás seguro de que quieres quitar ', { strong: artwork.title }, ' de tu galería? Se seguirá viendo en la app hasta que publiques.'],
    confirmLabel: 'Eliminar obra',
    danger: true,
  });
  if (!confirmed) return;
  await guarded(async () => {
    await api.deleteArtwork(artwork.id); // its files are removed after the next publication
    state.flash = { target: 'publish-message', kind: 'info', text: rich({ strong: artwork.title }, ' eliminada. Publica para quitarla de la app.') };
    await openPhotographer(state.slug);
  });
}

// ---- FR-13: publishing (ERR-11, ERR-12) ----

async function onPublish() {
  const slug = state.slug;
  const keep = new Set(state.artworks.map((a) => a.id));
  const dropped = (state.photographer.published?.artworks || []).filter((a) => !keep.has(a.id)).length;
  if (dropped && !confirm(`Al publicar, la app dejará de reconocer ${dropped} obra(s) que hoy están publicadas. ¿Continuar?`)) return;
  let committed = false;
  const progress = $('publish-progress');
  const bar = $('publish-bar');
  const step = $('publish-step');
  const setProgress = (percent, text) => {
    bar.style.width = `${percent}%`;
    if (text) step.textContent = text;
  };
  $('btn-publish').disabled = true;
  $('btn-retry').hidden = true;
  setMessage($('publish-message'));
  progress.hidden = false;
  setProgress(2, 'Preparando…');

  await guarded(
    () =>
      busy(async () => {
        // Fresh data: what is published is exactly what is stored now.
        const [photographer, stored] = await Promise.all([api.getPhotographer(slug), api.listArtworks(slug)]);
        const artworks = sortArtworks(stored);
        const version = nextVersion(photographer.published);
        let targetsUrl = null;

        if (artworks.length > 0) {
          setProgress(5, `Compilando el reconocimiento de ${artworks.length} foto(s)… puede tardar un minuto.`);
          const bytes = await compileTargets(
            artworks.map((a) => api.publicUrl(a.imagePath)),
            (percent) => setProgress(5 + percent * 0.85),
          );
          setProgress(90, 'Subiendo targets.mind…');
          const path = targetsPath(slug, version);
          await api.uploadFile(path, new Blob([bytes], { type: 'application/octet-stream' }), 'application/octet-stream');
          targetsUrl = api.publicUrl(path);
        }

        setProgress(95, 'Publicando…');
        const published = buildPublished({ artworks, version, targetsUrl, publicUrl: api.publicUrl });
        await api.commitPublication(slug, published, artworks.map((a) => a.id));
        committed = true;
        setProgress(100, 'Publicado.');

        // Best effort: remove files that nothing uses any more (replaced, deleted, older targets.mind).
        try {
          const listed = await api.listFiles(`photographers/${slug}`);
          await api.removeFiles(unusedPaths({ slug, listedPaths: listed, artworks, version }));
        } catch (error) {
          console.warn('Cleanup skipped', error);
        }

        state.flash = {
          target: 'publish-message',
          kind: 'ok',
          text: `Publicado (versión ${version}). Ya se ve en la app con el mismo enlace y QR.`,
        };
        await openPhotographer(slug);
      }),
    (error) => {
      progress.hidden = true;
      if (committed) {
        return setMessage($('publish-message'), 'ok', 'Publicado. Recarga la página para ver el estado actualizado.');
      }
      $('btn-publish').disabled = false;
      $('btn-retry').hidden = false;
      setMessage(
        $('publish-message'),
        'error',
        api.isNetworkError(error) ? 'Se perdió la conexión, intenta de nuevo.' : 'La publicación falló, intenta de nuevo.',
      );
    },
  );
}
