async function publicInbox(slug) {
  try {
    const inbox = await api(`/api/inboxes/${encodeURIComponent(slug)}`);
    if (!validSlug(inbox.slug) || typeof inbox.displayName !== 'string') throw new Error('This inbox is unavailable.');
    app.innerHTML = `<div class="public-shell">${topbar()}<main class="public-card"><div class="public-profile"><span class="brand-mark"><i></i><i></i></span><strong>${esc(inbox.displayName)}</strong><p>Send something anonymously.</p></div><section class="card" style="padding:0;overflow:hidden"><div class="composer-head"><h2 class="composer-title">Send anonymously</h2><p class="composer-sub">Your identity is not shown to the inbox owner.</p></div><div class="tool-row"><button class="tool active" type="button" data-kind="text">Text</button><button class="tool" type="button" data-kind="image">Image</button><button class="tool" type="button" data-kind="voice">Voice</button><button class="tool" type="button" data-kind="poll">Poll</button></div><form id="sendForm"><input type="hidden" name="kind" value="text"><div id="panel" class="tool-panel"></div></form></section><p class="sender-note">Please do not send passwords, addresses or other sensitive personal information.</p></main>${footer()}</div>`;

    let kind = 'text';
    let recorder = null;
    let mediaStream = null;
    let chunks = [];
    let voiceBlob = null;
    let voiceMime = '';
    let voiceObjectUrl = '';
    let recordingDone = null;
    let recordingDoneResolve = null;
    let recordStartedAt = 0;
    const panel = $('#panel');
    const form = $('#sendForm');

    function revokeVoicePreview() {
      if (voiceObjectUrl) URL.revokeObjectURL(voiceObjectUrl);
      voiceObjectUrl = '';
    }

    function preferredRecorderOptions() {
      if (!window.MediaRecorder?.isTypeSupported) return {};
      const choices = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const mimeType = choices.find((type) => MediaRecorder.isTypeSupported(type));
      return mimeType ? { mimeType } : {};
    }

    function finishRecorderState() {
      mediaStream?.getTracks?.().forEach((track) => track.stop());
      mediaStream = null;
      recorder = null;
      recordingDoneResolve?.();
      recordingDoneResolve = null;
    }

    async function stopRecording({ keepBlob = true } = {}) {
      const active = recorder;
      if (active?.state === 'recording') {
        try { active.requestData?.(); } catch {}
        try { active.stop(); } catch { finishRecorderState(); }
        await recordingDone?.catch(() => null);
      } else {
        mediaStream?.getTracks?.().forEach((track) => track.stop());
        mediaStream = null;
        recorder = null;
      }
      if (!keepBlob) {
        voiceBlob = null;
        voiceMime = '';
        revokeVoicePreview();
      }
    }

    function setVoicePreview(blob, label = 'Voice note ready.') {
      if (!blob?.size) return;
      revokeVoicePreview();
      voiceObjectUrl = URL.createObjectURL(blob);
      const preview = $('#voicePreview');
      if (preview) {
        preview.src = voiceObjectUrl;
        preview.classList.remove('hidden');
      }
      const status = $('#recordStatus');
      if (status) status.textContent = label;
    }

    function renderTool() {
      form.elements.kind.value = kind;
      if (kind === 'text') {
        panel.innerHTML = '<div class="field"><textarea name="text" maxlength="1200" placeholder="Write your message" required></textarea></div><div class="send-row"><button class="btn primary" type="submit">Send anonymously</button></div>';
      } else if (kind === 'image') {
        panel.innerHTML = '<label class="file-zone">Choose image<input id="imageFile" name="image" type="file" accept="image/jpeg,image/png,image/webp,image/gif" required><div id="imageName" class="file-name"></div></label><div class="field" style="margin-top:14px"><textarea name="text" maxlength="500" placeholder="Caption (optional)"></textarea></div><div class="send-row"><button class="btn primary" type="submit">Send image</button></div>';
        $('#imageFile').addEventListener('change', (event) => {
          const file = event.target.files?.[0];
          $('#imageName').textContent = file ? `${file.name} · ${Math.ceil(file.size / 1024)} KB` : '';
        });
      } else if (kind === 'voice') {
        panel.innerHTML = '<div class="record-box"><div id="recordStatus" class="record-status">Record a voice note or choose an audio file.</div><div class="record-actions"><button class="btn small" type="button" id="recordBtn">Start recording</button><label class="btn small">Choose file<input id="voiceFile" type="file" name="voice" accept="audio/*,video/webm" hidden></label></div><audio id="voicePreview" class="hidden" controls preload="metadata"></audio><small class="record-help">Maximum 8 MB. Recording is finalized before upload so mobile browsers do not send an empty file.</small></div><div class="send-row"><button class="btn primary" type="submit">Send voice note</button></div>';
        $('#voiceFile').addEventListener('change', async (event) => {
          await stopRecording({ keepBlob: false });
          const file = event.target.files?.[0];
          if (!file) return;
          if (file.size > 8 * 1024 * 1024) {
            event.target.value = '';
            return toast('Voice note is too large. Maximum size is 8 MB.');
          }
          setVoicePreview(file, `${file.name} · ${Math.ceil(file.size / 1024)} KB`);
        });
        $('#recordBtn').addEventListener('click', async (event) => {
          const button = event.currentTarget;
          if (recorder?.state === 'recording') {
            button.disabled = true;
            $('#recordStatus').textContent = 'Finishing recording…';
            await stopRecording();
            button.disabled = false;
            button.textContent = 'Record again';
            return;
          }
          if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
            toast('Voice recording is not supported in this browser. Choose an audio file instead.');
            return;
          }
          try {
            await stopRecording({ keepBlob: false });
            mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            chunks = [];
            voiceBlob = null;
            voiceMime = '';
            const options = preferredRecorderOptions();
            recorder = new MediaRecorder(mediaStream, options);
            voiceMime = recorder.mimeType || options.mimeType || 'audio/webm';
            recordingDone = new Promise((resolve) => { recordingDoneResolve = resolve; });
            recorder.ondataavailable = (dataEvent) => {
              if (dataEvent.data?.size) chunks.push(dataEvent.data);
            };
            recorder.onerror = () => {
              toast('Recording failed. You can choose an audio file instead.');
              finishRecorderState();
            };
            recorder.onstop = () => {
              const mime = voiceMime || chunks[0]?.type || 'audio/webm';
              const blob = new Blob(chunks, { type: mime });
              if (!blob.size) {
                voiceBlob = null;
                toast('The recording was empty. Please record again.');
              } else if (blob.size > 8 * 1024 * 1024) {
                voiceBlob = null;
                toast('Voice note is too large. Keep it shorter and try again.');
              } else {
                voiceBlob = blob;
                const seconds = Math.max(1, Math.round((Date.now() - recordStartedAt) / 1000));
                setVoicePreview(blob, `Voice note ready · ${seconds}s · ${Math.ceil(blob.size / 1024)} KB`);
              }
              finishRecorderState();
            };
            recorder.start(500);
            recordStartedAt = Date.now();
            button.textContent = 'Stop recording';
            $('#recordStatus').textContent = 'Recording… tap Stop when finished.';
          } catch (error) {
            await stopRecording({ keepBlob: false });
            toast(error?.name === 'NotAllowedError' ? 'Microphone permission is needed.' : 'Could not start the microphone. Choose an audio file instead.');
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

    $$('.tool').forEach((button) => button.addEventListener('click', async () => {
      if (button.dataset.kind !== 'voice') await stopRecording({ keepBlob: false });
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
        if (kind === 'voice' && recorder?.state === 'recording') {
          $('#recordStatus').textContent = 'Finishing recording…';
          await stopRecording();
        }
        const data = new FormData(form);
        data.set('kind', kind);
        if (kind === 'voice') {
          const chosen = $('#voiceFile')?.files?.[0];
          if (!chosen && voiceBlob) {
            const ext = voiceMime.includes('mp4') ? 'm4a' : voiceMime.includes('ogg') ? 'ogg' : 'webm';
            data.delete('voice');
            data.append('voice', voiceBlob, `voice.${ext}`);
          }
          const candidate = chosen || voiceBlob;
          if (!candidate?.size) throw new Error('Record or choose a voice note first.');
          if (candidate.size > 8 * 1024 * 1024) throw new Error('Voice note is too large. Maximum size is 8 MB.');
        }
        if (kind === 'poll') {
          const options = $$('#pollOptions input').map((input) => input.value.trim()).filter(Boolean);
          if (options.length < 2) throw new Error('A poll needs at least 2 options.');
          data.set('options', JSON.stringify(options));
        }
        const result = await api(`/api/inboxes/${encodeURIComponent(slug)}/messages`, { method: 'POST', body: data }, 75000);
        if (!result.ok || !result.id) throw new Error('The message was not saved. Please retry.');
        if (result.poll) {
          if (!validSlug(result.poll.slug)) throw new Error('The poll was created but its share link is invalid.');
          const link = `${location.origin}/poll/${result.poll.slug}`;
          const box = modal(`<h2>Poll sent</h2><div class="field"><label>Shareable poll link</label><input value="${esc(link)}" readonly></div><div class="modal-actions"><button class="btn" type="button" data-close>Close</button><button class="btn sage" type="button" data-copy>Copy link</button><button class="btn primary" type="button" data-share>Share</button></div>`);
          $('[data-close]', box).onclick = () => box.remove();
          $('[data-copy]', box).onclick = () => copy(link);
          $('[data-share]', box).onclick = () => share({ title: 'Anonymous poll', url: link }, link);
        } else toast('Sent anonymously.');
        await stopRecording({ keepBlob: false });
        voiceBlob = null;
        voiceMime = '';
        form.reset();
        renderTool();
      } catch (error) {
        toast(error.message);
      } finally {
        if (button) button.disabled = false;
      }
    });
  } catch (error) {
    app.innerHTML = `${topbar()}<main class="page"><div class="card empty">${esc(error.message)}</div></main>${footer()}`;
  }
}
