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

async function signInWithGoogle() {
  if (!config.googleOAuthEnabled) throw new Error('Google sign-in is not enabled on this deployment yet.');
  const { data, error } = await client.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${location.origin}/` }
  });
  if (error) throw error;
  return data;
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
  signInWithGoogle,
  signOut,
  updateProfile,
  onChange
};
