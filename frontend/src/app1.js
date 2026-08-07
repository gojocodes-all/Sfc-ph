const DEFAULT_API_BASE = 'https://ahvusnmuyfvdzjmdkgzj.supabase.co/functions/v1/phx-api';
const API_BASE = String(window.__PHX_CONFIG__?.apiBase || DEFAULT_API_BASE).replace(/\/$/, '');
const APP_NAME = 'NYMBOX';
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
  toastTimer = setTimeout(() => element.classList.remove('show'), 3200);
}

async function api(path, options = {}, timeoutMs = 35000) {
  await refreshAuthSession().catch(() => null);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(API_BASE + path, {
      ...options,
      signal: options.signal || controller.signal,
      headers: authHeaders({ ...(options.headers || {}) })
    });
    const contentType = response.headers.get('content-type') || '';
    let data = null;
    if (contentType.includes('application/json')) data = await response.json().catch(() => null);
    else {
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
  return '<a class="brand" href="/" aria-label="NYMBOX home"><span class="brand-mark"><i></i><i></i></span><span class="brand-copy"><strong>NYMBOX</strong><span>ANONYMOUS</span></span></a>';
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
  const last = localStorage.getItem('nymbox_last_inbox') || localStorage.getItem('phsfc_last_inbox');
  if (last && !localStorage.getItem(ownerKey(last)) && !authAccessToken()) localStorage.removeItem('nymbox_last_inbox');
}

function savedInboxes() {
  cleanupOwnerStorage();
  return Object.keys(localStorage)
    .filter((key) => key.startsWith('owner_'))
    .map((key) => key.slice(6))
    .filter(validSlug);
}

function saveOwner(slug, token) {
  if (!validSlug(slug)) throw new Error('Inbox creation returned invalid owner data.');
  if (token && validToken(token)) localStorage.setItem(ownerKey(slug), token);
  localStorage.setItem('nymbox_last_inbox', slug);
  localStorage.removeItem('phsfc_last_inbox');
}

function removeOwner(slug) {
  localStorage.removeItem(ownerKey(slug));
  if (localStorage.getItem('nymbox_last_inbox') === slug) localStorage.removeItem('nymbox_last_inbox');
}

function ownerToken(slug) {
  const token = localStorage.getItem(ownerKey(slug));
  return validToken(token) ? token : null;
}

function ownerHeaders(token, extra = {}) {
  return authHeaders({ ...extra, ...(token ? { 'x-owner-token': token } : {}) });
}

function deviceId() {
  let id = localStorage.getItem('nymbox_device') || localStorage.getItem('phsfc_device');
  if (!id) {
    id = crypto.randomUUID?.() || `dev_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
  localStorage.setItem('nymbox_device', id);
  localStorage.removeItem('phsfc_device');
  return id;
}

async function home() {
  const user = await hydrateAuthUser().catch(() => null);
  const saved = savedInboxes();
  const last = localStorage.getItem('nymbox_last_inbox');
  const defaultSaved = (last && saved.includes(last)) ? last : saved[0];
  app.innerHTML = `<div class="marketing-shell">${topbar(user ? '<a class="top-action" href="/account">My account</a>' : '<a class="top-action" href="/auth">Sign in</a>')}<main class="home-v3"><section class="hero-v3"><div class="hero-copy"><div class="section-kicker">Anonymous messages, upgraded</div><h1>Say it anonymously. Share it beautifully.</h1><p>Receive anonymous text, images, voice notes and polls through one link. Reply with clean shareable cards and keep control of your inbox.</p><div class="hero-actions">${user ? '<a class="btn primary" href="/account">Open my account</a><a class="btn" href="#create">Create another link</a>' : '<a class="btn primary" href="/auth?mode=signup">Create your free account</a><a class="btn" href="#how">How it works</a>'}</div></div><div class="hero-demo card"><div class="label">Your link</div><div class="big-link">/yourname</div><div class="demo-message"><span>Anonymous</span><strong>Drop your honest opinion 👀</strong></div><div class="demo-tools"><span>Text</span><span>Image</span><span>Voice</span><span>Poll</span></div></div></section>${user ? `<section id="create" class="create-v3"><div><div class="section-kicker">Create a link</div><h2>Start another inbox</h2><p>Your links stay attached to your account, not one browser.</p></div><form id="createForm" class="card"><div class="field"><label for="displayName">Display name</label><input id="displayName" name="displayName" maxlength="40" autocomplete="nickname" value="${esc(user.user_metadata?.display_name || '')}" placeholder="Your name" required></div><div class="field"><label for="handle">Link name</label><input id="handle" name="handle" maxlength="28" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="yourname" required></div><button class="btn primary" type="submit" style="width:100%">Create anonymous link</button></form></section>` : ''}<section id="how" class="feature-grid"><article><strong>1. Create</strong><p>Make an account and choose your anonymous link.</p></article><article><strong>2. Share</strong><p>Post the link anywhere. Senders never need an account.</p></article><article><strong>3. Receive</strong><p>Get text, images, voice notes and polls in one private inbox.</p></article><article><strong>4. Reply</strong><p>Turn messages into branded image cards ready for social media.</p></article></section>${defaultSaved && !user ? `<section class="legacy-card card"><h2>Existing inbox?</h2><p>This browser still has access to one of your older inboxes.</p><button type="button" id="openSaved" class="btn primary">Open saved inbox</button><a class="btn" href="/auth">Create an account</a></section>` : ''}<section class="seo-copy"><h2>Anonymous messaging with more than text</h2><p>NYMBOX is a lightweight anonymous messaging tool for creators, students, communities and anyone who wants honest feedback without exposing the sender. Each inbox can receive written messages, images, voice notes and interactive anonymous polls.</p><h2>Built for sharing</h2><p>Messages and replies can be exported as clean image cards, making it easy to share responses on social platforms without screenshots full of browser chrome.</p></section></main>${footer()}</div>`;

  $('#createForm')?.addEventListener('submit', async (event) => {
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
      if (!validSlug(data.slug)) throw new Error('Inbox creation failed. Please retry.');
      saveOwner(data.slug, data.ownerToken);
      nav(`/dashboard/${encodeURIComponent(data.slug)}`);
    } catch (error) {
      if (error.status === 401) nav('/auth?mode=signup');
      else toast(error.message);
    } finally {
      if (button) button.disabled = false;
    }
  });

  $('#openSaved')?.addEventListener('click', () => {
    if (defaultSaved) nav(`/dashboard/${encodeURIComponent(defaultSaved)}`);
  });
}
