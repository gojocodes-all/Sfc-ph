const picnymDashboardState = {
  inbox: null,
  token: null,
  active: 'inbox',
  messages: [],
  hasMore: false,
  nextCursor: null,
  hasLoadedOlder: false,
  loadingOlder: false
};

function mergeDashboardMessages(existing, incoming) {
  const byId = new Map();
  for (const message of [...existing, ...incoming]) if (message?.id) byId.set(message.id, message);
  return [...byId.values()].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function renderPaginatedInbox({ preserveSelection = false } = {}) {
  const state = picnymDashboardState;
  renderInbox(state.inbox, state.messages, state.token, { preserveSelection });
  if (!state.hasMore || !state.nextCursor) return;
  const messages = $('#messages');
  if (!messages || $('#loadOlderMessages')) return;
  const wrap = document.createElement('div');
  wrap.className = 'load-older-wrap';
  wrap.innerHTML = '<button id="loadOlderMessages" class="btn" type="button">Load older messages</button>';
  messages.after(wrap);
  $('#loadOlderMessages').onclick = loadOlderMessages;
}

async function loadOlderMessages() {
  const state = picnymDashboardState;
  if (state.loadingOlder || !state.hasMore || !state.nextCursor || !state.inbox) return;
  const button = $('#loadOlderMessages');
  state.loadingOlder = true;
  if (button) { button.disabled = true; button.textContent = 'Loading…'; }
  try {
    const data = await api(`/api/inboxes/${encodeURIComponent(state.inbox.slug)}/messages?limit=40&before=${encodeURIComponent(state.nextCursor)}`, {
      headers: ownerHeaders(state.token)
    });
    if (!data.inbox || !Array.isArray(data.messages)) throw new Error('The inbox response is invalid.');
    state.inbox = data.inbox;
    state.messages = mergeDashboardMessages(state.messages, data.messages);
    state.hasMore = Boolean(data.hasMore);
    state.nextCursor = data.nextCursor || null;
    state.hasLoadedOlder = true;
    renderPaginatedInbox({ preserveSelection: true });
  } catch (error) {
    toast(error.message);
    if (button) { button.disabled = false; button.textContent = 'Load older messages'; }
  } finally {
    state.loadingOlder = false;
  }
}

refreshDashboardNow = async function refreshDashboardNow({ silent = true } = {}) {
  const context = dashboardRefreshContext;
  if (!context || dashboardRefreshBusy || document.hidden || $('.modal-backdrop')) return;
  if ((typeof inboxSelectionMode !== 'undefined' && inboxSelectionMode) || $$('audio').some((audio) => !audio.paused)) return;
  dashboardRefreshBusy = true;
  try {
    if (context.active === 'polls') {
      await renderPolls(context.inbox, context.token, { silent: true });
    } else {
      const state = picnymDashboardState;
      const data = await api(`/api/inboxes/${encodeURIComponent(context.inbox.slug)}/messages?limit=40`, {
        headers: ownerHeaders(context.token)
      });
      if (!data.inbox || !Array.isArray(data.messages)) throw new Error('The inbox response is invalid.');
      context.inbox = data.inbox;
      state.inbox = data.inbox;
      state.messages = mergeDashboardMessages(state.messages, data.messages);
      if (!state.hasLoadedOlder) {
        state.hasMore = Boolean(data.hasMore);
        state.nextCursor = data.nextCursor || null;
      }
      renderPaginatedInbox({ preserveSelection: true });
    }
    const status = $('#refreshStatus');
    if (status) status.textContent = `Updated ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date())}`;
  } catch (error) {
    if (!silent) toast(error.message);
  } finally {
    dashboardRefreshBusy = false;
  }
};

startDashboardRefresh = function startDashboardRefresh(inbox, token, active) {
  stopDashboardRefresh();
  dashboardRefreshContext = { inbox, token, active };
  const schedule = () => {
    if (!dashboardRefreshContext) return;
    const delay = 18000 + Math.floor(Math.random() * 9000);
    dashboardRefreshTimer = setTimeout(async () => {
      await refreshDashboardNow();
      schedule();
    }, delay);
  };
  schedule();
};

dashboard = async function dashboard(slug, active = 'inbox') {
  stopDashboardRefresh();
  const token = ownerToken(slug);
  const session = await authSession();
  try {
    const data = await api(`/api/inboxes/${encodeURIComponent(slug)}/messages?limit=40`, { headers: ownerHeaders(token) });
    if (!data.inbox || !validSlug(data.inbox.slug) || !Array.isArray(data.messages)) throw new Error('The inbox response is invalid.');
    if (validToken(token)) saveOwner(data.inbox.slug, token);

    Object.assign(picnymDashboardState, {
      inbox: data.inbox,
      token,
      active,
      messages: data.messages,
      hasMore: Boolean(data.hasMore),
      nextCursor: data.nextCursor || null,
      hasLoadedOlder: false,
      loadingOlder: false
    });

    const link = `${location.origin}/u/${data.inbox.slug}`;
    const topAction = session ? '<a class="top-action" href="/account">Account</a>' : '<a class="top-action" href="/">Home</a>';
    app.innerHTML = `<div class="shell">${topbar(topAction)}<main class="page"><nav class="tabs"><button class="tab ${active === 'inbox' ? 'active' : ''}" type="button" data-tab="inbox">Inbox</button><button class="tab ${active === 'polls' ? 'active' : ''}" type="button" data-tab="polls">Polls</button></nav><section class="link-card"><div class="label">Your anonymous link</div><div class="big-link">/${esc(data.inbox.slug)}</div><div class="link-actions"><button id="editLink" class="btn" type="button">Edit</button><button id="shareLink" class="btn sage" type="button">Share link ↗</button></div></section><div class="refresh-line"><span class="refresh-dot" aria-hidden="true"></span><span>Auto-refresh on</span><span id="refreshStatus">Updated now</span></div><div id="content"></div></main></div>`;
    $('#shareLink').onclick = () => share({ title: 'Send me something anonymously on PICNYM', url: link }, link);
    $('#editLink').onclick = () => editLink(data.inbox, token);

    $$('.tab').forEach((button) => button.onclick = async () => {
      const tab = button.dataset.tab === 'polls' ? 'polls' : 'inbox';
      picnymDashboardState.active = tab;
      if (dashboardRefreshContext) dashboardRefreshContext.active = tab;
      history.replaceState({}, '', `/dashboard/${data.inbox.slug}?tab=${tab}`);
      $$('.tab').forEach((item) => item.classList.toggle('active', item.dataset.tab === tab));
      if (tab === 'polls') await renderPolls(picnymDashboardState.inbox, token);
      else renderPaginatedInbox({ preserveSelection: false });
    });

    if (active === 'polls') await renderPolls(data.inbox, token);
    else renderPaginatedInbox();
    startDashboardRefresh(data.inbox, token, active);
  } catch (error) {
    stopDashboardRefresh();
    if (error.status === 404 && token) removeOwner(slug);
    unlock(slug, error.message);
  }
};

(function addPaginationStyles() {
  if ($('#picnymPaginationStyles')) return;
  const style = document.createElement('style');
  style.id = 'picnymPaginationStyles';
  style.textContent = '.load-older-wrap{text-align:center;margin:-4px 0 30px}.load-older-wrap .btn{min-width:190px}';
  document.head.appendChild(style);
})();

if (location.pathname.startsWith('/dashboard/')) route();
