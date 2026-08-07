const DEFAULT_API_BASE = 'https://ahvusnmuyfvdzjmdkgzj.supabase.co/functions/v1/phx-api';
const API_BASE = String(window.__PHX_CONFIG__?.apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
const app = document.querySelector('#app');
const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
let toastTimer;

const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

const fmt = (input) => {
  const date = new Date(input);
  return Number.isNaN(date.getTime()) ? '' : new Intl.DateTimeFormat(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  }).format(date);
};

function toast(message) {
  const element = $('#toast');
  if (!element) return;
  element.textContent = String(message || 'Something went wrong.');
  element.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => element.classList.remove('show'), 2800);
}

async function api(path, options = {}, timeoutMs = 35000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(API_BASE + path, {
      ...options,
      signal: options.signal || controller.signal,
      headers: { ...(options.headers || {}) }
    });
    const contentType = response.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) {
      data = await response.json().catch(() => null);
    } else {
      const text = await response.text().catch(() => '');
      if (text) data = { error: text.slice(0, 180) };
    }
    if (!response.ok) {
      const error = new Error(data?.error || `Request failed (${response.status}).`);
      error.status = response.status;
      error.data = data;
      throw error;
    }
    if (!data || typeof data !== 'object') throw new Error('The server returned an invalid response.');
    return data;
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('The request timed out. Please try again.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

function brand() {
  return '<a class="brand" href="/" aria-label="PH X SFC ANONYMOUS home"><span class="brand-mark"><i></i><i></i></span><span class="brand-copy"><strong>PH X SFC</strong><span>ANONYMOUS</span></span></a>';
}
function topbar(action = '') { return `<header class="topbar">${brand()}${action}</header>`; }
function nav(path) { location.assign(path); }

function modal(html) {
  const wrapper = document.createElement('div');
  wrapper.className = 'modal-backdrop';
  wrapper.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  wrapper.addEventListener('click', (event) => { if (event.target === wrapper) wrapper.remove(); });
  document.body.appendChild(wrapper);
  return wrapper;
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copied.');
  } catch {
    const area = document.createElement('textarea');
    area.value = text;
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand?.('copy');
    area.remove();
    toast(ok ? 'Copied.' : 'Copy failed.');
  }
}

async function share(payload, fallbackText = '') {
  try {
    if (navigator.share) return await navigator.share(payload);
    return copy(fallbackText || payload.url || payload.text || '');
  } catch (error) {
    if (error?.name !== 'AbortError') toast('Could not open sharing.');
  }
}

function validSlug(slug) { return /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(String(slug || '')); }
function validToken(token) { return /^tok_[a-z0-9]{20,}$/i.test(String(token || '')); }
function ownerKey(slug) { return `owner_${slug}`; }

function cleanupOwnerStorage() {
  for (const key of Object.keys(localStorage)) {
    if (!key.startsWith('owner_')) continue;
    const slug = key.slice(6);
    const token = localStorage.getItem(key);
    if (!validSlug(slug) || !validToken(token)) localStorage.removeItem(key);
  }
  const last = localStorage.getItem('phsfc_last_inbox');
  if (last && !localStorage.getItem(ownerKey(last))) localStorage.removeItem('phsfc_last_inbox');
}

function savedInboxes() {
  cleanupOwnerStorage();
  return Object.keys(localStorage)
    .filter((key) => key.startsWith('owner_'))
    .map((key) => key.slice(6))
    .filter(validSlug);
}

function saveOwner(slug, token) {
  if (!validSlug(slug) || !validToken(token)) throw new Error('Inbox creation returned invalid owner data.');
  localStorage.setItem(ownerKey(slug), token);
  localStorage.setItem('phsfc_last_inbox', slug);
}

function removeOwner(slug) {
  localStorage.removeItem(ownerKey(slug));
  if (localStorage.getItem('phsfc_last_inbox') === slug) localStorage.removeItem('phsfc_last_inbox');
}

function ownerToken(slug) {
  const token = localStorage.getItem(ownerKey(slug));
  return validToken(token) ? token : null;
}

function ownerHeaders(token, extra = {}) {
  return { ...extra, 'x-owner-token': token };
}

function deviceId() {
  let id = localStorage.getItem('phsfc_device');
  if (!id) {
    id = crypto.randomUUID?.() || `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem('phsfc_device', id);
  }
  return id;
}

function home() {
  const saved = savedInboxes();
  const last = localStorage.getItem('phsfc_last_inbox');
  const defaultSaved = (last && saved.includes(last)) ? last : saved[0];
  app.innerHTML = `<main class="home"><section class="home-box">${brand()}<h1>Anonymous, without the extra noise.</h1><p>Create your link and share it.</p><form id="createForm" class="card"><div class="field"><label for="displayName">Your name</label><input id="displayName" name="displayName" maxlength="40" autocomplete="nickname" placeholder="Gojo" required></div><div class="field"><label for="handle">Link name</label><input id="handle" name="handle" maxlength="28" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="gojocodes" required></div><button class="btn primary" type="submit" style="width:100%">Create anonymous link</button>${defaultSaved ? '<button type="button" id="openSaved" class="btn" style="width:100%;margin-top:9px">Open my inbox</button>' : ''}</form></section></main>`;

  $('#createForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter || $('#createForm button[type="submit"]');
    if (button) button.disabled = true;
    try {
      const form = new FormData(event.currentTarget);
      const displayName = String(form.get('displayName') || '').trim();
      const handle = String(form.get('handle') || '').trim();
      if (!displayName || !handle) throw new Error('Enter your name and link name.');
      const data = await api('/api/inboxes', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ displayName, handle })
      });
      if (!validSlug(data.slug) || !validToken(data.ownerToken)) throw new Error('Inbox creation failed. Please retry.');
      saveOwner(data.slug, data.ownerToken);
      nav(`/dashboard/${encodeURIComponent(data.slug)}`);
    } catch (error) {
      toast(error.message);
    } finally {
      if (button) button.disabled = false;
    }
  });

  $('#openSaved')?.addEventListener('click', () => {
    if (defaultSaved) nav(`/dashboard/${encodeURIComponent(defaultSaved)}`);
  });
}
