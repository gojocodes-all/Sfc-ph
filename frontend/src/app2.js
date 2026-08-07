async function publicInbox(slug) {
  try {
    const inbox = await api(`/api/inboxes/${encodeURIComponent(slug)}`);
    if (!validSlug(inbox.slug) || typeof inbox.displayName !== 'string') throw new Error('This inbox is unavailable.');
    app.innerHTML = `<div class="public-shell">${topbar()}<main class="public-card"><div class="public-profile"><span class="brand-mark"><i></i><i></i></span><strong>${esc(inbox.displayName)}</strong><p>Send something anonymously.</p></div><section class="card" style="padding:0;overflow:hidden"><div class="composer-head"><h2 class="composer-title">Send anonymously</h2><p class="composer-sub">Your identity is not shown.</p></div><div class="tool-row"><button class="tool active" type="button" data-kind="text">Text</button><button class="tool" type="button" data-kind="image">Image</button><button class="tool" type="button" data-kind="voice">Voice</button><button class="tool" type="button" data-kind="poll">Poll</button></div><form id="sendForm"><input type="hidden" name="kind" value="text"><div id="panel" class="tool-panel"></div></form></section></main></div>`;

    let kind = 'text';
    let recorder = null;
    let mediaStream = null;
    let chunks = [];
    let voiceBlob = null;
    const panel = $('#panel');
    const form = $('#sendForm');

    function stopRecording() {
      try { if (recorder?.state === 'recording') recorder.stop(); } catch {}
      mediaStream?.getTracks?.().forEach((track) => track.stop());
      mediaStream = null;
      recorder = null;
    }

    function renderTool() {
      form.elements.kind.value = kind;
      if (kind === 'text') {
        panel.innerHTML = '<div class="field"><textarea name="text" maxlength="1200" placeholder="Write your message" required></textarea></div><div class="send-row"><button class="btn primary" type="submit">Send anonymously</button></div>';
      } else if (kind === 'image') {
        panel.innerHTML = '<label class="file-zone">Choose image<input id="imageFile" name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required><div id="imageName" class="file-name"></div></label><div class="field" style="margin-top:14px"><textarea name="text" maxlength="500" placeholder="Caption (optional)"></textarea></div><div class="send-row"><button class="btn primary" type="submit">Send image</button></div>';
        $('#imageFile').addEventListener('change', (event) => { $('#imageName').textContent = event.target.files?.[0]?.name || ''; });
      } else if (kind === 'voice') {
        panel.innerHTML = '<div class="record-box"><div id="recordStatus" class="record-status">Record a voice note or choose an audio file.</div><div class="record-actions"><button class="btn small" type="button" id="recordBtn">Start recording</button><label class="btn small">Choose file<input id="voiceFile" type="file" name="voice" accept="audio/*,video/webm" hidden></label></div><audio id="voicePreview" class="hidden" controls></audio></div><div class="send-row"><button class="btn primary" type="submit">Send voice note</button></div>';
        $('#voiceFile').addEventListener('change', (event) => {
          voiceBlob = null;
          const file = event.target.files?.[0];
          if (file) {
            $('#recordStatus').textContent = file.name;
            const preview = $('#voicePreview');
            preview.src = URL.createObjectURL(file);
            preview.classList.remove('hidden');
          }
        });
        $('#recordBtn').addEventListener('click', async (event) => {
          if (recorder?.state === 'recording') {
            recorder.stop();
            event.currentTarget.textContent = 'Start recording';
            return;
          }
          if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
            toast('Voice recording is not supported in this browser. Choose an audio file instead.');
            return;
          }
          try {
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            chunks = [];
            recorder = new MediaRecorder(mediaStream);
            recorder.ondataavailable = (dataEvent) => { if (dataEvent.data.size) chunks.push(dataEvent.data); };
            recorder.onstop = () => {
              voiceBlob = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
              const preview = $('#voicePreview');
              if (preview) {
                preview.src = URL.createObjectURL(voiceBlob);
                preview.classList.remove('hidden');
              }
              const status = $('#recordStatus');
              if (status) status.textContent = 'Voice note ready.';
              mediaStream?.getTracks?.().forEach((track) => track.stop());
              mediaStream = null;
            };
            recorder.start();
            event.currentTarget.textContent = 'Stop recording';
            $('#recordStatus').textContent = 'Recording…';
          } catch {
            mediaStream?.getTracks?.().forEach((track) => track.stop());
            mediaStream = null;
            toast('Microphone permission is needed.');
          }
        });
      } else {
        panel.innerHTML = '<div class="field"><label>Question</label><input name="question" maxlength="180" placeholder="Ask something" required></div><div class="field"><label>Options</label><div id="pollOptions" class="poll-options"><input maxlength="80" placeholder="Option 1" required><input maxlength="80" placeholder="Option 2" required></div></div><button class="btn small" type="button" id="addOption">+ Add option</button><div class="send-row"><button class="btn primary" type="submit">Create & send poll</button></div>';
        $('#addOption').addEventListener('click', () => {
          const box = $('#pollOptions');
          if (box.children.length >= 8) return toast('Maximum 8 options.');
          const input = document.createElement('input');
          input.maxLength = 80;
          input.placeholder = `Option ${box.children.length + 1}`;
          box.appendChild(input);
        });
      }
    }

    $$('.tool').forEach((button) => button.addEventListener('click', () => {
      if (button.dataset.kind !== 'voice') stopRecording();
      kind = button.dataset.kind;
      $$('.tool').forEach((item) => item.classList.toggle('active', item === button));
      renderTool();
    }));
    renderTool();

    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = event.submitter || $('#sendForm button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const data = new FormData(form);
        data.set('kind', kind);
        if (kind === 'voice') {
          const chosen = $('#voiceFile')?.files?.[0];
          if (voiceBlob && !chosen) data.set('voice', new File([voiceBlob], 'voice.webm', { type: voiceBlob.type || 'audio/webm' }));
        }
        if (kind === 'poll') {
          const options = $$('#pollOptions input').map((input) => input.value.trim()).filter(Boolean);
          if (options.length < 2) throw new Error('A poll needs at least 2 options.');
          data.set('options', JSON.stringify(options));
        }
        const result = await api(`/api/inboxes/${encodeURIComponent(slug)}/messages`, { method: 'POST', body: data }, 60000);
        if (!result.ok || !result.id) throw new Error('The message was not saved. Please retry.');
        if (result.poll) {
          if (!validSlug(result.poll.slug)) throw new Error('The poll was created but its share link is invalid.');
          const link = `${location.origin}/poll/${result.poll.slug}`;
          const box = modal(`<h2>Poll sent</h2><div class="field"><label>Shareable poll link</label><input value="${esc(link)}" readonly></div><div class="modal-actions"><button class="btn" type="button" data-close>Close</button><button class="btn sage" type="button" data-copy>Copy link</button><button class="btn primary" type="button" data-share>Share</button></div>`);
          $('[data-close]', box).onclick = () => box.remove();
          $('[data-copy]', box).onclick = () => copy(link);
          $('[data-share]', box).onclick = () => share({ title: 'Anonymous poll', url: link }, link);
        } else {
          toast('Sent anonymously.');
        }
        stopRecording();
        voiceBlob = null;
        form.reset();
        renderTool();
      } catch (error) {
        toast(error.message);
      } finally {
        if (button) button.disabled = false;
      }
    });
  } catch (error) {
    app.innerHTML = `${topbar()}<main class="page"><div class="card empty">${esc(error.message)}</div></main>`;
  }
}
