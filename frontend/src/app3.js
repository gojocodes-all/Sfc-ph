function wave() { return `<div class="wave">${Array.from({ length: 33 }, () => '<i></i>').join('')}</div>`; }

function pollInside(poll) {
  if (!poll || !Array.isArray(poll.options)) return '';
  return `<div class="poll-box"><div class="poll-question">${esc(poll.question)}</div>${poll.options.map((option) => {
    const percent = poll.totalVotes ? Math.round((option.votes / poll.totalVotes) * 100) : 0;
    return `<div class="poll-option"><span class="fill" style="width:${percent}%"></span><span>${esc(option.text)}</span><span>${percent}%</span></div>`;
  }).join('')}<div class="poll-meta"><span>${Number(poll.totalVotes) || 0} votes</span><a href="/poll/${encodeURIComponent(poll.slug)}">Open poll ↗</a></div></div>`;
}

let dashboardRefreshTimer = null;
let dashboardRefreshBusy = false;
let dashboardRefreshContext = null;

function stopDashboardRefresh() {
  clearInterval(dashboardRefreshTimer);
  dashboardRefreshTimer = null;
  dashboardRefreshContext = null;
  dashboardRefreshBusy = false;
}

async function refreshDashboardNow({ silent = true } = {}) {
  const context = dashboardRefreshContext;
  if (!context || dashboardRefreshBusy || document.hidden || $('.modal-backdrop')) return;
  dashboardRefreshBusy = true;
  try {
    if (context.active === 'polls') {
      await renderPolls(context.inbox, context.token, { silent: true });
    } else {
      const data = await api(`/api/inboxes/${encodeURIComponent(context.inbox.slug)}/messages`, {
        headers: ownerHeaders(context.token)
      });
      if (!data.inbox || !Array.isArray(data.messages)) throw new Error('The inbox response is invalid.');
      context.inbox = data.inbox;
      renderInbox(data.inbox, data.messages, context.token, { preserveSelection: true, silent: true });
    }
    const status = $('#refreshStatus');
    if (status) status.textContent = `Updated ${new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date())}`;
  } catch (error) {
    if (!silent) toast(error.message);
  } finally {
    dashboardRefreshBusy = false;
  }
}

function startDashboardRefresh(inbox, token, active) {
  stopDashboardRefresh();
  dashboardRefreshContext = { inbox, token, active };
  dashboardRefreshTimer = setInterval(() => refreshDashboardNow(), 10000);
}

window.addEventListener('focus', () => refreshDashboardNow());
document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshDashboardNow(); });

async function dashboard(slug, active = 'inbox') {
  stopDashboardRefresh();
  const token = ownerToken(slug);
  if (!token) return unlock(slug);
  try {
    const data = await api(`/api/inboxes/${encodeURIComponent(slug)}/messages`, { headers: ownerHeaders(token) });
    if (!data.inbox || !validSlug(data.inbox.slug) || !Array.isArray(data.messages)) throw new Error('The inbox response is invalid.');
    saveOwner(data.inbox.slug, token);
    if (data.inbox.slug !== slug) removeOwner(slug);
    const link = `${location.origin}/u/${data.inbox.slug}`;
    app.innerHTML = `<div class="shell">${topbar('<button id="signOut" class="top-action" type="button">Sign out</button>')}<main class="page"><nav class="tabs"><button class="tab ${active === 'inbox' ? 'active' : ''}" type="button" data-tab="inbox">Inbox</button><button class="tab ${active === 'polls' ? 'active' : ''}" type="button" data-tab="polls">Polls</button></nav><section class="link-card"><div class="label">Your anonymous link</div><div class="big-link">/${esc(data.inbox.slug)}</div><div class="link-actions"><button id="editLink" class="btn" type="button">Edit</button><button id="shareLink" class="btn sage" type="button">Share link ↗</button></div></section><div class="refresh-line"><span class="refresh-dot" aria-hidden="true"></span><span>Auto-refresh on</span><span id="refreshStatus">Updated now</span></div><div id="content"></div></main></div>`;
    $('#signOut').onclick = () => { stopDashboardRefresh(); removeOwner(data.inbox.slug); nav('/'); };
    $('#shareLink').onclick = () => share({ title: 'Send me something anonymously', url: link }, link);
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
    if ([403, 404].includes(error.status)) removeOwner(slug);
    unlock(slug, error.message);
  }
}

function unlock(slug, message = 'This dashboard is private.') {
  stopDashboardRefresh();
  app.innerHTML = `${topbar()}<main class="page"><div class="section-kicker">Private</div><h1>Inbox</h1><div class="card"><p>${esc(message)}</p><p>Your owner access is stored in the browser that created the inbox.</p><button class="btn primary" id="goHome" type="button">Go home</button></div></main>`;
  $('#goHome')?.addEventListener('click', () => nav('/'));
}

function editLink(inbox, token) {
  const box = modal(`<h2>Edit anonymous link</h2><div class="field"><label>Link name</label><input id="newSlug" value="${esc(inbox.slug)}" maxlength="28" autocapitalize="none" spellcheck="false"></div><div class="modal-actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" data-save>Save</button></div>`);
  $('[data-close]', box).onclick = () => box.remove();
  $('[data-save]', box).onclick = async () => {
    const button = $('[data-save]', box);
    button.disabled = true;
    try {
      const result = await api(`/api/inboxes/${encodeURIComponent(inbox.slug)}`, {
        method: 'PATCH',
        headers: ownerHeaders(token, { 'content-type': 'application/json' }),
        body: JSON.stringify({ slug: $('#newSlug', box).value })
      });
      if (!validSlug(result.slug)) throw new Error('The server returned an invalid link name.');
      saveOwner(result.slug, token);
      if (result.slug !== inbox.slug) removeOwner(inbox.slug);
      stopDashboardRefresh();
      nav(`/dashboard/${result.slug}`);
    } catch (error) {
      toast(error.message);
      button.disabled = false;
    }
  };
}
