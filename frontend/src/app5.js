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
  } catch {
    return null;
  }
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

  ctx.fillStyle = '#f1f2ed';
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = '#12264b';
  ctx.fillRect(0, 0, 1080, 155);
  ctx.fillStyle = '#b9c9b2';
  ctx.fillRect(0, 155, 1080, 14);
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 44px Arial';
  ctx.fillText('PH X SFC', 70, 80);
  ctx.font = '700 20px Arial';
  ctx.fillText('ANONYMOUS', 70, 116);

  ctx.fillStyle = '#fffefa';
  ctx.beginPath();
  roundedRect(ctx, 65, 225, 950, 940, 30);
  ctx.fill();
  ctx.fillStyle = '#71816f';
  ctx.font = '800 23px Arial';
  ctx.fillText(messageTypeLabel(message), 105, 290);
  ctx.fillStyle = '#92989a';
  ctx.font = '700 18px Arial';
  const stamp = fmt(message.createdAt);
  if (stamp) ctx.fillText(stamp, 105, 325);

  if (message.imageUrl) {
    const image = await loadShareImage(message.imageUrl);
    if (image) drawCover(ctx, image, 105, 370, 870, 535);
    else {
      ctx.fillStyle = '#edf0ea';
      ctx.beginPath(); roundedRect(ctx, 105, 370, 870, 535, 24); ctx.fill();
      ctx.fillStyle = '#12264b'; ctx.font = '800 42px Arial'; ctx.fillText('IMAGE MESSAGE', 150, 650);
    }
    if (message.text) {
      ctx.fillStyle = '#151b26'; ctx.font = '700 34px Arial';
      wrapText(ctx, message.text, 105, 970, 870, 46, 3);
    }
  } else if (message.voiceUrl) {
    ctx.fillStyle = '#eef0e9';
    ctx.beginPath(); roundedRect(ctx, 105, 385, 870, 330, 24); ctx.fill();
    ctx.fillStyle = '#12264b'; ctx.font = '800 42px Arial'; ctx.fillText('VOICE NOTE', 145, 470);
    const centerY = 585;
    for (let i = 0; i < 28; i += 1) {
      const height = 34 + ((i * 17) % 96);
      ctx.fillStyle = i % 2 ? '#b9c9b2' : '#12264b';
      ctx.fillRect(150 + (i * 27), centerY - height / 2, 10, height);
    }
    if (message.text) {
      ctx.fillStyle = '#151b26'; ctx.font = '700 34px Arial';
      wrapText(ctx, message.text, 105, 820, 870, 46, 5);
    }
  } else if (message.poll) {
    ctx.fillStyle = '#151b26'; ctx.font = '700 40px Arial';
    wrapText(ctx, message.poll.question, 105, 390, 870, 52, 4);
    const options = (message.poll.options || []).slice(0, 6);
    let y = 610;
    for (const option of options) {
      const percent = message.poll.totalVotes ? Math.round((option.votes / message.poll.totalVotes) * 100) : 0;
      ctx.fillStyle = '#edf0ea'; ctx.beginPath(); roundedRect(ctx, 105, y - 42, 870, 72, 18); ctx.fill();
      ctx.fillStyle = '#151b26'; ctx.font = '700 26px Arial'; ctx.fillText(String(option.text).slice(0, 42), 135, y);
      ctx.fillStyle = '#71816f'; ctx.font = '800 24px Arial'; ctx.textAlign = 'right'; ctx.fillText(`${percent}%`, 940, y); ctx.textAlign = 'left';
      y += 95;
    }
    ctx.fillStyle = '#777d81'; ctx.font = '700 22px Arial'; ctx.fillText(`${Number(message.poll.totalVotes) || 0} votes`, 105, 1080);
  } else {
    ctx.fillStyle = '#151b26'; ctx.font = '700 44px Arial';
    wrapText(ctx, message.text || 'Anonymous message', 105, 420, 870, 60, 11);
  }

  ctx.fillStyle = '#747a80';
  ctx.font = '700 21px Arial';
  ctx.fillText('anonymous.gojodev.name.ng', 70, 1260);
  ctx.textAlign = 'right';
  ctx.fillText(inbox?.displayName ? `@${String(inbox.displayName).slice(0, 28)}` : 'PH X SFC', 1010, 1260);
  ctx.textAlign = 'left';

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not create the share image.');
  return blob;
}

async function messageCardFile(message, inbox, index = 1) {
  const blob = await messageCardBlob(message, inbox);
  const safeIndex = String(index).padStart(2, '0');
  return new File([blob], `anonymous-message-${safeIndex}.png`, { type: 'image/png' });
}

async function shareImageFiles(files, title = 'PH X SFC ANONYMOUS') {
  if (!files?.length) throw new Error('There is nothing to share.');
  if (navigator.share && navigator.canShare?.({ files })) {
    return navigator.share({ files, title });
  }
  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const anchor = document.createElement('a');
    const objectUrl = URL.createObjectURL(file);
    anchor.href = objectUrl;
    anchor.download = file.name || `anonymous-message-${index + 1}.png`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1500 + index * 100);
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  toast(files.length > 1 ? `${files.length} share images saved.` : 'Share image saved.');
}

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
  wrapText(ctx, message.poll?.question || message.text || (message.voiceUrl ? 'Voice note' : message.imageUrl ? 'Image message' : 'Anonymous message'), 105, 360, 860, 52);
  ctx.fillStyle = '#dfe9dc'; ctx.beginPath(); roundedRect(ctx, 65, 745, 950, 430, 28); ctx.fill();
  ctx.fillStyle = '#526a56'; ctx.font = '800 23px Arial'; ctx.fillText(`${inbox.displayName.toUpperCase()} REPLIED`, 105, 815);
  ctx.fillStyle = '#151b26'; ctx.font = '700 38px Arial'; wrapText(ctx, message.reply, 105, 885, 860, 52);
  ctx.fillStyle = '#747a80'; ctx.font = '700 22px Arial'; ctx.fillText('PH X SFC ANONYMOUS', 70, 1270);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not create the answer card.');
  const file = new File([blob], 'ph-sfc-answer.png', { type: 'image/png' });
  return shareImageFiles([file], 'PH X SFC ANONYMOUS');
}

async function renderPolls(inbox, token, options = {}) {
  const { silent = false } = options;
  const content = $('#content');
  if (!silent || !$('#pollList')) {
    content.innerHTML = '<div class="section-kicker">Anonymous</div><h1>Polls</h1><div id="pollList"><div class="card empty">Loading polls…</div></div>';
  }
  try {
    const data = await api(`/api/inboxes/${encodeURIComponent(inbox.slug)}/polls`, { headers: ownerHeaders(token) });
    if (!Array.isArray(data.polls)) throw new Error('The poll list is invalid.');
    const list = $('#pollList');
    if (!list) return;
    list.innerHTML = data.polls.length
      ? data.polls.map((poll) => `<article class="card">${pollInside(poll)}<div class="card-divider"></div><button class="btn sage poll-share" type="button" data-slug="${esc(poll.slug)}">Share poll</button></article>`).join('')
      : '<div class="card empty">No polls received yet.</div>';
    $$('.poll-share').forEach((button) => button.onclick = () => {
      const url = `${location.origin}/poll/${button.dataset.slug}`;
      share({ title: 'Anonymous poll', url }, url);
    });
  } catch (error) {
    if (!silent && $('#pollList')) $('#pollList').innerHTML = `<div class="card empty">${esc(error.message)}</div>`;
  }
}

async function pollPage(slug) {
  stopDashboardRefresh();
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

function injectEnhancementStyles() {
  if ($('#phxEnhancementStyles')) return;
  const style = document.createElement('style');
  style.id = 'phxEnhancementStyles';
  style.textContent = `
    .refresh-line{display:flex;align-items:center;gap:8px;color:#7a807c;font-size:12px;margin:-7px 2px 4px}.refresh-line #refreshStatus{margin-left:auto}.refresh-dot{width:8px;height:8px;border-radius:50%;background:#829a7d;box-shadow:0 0 0 4px #b9c9b233}
    .inbox-heading{display:flex;align-items:flex-end;justify-content:space-between;gap:18px}.inbox-heading .section-kicker{margin-bottom:20px}.inbox-heading h1{margin-bottom:30px}
    .bulk-bar{position:sticky;top:100px;z-index:8;display:flex;align-items:center;justify-content:space-between;gap:12px;background:#e1eadf;border:1px solid #cbd8c7;border-radius:14px;padding:12px 14px;margin:0 0 16px}.bulk-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
    .message-card{position:relative;transition:border-color .15s,box-shadow .15s,transform .15s}.message-card.selecting{padding-left:58px;cursor:pointer}.message-card.selected{border-color:#7d9478;box-shadow:0 0 0 3px #b9c9b244,0 8px 22px rgba(29,38,34,.045)}
    .message-select{position:absolute;left:18px;top:22px;width:28px;height:28px;border:2px solid #aeb7ad;border-radius:50%;background:#fff;color:#fff;font-weight:900;display:grid;place-items:center;cursor:pointer}.message-select.selected{background:#12264b;border-color:#12264b}
    @media(max-width:560px){.bulk-bar{top:92px;align-items:flex-start;flex-direction:column}.bulk-actions{width:100%}.bulk-actions .btn{flex:1 1 auto}.refresh-line{flex-wrap:wrap}.refresh-line #refreshStatus{margin-left:0}.message-card.selecting{padding-left:54px}}
  `;
  document.head.appendChild(style);
}

let deferredInstallPrompt = null;

function isStandaloneApp() {
  return window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

function syncInstallButton() {
  $('#installApp')?.remove();
  if (!deferredInstallPrompt || isStandaloneApp()) return;
  const homeCard = $('.home .card');
  if (!homeCard) return;
  const button = document.createElement('button');
  button.id = 'installApp';
  button.className = 'btn sage';
  button.type = 'button';
  button.style.cssText = 'width:100%;margin-top:9px';
  button.textContent = 'Install mobile app';
  button.onclick = async () => {
    const prompt = deferredInstallPrompt;
    deferredInstallPrompt = null;
    syncInstallButton();
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice.catch(() => null);
  };
  homeCard.appendChild(button);
}

function initPWA() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js').catch(() => null), { once: true });
  }
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    syncInstallButton();
  });
  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    syncInstallButton();
    toast('PH X SFC installed.');
  });
  syncInstallButton();
}

function route() {
  cleanupOwnerStorage();
  const parts = location.pathname.split('/').filter(Boolean).map((part) => {
    try { return decodeURIComponent(part); } catch { return part; }
  });
  if (!parts.length) {
    stopDashboardRefresh();
    home();
    syncInstallButton();
    return;
  }
  if (parts[0] === 'u' && validSlug(parts[1])) {
    stopDashboardRefresh();
    return publicInbox(parts[1]);
  }
  if (parts[0] === 'dashboard' && validSlug(parts[1])) {
    const tab = new URLSearchParams(location.search).get('tab') === 'polls' ? 'polls' : 'inbox';
    return dashboard(parts[1], tab);
  }
  if (parts[0] === 'poll' && validSlug(parts[1])) {
    stopDashboardRefresh();
    return pollPage(parts[1]);
  }
  stopDashboardRefresh();
  app.innerHTML = `${topbar()}<main class="page"><div class="card empty">Page not found.<br><br><a class="btn" href="/">Go home</a></div></main>`;
}

injectEnhancementStyles();
initPWA();
route();
