async function cardImage(message, inbox) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1350;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Your browser cannot create the answer card.');
  ctx.fillStyle = '#f1f2ed'; ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = '#12264b'; ctx.fillRect(0, 0, 1080, 155);
  ctx.fillStyle = '#b9c9b2'; ctx.fillRect(0, 155, 1080, 14);
  ctx.fillStyle = 'white'; ctx.font = '800 44px Arial'; ctx.fillText('PH X SFC', 70, 80);
  ctx.font = '700 20px Arial'; ctx.fillText('ANONYMOUS', 70, 116);
  ctx.fillStyle = '#fffefa'; ctx.beginPath(); roundedRect(ctx, 65, 230, 950, 440, 28); ctx.fill();
  ctx.fillStyle = '#71816f'; ctx.font = '800 24px Arial'; ctx.fillText('ANONYMOUS', 105, 290);
  ctx.fillStyle = '#151b26'; ctx.font = '700 38px Arial';
  wrapText(ctx, message.poll?.question || message.text || (message.voiceUrl ? 'Voice note' : 'Anonymous message'), 105, 360, 860, 52);
  ctx.fillStyle = '#dfe9dc'; ctx.beginPath(); roundedRect(ctx, 65, 745, 950, 430, 28); ctx.fill();
  ctx.fillStyle = '#526a56'; ctx.font = '800 23px Arial'; ctx.fillText(`${inbox.displayName.toUpperCase()} REPLIED`, 105, 815);
  ctx.fillStyle = '#151b26'; ctx.font = '700 38px Arial'; wrapText(ctx, message.reply, 105, 885, 860, 52);
  ctx.fillStyle = '#747a80'; ctx.font = '700 22px Arial'; ctx.fillText('PH X SFC ANONYMOUS', 70, 1270);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not create the answer card.');
  const file = new File([blob], 'ph-sfc-answer.png', { type: 'image/png' });
  if (navigator.share && navigator.canShare?.({ files: [file] })) return navigator.share({ files: [file], title: 'PH X SFC ANONYMOUS' });
  const anchor = document.createElement('a');
  const objectUrl = URL.createObjectURL(blob);
  anchor.href = objectUrl;
  anchor.download = file.name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

async function renderPolls(inbox, token) {
  const content = $('#content');
  content.innerHTML = '<div class="section-kicker">Anonymous</div><h1>Polls</h1><div id="pollList"><div class="card empty">Loading polls…</div></div>';
  try {
    const data = await api(`/api/inboxes/${encodeURIComponent(inbox.slug)}/polls`, { headers: ownerHeaders(token) });
    if (!Array.isArray(data.polls)) throw new Error('The poll list is invalid.');
    $('#pollList').innerHTML = data.polls.length
      ? data.polls.map((poll) => `<article class="card">${pollInside(poll)}<div class="card-divider"></div><button class="btn sage poll-share" type="button" data-slug="${esc(poll.slug)}">Share poll</button></article>`).join('')
      : '<div class="card empty">No polls received yet.</div>';
    $$('.poll-share').forEach((button) => button.onclick = () => {
      const url = `${location.origin}/poll/${button.dataset.slug}`;
      share({ title: 'Anonymous poll', url }, url);
    });
  } catch (error) {
    $('#pollList').innerHTML = `<div class="card empty">${esc(error.message)}</div>`;
  }
}

async function pollPage(slug) {
  try {
    const poll = await api(`/api/polls/${encodeURIComponent(slug)}`);
    if (!poll.id || !validSlug(poll.slug) || !Array.isArray(poll.options)) throw new Error('This poll is unavailable.');
    renderPollPage(poll, localStorage.getItem(`voted_${poll.id}`) === '1');
  } catch (error) {
    app.innerHTML = `${topbar()}<main class="poll-page"><div class="card empty">${esc(error.message)}</div></main>`;
  }
}

function renderPollPage(poll, voted) {
  const url = `${location.origin}/poll/${poll.slug}`;
  app.innerHTML = `${topbar()}<main class="poll-page"><div class="section-kicker">Anonymous poll</div><h1>${esc(poll.question)}</h1><div class="meta">${Number(poll.totalVotes) || 0} votes · identities are not shown</div><section class="card">${poll.options.map((option) => {
    const percent = poll.totalVotes ? Math.round((option.votes / poll.totalVotes) * 100) : 0;
    return `<button class="poll-option vote-btn" type="button" data-option="${esc(option.id)}" ${voted ? 'disabled' : ''}><span class="fill" style="width:${voted ? percent : 0}%"></span><span>${esc(option.text)}</span><span>${voted ? `${percent}%` : ''}</span></button>`;
  }).join('')}<div class="card-divider"></div><button id="sharePoll" class="btn sage" type="button" style="width:100%">Share poll</button></section></main>`;
  $('#sharePoll').onclick = () => share({ title: poll.question, url }, url);
  if (!voted) $$('.vote-btn').forEach((button) => button.onclick = async () => {
    $$('.vote-btn').forEach((item) => item.disabled = true);
    try {
      const result = await api(`/api/polls/${encodeURIComponent(poll.slug)}/vote`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ optionId: button.dataset.option, clientId: deviceId() })
      });
      if (!result.poll) throw new Error('Vote response is invalid.');
      localStorage.setItem(`voted_${poll.id}`, '1');
      renderPollPage(result.poll, true);
    } catch (error) {
      if (error.status === 409 && error.data?.poll) {
        localStorage.setItem(`voted_${poll.id}`, '1');
        renderPollPage(error.data.poll, true);
      } else {
        toast(error.message);
        $$('.vote-btn').forEach((item) => item.disabled = false);
      }
    }
  });
}

function route() {
  cleanupOwnerStorage();
  const parts = location.pathname.split('/').filter(Boolean).map((part) => {
    try { return decodeURIComponent(part); } catch { return part; }
  });
  if (!parts.length) return home();
  if (parts[0] === 'u' && validSlug(parts[1])) return publicInbox(parts[1]);
  if (parts[0] === 'dashboard' && validSlug(parts[1])) {
    const tab = new URLSearchParams(location.search).get('tab') === 'polls' ? 'polls' : 'inbox';
    return dashboard(parts[1], tab);
  }
  if (parts[0] === 'poll' && validSlug(parts[1])) return pollPage(parts[1]);
  app.innerHTML = `${topbar()}<main class="page"><div class="card empty">Page not found.<br><br><a class="btn" href="/">Go home</a></div></main>`;
}

route();
