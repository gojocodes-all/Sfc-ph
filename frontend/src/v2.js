const PICNYM = 'PICNYM';
const legacyBrand = brand;
const legacyApi = api;
const legacyMessageCardBlob = typeof messageCardBlob === 'function' ? messageCardBlob : null;
const legacyShareImageFiles = typeof shareImageFiles === 'function' ? shareImageFiles : null;

function picnymConfig() { return window.__PICNYM_CONFIG__ || {}; }
function currentHostLabel() {
  try { return new URL(picnymConfig().siteUrl || location.origin).hostname; }
  catch { return location.hostname; }
}
function userDisplayName(user) {
  return String(user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.user_metadata?.name || user?.email?.split('@')[0] || 'User');
}
async function authSession() {
  try { return await window.PicnymAuth?.getSession?.(); }
  catch { return null; }
}

brand = function brand() {
  return '<a class="brand" href="/" aria-label="PICNYM home"><img class="brand-mark" src="/favicon.svg" width="40" height="40" alt=""><span class="brand-copy"><strong>PICNYM</strong><span>PRIVATE INBOX</span></span></a>';
};

ownerHeaders = function ownerHeaders(token, extra = {}) {
  const headers = { ...extra };
  if (validToken(token)) headers['x-owner-token'] = token;
  return headers;
};

api = async function authenticatedApi(path, options = {}, timeoutMs = 35000) {
  const headers = { ...(options.headers || {}) };
  try {
    const token = await window.PicnymAuth?.accessToken?.();
    if (token && !headers.Authorization && !headers.authorization) headers.Authorization = `Bearer ${token}`;
  } catch {}
  return legacyApi(path, { ...options, headers }, timeoutMs);
};

function renderAuthTabs(mode = 'signup') {
  const signup = mode !== 'signin';
  return `<section class="card auth-card" aria-labelledby="authTitle">
    <div class="auth-intro">
      <span class="auth-badge">Your private inbox</span>
      <h2 id="authTitle">${signup ? 'Make your PICNYM.' : 'Good to see you again.'}</h2>
      <p>${signup ? 'One account keeps your links, replies and safety controls together.' : 'Your inboxes are right where you left them.'}</p>
    </div>
    <div class="auth-tabs" role="tablist">
      <button class="auth-tab ${signup ? 'active' : ''}" type="button" role="tab" aria-selected="${signup}" data-auth-mode="signup">Create account</button>
      <button class="auth-tab ${signup ? '' : 'active'}" type="button" role="tab" aria-selected="${!signup}" data-auth-mode="signin">Sign in</button>
    </div>
    <button id="googleAuth" class="btn google-btn" type="button">
      <span class="google-g" aria-hidden="true">G</span> Continue with Google
    </button>
    <div class="auth-or"><span>or use email</span></div>
    ${signup ? `<form id="signupForm">
      <div class="field"><label for="signupName">Display name</label><input id="signupName" name="displayName" maxlength="60" autocomplete="name" required></div>
      <div class="field"><label for="signupEmail">Email</label><input id="signupEmail" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="signupPassword">Password</label><input id="signupPassword" name="password" type="password" minlength="8" autocomplete="new-password" required></div>
      <label class="eligibility-check"><input id="signupEligibility" name="eligibility" type="checkbox" required><span>I confirm I am 18 or older and accept the <a href="/terms">Terms</a> and <a href="/privacy">Privacy Policy</a>.</span></label>
      <button class="btn primary auth-submit" type="submit">Create account</button>
    </form>` : `<form id="signinForm">
      <div class="field"><label for="signinEmail">Email</label><input id="signinEmail" name="email" type="email" autocomplete="email" required></div>
      <div class="field"><label for="signinPassword">Password</label><input id="signinPassword" name="password" type="password" autocomplete="current-password" required></div>
      <button class="btn primary auth-submit" type="submit">Sign in</button>
    </form>`}
    <p class="auth-trust"><span aria-hidden="true">&#10003;</span> Anonymous to recipients. Account-protected for you.</p>
  </section>`;
}

async function home(modeFromQuery) {
  stopDashboardRefresh?.();
  const session = await authSession();
  const saved = savedInboxes();
  const last = localStorage.getItem('phsfc_last_inbox');
  const defaultSaved = (last && saved.includes(last)) ? last : saved[0];
  const authMode = modeFromQuery || (new URLSearchParams(location.search).get('auth') === 'signin' ? 'signin' : 'signup');
  const accountCard = session ? `<section class="card account-welcome creator-card">
      <div class="account-row"><div><div class="label">Your creator space</div><strong>${esc(userDisplayName(session.user))}</strong><div class="form-note">${esc(session.user.email || '')}</div></div><a class="btn small" href="/account">Open account</a></div>
      <form id="createForm" style="margin-top:20px">
        <div class="field"><label for="displayName">Name shown on your inbox</label><input id="displayName" name="displayName" maxlength="40" autocomplete="nickname" value="${esc(userDisplayName(session.user))}" required></div>
        <div class="field"><label for="handle">Your link</label><div class="slug-field"><span>/u/</span><input id="handle" name="handle" maxlength="28" autocapitalize="none" autocomplete="off" spellcheck="false" placeholder="your-name" required></div></div>
        <button class="btn primary auth-submit" type="submit">Create anonymous link</button>
      </form>
      ${defaultSaved ? `<button type="button" id="openSaved" class="btn saved-inbox-btn">Open saved inbox</button>` : ''}
    </section>` : renderAuthTabs(authMode);

  app.innerHTML = `<main id="main-content" class="home v2-home market-home">
    <header class="market-nav">
      ${brand()}
      <nav aria-label="Primary navigation"><a href="/features">Features</a><a href="/safety">Safety</a>${session ? '<a href="/account">Account</a>' : '<a class="nav-cta" href="/?auth=signin">Sign in</a>'}</nav>
    </header>
    <section class="market-hero">
      <div class="hero-copy">
        <p class="home-kicker">Anonymous inbox, on your terms</p>
        <h1>Ask for honesty.<br><em>Keep names out of it.</em></h1>
        <p class="hero-lede">Create one link for anonymous text, photos, voice notes and polls. You control who can send, what stays private and what gets a reply.</p>
        <div class="hero-actions"><a class="btn primary" href="#start">Create your PICNYM link</a><a class="text-link" href="/safety">How safety works</a></div>
        <dl class="hero-facts"><div><dt>01</dt><dd>Private by default</dd></div><div><dt>02</dt><dd>Four message formats</dd></div><div><dt>03</dt><dd>Receiver-controlled</dd></div></dl>
      </div>
      <div id="start" class="hero-panel">${accountCard}</div>
    </section>
    <section class="process-section" aria-labelledby="process-title">
      <div class="section-heading"><span>How PICNYM works</span><h2 id="process-title">One link. Three clear decisions.</h2></div>
      <ol class="process-list"><li><span>01 / CREATE</span><div><h3>Open a private inbox.</h3><p>Choose the name on the page and the link you want to share.</p></div></li><li><span>02 / COLLECT</span><div><h3>Let people choose how to answer.</h3><p>They can send text, a supported photo, a voice note or a poll.</p></div></li><li><span>03 / CONTROL</span><div><h3>Keep, reply, publish or remove.</h3><p>Nothing becomes a public answer unless you deliberately publish it.</p></div></li></ol>
    </section>
    <section class="format-ledger" aria-labelledby="formats-title">
      <div class="format-intro"><span>Message formats</span><h2 id="formats-title">More than a text box.</h2><p>Every format arrives in the same private dashboard and follows the same receiver controls.</p></div>
      <div class="format-rows"><article><b>01</b><h3>Text</h3><p>Questions, feedback and notes.</p></article><article><b>02</b><h3>Photo</h3><p>Supported images with an optional caption.</p></article><article><b>03</b><h3>Voice</h3><p>Recorded audio with a clear playback control.</p></article><article><b>04</b><h3>Poll</h3><p>Shareable choices with anonymous vote totals.</p></article></div>
    </section>
    <section class="control-section" aria-labelledby="control-title">
      <div class="control-visual" aria-hidden="true"><span>INBOX CONTROL</span><i></i><i></i><i></i><strong>YOU DECIDE<br>WHAT HAPPENS NEXT.</strong></div>
      <div class="control-copy"><span>Control before curiosity</span><h2 id="control-title">Anonymous does not mean uncontrolled.</h2><p>Pause a link, require accounts or friends, disable media, filter hidden words, report content and block a sender.</p><ul><li>No paid identity reveals</li><li>Public answers are opt-in</li><li>Account and inbox deletion controls</li></ul><a class="btn inverse" href="/safety">Open the safety center</a></div>
    </section>
    <section class="closing-section"><p>Ready when you are.</p><h2>Make room for an honest answer.</h2><a class="btn primary" href="#start">Create your PICNYM link</a>
    </section>
    <footer class="market-footer">
      ${brand()}
      <nav class="market-footer-links" aria-label="PICNYM information"><a href="/features">Features</a><a href="/safety">Safety</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/about">About</a></nav>
      <p>Designed &amp; built by <a href="https://www.gojodev.name.ng/" target="_blank" rel="noopener">Owojuyigbe Oluwajomiloju · GOJO.DEV</a></p>
    </footer>
  </main>`;

  $$('.auth-tab').forEach((button) => button.onclick = () => {
    const next = button.dataset.authMode === 'signin' ? 'signin' : 'signup';
    history.replaceState({}, '', next === 'signin' ? '/?auth=signin' : '/');
    home(next);
  });

  $('#signupForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter;
    if (button) button.disabled = true;
    try {
      const form = new FormData(event.currentTarget);
      const displayName = String(form.get('displayName') || '').trim();
      const email = String(form.get('email') || '').trim();
      const password = String(form.get('password') || '');
      if (!form.has('eligibility')) throw new Error('Confirm your age and accept the Terms to continue.');
      if (password.length < 8) throw new Error('Use at least 8 characters for your password.');
      const result = await PicnymAuth.signUp({ email, password, displayName });
      if (result.session) {
        toast('Account created.');
        await home();
      } else {
        toast('Account created. Check your email to confirm it, then sign in.');
        history.replaceState({}, '', '/?auth=signin');
        await home('signin');
      }
    } catch (error) { toast(error.message); }
    finally { if (button) button.disabled = false; }
  });

  $('#signinForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter;
    if (button) button.disabled = true;
    try {
      const form = new FormData(event.currentTarget);
      await PicnymAuth.signIn({ email: form.get('email'), password: form.get('password') });
      toast('Signed in.');
      history.replaceState({}, '', '/');
      await home();
    } catch (error) { toast(error.message); }
    finally { if (button) button.disabled = false; }
  });

  $('#googleAuth')?.addEventListener('click', async () => {
    try {
      if (authMode !== 'signin' && !$('#signupEligibility')?.checked) throw new Error('Confirm your age and accept the Terms before creating an account.');
      await PicnymAuth.signInWithGoogle();
    }
    catch (error) { toast(error.message); }
  });

  $('#createForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter;
    if (button) button.disabled = true;
    try {
      const form = new FormData(event.currentTarget);
      const displayName = String(form.get('displayName') || '').trim();
      const handle = String(form.get('handle') || '').trim();
      const data = await api('/api/inboxes', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName, handle })
      });
      if (!validSlug(data.slug)) throw new Error('Inbox creation failed. Please retry.');
      if (validToken(data.ownerToken)) saveOwner(data.slug, data.ownerToken);
      nav(`/dashboard/${encodeURIComponent(data.slug)}`);
    } catch (error) { toast(error.message); }
    finally { if (button) button.disabled = false; }
  });

  $('#openSaved')?.addEventListener('click', () => { if (defaultSaved) nav(`/dashboard/${encodeURIComponent(defaultSaved)}`); });
}

async function accountPage() {
  stopDashboardRefresh?.();
  const session = await authSession();
  if (!session) {
    history.replaceState({}, '', '/?auth=signin');
    return home('signin');
  }
  app.innerHTML = `${topbar('<a class="top-action" href="/">Home</a>')}<main class="page account-page"><div class="section-kicker">Account</div><h1>Your PICNYM account</h1><div id="accountContent"><div class="card empty">Loading account…</div></div></main>`;
  try {
    const data = await api('/api/account');
    const inboxes = Array.isArray(data.inboxes) ? data.inboxes : [];
    const ownedSlugs = new Set(inboxes.map((item) => item.slug));
    const legacy = savedInboxes().filter((slug) => !ownedSlugs.has(slug));
    $('#accountContent').innerHTML = `<section class="card">
      <form id="profileForm"><div class="field"><label>Display name</label><input name="displayName" maxlength="60" value="${esc(userDisplayName(session.user))}" required></div><button class="btn sage" type="submit">Save profile</button></form>
      <div class="card-divider"></div><div class="account-row"><div><strong>${esc(session.user.email || '')}</strong><div class="form-note">Account ID is kept private.</div></div><button id="accountSignOut" class="btn small" type="button">Sign out</button></div>
    </section>
    <div class="section-kicker compact-kicker">Your inboxes</div>
    <div class="account-list">${inboxes.length ? inboxes.map((item) => `<article class="card account-inbox"><div><strong>/${esc(item.slug)}</strong><div class="form-note">${esc(item.displayName || '')}</div></div><a class="btn primary small" href="/dashboard/${encodeURIComponent(item.slug)}">Open</a></article>`).join('') : '<div class="card empty">No account-owned inboxes yet.</div>'}</div>
    ${legacy.length ? `<div class="section-kicker compact-kicker">Saved on this device</div><p class="form-note">These were created before accounts. Claim one to make it available after signing in on another device.</p><div class="account-list">${legacy.map((slug) => `<article class="card account-inbox"><div><strong>/${esc(slug)}</strong><div class="form-note">Legacy device-owned inbox</div></div><button class="btn sage small claim-inbox" type="button" data-slug="${esc(slug)}">Claim</button></article>`).join('')}</div>` : ''}`;

    $('#profileForm')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      try {
        const form = new FormData(event.currentTarget);
        await PicnymAuth.updateProfile(form.get('displayName'));
        toast('Profile updated.');
      } catch (error) { toast(error.message); }
    });
    $('#accountSignOut')?.addEventListener('click', async () => {
      try { await PicnymAuth.signOut(); nav('/'); }
      catch (error) { toast(error.message); }
    });
    $$('.claim-inbox').forEach((button) => button.onclick = async () => {
      const slug = button.dataset.slug;
      const token = ownerToken(slug);
      if (!token) return toast('The owner token for this inbox is missing.');
      button.disabled = true;
      try {
        await api(`/api/inboxes/${encodeURIComponent(slug)}/claim`, { method: 'POST', headers: ownerHeaders(token) });
        toast('Inbox added to your account.');
        await accountPage();
      } catch (error) { toast(error.message); button.disabled = false; }
    });
  } catch (error) {
    $('#accountContent').innerHTML = `<div class="card empty">${esc(error.message)}</div>`;
  }
}

dashboard = async function dashboard(slug, active = 'inbox') {
  stopDashboardRefresh();
  const token = ownerToken(slug);
  const session = await authSession();
  try {
    const data = await api(`/api/inboxes/${encodeURIComponent(slug)}/messages?limit=40`, { headers: ownerHeaders(token) });
    if (!data.inbox || !validSlug(data.inbox.slug) || !Array.isArray(data.messages)) throw new Error('The inbox response is invalid.');
    if (validToken(token)) saveOwner(data.inbox.slug, token);
    const link = `${location.origin}/u/${data.inbox.slug}`;
    const topAction = session ? '<a class="top-action" href="/account">Account</a>' : '<a class="top-action" href="/">Home</a>';
    app.innerHTML = `<div class="shell">${topbar(topAction)}<main class="page"><nav class="tabs"><button class="tab ${active === 'inbox' ? 'active' : ''}" type="button" data-tab="inbox">Inbox</button><button class="tab ${active === 'polls' ? 'active' : ''}" type="button" data-tab="polls">Polls</button></nav><section class="link-card"><div class="label">Your anonymous link</div><div class="big-link">/${esc(data.inbox.slug)}</div><div class="link-actions"><button id="editLink" class="btn" type="button">Edit</button><button id="shareLink" class="btn sage" type="button">Share link ↗</button></div></section><div class="refresh-line"><span class="refresh-dot" aria-hidden="true"></span><span>Auto-refresh on</span><span id="refreshStatus">Updated now</span></div><div id="content"></div></main></div>`;
    $('#shareLink').onclick = () => share({ title: 'Send me something anonymously on PICNYM', url: link }, link);
    $('#editLink').onclick = () => editLink(data.inbox, token);
    $$('.tab').forEach((button) => button.onclick = async () => {
      const tab = button.dataset.tab === 'polls' ? 'polls' : 'inbox';
      history.replaceState({}, '', `/dashboard/${data.inbox.slug}?tab=${tab}`);
      $$('.tab').forEach((item) => item.classList.toggle('active', item.dataset.tab === tab));
      if (dashboardRefreshContext) dashboardRefreshContext.active = tab;
      if (tab === 'polls') await renderPolls(data.inbox, token);
      else renderInbox(data.inbox, data.messages, token);
      await refreshDashboardNow();
    });
    if (active === 'polls') await renderPolls(data.inbox, token);
    else renderInbox(data.inbox, data.messages, token);
    startDashboardRefresh(data.inbox, token, active);
  } catch (error) {
    stopDashboardRefresh();
    if (error.status === 404 && token) removeOwner(slug);
    unlock(slug, error.message);
  }
};

unlock = async function unlock(slug, message = 'This dashboard is private.') {
  stopDashboardRefresh();
  const session = await authSession();
  app.innerHTML = `${topbar()}<main class="page"><div class="section-kicker">Private</div><h1>Inbox</h1><div class="card"><p>${esc(message)}</p><p>${session ? 'This inbox is not linked to your signed-in account.' : 'Sign in with the account that owns this inbox, or open it on the device that created it.'}</p><div class="modal-actions"><a class="btn" href="/">Go home</a>${session ? '<a class="btn primary" href="/account">Open account</a>' : '<a class="btn primary" href="/?auth=signin">Sign in</a>'}</div></div></main>`;
};

editLink = function editLink(inbox, token) {
  const box = modal(`<h2>Edit anonymous link</h2><div class="field"><label>Link name</label><input id="newSlug" value="${esc(inbox.slug)}" maxlength="28" autocapitalize="none" spellcheck="false"></div><div class="modal-actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" data-save>Save</button></div>`);
  $('[data-close]', box).onclick = () => box.remove();
  $('[data-save]', box).onclick = async () => {
    const button = $('[data-save]', box); button.disabled = true;
    try {
      const result = await api(`/api/inboxes/${encodeURIComponent(inbox.slug)}`, { method: 'PATCH', headers: ownerHeaders(token, { 'content-type': 'application/json' }), body: JSON.stringify({ slug: $('#newSlug', box).value }) });
      if (!validSlug(result.slug)) throw new Error('The server returned an invalid link name.');
      if (validToken(token)) { saveOwner(result.slug, token); if (result.slug !== inbox.slug) removeOwner(inbox.slug); }
      stopDashboardRefresh(); nav(`/dashboard/${result.slug}`);
    } catch (error) { toast(error.message); button.disabled = false; }
  };
};

publicInbox = async function publicInbox(slug) {
  try {
    const inbox = await api(`/api/inboxes/${encodeURIComponent(slug)}`);
    if (!validSlug(inbox.slug) || typeof inbox.displayName !== 'string') throw new Error('This inbox is unavailable.');
    app.innerHTML = `<div class="public-shell">${topbar()}<main class="public-card"><div class="public-profile"><span class="brand-mark"><i></i><i></i></span><strong>${esc(inbox.displayName)}</strong><p>Send something anonymously.</p></div><section class="card" style="padding:0;overflow:hidden"><div class="composer-head"><h2 class="composer-title">Send anonymously</h2><p class="composer-sub">Your profile is not shown to the inbox owner.</p></div><div class="tool-row"><button class="tool active" type="button" data-kind="text">Text</button><button class="tool" type="button" data-kind="image">Image</button><button class="tool" type="button" data-kind="voice">Voice</button><button class="tool" type="button" data-kind="poll">Poll</button></div><form id="sendForm"><input type="hidden" name="kind" value="text"><div id="panel" class="tool-panel"></div></form></section><div class="public-legal">By sending, you agree to the <a href="/terms">Terms</a> and <a href="/safety">Safety rules</a>.</div></main></div>`;

    let kind = 'text';
    let recorder = null;
    let mediaStream = null;
    let chunks = [];
    let voiceBlob = null;
    let recordingPromise = null;
    let recordingResolve = null;
    let previewObjectUrl = null;
    const panel = $('#panel');
    const form = $('#sendForm');

    function releasePreview() { if (previewObjectUrl) { URL.revokeObjectURL(previewObjectUrl); previewObjectUrl = null; } }
    function stopTracks() { mediaStream?.getTracks?.().forEach((track) => track.stop()); mediaStream = null; }
    function preferredRecorderOptions() {
      const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
      const mimeType = candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type));
      return mimeType ? { mimeType } : undefined;
    }
    async function finishRecording({ discard = false } = {}) {
      if (recorder?.state === 'recording') {
        try { recorder.stop(); } catch {}
        if (recordingPromise) await recordingPromise;
      }
      stopTracks();
      recorder = null;
      if (discard) { voiceBlob = null; chunks = []; releasePreview(); }
      return voiceBlob;
    }

    function setVoicePreview(blob, label) {
      releasePreview();
      const preview = $('#voicePreview');
      if (!preview || !blob) return;
      previewObjectUrl = URL.createObjectURL(blob);
      preview.src = previewObjectUrl;
      preview.classList.remove('hidden');
      const status = $('#recordStatus'); if (status) status.textContent = label || 'Voice note ready.';
    }

    function renderTool() {
      form.elements.kind.value = kind;
      if (kind === 'text') {
        panel.innerHTML = '<div class="field"><textarea name="text" maxlength="1200" placeholder="Write your message" required></textarea></div><div class="send-row"><button class="btn primary" type="submit">Send anonymously</button></div>';
      } else if (kind === 'image') {
        panel.innerHTML = '<label class="file-zone">Choose image<input id="imageFile" name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required><div id="imageName" class="file-name"></div></label><div class="field" style="margin-top:14px"><textarea name="text" maxlength="500" placeholder="Caption (optional)"></textarea></div><div class="send-row"><button class="btn primary" type="submit">Send image</button></div>';
        $('#imageFile').addEventListener('change', (event) => { $('#imageName').textContent = event.target.files?.[0]?.name || ''; });
      } else if (kind === 'voice') {
        panel.innerHTML = '<div class="record-box"><div id="recordStatus" class="record-status">Record a voice note or choose an audio file.</div><div class="record-actions"><button class="btn small" type="button" id="recordBtn">Start recording</button><label class="btn small">Choose file<input id="voiceFile" type="file" name="voice" accept="audio/*,video/webm,.m4a,.aac,.ogg,.webm" hidden></label></div><audio id="voicePreview" class="hidden" controls></audio></div><div class="send-row"><button class="btn primary" type="submit">Send voice note</button></div>';
        $('#voiceFile').addEventListener('change', async (event) => {
          await finishRecording({ discard: true });
          const file = event.target.files?.[0];
          if (file) setVoicePreview(file, file.name);
        });
        $('#recordBtn').addEventListener('click', async (event) => {
          const button = event.currentTarget;
          if (recorder?.state === 'recording') {
            button.disabled = true;
            const status = $('#recordStatus'); if (status) status.textContent = 'Finishing recording…';
            await finishRecording();
            if (document.body.contains(button)) { button.textContent = 'Start recording'; button.disabled = false; }
            return;
          }
          if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) return toast('Voice recording is not supported here. You can choose an audio file instead.');
          try {
            await finishRecording({ discard: true });
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
            chunks = [];
            const currentRecorder = new MediaRecorder(mediaStream, preferredRecorderOptions());
            recorder = currentRecorder;
            recordingPromise = new Promise((resolve) => { recordingResolve = resolve; });
            currentRecorder.ondataavailable = (dataEvent) => { if (dataEvent.data?.size) chunks.push(dataEvent.data); };
            currentRecorder.onerror = () => { recordingResolve?.(null); recordingResolve = null; stopTracks(); toast('Recording failed. Try again or choose a file.'); };
            currentRecorder.onstop = () => {
              const declared = String(currentRecorder.mimeType || chunks[0]?.type || 'audio/webm');
              const baseType = declared.split(';')[0].trim() || 'audio/webm';
              voiceBlob = chunks.length ? new Blob(chunks, { type: baseType }) : null;
              if (voiceBlob?.size) setVoicePreview(voiceBlob, 'Voice note ready.');
              else toast('No audio was captured. Please try again.');
              stopTracks();
              recordingResolve?.(voiceBlob); recordingResolve = null;
            };
            currentRecorder.start(250);
            button.textContent = 'Stop recording';
            $('#recordStatus').textContent = 'Recording…';
          } catch (error) {
            stopTracks(); recorder = null;
            toast(error?.name === 'NotAllowedError' ? 'Microphone permission is needed.' : 'Could not start recording. Try choosing an audio file.');
          }
        });
      } else {
        panel.innerHTML = '<div class="field"><label>Question</label><input name="question" maxlength="180" placeholder="Ask something" required></div><div class="field"><label>Options</label><div id="pollOptions" class="poll-options"><input maxlength="80" placeholder="Option 1" required><input maxlength="80" placeholder="Option 2" required></div></div><button class="btn small" type="button" id="addOption">+ Add option</button><div class="send-row"><button class="btn primary" type="submit">Create & send poll</button></div>';
        $('#addOption').addEventListener('click', () => {
          const box = $('#pollOptions'); if (box.children.length >= 8) return toast('Maximum 8 options.');
          const input = document.createElement('input'); input.maxLength = 80; input.placeholder = `Option ${box.children.length + 1}`; box.appendChild(input);
        });
      }
    }

    $$('.tool').forEach((button) => button.addEventListener('click', async () => {
      if (button.dataset.kind !== 'voice') await finishRecording({ discard: true });
      kind = button.dataset.kind; $$('.tool').forEach((item) => item.classList.toggle('active', item === button)); renderTool();
    }));
    renderTool();

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = event.submitter || $('#sendForm button[type="submit"]');
      if (button) button.disabled = true;
      try {
        if (kind === 'voice' && recorder?.state === 'recording') {
          const status = $('#recordStatus'); if (status) status.textContent = 'Finishing recording…';
          await finishRecording();
        }
        const data = new FormData(form); data.set('kind', kind);
        if (kind === 'voice') {
          const chosen = $('#voiceFile')?.files?.[0];
          if (!chosen && !voiceBlob?.size) throw new Error('Record or choose a voice note first.');
          if (voiceBlob?.size && !chosen) {
            const type = voiceBlob.type || 'audio/webm';
            const ext = type.includes('mp4') ? 'm4a' : type.includes('ogg') ? 'ogg' : type.includes('mpeg') ? 'mp3' : 'webm';
            data.set('voice', new File([voiceBlob], `voice.${ext}`, { type }));
          }
          const status = $('#recordStatus'); if (status) status.textContent = 'Uploading voice note…';
        }
        if (kind === 'poll') {
          const options = $$('#pollOptions input').map((input) => input.value.trim()).filter(Boolean);
          if (options.length < 2) throw new Error('A poll needs at least 2 options.');
          data.set('options', JSON.stringify(options));
        }
        const result = await api(`/api/inboxes/${encodeURIComponent(slug)}/messages`, { method: 'POST', body: data }, 90000);
        if (!result.ok || !result.id) throw new Error('The message was not saved. Please retry.');
        if (result.poll) {
          const link = `${location.origin}/poll/${result.poll.slug}`;
          const box = modal(`<h2>Poll sent</h2><div class="field"><label>Shareable poll link</label><input value="${esc(link)}" readonly></div><div class="modal-actions"><button class="btn" type="button" data-close>Close</button><button class="btn sage" type="button" data-copy>Copy link</button><button class="btn primary" type="button" data-share>Share</button></div>`);
          $('[data-close]', box).onclick = () => box.remove(); $('[data-copy]', box).onclick = () => copy(link); $('[data-share]', box).onclick = () => share({ title: 'Anonymous poll on PICNYM', url: link }, link);
        } else toast('Sent anonymously.');
        await finishRecording({ discard: true }); form.reset(); renderTool();
      } catch (error) { toast(error.message); }
      finally { if (button) button.disabled = false; }
    });
  } catch (error) {
    app.innerHTML = `${topbar()}<main class="page"><div class="card empty">${esc(error.message)}</div></main>`;
  }
};

if (legacyMessageCardBlob) {
  messageCardBlob = async function messageCardBlob(message, inbox) {
    const baseBlob = await legacyMessageCardBlob(message, inbox);
    const bitmap = 'createImageBitmap' in window ? await createImageBitmap(baseBlob) : null;
    const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
    const ctx = canvas.getContext('2d'); if (!ctx) return baseBlob;
    if (bitmap) { ctx.drawImage(bitmap, 0, 0); bitmap.close?.(); }
    else {
      const url = URL.createObjectURL(baseBlob); const img = await new Promise((resolve, reject) => { const el = new Image(); el.onload = () => resolve(el); el.onerror = reject; el.src = url; }); ctx.drawImage(img, 0, 0); URL.revokeObjectURL(url);
    }
    ctx.fillStyle = '#4c56e8'; ctx.fillRect(0, 0, 1080, 155); ctx.fillStyle = '#ff6d59'; ctx.fillRect(0, 155, 1080, 14);
    ctx.fillStyle = '#fff'; ctx.font = '800 48px Arial'; ctx.fillText('PICNYM', 70, 83); ctx.font = '700 20px Arial'; ctx.fillText('ANONYMOUS', 70, 119);
    ctx.fillStyle = '#f7f7fb'; ctx.fillRect(55, 1195, 970, 105); ctx.fillStyle = '#676a7d'; ctx.font = '700 21px Arial'; ctx.fillText(currentHostLabel(), 70, 1260);
    ctx.textAlign = 'right'; ctx.fillText(inbox?.displayName ? `@${String(inbox.displayName).slice(0, 28)}` : PICNYM, 1010, 1260); ctx.textAlign = 'left';
    return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob || baseBlob), 'image/png'));
  };
}

if (legacyShareImageFiles) {
  shareImageFiles = function shareImageFiles(files, title = PICNYM) {
    const cleanTitle = String(title || PICNYM).replace(/PH X SFC ANONYMOUS/gi, PICNYM);
    return legacyShareImageFiles(files, cleanTitle);
  };
}

cardImage = async function cardImage(message, inbox) {
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Your browser cannot create the answer card.');
  ctx.fillStyle = '#f7f7fb'; ctx.fillRect(0, 0, 1080, 1350); ctx.fillStyle = '#4c56e8'; ctx.fillRect(0, 0, 1080, 155); ctx.fillStyle = '#ff6d59'; ctx.fillRect(0, 155, 1080, 14);
  ctx.fillStyle = '#fff'; ctx.font = '800 48px Arial'; ctx.fillText('PICNYM', 70, 83); ctx.font = '700 20px Arial'; ctx.fillText('ANONYMOUS', 70, 119);
  ctx.fillStyle = '#ffffff'; ctx.beginPath(); roundedRect(ctx, 65, 230, 950, 440, 28); ctx.fill(); ctx.fillStyle = '#4c56e8'; ctx.font = '800 24px Arial'; ctx.fillText('ANONYMOUS', 105, 290);
  ctx.fillStyle = '#17182b'; ctx.font = '700 38px Arial'; wrapText(ctx, message.poll?.question || message.text || (message.voiceUrl ? 'Voice note' : message.imageUrl ? 'Image message' : 'Anonymous message'), 105, 360, 860, 52);
  ctx.fillStyle = '#e9fbf8'; ctx.beginPath(); roundedRect(ctx, 65, 745, 950, 430, 28); ctx.fill(); ctx.fillStyle = '#21665d'; ctx.font = '800 23px Arial'; ctx.fillText(`${String(inbox.displayName || 'YOU').toUpperCase()} REPLIED`, 105, 815);
  ctx.fillStyle = '#17182b'; ctx.font = '700 38px Arial'; wrapText(ctx, message.reply, 105, 885, 860, 52); ctx.fillStyle = '#676a7d'; ctx.font = '700 22px Arial'; ctx.fillText(currentHostLabel(), 70, 1270);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png')); if (!blob) throw new Error('Could not create the answer card.');
  return shareImageFiles([new File([blob], 'picnym-answer.png', { type: 'image/png' })], PICNYM);
};

function injectPicnymStyles() {
  if ($('#picnymV2Styles')) return;
  const style = document.createElement('style'); style.id = 'picnymV2Styles';
  style.textContent = `
    .wide-home{width:min(540px,100%)}.v2-home .home-box>.brand{margin-bottom:25px}
    .auth-tabs{display:grid;grid-template-columns:1fr 1fr}.auth-tab{border:0;background:transparent;border-radius:10px;padding:12px;color:var(--muted);font-weight:850;cursor:pointer}.auth-tab.active{background:var(--card);color:var(--brand);box-shadow:0 2px 7px #20244914}.google-g{display:inline-grid;place-items:center;margin-right:8px;font-weight:950}.form-note{font-size:12px;color:var(--muted);line-height:1.5;margin:8px 0 0}.marketing-links{display:flex;justify-content:center;flex-wrap:wrap;gap:12px;margin:20px 0 12px}.product-footer{text-align:center;color:var(--muted);font-size:11px;line-height:1.5}.account-row,.account-inbox{display:flex;justify-content:space-between;align-items:center;gap:14px}.account-welcome strong,.account-inbox strong{color:var(--ink);font-size:18px}.account-list{display:grid;gap:12px}.account-list .card{margin-bottom:0}.compact-kicker{margin-top:30px;margin-bottom:12px}.public-legal{text-align:center;color:var(--muted);font-size:11px;padding:0 10px 24px}
    @media(max-width:560px){.account-row,.account-inbox{align-items:flex-start}.account-inbox{flex-direction:column}.account-inbox .btn{width:100%}}
  `;
  document.head.appendChild(style);
}

route = function route() {
  cleanupOwnerStorage();
  const parts = location.pathname.split('/').filter(Boolean).map((part) => { try { return decodeURIComponent(part); } catch { return part; } });
  if (!parts.length) { stopDashboardRefresh(); return home(); }
  if (parts[0] === 'account' && !parts[1]) return accountPage();
  if (parts[0] === 'u' && validSlug(parts[1])) { stopDashboardRefresh(); return publicInbox(parts[1]); }
  if (parts[0] === 'dashboard' && validSlug(parts[1])) { const tab = new URLSearchParams(location.search).get('tab') === 'polls' ? 'polls' : 'inbox'; return dashboard(parts[1], tab); }
  if (parts[0] === 'poll' && validSlug(parts[1])) { stopDashboardRefresh(); return pollPage(parts[1]); }
  stopDashboardRefresh(); app.innerHTML = `${topbar()}<main class="page"><div class="card empty">Page not found.<br><br><a class="btn" href="/">Go home</a></div></main>`;
};

injectPicnymStyles();
window.PicnymAuth?.onChange?.((event) => {
  if (!['SIGNED_IN', 'SIGNED_OUT', 'USER_UPDATED'].includes(event)) return;
  if (location.pathname === '/' || location.pathname === '/account') route();
});
route();
