async function loadShareImage(url) {
  if (!url) return null;
  try {
    const response = await fetch(url, { cache: 'no-store' });
    if (!response.ok) return null;
    const blob = await response.blob();
    if ('createImageBitmap' in window) return await createImageBitmap(blob);
    const objectUrl = URL.createObjectURL(blob);
    const image = await new Promise((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = reject;
      element.src = objectUrl;
    });
    image._objectUrl = objectUrl;
    return image;
  } catch { return null; }
}

function drawCover(ctx, image, x, y, width, height) {
  const iw = image.width || image.naturalWidth || width;
  const ih = image.height || image.naturalHeight || height;
  const scale = Math.max(width / iw, height / ih);
  const sw = width / scale;
  const sh = height / scale;
  const sx = Math.max(0, (iw - sw) / 2);
  const sy = Math.max(0, (ih - sh) / 2);
  ctx.save();
  ctx.beginPath();
  roundedRect(ctx, x, y, width, height, 24);
  ctx.clip();
  ctx.drawImage(image, sx, sy, sw, sh, x, y, width, height);
  ctx.restore();
  if (image._objectUrl) URL.revokeObjectURL(image._objectUrl);
  if (typeof image.close === 'function') image.close();
}

function messageTypeLabel(message) {
  if (message.poll) return 'ANONYMOUS POLL';
  if (message.imageUrl) return 'ANONYMOUS IMAGE';
  if (message.voiceUrl) return 'ANONYMOUS VOICE NOTE';
  return 'ANONYMOUS MESSAGE';
}

async function messageCardBlob(message, inbox) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser cannot create the share image.');
  ctx.fillStyle = '#f1f2ed'; ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = '#12264b'; ctx.fillRect(0, 0, 1080, 155);
  ctx.fillStyle = '#b9c9b2'; ctx.fillRect(0, 155, 1080, 14);
  ctx.fillStyle = '#fff'; ctx.font = '800 44px Arial'; ctx.fillText('NYMBOX', 70, 80);
  ctx.font = '700 20px Arial'; ctx.fillText('ANONYMOUS', 70, 116);
  ctx.fillStyle = '#fffefa'; ctx.beginPath(); roundedRect(ctx, 65, 225, 950, 940, 30); ctx.fill();
  ctx.fillStyle = '#71816f'; ctx.font = '800 23px Arial'; ctx.fillText(messageTypeLabel(message), 105, 290);
  ctx.fillStyle = '#92989a'; ctx.font = '700 18px Arial';
  const stamp = fmt(message.createdAt); if (stamp) ctx.fillText(stamp, 105, 325);

  if (message.imageUrl) {
    const image = await loadShareImage(message.imageUrl);
    if (image) drawCover(ctx, image, 105, 370, 870, 535);
    else { ctx.fillStyle = '#edf0ea'; ctx.beginPath(); roundedRect(ctx, 105, 370, 870, 535, 24); ctx.fill(); ctx.fillStyle = '#12264b'; ctx.font = '800 42px Arial'; ctx.fillText('IMAGE MESSAGE', 150, 650); }
    if (message.text) { ctx.fillStyle = '#151b26'; ctx.font = '700 34px Arial'; wrapText(ctx, message.text, 105, 970, 870, 46, 3); }
  } else if (message.voiceUrl) {
    ctx.fillStyle = '#eef0e9'; ctx.beginPath(); roundedRect(ctx, 105, 385, 870, 330, 24); ctx.fill();
    ctx.fillStyle = '#12264b'; ctx.font = '800 42px Arial'; ctx.fillText('VOICE NOTE', 145, 470);
    const centerY = 585;
    for (let i = 0; i < 28; i += 1) { const height = 34 + ((i * 17) % 96); ctx.fillStyle = i % 2 ? '#b9c9b2' : '#12264b'; ctx.fillRect(150 + (i * 27), centerY - height / 2, 10, height); }
    if (message.text) { ctx.fillStyle = '#151b26'; ctx.font = '700 34px Arial'; wrapText(ctx, message.text, 105, 820, 870, 46, 5); }
  } else if (message.poll) {
    ctx.fillStyle = '#151b26'; ctx.font = '700 40px Arial'; wrapText(ctx, message.poll.question, 105, 390, 870, 52, 4);
    const options = (message.poll.options || []).slice(0, 6);
    let y = 610;
    for (const option of options) {
      const percent = message.poll.totalVotes ? Math.round((option.votes / message.poll.totalVotes) * 100) : 0;
      ctx.fillStyle = '#edf0ea'; ctx.beginPath(); roundedRect(ctx, 105, y - 42, 870, 72, 18); ctx.fill();
      ctx.fillStyle = '#151b26'; ctx.font = '700 26px Arial'; ctx.fillText(String(option.text).slice(0, 42), 135, y);
      ctx.fillStyle = '#71816f'; ctx.font = '800 24px Arial'; ctx.textAlign = 'right'; ctx.fillText(`${percent}%`, 940, y); ctx.textAlign = 'left'; y += 95;
    }
    ctx.fillStyle = '#777d81'; ctx.font = '700 22px Arial'; ctx.fillText(`${Number(message.poll.totalVotes) || 0} votes`, 105, 1080);
  } else {
    ctx.fillStyle = '#151b26'; ctx.font = '700 44px Arial'; wrapText(ctx, message.text || 'Anonymous message', 105, 420, 870, 60, 11);
  }

  ctx.fillStyle = '#747a80'; ctx.font = '700 21px Arial'; ctx.fillText(location.host, 70, 1260);
  ctx.textAlign = 'right'; ctx.fillText(inbox?.displayName ? `@${String(inbox.displayName).slice(0, 28)}` : 'NYMBOX', 1010, 1260); ctx.textAlign = 'left';
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not create the share image.');
  return blob;
}

async function messageCardFile(message, inbox, index = 1) {
  const blob = await messageCardBlob(message, inbox);
  return new File([blob], `nymbox-message-${String(index).padStart(2, '0')}.png`, { type: 'image/png' });
}

async function shareImageFiles(files, title = 'NYMBOX') {
  if (!files?.length) throw new Error('There is nothing to share.');
  if (navigator.share && navigator.canShare?.({ files })) return navigator.share({ files, title });
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const anchor = document.createElement('a');
    const objectUrl = URL.createObjectURL(file);
    anchor.href = objectUrl; anchor.download = file.name || `nymbox-message-${index + 1}.png`;
    document.body.appendChild(anchor); anchor.click(); anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500 + index * 100);
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  toast(files.length > 1 ? `${files.length} share images saved.` : 'Share image saved.');
}

async function cardImage(message, inbox) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080; canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser cannot create the answer card.');
  ctx.fillStyle = '#f1f2ed'; ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = '#12264b'; ctx.fillRect(0, 0, 1080, 155);
  ctx.fillStyle = '#b9c9b2'; ctx.fillRect(0, 155, 1080, 14);
  ctx.fillStyle = 'white'; ctx.font = '800 44px Arial'; ctx.fillText('NYMBOX', 70, 80);
  ctx.font = '700 20px Arial'; ctx.fillText('ANONYMOUS', 70, 116);
  ctx.fillStyle = '#fffefa'; ctx.beginPath(); roundedRect(ctx, 65, 230, 950, 440, 28); ctx.fill();
  ctx.fillStyle = '#71816f'; ctx.font = '800 24px Arial'; ctx.fillText('ANONYMOUS', 105, 290);
  ctx.fillStyle = '#151b26'; ctx.font = '700 38px Arial'; wrapText(ctx, message.poll?.question || message.text || (message.voiceUrl ? 'Voice note' : message.imageUrl ? 'Image message' : 'Anonymous message'), 105, 360, 860, 52);
  ctx.fillStyle = '#dfe9dc'; ctx.beginPath(); roundedRect(ctx, 65, 745, 950, 430, 28); ctx.fill();
  ctx.fillStyle = '#526a56'; ctx.font = '800 23px Arial'; ctx.fillText(`${inbox.displayName.toUpperCase()} REPLIED`, 105, 815);
  ctx.fillStyle = '#151b26'; ctx.font = '700 38px Arial'; wrapText(ctx, message.reply, 105, 885, 860, 52);
  ctx.fillStyle = '#747a80'; ctx.font = '700 22px Arial'; ctx.fillText('NYMBOX · ANONYMOUS', 70, 1270);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not create the answer card.');
  return shareImageFiles([new File([blob], 'nymbox-answer.png', { type: 'image/png' })], 'NYMBOX');
}

async function renderPolls(inbox, token, options = {}) {
  const { silent = false } = options;
  const content = $('#content');
  if (!silent || !$('#pollList')) content.innerHTML = '<div class="section-kicker">Anonymous</div><h1>Polls</h1><div id="pollList"><div class="card empty">Loading polls…</div></div>';
  try {
    const data = await api(`/api/inboxes/${encodeURIComponent(inbox.slug)}/polls`, { headers: ownerHeaders(token) });
    if (!Array.isArray(data.polls)) throw new Error('The poll list is invalid.');
    const list = $('#pollList'); if (!list) return;
    list.innerHTML = data.polls.length ? data.polls.map((poll) => `<article class="card">${pollInside(poll)}<div class="card-divider"></div><button class="btn sage poll-share" type="button" data-slug="${esc(poll.slug)}">Share poll</button></article>`).join('') : '<div class="card empty">No polls received yet.</div>';
    $$('.poll-share').forEach((button) => button.onclick = () => { const url = `${location.origin}/poll/${button.dataset.slug}`; share({ title: 'Anonymous poll on NYMBOX', url }, url); });
  } catch (error) {
    if (!silent && $('#pollList')) $('#pollList').innerHTML = `<div class="card empty">${esc(error.message)}</div>`;
  }
}

async function pollPage(slug) {
  stopDashboardRefresh();
  setPageMeta({ title: 'Anonymous poll | NYMBOX', description: 'Vote anonymously in a NYMBOX poll.', path: `/poll/${slug}`, index: false });
  try {
    const poll = await api(`/api/polls/${encodeURIComponent(slug)}`);
    if (!poll.id || !validSlug(poll.slug) || !Array.isArray(poll.options)) throw new Error('This poll is unavailable.');
    renderPollPage(poll, localStorage.getItem(`voted_${poll.id}`) === '1');
  } catch (error) { app.innerHTML = `${topbar()}<main class="poll-page"><div class="card empty">${esc(error.message)}</div></main>${footer()}`; }
}

function renderPollPage(poll, voted) {
  const url = `${location.origin}/poll/${poll.slug}`;
  app.innerHTML = `${topbar()}<main class="poll-page"><div class="section-kicker">Anonymous poll</div><h1>${esc(poll.question)}</h1><div class="meta">${Number(poll.totalVotes) || 0} votes · identities are not shown</div><section class="card">${poll.options.map((option) => {
    const percent = poll.totalVotes ? Math.round((option.votes / poll.totalVotes) * 100) : 0;
    return `<button class="poll-option vote-btn" type="button" data-option="${esc(option.id)}" ${voted ? 'disabled' : ''}><span class="fill" style="width:${voted ? percent : 0}%"></span><span>${esc(option.text)}</span><span>${voted ? `${percent}%` : ''}</span></button>`;
  }).join('')}<div class="card-divider"></div><button id="sharePoll" class="btn sage" type="button" style="width:100%">Share poll</button></section></main>${footer()}`;
  $('#sharePoll').onclick = () => share({ title: poll.question, url }, url);
  if (!voted) $$('.vote-btn').forEach((button) => button.onclick = async () => {
    $$('.vote-btn').forEach((item) => item.disabled = true);
    try {
      const result = await api(`/api/polls/${encodeURIComponent(poll.slug)}/vote`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ optionId: button.dataset.option, clientId: deviceId() }) });
      if (!result.poll) throw new Error('Vote response is invalid.');
      localStorage.setItem(`voted_${poll.id}`, '1'); renderPollPage(result.poll, true);
    } catch (error) {
      if (error.status === 409 && error.data?.poll) { localStorage.setItem(`voted_${poll.id}`, '1'); renderPollPage(error.data.poll, true); }
      else { toast(error.message); $$('.vote-btn').forEach((item) => item.disabled = false); }
    }
  });
}

function footer() {
  return `<footer class="site-footer"><div>${brand()}</div><nav><a href="/about">About</a><a href="/safety">Safety</a><a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="https://gojodev.name.ng" rel="noopener">GOJO.DEV</a></nav><p>Designed & built by GOJO.DEV.</p></footer>`;
}

function setPageMeta({ title, description, path = '/', index = true }) {
  document.title = title;
  const canonicalUrl = `${location.origin}${path === '/' ? '/' : path}`;
  const set = (selector, attr, value) => { const el = $(selector); if (el) el.setAttribute(attr, value); };
  set('meta[name="description"]', 'content', description);
  set('meta[name="robots"]', 'content', index ? 'index,follow,max-image-preview:large,max-snippet:-1,max-video-preview:-1' : 'noindex,nofollow');
  set('meta[property="og:title"]', 'content', title);
  set('meta[property="og:description"]', 'content', description);
  set('meta[property="og:url"]', 'content', canonicalUrl);
  set('meta[name="twitter:title"]', 'content', title);
  set('meta[name="twitter:description"]', 'content', description);
  const canonical = $('link[rel="canonical"]'); if (canonical) canonical.href = canonicalUrl;
}

function legalPage(kind) {
  const pages = {
    about: { title: 'About NYMBOX', description: 'Learn how NYMBOX anonymous messaging works.', kicker: 'About', heading: 'Anonymous messages, without the boring limits.', body: `<p>NYMBOX lets people create a personal link for receiving anonymous text, images, voice notes and polls. Inbox owners can reply, create shareable image cards, block senders and remove content.</p><p>The product started as a small messaging experiment and is being developed into a broader public platform focused on simple sharing, privacy-conscious design and useful moderation controls.</p><h2>What NYMBOX does not promise</h2><p>Anonymous does not mean invisible to infrastructure. NYMBOX may process technical information needed for security, rate limiting and abuse prevention. The service should not be used to send secrets or highly sensitive personal data.</p>` },
    safety: { title: 'Safety | NYMBOX', description: 'Safety and acceptable-use guidance for NYMBOX.', kicker: 'Safety', heading: 'Anonymous should not mean abusive.', body: `<p>NYMBOX is designed for feedback, questions, jokes, polls and ordinary social interaction. It is not a license to harass people.</p><h2>Do not use NYMBOX for</h2><p>Threats, targeted harassment, impersonation, doxxing, sexual exploitation, illegal content, spam, malware, or attempts to expose another person's identity are prohibited.</p><h2>Inbox controls</h2><p>Inbox owners can block a sender fingerprint and delete unwanted messages. More reporting and moderation tooling can be added as the public service grows.</p><h2>Protect your privacy</h2><p>Do not send passwords, home addresses, financial details, private documents or other information that could seriously harm you or someone else if exposed.</p>` },
    privacy: { title: 'Privacy Policy | NYMBOX', description: 'How NYMBOX handles accounts, anonymous messages and technical data.', kicker: 'Legal', heading: 'Privacy Policy', body: `<p><strong>Last updated:</strong> August 8, 2026.</p><h2>Information you provide</h2><p>Account users may provide an email address, display name and authentication credentials handled through Supabase Auth. Anonymous senders may provide message text, images, voice notes and poll responses.</p><h2>Technical information</h2><p>NYMBOX may process limited network and browser information to create abuse-prevention fingerprints, rate-limit activity and help block repeated unwanted messages. These fingerprints are designed for service protection rather than to display a sender's identity to inbox owners.</p><h2>Media and storage</h2><p>Uploaded images and voice notes are stored using Supabase Storage. Messages, polls, votes and account-to-inbox ownership records are stored in the service database.</p><h2>How information is used</h2><p>Information is used to operate accounts and inboxes, deliver anonymous messages, display poll results, prevent abuse, maintain security and improve reliability.</p><h2>Third-party infrastructure</h2><p>The service currently relies on infrastructure providers including Supabase and Vercel. Their systems may process data as necessary to provide hosting, authentication, databases and file delivery.</p><h2>Contact</h2><p>Project information and developer contact routes are available through <a href="https://gojodev.name.ng" rel="noopener">GOJO.DEV</a>.</p>` },
    terms: { title: 'Terms of Use | NYMBOX', description: 'Terms governing use of the NYMBOX anonymous messaging service.', kicker: 'Legal', heading: 'Terms of Use', body: `<p><strong>Last updated:</strong> August 8, 2026.</p><h2>Using the service</h2><p>By using NYMBOX, you agree to use the service lawfully and responsibly. Account holders are responsible for activity performed through their accounts and should protect their login credentials.</p><h2>Anonymous content</h2><p>NYMBOX allows people to submit content without showing their identity to the inbox owner. You must not use that feature for threats, harassment, impersonation, illegal activity, sexual exploitation, doxxing, spam, malware or violations of another person's rights.</p><h2>User content</h2><p>You remain responsible for content you submit. You grant the service the limited permission needed to store, process and display that content for the requested feature.</p><h2>Moderation</h2><p>Content or accounts may be restricted or removed when needed for safety, abuse prevention, legal compliance or reliable operation of the service.</p><h2>Availability</h2><p>The service may change, experience interruptions or be discontinued. Features are provided without a guarantee of uninterrupted availability.</p><h2>Contact</h2><p>Developer and project information is available at <a href="https://gojodev.name.ng" rel="noopener">GOJO.DEV</a>.</p>` }
  };
  const page = pages[kind] || pages.about;
  setPageMeta({ title: page.title, description: page.description, path: `/${kind}`, index: true });
  app.innerHTML = `${topbar(authAccessToken() ? '<a class="top-action" href="/account">My account</a>' : '<a class="top-action" href="/auth">Sign in</a>')}<main class="legal-page"><div class="section-kicker">${page.kicker}</div><h1>${page.heading}</h1><article class="legal-copy">${page.body}</article></main>${footer()}`;
}

async function authPage() {
  stopDashboardRefresh();
  if (await hydrateAuthUser().catch(() => null)) return nav('/account');
  const params = new URLSearchParams(location.search);
  const signup = params.get('mode') === 'signup';
  setPageMeta({ title: `${signup ? 'Create account' : 'Sign in'} | NYMBOX`, description: 'Create or sign in to your NYMBOX account.', path: '/auth', index: false });
  const googleEnabled = await googleProviderEnabled();
  app.innerHTML = `${topbar()}<main class="auth-page"><section class="auth-card card"><div class="section-kicker">${signup ? 'Create account' : 'Welcome back'}</div><h1>${signup ? 'Create your NYMBOX account' : 'Sign in to NYMBOX'}</h1><p>Your inboxes follow your account across devices.</p><button id="googleAuth" class="btn google-btn" type="button" ${googleEnabled ? '' : 'disabled'}>Continue with Google</button>${googleEnabled ? '' : '<small class="auth-note">Google sign-in is wired in but the Google provider still needs its OAuth credentials enabled.</small>'}<div class="auth-divider"><span>or</span></div><form id="authForm">${signup ? '<div class="field"><label>Display name</label><input name="displayName" maxlength="50" autocomplete="name" required></div>' : ''}<div class="field"><label>Email</label><input name="email" type="email" autocomplete="email" required></div><div class="field"><label>Password</label><input name="password" type="password" minlength="8" autocomplete="current-password" required></div><button class="btn primary" type="submit" style="width:100%">${signup ? 'Create account' : 'Sign in'}</button></form><div class="auth-switch">${signup ? 'Already have an account? <a href="/auth">Sign in</a>' : 'New here? <a href="/auth?mode=signup">Create an account</a>'}</div>${signup ? '' : '<button id="forgotPassword" class="text-button" type="button">Forgot password?</button>'}</section></main>${footer()}`;
  $('#googleAuth')?.addEventListener('click', startGoogleAuth);
  $('#authForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter; button.disabled = true;
    try {
      const data = new FormData(event.currentTarget);
      const email = String(data.get('email') || '').trim();
      const password = String(data.get('password') || '');
      if (signup) {
        const displayName = String(data.get('displayName') || '').trim();
        const result = await signUpWithEmail(email, password, displayName);
        if (result.access_token) nav('/account');
        else toast('Account created. Check your email to confirm it, then sign in.');
      } else {
        await signInWithEmail(email, password);
        const next = params.get('next');
        nav(next?.startsWith('/') ? next : '/account');
      }
    } catch (error) { toast(error.message); }
    finally { button.disabled = false; }
  });
  $('#forgotPassword')?.addEventListener('click', async () => {
    const email = String($('#authForm input[name="email"]')?.value || '').trim();
    if (!email) return toast('Enter your email first.');
    try { await sendPasswordReset(email); toast('Password reset email sent.'); } catch (error) { toast(error.message); }
  });
}

async function authCallbackPage() {
  setPageMeta({ title: 'Signing in | NYMBOX', description: 'Completing NYMBOX sign in.', path: '/auth/callback', index: false });
  app.innerHTML = `${topbar()}<main class="page"><div class="card empty">Finishing sign in…</div></main>`;
  const user = await hydrateAuthUser().catch(() => null);
  if (user) nav('/account');
  else app.innerHTML = `${topbar()}<main class="page"><div class="card empty">Sign-in could not be completed.<br><br><a class="btn primary" href="/auth">Try again</a></div></main>${footer()}`;
}

async function claimLegacyInboxes() {
  if (!authAccessToken()) return;
  for (const slug of savedInboxes()) {
    const token = ownerToken(slug);
    if (!token) continue;
    try { await api(`/api/inboxes/${encodeURIComponent(slug)}/claim`, { method: 'POST', headers: ownerHeaders(token, { 'content-type': 'application/json' }), body: JSON.stringify({ token }) }); }
    catch (error) { if (![403, 409, 404].includes(error.status)) console.warn('Legacy inbox claim failed:', error.message); }
  }
}

async function accountPage() {
  stopDashboardRefresh();
  const user = await hydrateAuthUser().catch(() => null);
  if (!user) return nav('/auth?next=%2Faccount');
  setPageMeta({ title: 'My account | NYMBOX', description: 'Manage your NYMBOX anonymous links.', path: '/account', index: false });
  app.innerHTML = `${topbar('<button id="accountSignOut" class="top-action" type="button">Sign out</button>')}<main class="page"><div class="card empty">Loading your account…</div></main>`;
  await claimLegacyInboxes();
  try {
    const data = await api('/api/account/inboxes');
    const inboxes = Array.isArray(data.inboxes) ? data.inboxes : [];
    app.innerHTML = `${topbar('<button id="accountSignOut" class="top-action" type="button">Sign out</button>')}<main class="account-page"><section class="account-head"><div><div class="section-kicker">Account</div><h1>${esc(data.user?.displayName || user.user_metadata?.display_name || 'Your NYMBOX')}</h1><p>${esc(data.user?.email || user.email || '')}</p></div><a class="btn primary" href="/#create">+ New link</a></section><section><h2>Your links</h2><div class="account-grid">${inboxes.length ? inboxes.map((inbox) => `<article class="card account-inbox"><div class="label">Anonymous link</div><div class="big-link">/${esc(inbox.slug)}</div><p>${esc(inbox.displayName)}</p><div class="link-actions"><a class="btn primary" href="/dashboard/${encodeURIComponent(inbox.slug)}">Open inbox</a><button class="btn share-account-link" type="button" data-slug="${esc(inbox.slug)}">Share</button></div></article>`).join('') : '<div class="card empty">No links yet. Create your first one.</div>'}</div></section></main>${footer()}`;
    $$('.share-account-link').forEach((button) => button.onclick = () => { const url = `${location.origin}/u/${button.dataset.slug}`; share({ title: 'Send me something anonymously on NYMBOX', url }, url); });
  } catch (error) {
    if (error.status === 401) { clearAuthSession(); return nav('/auth'); }
    app.innerHTML = `${topbar()}<main class="page"><div class="card empty">${esc(error.message)}</div></main>${footer()}`;
  }
  $('#accountSignOut')?.addEventListener('click', async () => { await signOutAccount(); nav('/'); });
}

function injectEnhancementStyles() {
  if ($('#nymboxEnhancementStyles')) return;
  const style = document.createElement('style');
  style.id = 'nymboxEnhancementStyles';
  style.textContent = `
    .refresh-line{display:flex;align-items:center;gap:8px;color:#7a807c;font-size:12px;margin:-7px 2px 4px}.refresh-line #refreshStatus{margin-left:auto}.refresh-dot{width:8px;height:8px;border-radius:50%;background:#829a7d;box-shadow:0 0 0 4px #b9c9b233}
    .inbox-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:18px}.inbox-heading .section-kicker{margin-bottom:20px}.inbox-heading h1{margin-bottom:30px}.bulk-bar{position:sticky;top:100px;z-index:8;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#e1eadf;border:1px solid #cbd8c7;border-radius:14px;padding:12px 14px;margin:0 0 16px}.bulk-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.message-card{position:relative;transition:border-color .15s,box-shadow .15s,transform .15s}.message-card.selecting{padding-left:58px;cursor:pointer}.message-card.selected{border-color:#7d9478;box-shadow:0 0 0 3px #b9c9b244,0 8px 22px rgba(29,38,34,.045)}.message-select{position:absolute;left:18px;top:22px;width:28px;height:28px;border:2px solid #aeb7ad;border-radius:50%;background:#fff;color:#fff;font-weight:900;display:grid;place-items:center;cursor:pointer}.message-select.selected{background:#12264b;border-color:#12264b}
    .site-footer{max-width:980px;margin:70px auto 0;padding:28px 20px 40px;border-top:1px solid #dde0da;display:grid;gap:18px;color:#777d81}.site-footer nav{display:flex;gap:16px;flex-wrap:wrap}.site-footer nav a{color:#48566c;text-decoration:none;font-weight:700}.site-footer .brand{width:max-content}.site-footer p{margin:0;font-size:13px}
    .home-v3{max-width:1040px;margin:auto;padding:72px 24px}.hero-v3{display:grid;grid-template-columns:1.15fr .85fr;gap:54px;align-items:center;min-height:62vh}.hero-v3 h1{font-family:Georgia,serif;font-size:clamp(45px,7vw,78px);line-height:.98;color:#12264b;margin:16px 0}.hero-v3 p,.create-v3 p,.seo-copy p{font-size:18px;line-height:1.65;color:#6e7478}.hero-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}.hero-demo{transform:rotate(1deg)}.demo-message{background:#eef0e9;border-radius:14px;padding:18px;margin:26px 0;display:grid;gap:8px}.demo-message span{font-size:12px;text-transform:uppercase;letter-spacing:1.4px;color:#71816f;font-weight:800}.demo-message strong{font-size:22px}.demo-tools{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.demo-tools span{background:#12264b;color:white;border-radius:9px;padding:10px 4px;text-align:center;font-size:12px;font-weight:800}.create-v3{display:grid;grid-template-columns:1fr 1fr;gap:50px;align-items:start;padding:70px 0}.create-v3 h2,.seo-copy h2{font-family:Georgia,serif;color:#12264b;font-size:38px;margin:8px 0}.feature-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:60px 0}.feature-grid article{background:#fffefa;border:1px solid #dedfd9;border-radius:18px;padding:24px}.feature-grid strong{color:#12264b;font-size:18px}.feature-grid p{color:#73797c;line-height:1.55}.seo-copy{max-width:760px;margin:90px auto}.legacy-card{max-width:600px;margin:60px auto}.sender-note,.record-help{display:block;color:#7a807c;font-size:12px;line-height:1.5;margin-top:12px}.record-help{margin-top:16px}
    .auth-page{min-height:75vh;display:grid;place-items:center;padding:50px 20px}.auth-card{width:min(480px,100%)}.auth-card h1{font-family:Georgia,serif;color:#12264b;font-size:38px}.google-btn{width:100%;margin:12px 0}.auth-note{display:block;color:#8a8172;line-height:1.45}.auth-divider{display:flex;align-items:center;gap:12px;color:#999;margin:22px 0}.auth-divider:before,.auth-divider:after{content:'';height:1px;background:#ddd;flex:1}.auth-switch{text-align:center;color:#777;margin-top:18px}.auth-switch a{color:#12264b;font-weight:800}.text-button{display:block;margin:14px auto 0;border:0;background:transparent;color:#566b58;text-decoration:underline;cursor:pointer}
    .account-page,.legal-page{max-width:900px;margin:auto;padding:60px 22px}.account-head{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:45px}.account-head h1,.legal-page h1{font-family:Georgia,serif;color:#12264b;font-size:48px;margin:10px 0}.account-head p{color:#777}.account-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}.account-inbox{margin:0}.legal-copy{font-size:17px;line-height:1.75}.legal-copy h2{color:#12264b;margin-top:34px}.legal-copy a{color:#12264b}.marketing-shell .topbar{position:sticky}
    @media(max-width:760px){.hero-v3,.create-v3{grid-template-columns:1fr}.hero-v3{gap:28px}.hero-demo{transform:none}.feature-grid{grid-template-columns:1fr 1fr}.account-grid{grid-template-columns:1fr}.account-head{align-items:start;flex-direction:column}.home-v3{padding-top:45px}}
    @media(max-width:560px){.bulk-bar{top:92px;align-items:flex-start;flex-direction:column}.bulk-actions{width:100%}.bulk-actions .btn{flex:1 1 auto}.refresh-line{flex-wrap:wrap}.refresh-line #refreshStatus{margin-left:0}.message-card.selecting{padding-left:54px}.feature-grid{grid-template-columns:1fr}.hero-v3 h1{font-size:46px}.home-v3{padding-left:20px;padding-right:20px}.account-head h1,.legal-page h1{font-size:40px}}
  `;
  document.head.appendChild(style);
}

let deferredInstallPrompt = null;
function isStandaloneApp() { return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true; }
function syncInstallButton() {
  $('#installApp')?.remove();
  if (!deferredInstallPrompt || isStandaloneApp()) return;
  const target = $('.hero-actions'); if (!target) return;
  const button = document.createElement('button');
  button.id = 'installApp'; button.className = 'btn sage'; button.type = 'button'; button.textContent = 'Install app';
  button.onclick = async () => { const prompt = deferredInstallPrompt; deferredInstallPrompt = null; syncInstallButton(); if (!prompt) return; await prompt.prompt(); await prompt.userChoice.catch(() => null); };
  target.appendChild(button);
}
function initPWA() {
  if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js').catch(() => null), { once: true });
  window.addEventListener('beforeinstallprompt', (event) => { event.preventDefault(); deferredInstallPrompt = event; syncInstallButton(); });
  window.addEventListener('appinstalled', () => { deferredInstallPrompt = null; syncInstallButton(); toast('NYMBOX installed.'); });
}

async function route() {
  cleanupOwnerStorage();
  const parts = location.pathname.split('/').filter(Boolean).map((part) => { try { return decodeURIComponent(part); } catch { return part; } });
  if (!parts.length) {
    stopDashboardRefresh();
    setPageMeta({ title: 'NYMBOX — Anonymous messages, images, voice notes & polls', description: 'Create a NYMBOX link to receive anonymous text, images, voice notes and polls, then turn replies into shareable cards.', path: '/', index: true });
    await home(); syncInstallButton(); return;
  }
  if (parts[0] === 'auth' && parts[1] === 'callback') return authCallbackPage();
  if (parts[0] === 'auth') return authPage();
  if (parts[0] === 'account') return accountPage();
  if (['about', 'privacy', 'terms', 'safety'].includes(parts[0])) return legalPage(parts[0]);
  if (parts[0] === 'u' && validSlug(parts[1])) { stopDashboardRefresh(); setPageMeta({ title: `Send an anonymous message | NYMBOX`, description: 'Send text, images, voice notes or polls anonymously with NYMBOX.', path: `/u/${parts[1]}`, index: false }); return publicInbox(parts[1]); }
  if (parts[0] === 'dashboard' && validSlug(parts[1])) { setPageMeta({ title: 'Private inbox | NYMBOX', description: 'Private NYMBOX inbox dashboard.', path: `/dashboard/${parts[1]}`, index: false }); const tab = new URLSearchParams(location.search).get('tab') === 'polls' ? 'polls' : 'inbox'; return dashboard(parts[1], tab); }
  if (parts[0] === 'poll' && validSlug(parts[1])) return pollPage(parts[1]);
  stopDashboardRefresh();
  setPageMeta({ title: 'Page not found | NYMBOX', description: 'The requested NYMBOX page was not found.', path: location.pathname, index: false });
  app.innerHTML = `${topbar()}<main class="page"><div class="card empty">Page not found.<br><br><a class="btn" href="/">Go home</a></div></main>${footer()}`;
}

injectEnhancementStyles();
initPWA();
route();
