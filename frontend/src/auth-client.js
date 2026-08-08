import { createClient } from '@supabase/supabase-js';

const config = window.__PICNYM_CONFIG__ || {};
const supabaseUrl = String(config.supabaseUrl || '');
const supabaseKey = String(config.supabaseKey || '');

if (!supabaseUrl || !supabaseKey) throw new Error('PICNYM auth configuration is missing.');

const client = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    storageKey: 'picnym-auth'
  }
});

async function getSession() {
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session || null;
}

async function accessToken() {
  return (await getSession())?.access_token || null;
}

async function signUp({ email, password, displayName }) {
  const { data, error } = await client.auth.signUp({
    email: String(email || '').trim(),
    password: String(password || ''),
    options: {
      emailRedirectTo: `${location.origin}/`,
      data: {
        display_name: String(displayName || '').trim(),
        full_name: String(displayName || '').trim()
      }
    }
  });
  if (error) throw error;
  return data;
}

async function signIn({ email, password }) {
  const { data, error } = await client.auth.signInWithPassword({
    email: String(email || '').trim(),
    password: String(password || '')
  });
  if (error) throw error;
  return data;
}

let googleEnabledCache = null;
async function isGoogleEnabled({ refresh = false } = {}) {
  if (!refresh && googleEnabledCache !== null) return googleEnabledCache;
  try {
    const response = await fetch(`${supabaseUrl}/auth/v1/settings`, {
      headers: { apikey: supabaseKey },
      cache: 'no-store'
    });
    if (!response.ok) return false;
    const settings = await response.json();
    googleEnabledCache = Boolean(settings?.external?.google);
    return googleEnabledCache;
  } catch {
    return false;
  }
}

async function signInWithGoogle() {
  if (!await isGoogleEnabled({ refresh: true })) {
    throw new Error('Google sign-in is not enabled yet. Use email and password for now.');
  }
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${location.origin}/`,
      queryParams: { access_type: 'offline', prompt: 'select_account' }
    }
  });
  if (error) throw error;
  return data;
}

async function requestPasswordReset(email) {
  const value = String(email || '').trim();
  if (!value) throw new Error('Enter your email address.');
  const { data, error } = await client.auth.resetPasswordForEmail(value, {
    redirectTo: `${location.origin}/reset-password`
  });
  if (error) throw error;
  return data;
}

async function updatePassword(password) {
  const value = String(password || '');
  if (value.length < 8) throw new Error('Use at least 8 characters for your password.');
  const { data, error } = await client.auth.updateUser({ password: value });
  if (error) throw error;
  return data.user;
}

async function signOut() {
  const { error } = await client.auth.signOut();
  if (error) throw error;
}

async function updateProfile(displayName) {
  const value = String(displayName || '').trim().slice(0, 60);
  if (!value) throw new Error('Enter a display name.');
  const { data, error } = await client.auth.updateUser({
    data: { display_name: value, full_name: value }
  });
  if (error) throw error;
  return data.user;
}

function onChange(callback) {
  return client.auth.onAuthStateChange((event, session) => callback(event, session));
}

window.PicnymAuth = {
  client,
  config,
  getSession,
  accessToken,
  signUp,
  signIn,
  isGoogleEnabled,
  signInWithGoogle,
  requestPasswordReset,
  updatePassword,
  signOut,
  updateProfile,
  onChange
};
