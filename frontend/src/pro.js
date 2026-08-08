(function () {
  const THEME = window.PicnymTheme;
  let accountCache = null;
  let friendCache = null;
  let dashboardFilter = { query: '', kind: 'all', favoritesOnly: false, showArchived: false };
  const PROMPTS = [
    'What is something I do that people remember?',
    'What should I do more often?',
    'What is your first impression of me?',
    'Tell me an opinion you think I need to hear.',
    'What is one thing you have always wanted to ask me?',
    'Pick my next profile photo: bold, calm or funny?'
  ];
  const interfacePreference = (key) => localStorage.getItem(`picnym-${key}`) === 'true';

  function applyInterfacePreferences() {
    document.documentElement.dataset.compact = String(interfacePreference('compact'));
    document.documentElement.dataset.motion = interfacePreference('reduced-motion') ? 'reduced' : 'full';
  }

  applyInterfacePreferences();

  const avatar = (profile, size = 'md') => profile?.avatarUrl
    ? `<img class="profile-avatar ${size}" src="${esc(profile.avatarUrl)}" alt="${esc(profile.displayName || profile.username || 'Profile')} profile picture" loading="lazy">`
    : `<span class="profile-avatar ${size} fallback" aria-hidden="true">${esc(String(profile?.displayName || profile?.username || 'P').slice(0, 1).toUpperCase())}</span>`;
  const premiumBadge = (profile) => profile?.premium ? '<span class="premium-badge">PICNYM PREMIUM</span>' : '';
  const fmtCount = (value) => new Intl.NumberFormat().format(Number(value) || 0);

  function ensureThemeToggle() {
    let button = document.getElementById('themeToggle');
    if (!button) {
      button = document.createElement('button');
      button.id = 'themeToggle';
      button.type = 'button';
      button.className = 'theme-toggle';
      document.body.appendChild(button);
      button.addEventListener('click', async () => {
        const current = THEME?.currentPreference?.() || 'system';
        const resolved = THEME?.resolved?.(current) || document.documentElement.dataset.theme || 'light';
        const next = resolved === 'dark' ? 'light' : 'dark';
        THEME?.apply?.(next);
        updateThemeToggle();
        try {
          const session = await authSession();
          if (session) await api('/api/account/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme: next }) });
        } catch {}
      });
    }
    updateThemeToggle();
  }

  function updateThemeToggle() {
    const button = document.getElementById('themeToggle');
    if (!button) return;
    const mode = document.documentElement.dataset.theme || 'light';
    button.textContent = mode === 'dark' ? '☀' : '☾';
    button.title = mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
    button.setAttribute('aria-label', button.title);
  }

  window.addEventListener('picnym-theme-change', updateThemeToggle);

  async function syncThemeFromAccount(data) {
    if (!data?.settings?.theme || !THEME) return;
    const local = localStorage.getItem(THEME.key);
    if (!local || local === 'system') THEME.apply(data.settings.theme, true);
  }

  function premiumTeaser() {
    if (document.querySelector('.premium-home-teaser')) return;
    const links = document.querySelector('.marketing-links');
    if (!links) return;
    const section = document.createElement('section');
    section.className = 'premium-home-teaser';
    section.innerHTML = `<div><span class="premium-badge">PICNYM PREMIUM</span><strong>More control. More customization.</strong><p>Advanced anonymous analytics, premium profile styling, larger inbox limits, exports and power-user tools.</p></div><div class="premium-price">₦500 <span>/ month</span><small>Payments coming soon</small></div>`;
    links.before(section);
  }

  const baseHome = home;
  home = async function professionalHome(...args) {
    await baseHome(...args);
    premiumTeaser();
    ensureThemeToggle();
  };

  function accountTabs(active) {
    const tabs = [['profile','Profile'],['inboxes','Inboxes'],['friends','Friends'],['settings','Settings'],['billing','Billing']];
    return `<nav class="account-tabs" aria-label="Account sections">${tabs.map(([key,label]) => `<button type="button" class="account-tab ${active === key ? 'active' : ''}" data-account-tab="${key}">${label}</button>`).join('')}</nav>`;
  }

  function accountHero(data) {
    const profile = data.profile || {};
    return `<section class="account-hero card"><div class="profile-main">${avatar(profile, 'xl')}<div><div class="profile-name-row"><h1>${esc(profile.displayName || 'PICNYM user')}</h1>${premiumBadge(profile)}</div><div class="profile-handle">@${esc(profile.username || '')}</div><p>${esc(profile.bio || 'Your PICNYM profile is ready for a bio.')}</p></div></div><div class="account-stat-grid"><div><strong>${fmtCount(data.stats?.inboxes)}</strong><span>Inboxes</span></div><div><strong>${fmtCount(data.stats?.totalMessages)}</strong><span>Messages</span></div><div><strong>${fmtCount(data.stats?.friends)}</strong><span>Friends</span></div></div></section>`;
  }

  function profileSection(data) {
    const p = data.profile || {};
    return `<section class="settings-grid"><article class="card"><div class="card-title-row"><div><div class="section-kicker compact">Profile picture</div><h2>Your profile</h2></div>${avatar(p, 'lg')}</div><form id="avatarForm"><label class="file-zone compact-file">Choose a new picture<input id="avatarInput" name="avatar" type="file" accept="image/jpeg,image/png,image/webp" required><div class="form-note">JPEG, PNG or WebP · up to 5 MB</div></label><div class="inline-actions"><button class="btn sage" type="submit">Upload picture</button>${p.avatarUrl ? '<button id="removeAvatar" class="btn" type="button">Remove</button>' : ''}</div></form></article><article class="card"><div class="section-kicker compact">Identity</div><h2>Profile details</h2><form id="profileProForm"><div class="field"><label>Display name</label><input name="displayName" maxlength="60" value="${esc(p.displayName || '')}" required></div><div class="field"><label>Username</label><div class="slug-field"><span>@</span><input name="username" maxlength="24" pattern="[a-zA-Z0-9_]{3,24}" value="${esc(p.username || '')}" required></div></div><div class="field"><label>Bio</label><textarea name="bio" maxlength="240" placeholder="A short intro for your PICNYM profile">${esc(p.bio || '')}</textarea></div><button class="btn primary" type="submit">Save profile</button></form><div class="card-divider"></div><div class="inline-actions"><a class="btn" href="/profile/${encodeURIComponent(p.username || '')}">View public profile</a><button id="copyProfileLink" class="btn" type="button">Copy profile link</button></div></article></section>`;
  }

  function inboxStatus(item) {
    const s = item.settings || {};
    if (s.paused) return '<span class="status-pill paused">Paused</span>';
    if (s.friendsOnly) return '<span class="status-pill">Friends only</span>';
    if (s.registeredOnly) return '<span class="status-pill">Accounts only</span>';
    return '<span class="status-pill live">Live</span>';
  }

  function inboxesSection(data) {
    const inboxes = Array.isArray(data.inboxes) ? data.inboxes : [];
    return `<div class="section-heading-row"><div><div class="section-kicker compact">Manage links</div><h2>Your inboxes</h2><p class="form-note">Free accounts can create up to 5 inboxes. Each inbox has its own filters and privacy controls.</p></div><a class="btn primary" href="/">+ Create inbox</a></div><div class="professional-inbox-list">${inboxes.length ? inboxes.map((item) => `<article class="card professional-inbox"><div class="professional-inbox-main"><div><div class="inbox-title-row"><strong>/${esc(item.slug)}</strong>${inboxStatus(item)}</div><span>${esc(item.displayName || '')} · ${fmtCount(item.messageCount)} messages</span></div><div class="inbox-card-actions"><a class="btn small primary" href="/dashboard/${encodeURIComponent(item.slug)}">Open</a><button class="btn small inbox-settings-btn" type="button" data-slug="${esc(item.slug)}">Settings</button><button class="btn small danger-btn inbox-delete-btn" type="button" data-slug="${esc(item.slug)}">Delete</button></div></div></article>`).join('') : '<div class="card empty">No inboxes yet. Create your first anonymous link.</div>'}</div>`;
  }

  function friendCard(item, action = '') {
    const p = item?.profile || item;
    if (!p) return '';
    return `<article class="friend-card card">${avatar(p, 'sm')}<div class="friend-copy"><strong>${esc(p.displayName || p.username)}</strong><a href="/profile/${encodeURIComponent(p.username)}">@${esc(p.username)}</a>${premiumBadge(p)}</div>${action}</article>`;
  }

  function friendsSection() {
    return `<section><div class="section-kicker compact">Connections</div><h2>Friends</h2><p class="form-note">Search by username. Friend-only inboxes can accept anonymous messages only from people you have mutually added.</p><form id="friendSearchForm" class="friend-search"><input id="friendSearchInput" minlength="3" maxlength="24" placeholder="Search @username" autocomplete="off"><button class="btn primary" type="submit">Search</button></form><div id="friendSearchResults"></div><div id="friendsContent"><div class="card empty">Loading friends…</div></div></section>`;
  }

  function switchControl(name, label, description, checked) {
    return `<label class="setting-row"><span><strong>${esc(label)}</strong><small>${esc(description)}</small></span><input type="checkbox" name="${esc(name)}" ${checked ? 'checked' : ''}><i aria-hidden="true"></i></label>`;
  }

  function settingsSection(data) {
    const s = data.settings || {};
    return `<section class="settings-grid"><article class="card"><div class="section-kicker compact">Appearance</div><h2>Theme</h2><div class="theme-choice" role="group" aria-label="Theme preference"><button class="theme-option ${s.theme === 'system' ? 'active' : ''}" data-theme-value="system" type="button">System</button><button class="theme-option ${s.theme === 'light' ? 'active' : ''}" data-theme-value="light" type="button">Light</button><button class="theme-option ${s.theme === 'dark' ? 'active' : ''}" data-theme-value="dark" type="button">Dark</button></div><p class="form-note">The floating ☾ / ☀ button gives you a quick dedicated light/dark toggle anywhere in PICNYM.</p></article><article class="card"><div class="section-kicker compact">Interface</div><h2>Make it yours</h2><form id="interfaceSettingsForm">${switchControl('compact','Compact inbox','Fit more messages on screen with tighter cards.',interfacePreference('compact'))}${switchControl('reducedMotion','Reduce motion','Limit transitions and non-essential animation.',interfacePreference('reduced-motion'))}<button class="btn primary" type="submit">Save interface</button></form></article><article class="card"><div class="section-kicker compact">Privacy</div><h2>Profile controls</h2><form id="privacySettingsForm">${switchControl('discoverable','Discoverable profile','Allow people to find you by PICNYM username.',s.discoverable)}${switchControl('allowFriendRequests','Friend requests','Let other PICNYM users send you friend requests.',s.allowFriendRequests)}${switchControl('showActivity','Activity status','Show friends when you are currently active.',s.showActivity)}${switchControl('browserNotifications','In-app browser notifications','Notify you about new messages while PICNYM is open.',s.browserNotifications)}<button class="btn primary" type="submit">Save settings</button></form></article><article class="card safety-settings-card"><div class="section-kicker compact">Help & safety</div><h2>Your control center</h2><p class="form-note">Review the rules, privacy choices and the steps for reporting or blocking unwanted messages.</p><div class="inline-actions"><a class="btn" href="/safety">Safety center</a><a class="btn" href="/privacy">Privacy</a><a class="btn" href="/terms">Terms</a></div></article><article class="card danger-zone"><div class="section-kicker compact">Data & account</div><h2>Account controls</h2><p class="form-note">Export a snapshot of your account settings, or permanently delete your PICNYM account and every inbox it owns.</p><div class="inline-actions"><button id="exportAccount" class="btn" type="button">Export account JSON</button><button id="deleteAccount" class="btn danger-btn" type="button">Delete account</button></div></article></section>`;
  }

  function billingSection(data) {
    const premium = data.profile?.premium;
    return `<section><div class="section-kicker compact">Billing</div><h2>PICNYM plans</h2><div class="billing-grid"><article class="card plan-card ${premium ? '' : 'current-plan'}"><span class="plan-label">FREE</span><h3>PICNYM Free</h3><div class="plan-price">₦0</div><ul><li>Up to 5 inboxes</li><li>Text, images, voice notes & polls</li><li>Profiles, friends and dark theme</li><li>Hidden-word filters and safety controls</li><li>Message search, favorites and archive</li></ul>${premium ? '' : '<span class="status-pill live">Current plan</span>'}</article><article class="card plan-card premium-plan ${premium ? 'current-plan' : ''}"><span class="premium-badge">PICNYM PREMIUM</span><h3>Power-user tools</h3><div class="plan-price">₦500 <small>/ month</small></div><ul><li>Up to 30 inboxes</li><li>30-day advanced anonymous analytics</li><li>Unique anonymous-sender counts without revealing identities</li><li>Premium profile badge and future profile styles</li><li>Bulk exports and advanced organization tools</li><li>Early access to new creator features</li></ul>${premium ? '<span class="status-pill live">Active</span>' : '<button class="btn primary" type="button" disabled>Payments coming soon</button>'}<p class="form-note premium-trust">PICNYM Premium never reveals a sender’s hidden identity, exact location, IP address or device fingerprint. A sender can voluntarily attach their PICNYM profile to a message.</p></article></div></section>`;
  }

  async function renderAccountTab(tab, data) {
    const target = document.getElementById('accountPanel');
    if (!target) return;
    if (tab === 'inboxes') target.innerHTML = inboxesSection(data);
    else if (tab === 'friends') target.innerHTML = friendsSection();
    else if (tab === 'settings') target.innerHTML = settingsSection(data);
    else if (tab === 'billing') target.innerHTML = billingSection(data);
    else target.innerHTML = profileSection(data);
    await bindAccountTab(tab, data);
  }

  async function professionalAccountPage() {
    stopDashboardRefresh?.();
    const session = await authSession();
    if (!session) { history.replaceState({}, '', '/?auth=signin'); return home('signin'); }
    const requested = new URLSearchParams(location.search).get('tab');
    const tab = ['profile','inboxes','friends','settings','billing'].includes(requested) ? requested : 'profile';
    app.innerHTML = `${topbar('<a class="top-action" href="/">Home</a>')}<main class="page account-pro-page"><div class="section-kicker">Account center</div><div id="accountPro"><div class="card empty">Loading your account…</div></div></main>`;
    try {
      const data = await api('/api/account');
      accountCache = data;
      await syncThemeFromAccount(data);
      document.getElementById('accountPro').innerHTML = `${accountHero(data)}${accountTabs(tab)}<section id="accountPanel"></section>`;
      document.querySelectorAll('[data-account-tab]').forEach((button) => button.onclick = async () => {
        const next = button.dataset.accountTab;
        history.replaceState({}, '', `/account?tab=${next}`);
        document.querySelectorAll('[data-account-tab]').forEach((item) => item.classList.toggle('active', item === button));
        await renderAccountTab(next, data);
      });
      await renderAccountTab(tab, data);
    } catch (error) {
      document.getElementById('accountPro').innerHTML = `<div class="card empty">${esc(error.message)}</div>`;
    }
    ensureThemeToggle();
  }

  accountPage = professionalAccountPage;

  async function bindAccountTab(tab, data) {
    if (tab === 'profile') {
      document.getElementById('profileProForm')?.addEventListener('submit', async (event) => {
        event.preventDefault(); const button = event.submitter; if (button) button.disabled = true;
        try {
          const form = new FormData(event.currentTarget);
          const result = await api('/api/account/profile', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ displayName: form.get('displayName'), username: form.get('username'), bio: form.get('bio') }) });
          await PicnymAuth.updateProfile(result.profile.displayName);
          toast('Profile updated.'); await professionalAccountPage();
        } catch (error) { toast(error.message); if (button) button.disabled = false; }
      });
      document.getElementById('avatarForm')?.addEventListener('submit', async (event) => {
        event.preventDefault(); const button = event.submitter; if (button) button.disabled = true;
        try { const form = new FormData(event.currentTarget); await api('/api/account/avatar', { method: 'POST', body: form }, 90000); toast('Profile picture updated.'); await professionalAccountPage(); }
        catch (error) { toast(error.message); if (button) button.disabled = false; }
      });
      document.getElementById('removeAvatar')?.addEventListener('click', async () => { try { await api('/api/account/avatar', { method: 'DELETE' }); toast('Profile picture removed.'); await professionalAccountPage(); } catch (error) { toast(error.message); } });
      document.getElementById('copyProfileLink')?.addEventListener('click', () => copy(`${location.origin}/profile/${data.profile.username}`));
    }
    if (tab === 'inboxes') {
      document.querySelectorAll('.inbox-settings-btn').forEach((button) => button.onclick = () => openInboxSettings(data.inboxes.find((item) => item.slug === button.dataset.slug)));
      document.querySelectorAll('.inbox-delete-btn').forEach((button) => button.onclick = () => confirmInboxDelete(button.dataset.slug));
    }
    if (tab === 'friends') { await loadFriends(); bindFriendSearch(); }
    if (tab === 'settings') {
      document.querySelectorAll('[data-theme-value]').forEach((button) => button.onclick = async () => {
        const theme = button.dataset.themeValue; THEME?.apply?.(theme);
        document.querySelectorAll('[data-theme-value]').forEach((item) => item.classList.toggle('active', item === button));
        try { await api('/api/account/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ theme }) }); data.settings.theme = theme; }
        catch (error) { toast(error.message); }
      });
      document.getElementById('privacySettingsForm')?.addEventListener('submit', async (event) => {
        event.preventDefault(); const form = new FormData(event.currentTarget);
        let browserNotifications = form.has('browserNotifications');
        if (browserNotifications && 'Notification' in window && Notification.permission === 'default') {
          const permission = await Notification.requestPermission(); browserNotifications = permission === 'granted';
          event.currentTarget.elements.browserNotifications.checked = browserNotifications;
        }
        try {
          const result = await api('/api/account/settings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ discoverable: form.has('discoverable'), allowFriendRequests: form.has('allowFriendRequests'), showActivity: form.has('showActivity'), browserNotifications }) });
          data.settings = result.settings; accountCache = { ...data, settings: result.settings }; toast('Settings saved.');
        } catch (error) { toast(error.message); }
      });
      document.getElementById('interfaceSettingsForm')?.addEventListener('submit', (event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        localStorage.setItem('picnym-compact', String(form.has('compact')));
        localStorage.setItem('picnym-reduced-motion', String(form.has('reducedMotion')));
        applyInterfacePreferences();
        toast('Interface preferences saved.');
      });
      document.getElementById('exportAccount')?.addEventListener('click', () => exportJson(data));
      document.getElementById('deleteAccount')?.addEventListener('click', confirmAccountDelete);
    }
  }

  function openInboxSettings(item) {
    if (!item) return;
    const s = item.settings || {};
    const box = modal(`<h2>Inbox settings</h2><p class="form-note">/${esc(item.slug)}</p><div class="field"><label>Inbox display name</label><input id="inboxDisplayName" maxlength="40" value="${esc(item.displayName || '')}"></div><div class="field"><label>Link name</label><div class="slug-field"><span>/u/</span><input id="inboxSlug" maxlength="28" value="${esc(item.slug)}"></div></div>${switchControl('paused','Pause this link','Stop all new messages until you turn it back on.',s.paused)}${switchControl('registeredOnly','Registered users only','Senders must be signed into PICNYM.',s.registeredOnly)}${switchControl('friendsOnly','Friends only','Only accepted PICNYM friends can send messages.',s.friendsOnly)}${switchControl('allowImages','Allow images','Let people attach image messages.',s.allowImages !== false)}${switchControl('allowVoice','Allow voice notes','Let people record or upload voice notes.',s.allowVoice !== false)}${switchControl('allowPolls','Allow polls','Let people send anonymous polls.',s.allowPolls !== false)}<div class="field"><label>Hidden words</label><textarea id="hiddenWords" placeholder="One word or phrase per line">${esc((s.hiddenWords || []).join('\n'))}</textarea><div class="form-note">Messages containing these words are rejected before they reach you.</div></div><div class="modal-actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" data-save>Save settings</button></div>`);
    $('[data-close]', box).onclick = () => box.remove();
    $('[data-save]', box).onclick = async () => {
      const button = $('[data-save]', box); button.disabled = true;
      try {
        const newSlug = $('#inboxSlug', box).value.trim();
        const displayName = $('#inboxDisplayName', box).value.trim();
        const renamed = await api(`/api/inboxes/${encodeURIComponent(item.slug)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug: newSlug, displayName }) });
        const hiddenWords = $('#hiddenWords', box).value.split(/\n|,/).map((word) => word.trim()).filter(Boolean);
        await api(`/api/inboxes/${encodeURIComponent(renamed.slug)}/settings`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ paused: box.querySelector('[name="paused"]').checked, registeredOnly: box.querySelector('[name="registeredOnly"]').checked, friendsOnly: box.querySelector('[name="friendsOnly"]').checked, allowImages: box.querySelector('[name="allowImages"]').checked, allowVoice: box.querySelector('[name="allowVoice"]').checked, allowPolls: box.querySelector('[name="allowPolls"]').checked, hiddenWords }) });
        if (renamed.slug !== item.slug) { const token = ownerToken(item.slug); if (token) { saveOwner(renamed.slug, token); removeOwner(item.slug); } }
        box.remove(); toast('Inbox settings saved.'); await professionalAccountPage();
      } catch (error) { toast(error.message); button.disabled = false; }
    };
  }

  function confirmInboxDelete(slug) {
    const box = modal(`<h2>Delete /${esc(slug)}?</h2><p>This permanently deletes the inbox, its messages, polls and uploaded media. This cannot be undone.</p><div class="modal-actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn danger-btn" type="button" data-delete>Delete inbox</button></div>`);
    $('[data-close]', box).onclick = () => box.remove();
    $('[data-delete]', box).onclick = async () => {
      const button = $('[data-delete]', box); button.disabled = true;
      try { await api(`/api/inboxes/${encodeURIComponent(slug)}`, { method: 'DELETE', headers: ownerHeaders(ownerToken(slug)) }); removeOwner(slug); box.remove(); toast('Inbox deleted.'); await professionalAccountPage(); }
      catch (error) { toast(error.message); button.disabled = false; }
    };
  }

  async function loadFriends() {
    const target = document.getElementById('friendsContent'); if (!target) return;
    try {
      friendCache = await api('/api/friends');
      const incoming = friendCache.incoming || [], outgoing = friendCache.outgoing || [], accepted = friendCache.accepted || [];
      target.innerHTML = `${incoming.length ? `<div class="section-kicker compact">Requests</div><div class="friend-list">${incoming.map((item) => friendCard(item, `<div class="friend-actions"><button class="btn small primary accept-friend" data-id="${esc(item.profile.userId || '')}" type="button">Accept</button><button class="btn small remove-friend" data-id="${esc(item.profile.userId || '')}" type="button">Decline</button></div>`)).join('')}</div>` : ''}${outgoing.length ? `<div class="section-kicker compact">Sent requests</div><div class="friend-list">${outgoing.map((item) => friendCard(item, `<button class="btn small remove-friend" data-id="${esc(item.profile.userId || '')}" type="button">Cancel</button>`)).join('')}</div>` : ''}<div class="section-kicker compact">Your friends</div><div class="friend-list">${accepted.length ? accepted.map((item) => friendCard(item, `<button class="btn small remove-friend" data-id="${esc(item.profile.userId || '')}" type="button">Remove</button>`)).join('') : '<div class="card empty">No friends yet.</div>'}</div>`;
      bindFriendActions();
    } catch (error) { target.innerHTML = `<div class="card empty">${esc(error.message)}</div>`; }
  }

  function bindFriendActions() {
    document.querySelectorAll('.accept-friend').forEach((button) => button.onclick = async () => {
      try { await api(`/api/friends/${encodeURIComponent(button.dataset.id)}/accept`, { method: 'POST' }); toast('Friend added.'); await loadFriends(); }
      catch (error) { toast(error.message); }
    });
    document.querySelectorAll('.remove-friend').forEach((button) => button.onclick = async () => {
      try { await api(`/api/friends/${encodeURIComponent(button.dataset.id)}`, { method: 'DELETE' }); toast('Friend connection updated.'); await loadFriends(); }
      catch (error) { toast(error.message); }
    });
  }

  function bindFriendSearch() {
    document.getElementById('friendSearchForm')?.addEventListener('submit', async (event) => {
      event.preventDefault(); const q = document.getElementById('friendSearchInput').value.trim().replace(/^@/, ''); const target = document.getElementById('friendSearchResults');
      if (q.length < 3) return toast('Enter at least 3 characters.');
      target.innerHTML = '<div class="card empty">Searching…</div>';
      try {
        const result = await api(`/api/users/search?q=${encodeURIComponent(q)}`);
        target.innerHTML = result.users?.length ? `<div class="section-kicker compact">Search results</div><div class="friend-list">${result.users.map((profile) => friendCard(profile, `<button class="btn small sage add-friend" type="button" data-username="${esc(profile.username)}">Add friend</button>`)).join('')}</div>` : '<div class="card empty">No matching public profiles.</div>';
        document.querySelectorAll('.add-friend').forEach((button) => button.onclick = async () => {
          try { await api('/api/friends/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: button.dataset.username }) }); toast('Friend request sent.'); button.disabled = true; await loadFriends(); }
          catch (error) { toast(error.message); }
        });
      } catch (error) { target.innerHTML = `<div class="card empty">${esc(error.message)}</div>`; }
    });
  }

  function exportJson(data) {
    const safe = { exportedAt: new Date().toISOString(), profile: data.profile, settings: data.settings, stats: data.stats, inboxes: data.inboxes?.map(({ id, ...item }) => item) || [] };
    const blob = new Blob([JSON.stringify(safe, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'picnym-account-export.json'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function confirmAccountDelete() {
    const box = modal(`<h2>Delete your PICNYM account?</h2><p>This permanently deletes every inbox owned by this account, all their messages and your profile. Type <strong>DELETE</strong> to continue.</p><div class="field"><input id="deleteAccountConfirm" autocomplete="off" placeholder="DELETE"></div><div class="modal-actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn danger-btn" type="button" data-delete disabled>Delete account</button></div>`);
    const input = $('#deleteAccountConfirm', box), button = $('[data-delete]', box); input.oninput = () => { button.disabled = input.value !== 'DELETE'; }; $('[data-close]', box).onclick = () => box.remove();
    button.onclick = async () => { button.disabled = true; try { await api('/api/account', { method: 'DELETE' }); await PicnymAuth.signOut().catch(() => {}); localStorage.removeItem('picnym-auth'); box.remove(); toast('Account deleted.'); nav('/'); } catch (error) { toast(error.message); button.disabled = false; } };
  }

  async function publicProfilePage(username) {
    stopDashboardRefresh?.();
    app.innerHTML = `${topbar('<a class="top-action" href="/">Home</a>')}<main class="page public-profile-page"><div class="card empty">Loading profile…</div></main>`;
    try {
      const data = await api(`/api/profiles/${encodeURIComponent(username)}`);
      const p = data.profile;
      const session = await authSession();
      const posts = data.posts || [];
      document.querySelector('.public-profile-page').innerHTML = `<section class="card public-profile-card"><div class="profile-main">${avatar(p, 'xl')}<div><div class="profile-name-row"><h1>${esc(p.displayName)}</h1>${premiumBadge(p)}</div><div class="profile-handle">@${esc(p.username)}</div><p>${esc(p.bio || 'No bio yet.')}</p></div></div><div class="account-stat-grid two"><div><strong>${fmtCount(data.stats?.friends)}</strong><span>Friends</span></div><div><strong>${fmtCount(data.stats?.publicAnswers)}</strong><span>Public answers</span></div></div>${session ? `<button id="profileAddFriend" class="btn sage" type="button">Add friend</button>` : '<a class="btn sage" href="/?auth=signin">Sign in to add friend</a>'}</section><div class="section-kicker">Public answers</div><div class="public-answer-list">${posts.length ? posts.map((message) => publicAnswerCard(message)).join('') : '<div class="card empty">No public answers yet.</div>'}</div>`;
      document.getElementById('profileAddFriend')?.addEventListener('click', async (event) => { try { await api('/api/friends/request', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: p.username }) }); toast('Friend request sent.'); event.currentTarget.disabled = true; } catch (error) { toast(error.message); } });
    } catch (error) { document.querySelector('.public-profile-page').innerHTML = `<div class="card empty">${esc(error.message)}</div>`; }
    ensureThemeToggle();
  }

  function publicAnswerCard(message) {
    const body = message.imageUrl ? `<img class="message-image" src="${esc(message.imageUrl)}" alt="Shared anonymous image" loading="lazy">` : message.voiceUrl ? `<div class="voice-box"><audio controls preload="metadata" src="${esc(message.voiceUrl)}"></audio></div>` : message.poll ? `<div class="poll-box"><div class="poll-question">${esc(message.poll.question)}</div></div>` : `<div class="message-text">${esc(message.text || 'Anonymous message')}</div>`;
    return `<article class="card public-answer"><div class="anon">Anonymous message</div>${body}<div class="reply-preview"><strong>Reply</strong><br>${esc(message.reply || '')}</div><div class="time">${esc(fmt(message.createdAt))}</div></article>`;
  }

  const basePublicInbox = publicInbox;
  publicInbox = async function professionalPublicInbox(slug) {
    await basePublicInbox(slug);
    try {
      const inbox = await api(`/api/inboxes/${encodeURIComponent(slug)}`);
      const profileBox = document.querySelector('.public-profile');
      if (profileBox && inbox.profile) {
        const mark = profileBox.querySelector('.brand-mark'); if (mark) mark.outerHTML = avatar(inbox.profile, 'lg');
        const strong = profileBox.querySelector('strong'); if (strong) strong.insertAdjacentHTML('afterend', `<a class="profile-handle public-profile-link" href="/profile/${encodeURIComponent(inbox.profile.username)}">@${esc(inbox.profile.username)} ${inbox.profile.premium ? '· Premium' : ''}</a>`);
      }
      const settings = inbox.settings || {};
      const composer = document.querySelector('.public-card .card');
      if (composer) {
        const notes = [];
        if (settings.paused) notes.push('This inbox is paused and is not accepting new messages.');
        if (settings.friendsOnly) notes.push('Only accepted PICNYM friends can send here.');
        else if (settings.registeredOnly) notes.push('You must be signed into PICNYM to send here.');
        if (notes.length) composer.insertAdjacentHTML('beforebegin', `<div class="inbox-notice">${esc(notes.join(' '))}</div>`);
      }
      const kindAllowed = { image: settings.allowImages !== false, voice: settings.allowVoice !== false, poll: settings.allowPolls !== false };
      document.querySelectorAll('.tool').forEach((button) => { if (button.dataset.kind !== 'text' && kindAllowed[button.dataset.kind] === false) { button.disabled = true; button.title = 'Disabled by the inbox owner'; } });
      const session = await authSession();
      const form = document.getElementById('sendForm');
      if (form && !document.querySelector('.prompt-deck')) {
        const deck = document.createElement('div');
        deck.className = 'prompt-deck';
        deck.innerHTML = `<strong>Need a starting point?</strong><div class="prompt-chips">${PROMPTS.map((prompt) => `<button class="prompt-chip" type="button" data-prompt="${esc(prompt)}">${esc(prompt)}</button>`).join('')}</div>`;
        form.before(deck);
        const usePrompt = (prompt) => {
          document.querySelector('.tool[data-kind="text"]')?.click();
          requestAnimationFrame(() => {
            const input = document.querySelector('#sendForm textarea[name="text"]');
            if (!input) return;
            input.value = prompt;
            input.focus();
            input.setSelectionRange(input.value.length, input.value.length);
          });
        };
        deck.querySelectorAll('[data-prompt]').forEach((button) => button.addEventListener('click', () => usePrompt(button.dataset.prompt)));
        const requestedPrompt = new URLSearchParams(location.search).get('prompt');
        if (requestedPrompt && requestedPrompt.length <= 180) usePrompt(requestedPrompt);
      }
      if (form && session) form.insertAdjacentHTML('beforeend', '<label class="reveal-profile-option"><input type="checkbox" name="revealProfile" value="1"><span><strong>Reveal my PICNYM profile with this message</strong><small>Optional. Leave off to stay anonymous.</small></span></label>');
      if (form && settings.paused) form.querySelectorAll('button,input,textarea').forEach((element) => element.disabled = true);
      if (form && !session && (settings.registeredOnly || settings.friendsOnly)) {
        form.querySelectorAll('button,input,textarea').forEach((element) => element.disabled = true);
        form.insertAdjacentHTML('afterbegin', '<a class="btn primary" href="/?auth=signin" style="width:100%;margin-bottom:14px">Sign in to send</a>');
      }
    } catch {}
    ensureThemeToggle();
  };

  const baseRenderInbox = renderInbox;
  renderInbox = function professionalRenderInbox(inbox, messages, token, options = {}) {
    baseRenderInbox(inbox, messages, token, options);
    enhanceMessageList(inbox, messages, token);
  };

  function enhanceMessageList(inbox, messages, token) {
    const heading = document.querySelector('.inbox-heading');
    if (heading && !document.getElementById('messageFilters')) heading.insertAdjacentHTML('afterend', `<div id="messageFilters" class="message-filters"><input id="messageSearch" type="search" placeholder="Search messages or replies" value="${esc(dashboardFilter.query)}"><select id="messageKindFilter"><option value="all">All types</option><option value="text">Text</option><option value="image">Images</option><option value="voice">Voice</option><option value="poll">Polls</option></select><label><input id="favoritesOnly" type="checkbox" ${dashboardFilter.favoritesOnly ? 'checked' : ''}> Favorites</label><label><input id="showArchived" type="checkbox" ${dashboardFilter.showArchived ? 'checked' : ''}> Archived</label></div>`);
    const kindSelect = document.getElementById('messageKindFilter'); if (kindSelect) kindSelect.value = dashboardFilter.kind;
    document.getElementById('messageSearch')?.addEventListener('input', (event) => { dashboardFilter.query = event.target.value; filterMessageCards(messages); });
    kindSelect?.addEventListener('change', (event) => { dashboardFilter.kind = event.target.value; filterMessageCards(messages); });
    document.getElementById('favoritesOnly')?.addEventListener('change', (event) => { dashboardFilter.favoritesOnly = event.target.checked; filterMessageCards(messages); });
    document.getElementById('showArchived')?.addEventListener('change', (event) => { dashboardFilter.showArchived = event.target.checked; filterMessageCards(messages); });
    for (const message of messages) {
      const card = document.querySelector(`.message-card[data-message-id="${CSS.escape(message.id)}"]`); if (!card) continue;
      if (message.senderProfile) {
        const anon = card.querySelector('.anon'); if (anon) anon.innerHTML = `${avatar(message.senderProfile, 'xs')}<a href="/profile/${encodeURIComponent(message.senderProfile.username)}">@${esc(message.senderProfile.username)}</a><small>revealed by sender</small>`;
      }
      if (message.favorite) card.classList.add('favorite-message');
      if (message.archived) card.classList.add('archived-message');
      const menu = card.querySelector('.menu');
      if (menu && !menu.querySelector('[data-favorite]')) {
        menu.insertAdjacentHTML('afterbegin', `<button type="button" data-favorite>${message.favorite ? 'Remove favorite' : 'Favorite'}</button><button type="button" data-archive>${message.archived ? 'Unarchive' : 'Archive'}</button>${message.reply ? `<button type="button" data-publish>${message.isPublic ? 'Remove from profile' : 'Publish answer to profile'}</button>` : ''}<button type="button" data-report>Report message</button>`);
        menu.querySelector('[data-favorite]').onclick = () => updateMessageState(message, token, { favorite: !message.favorite });
        menu.querySelector('[data-archive]').onclick = () => updateMessageState(message, token, { archived: !message.archived });
        menu.querySelector('[data-publish]')?.addEventListener('click', () => updateMessageState(message, token, { isPublic: !message.isPublic }));
        menu.querySelector('[data-report]').onclick = () => reportMessage(message, token);
      }
    }
    filterMessageCards(messages);
  }

  function filterMessageCards(messages) {
    const map = new Map(messages.map((message) => [message.id, message]));
    document.querySelectorAll('.message-card').forEach((card) => {
      const message = map.get(card.dataset.messageId); if (!message) return;
      const q = dashboardFilter.query.trim().toLowerCase();
      const searchable = `${message.text || ''} ${message.reply || ''} ${message.poll?.question || ''}`.toLowerCase();
      const typeMatch = dashboardFilter.kind === 'all' || message.kind === dashboardFilter.kind;
      const queryMatch = !q || searchable.includes(q);
      const favoriteMatch = !dashboardFilter.favoritesOnly || message.favorite;
      const archiveMatch = dashboardFilter.showArchived ? message.archived : !message.archived;
      card.classList.toggle('filter-hidden', !(typeMatch && queryMatch && favoriteMatch && archiveMatch));
    });
  }

  async function updateMessageState(message, token, patch) {
    try {
      const result = await api(`/api/messages/${encodeURIComponent(message.id)}/state`, { method: 'PATCH', headers: ownerHeaders(token, { 'content-type': 'application/json' }), body: JSON.stringify(patch) });
      if (result.favorite !== undefined) message.favorite = result.favorite;
      if (result.archived !== undefined) message.archived = result.archived;
      if (result.isPublic !== undefined) message.isPublic = result.isPublic;
      toast(patch.isPublic !== undefined ? (message.isPublic ? 'Answer published to your profile.' : 'Answer removed from your profile.') : patch.archived !== undefined ? (message.archived ? 'Message archived.' : 'Message restored.') : (message.favorite ? 'Added to favorites.' : 'Removed from favorites.'));
      const activeInbox = typeof inboxSelectionInbox !== 'undefined' ? inboxSelectionInbox : picnymDashboardState?.inbox;
      const activeMessages = typeof inboxSelectionMessages !== 'undefined' ? inboxSelectionMessages : picnymDashboardState?.messages || [];
      renderInbox(activeInbox, activeMessages, token, { preserveSelection: true });
    } catch (error) { toast(error.message); }
  }

  function reportMessage(message, token) {
    const box = modal(`<h2>Report message</h2><div class="field"><label>Reason</label><select id="reportReason"><option>Harassment or bullying</option><option>Spam</option><option>Hate or abuse</option><option>Impersonation</option><option>Other</option></select></div><div class="field"><label>Details (optional)</label><textarea id="reportDetails" maxlength="1000"></textarea></div><div class="modal-actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" data-report>Submit report</button></div>`);
    $('[data-close]', box).onclick = () => box.remove(); $('[data-report]', box).onclick = async () => { try { await api(`/api/messages/${encodeURIComponent(message.id)}/report`, { method: 'POST', headers: ownerHeaders(token, { 'content-type': 'application/json' }), body: JSON.stringify({ reason: $('#reportReason', box).value, details: $('#reportDetails', box).value }) }); box.remove(); toast('Report submitted.'); } catch (error) { toast(error.message); } };
  }

  const baseDashboard = dashboard;
  function openPromptShare(inbox) {
    if (!inbox?.slug) return;
    const box = modal(`<div class="section-kicker compact">Prompt deck</div><h2>Share a question</h2><p class="form-note">Choose a conversation starter. The question opens pre-filled, and the sender can still edit it.</p><div class="prompt-share-list">${PROMPTS.map((prompt) => `<button class="prompt-share-option" type="button" data-prompt="${esc(prompt)}"><span>${esc(prompt)}</span><b>Share</b></button>`).join('')}</div><div class="modal-actions"><button class="btn" type="button" data-close>Close</button></div>`);
    $('[data-close]', box).onclick = () => box.remove();
    box.querySelectorAll('[data-prompt]').forEach((button) => button.onclick = async () => {
      const prompt = button.dataset.prompt;
      const url = `${location.origin}/u/${encodeURIComponent(inbox.slug)}?prompt=${encodeURIComponent(prompt)}`;
      await share({ title: `${prompt} — PICNYM`, text: prompt, url }, url);
    });
  }

  dashboard = async function professionalDashboard(slug, active = 'inbox') {
    await baseDashboard(slug, active);
    const actions = document.querySelector('.link-actions');
    if (actions && !document.getElementById('dashboardSettings')) {
      const button = document.createElement('button'); button.id = 'dashboardSettings'; button.className = 'btn'; button.type = 'button'; button.textContent = 'Inbox settings'; actions.prepend(button);
      button.onclick = () => openInboxSettings(picnymDashboardState?.inbox);
    }
    if (actions && !document.getElementById('sharePromptButton')) {
      const button = document.createElement('button'); button.id = 'sharePromptButton'; button.className = 'btn sage'; button.type = 'button'; button.textContent = 'Share a prompt'; actions.prepend(button);
      button.onclick = () => openPromptShare(picnymDashboardState?.inbox);
    }
    ensureThemeToggle();
  };

  if (typeof refreshDashboardNow === 'function') {
    const baseRefresh = refreshDashboardNow;
    refreshDashboardNow = async function professionalRefresh(...args) {
      const before = new Set((picnymDashboardState?.messages || []).map((message) => message.id));
      const result = await baseRefresh(...args);
      const after = picnymDashboardState?.messages || [];
      const newMessages = after.filter((message) => !before.has(message.id));
      if (newMessages.length && accountCache?.settings?.browserNotifications && 'Notification' in window && Notification.permission === 'granted') {
        new Notification('New PICNYM message', { body: `${newMessages.length} new anonymous message${newMessages.length === 1 ? '' : 's'} received.`, icon: '/icon-192.png' });
      }
      return result;
    };
  }

  const baseRoute = route;
  route = function professionalRoute() {
    const parts = location.pathname.split('/').filter(Boolean).map((part) => { try { return decodeURIComponent(part); } catch { return part; } });
    if (parts[0] === 'profile' && parts[1] && /^[a-z0-9_]{3,24}$/i.test(parts[1])) return publicProfilePage(parts[1].toLowerCase());
    return baseRoute();
  };

  PicnymAuth?.onChange?.((event) => {
    if (event === 'SIGNED_OUT') accountCache = null;
    if (event === 'SIGNED_IN') setTimeout(async () => { try { const data = await api('/api/account'); accountCache = data; await syncThemeFromAccount(data); } catch {} }, 0);
  });

  ensureThemeToggle();
  route();
})();
