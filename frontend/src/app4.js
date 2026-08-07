const inboxSelection = new Set();
let inboxSelectionMode = false;
let inboxSelectionMessages = [];
let inboxSelectionInbox = null;
let inboxSelectionToken = null;

function updateBulkSelectionUI() {
  const count = inboxSelection.size;
  const bar = $('#bulkBar');
  const countLabel = $('#selectedCount');
  const shareButton = $('#shareSelected');
  const selectAllButton = $('#selectAllMessages');
  if (bar) bar.classList.toggle('hidden', !inboxSelectionMode);
  if (countLabel) countLabel.textContent = `${count} selected`;
  if (shareButton) shareButton.disabled = count === 0;
  if (selectAllButton) selectAllButton.textContent = count && count === inboxSelectionMessages.length ? 'Clear all' : 'Select all';
  $$('.message-card').forEach((card) => {
    const selected = inboxSelection.has(card.dataset.messageId);
    card.classList.toggle('selecting', inboxSelectionMode);
    card.classList.toggle('selected', selected);
    const toggle = $('.message-select', card);
    if (toggle) {
      toggle.classList.toggle('hidden', !inboxSelectionMode);
      toggle.classList.toggle('selected', selected);
      toggle.setAttribute('aria-pressed', selected ? 'true' : 'false');
      toggle.textContent = selected ? '✓' : '';
    }
  });
}

function toggleMessageSelection(id) {
  if (inboxSelection.has(id)) inboxSelection.delete(id);
  else inboxSelection.add(id);
  updateBulkSelectionUI();
}

async function shareSelectedMessages() {
  const selected = inboxSelectionMessages.filter((message) => inboxSelection.has(message.id));
  if (!selected.length || !inboxSelectionInbox) return toast('Select at least one message.');
  if (selected.length > 20) return toast('Share up to 20 messages at once.');
  const button = $('#shareSelected');
  if (button) button.disabled = true;
  try {
    const files = [];
    for (let index = 0; index < selected.length; index += 1) {
      const file = await messageCardFile(selected[index], inboxSelectionInbox, index + 1);
      files.push(file);
    }
    await shareImageFiles(files, selected.length > 1 ? `${selected.length} anonymous messages` : 'Anonymous message');
  } catch (error) {
    if (error?.name !== 'AbortError') toast(error.message || 'Could not share the selected messages.');
  } finally {
    if (button) button.disabled = inboxSelection.size === 0;
  }
}

function renderInbox(inbox, messages, token, options = {}) {
  const { preserveSelection = false } = options;
  if (!preserveSelection) {
    inboxSelection.clear();
    inboxSelectionMode = false;
  } else {
    const ids = new Set(messages.map((message) => message.id));
    for (const id of [...inboxSelection]) if (!ids.has(id)) inboxSelection.delete(id);
  }
  inboxSelectionMessages = messages;
  inboxSelectionInbox = inbox;
  inboxSelectionToken = token;

  const content = $('#content');
  content.innerHTML = `<div class="inbox-heading"><div><div class="section-kicker">Private</div><h1>Inbox</h1></div>${messages.length ? '<button id="selectMessages" class="btn small" type="button">Select</button>' : ''}</div><div id="bulkBar" class="bulk-bar hidden"><strong id="selectedCount">0 selected</strong><div class="bulk-actions"><button id="selectAllMessages" class="btn small" type="button">Select all</button><button id="cancelSelection" class="btn small" type="button">Cancel</button><button id="shareSelected" class="btn primary small" type="button" disabled>Share selected</button></div></div><div id="messages"></div>`;
  const list = $('#messages');
  if (!messages.length) {
    inboxSelection.clear();
    inboxSelectionMode = false;
    list.innerHTML = '<div class="card empty">No anonymous messages yet.</div>';
    return;
  }

  messages.forEach((message) => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `<article class="card message-card" data-message-id="${esc(message.id)}"><button class="message-select hidden" type="button" aria-label="Select message" aria-pressed="false"></button><div class="message-head"><span class="anon">Anonymous</span><span class="time">${esc(fmt(message.createdAt))}</span></div>${message.text ? `<div class="message-text">${esc(message.text)}</div>` : ''}${message.imageUrl ? `<img class="message-image" src="${esc(message.imageUrl)}" alt="Anonymous image" loading="lazy">` : ''}${message.voiceUrl ? `<div class="voice-box">${wave()}<audio controls preload="metadata" src="${esc(message.voiceUrl)}"></audio></div>` : ''}${message.poll ? pollInside(message.poll) : ''}${message.reply ? `<div class="reply-preview"><strong>Your reply</strong><br>${esc(message.reply)}</div>` : ''}<div class="card-divider"></div><div class="actions"><button class="btn primary answer" type="button">Answer card</button><button class="btn share" type="button">Share image</button><div class="more-wrap"><button class="btn icon more" type="button" aria-label="More actions">•••</button><div class="menu hidden"><button type="button" data-block>Block sender</button><button type="button" data-delete class="danger">Delete</button></div></div></div></article>`;
    const card = wrapper.firstElementChild;
    list.appendChild(card);

    $('.message-select', card).onclick = (event) => {
      event.stopPropagation();
      toggleMessageSelection(message.id);
    };
    card.addEventListener('click', (event) => {
      if (!inboxSelectionMode) return;
      if (event.target.closest('button,a,audio,input,textarea')) return;
      toggleMessageSelection(message.id);
    });
    $('.more', card).onclick = () => $('.menu', card).classList.toggle('hidden');
    $('[data-block]', card).onclick = async () => {
      try {
        await api(`/api/messages/${encodeURIComponent(message.id)}/block`, { method: 'POST', headers: ownerHeaders(token) });
        toast('Sender blocked.');
      } catch (error) { toast(error.message); }
    };
    $('[data-delete]', card).onclick = async () => {
      if (!confirm('Delete this message?')) return;
      try {
        await api(`/api/messages/${encodeURIComponent(message.id)}`, { method: 'DELETE', headers: ownerHeaders(token) });
        inboxSelection.delete(message.id);
        inboxSelectionMessages = inboxSelectionMessages.filter((item) => item.id !== message.id);
        card.remove();
        if (!$('#messages')?.children.length) {
          inboxSelection.clear();
          inboxSelectionMode = false;
          $('#messages').innerHTML = '<div class="card empty">No anonymous messages yet.</div>';
          $('#selectMessages')?.remove();
        }
        updateBulkSelectionUI();
      } catch (error) { toast(error.message); }
    };
    $('.share', card).onclick = () => shareMessage(message, inbox);
    $('.answer', card).onclick = () => answerModal(message, inbox, token);
  });

  $('#selectMessages')?.addEventListener('click', () => {
    inboxSelectionMode = !inboxSelectionMode;
    if (!inboxSelectionMode) inboxSelection.clear();
    $('#selectMessages').textContent = inboxSelectionMode ? 'Done' : 'Select';
    updateBulkSelectionUI();
  });
  $('#cancelSelection')?.addEventListener('click', () => {
    inboxSelection.clear();
    inboxSelectionMode = false;
    $('#selectMessages').textContent = 'Select';
    updateBulkSelectionUI();
  });
  $('#selectAllMessages')?.addEventListener('click', () => {
    if (inboxSelection.size === inboxSelectionMessages.length) inboxSelection.clear();
    else inboxSelectionMessages.forEach((message) => inboxSelection.add(message.id));
    updateBulkSelectionUI();
  });
  $('#shareSelected')?.addEventListener('click', shareSelectedMessages);
  updateBulkSelectionUI();
}

async function shareMessage(message, inbox) {
  try {
    const file = await messageCardFile(message, inbox, 1);
    await shareImageFiles([file], 'Anonymous message');
  } catch (error) {
    if (error?.name !== 'AbortError') toast(error.message || 'Could not open sharing.');
  }
}

function answerModal(message, inbox, token) {
  const box = modal(`<h2>Answer card</h2><div class="field"><label>Your reply</label><textarea id="replyText" maxlength="700">${esc(message.reply || '')}</textarea></div><div class="modal-actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn sage" type="button" data-save>Save</button><button class="btn primary" type="button" data-card>Share card</button></div>`);
  $('[data-close]', box).onclick = () => box.remove();
  $('[data-save]', box).onclick = async () => {
    try {
      message.reply = $('#replyText', box).value.trim();
      await api(`/api/messages/${encodeURIComponent(message.id)}/reply`, {
        method: 'POST', headers: ownerHeaders(token, { 'content-type': 'application/json' }), body: JSON.stringify({ reply: message.reply })
      });
      box.remove();
      await dashboard(inbox.slug);
    } catch (error) { toast(error.message); }
  };
  $('[data-card]', box).onclick = async () => {
    message.reply = $('#replyText', box).value.trim();
    if (!message.reply) return toast('Write a reply first.');
    try {
      await api(`/api/messages/${encodeURIComponent(message.id)}/reply`, {
        method: 'POST', headers: ownerHeaders(token, { 'content-type': 'application/json' }), body: JSON.stringify({ reply: message.reply })
      });
      await cardImage(message, inbox);
      box.remove();
    } catch (error) { toast(error.message); }
  };
}

function roundedRect(ctx, x, y, w, h, radius) {
  if (typeof ctx.roundRect === 'function') {
    ctx.roundRect(x, y, w, h, radius);
    return;
  }
  const r = Math.min(radius, w / 2, h / 2);
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines = 6) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  let line = '';
  let lines = 0;
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > maxWidth) {
      ctx.fillText(line, x, y);
      y += lineHeight;
      lines += 1;
      if (lines >= maxLines) return;
      line = word;
    } else {
      line = next;
    }
  }
  if (line && lines < maxLines) ctx.fillText(line, x, y);
}
