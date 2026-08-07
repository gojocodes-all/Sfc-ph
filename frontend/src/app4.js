function renderInbox(inbox, messages, token) {
  const content = $('#content');
  content.innerHTML = '<div class="section-kicker">Private</div><h1>Inbox</h1><div id="messages"></div>';
  const list = $('#messages');
  if (!messages.length) {
    list.innerHTML = '<div class="card empty">No anonymous messages yet.</div>';
    return;
  }
  messages.forEach((message) => {
    const wrapper = document.createElement('div');
    wrapper.innerHTML = `<article class="card message-card"><div class="message-head"><span class="anon">Anonymous</span><span class="time">${esc(fmt(message.createdAt))}</span></div>${message.text ? `<div class="message-text">${esc(message.text)}</div>` : ''}${message.imageUrl ? `<img class="message-image" src="${esc(message.imageUrl)}" alt="Anonymous image" loading="lazy">` : ''}${message.voiceUrl ? `<div class="voice-box">${wave()}<audio controls preload="metadata" src="${esc(message.voiceUrl)}"></audio></div>` : ''}${message.poll ? pollInside(message.poll) : ''}${message.reply ? `<div class="reply-preview"><strong>Your reply</strong><br>${esc(message.reply)}</div>` : ''}<div class="card-divider"></div><div class="actions"><button class="btn primary answer" type="button">Answer card</button><button class="btn share" type="button">Share</button><div class="more-wrap"><button class="btn icon more" type="button" aria-label="More actions">•••</button><div class="menu hidden"><button type="button" data-block>Block sender</button><button type="button" data-delete class="danger">Delete</button></div></div></div></article>`;
    const card = wrapper.firstElementChild;
    list.appendChild(card);
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
        card.remove();
        if (!$('#messages')?.children.length) $('#messages').innerHTML = '<div class="card empty">No anonymous messages yet.</div>';
      } catch (error) { toast(error.message); }
    };
    $('.share', card).onclick = () => shareMessage(message);
    $('.answer', card).onclick = () => answerModal(message, inbox, token);
  });
}

async function shareMessage(message) {
  try {
    if (message.imageUrl || message.voiceUrl) {
      const url = message.imageUrl || message.voiceUrl;
      const response = await fetch(url);
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      const ext = message.imageUrl ? (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg') : (blob.type.split('/')[1] || 'webm').split(';')[0];
      const file = new File([blob], `anonymous-${message.imageUrl ? 'image' : 'voice'}.${ext}`, { type: blob.type });
      if (navigator.share && navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file], title: 'PH X SFC ANONYMOUS' });
      return window.open(url, '_blank', 'noopener,noreferrer');
    }
    if (message.poll) {
      const url = `${location.origin}/poll/${message.poll.slug}`;
      return share({ title: message.poll.question, url }, url);
    }
    return share({ title: 'PH X SFC ANONYMOUS', text: message.text || 'Anonymous message' }, message.text || 'Anonymous message');
  } catch (error) {
    if (error?.name !== 'AbortError') toast('Could not open sharing.');
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
