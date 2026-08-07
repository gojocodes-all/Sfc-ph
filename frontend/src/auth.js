const SUPABASE_URL = 'https://ahvusnmuyfvdzjmdkgzj.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_JODLl_4Ue29jwz2w8hSSSw_UO4l5OJZ';
const AUTH_STORAGE_KEY = 'nymbox_auth_session';

function readAuthSession() {
  try {
    const parsed = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || 'null');
    if (!parsed || !parsed.access_token || !parsed.refresh_token) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeAuthSession(session) {
  if (!session?.access_token || !session?.refresh_token) {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    return null;
  }
  const expiresAt = session.expires_at || Math.floor(Date.now() / 1000) + Number(session.expires_in || 3600);
  const stored = { ...session, expires_at: expiresAt };
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(stored));
  return stored;
}

function clearAuthSession() {
  localStorage.removeItem(AUTH_STORAGE_KEY);
}

function authAccessToken() {
  const session = readAuthSession();
  if (!session) return null;
  return session.access_token || null;
}

function authUser() {
  return readAuthSession()?.user || null;
}

function authHeaders(extra = {}) {
  const token = authAccessToken();
  return {
    ...extra,
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function supabaseAuthRequest(path, options = {}) {
  const response = await fetch(`${SUPABASE_URL}/auth/v1${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_PUBLISHABLE_KEY,
      'content-type': 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.msg || data.message || data.error_description || data.error || `Authentication failed (${response.status}).`);
    error.status = response.status;
    error.data = data;
    throw error;
  }
  return data;
}

async function refreshAuthSession(force = false) {
  const current = readAuthSession();
  if (!current?.refresh_token) return null;
  const now = Math.floor(Date.now() / 1000);
  if (!force && current.expires_at && current.expires_at - now > 90) return current;
  try {
    const fresh = await supabaseAuthRequest('/token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: current.refresh_token })
    });
    return writeAuthSession(fresh);
  } catch {
    clearAuthSession();
    return null;
  }
}

async function signUpWithEmail(email, password, displayName) {
  const data = await supabaseAuthRequest('/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, data: { display_name: displayName } })
  });
  if (data.access_token) writeAuthSession(data);
  return data;
}

async function signInWithEmail(email, password) {
  const data = await supabaseAuthRequest('/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password })
  });
  writeAuthSession(data);
  return data;
}

async function sendPasswordReset(email) {
  return supabaseAuthRequest('/recover', {
    method: 'POST',
    body: JSON.stringify({ email, redirect_to: `${location.origin}/auth?mode=reset` })
  });
}

async function signOutAccount() {
  const token = authAccessToken();
  if (token) {
    await fetch(`${SUPABASE_URL}/auth/v1/logout`, {
      method: 'POST',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}` }
    }).catch(() => null);
  }
  clearAuthSession();
}

function startGoogleAuth() {
  const redirect = encodeURIComponent(`${location.origin}/auth/callback`);
  location.assign(`${SUPABASE_URL}/auth/v1/authorize?provider=google&redirect_to=${redirect}`);
}

function consumeOAuthHash() {
  if (!location.hash || !location.hash.includes('access_token=')) return false;
  const params = new URLSearchParams(location.hash.slice(1));
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (!accessToken || !refreshToken) return false;
  const expiresIn = Number(params.get('expires_in') || 3600);
  writeAuthSession({
    access_token: accessToken,
    refresh_token: refreshToken,
    expires_in: expiresIn,
    expires_at: Math.floor(Date.now() / 1000) + expiresIn,
    token_type: params.get('token_type') || 'bearer',
    user: null
  });
  history.replaceState({}, '', location.pathname + location.search);
  return true;
}

async function hydrateAuthUser() {
  const session = await refreshAuthSession();
  if (!session?.access_token) return null;
  if (session.user?.id) return session.user;
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${session.access_token}` }
    });
    const user = await response.json();
    if (!response.ok || !user?.id) throw new Error('Session unavailable.');
    writeAuthSession({ ...session, user });
    return user;
  } catch {
    clearAuthSession();
    return null;
  }
}

async function googleProviderEnabled() {
  try {
    const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY }
    });
    const settings = await response.json();
    return Boolean(response.ok && settings?.external?.google);
  } catch {
    return false;
  }
}

consumeOAuthHash();
refreshAuthSession().catch(() => null);
