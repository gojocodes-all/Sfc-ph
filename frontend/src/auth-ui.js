const picnymBaseHome = home;
const picnymBaseRoute = route;

async function syncGoogleAuthButton() {
  const button = $('#googleAuth');
  if (!button) return;
  const note = button.parentElement?.querySelector('.form-note');
  const enabled = await PicnymAuth.isGoogleEnabled().catch(() => false);
  if (!document.body.contains(button)) return;
  button.disabled = !enabled;
  if (note) {
    note.textContent = enabled
      ? 'Use your Google account to continue.'
      : 'Google sign-in will appear here once the provider is enabled.';
  }
}

function addLegacyInboxShortcut() {
  const card = $('.auth-card');
  if (!card || $('#openLegacySaved')) return;
  const saved = savedInboxes();
  const last = localStorage.getItem('phsfc_last_inbox');
  const slug = (last && saved.includes(last)) ? last : saved[0];
  if (!slug) return;
  const button = document.createElement('button');
  button.id = 'openLegacySaved';
  button.type = 'button';
  button.className = 'btn sage';
  button.style.cssText = 'width:100%;margin-top:10px';
  button.textContent = 'Open saved inbox';
  button.onclick = () => nav(`/dashboard/${encodeURIComponent(slug)}`);
  card.appendChild(button);
  const note = document.createElement('p');
  note.className = 'form-note';
  note.textContent = 'This inbox was saved on this device before PICNYM accounts. Sign in later to claim it to your account.';
  card.appendChild(note);
}

function addForgotPasswordLink() {
  const form = $('#signinForm');
  if (!form || $('#forgotPassword')) return;
  const button = document.createElement('button');
  button.id = 'forgotPassword';
  button.type = 'button';
  button.className = 'auth-text-button';
  button.textContent = 'Forgot password?';
  form.appendChild(button);
  button.onclick = () => {
    const currentEmail = String($('#signinEmail')?.value || '').trim();
    const box = modal(`<h2>Reset password</h2><p class="form-note">Enter the email address on your PICNYM account. We’ll send a secure recovery link.</p><div class="field"><label>Email</label><input id="resetEmail" type="email" autocomplete="email" value="${esc(currentEmail)}" required></div><div class="modal-actions"><button class="btn" type="button" data-close>Cancel</button><button class="btn primary" type="button" data-send>Send reset link</button></div>`);
    $('[data-close]', box).onclick = () => box.remove();
    $('[data-send]', box).onclick = async () => {
      const sendButton = $('[data-send]', box);
      sendButton.disabled = true;
      try {
        await PicnymAuth.requestPasswordReset($('#resetEmail', box).value);
        box.remove();
        toast('Password reset link sent. Check your email.');
      } catch (error) {
        toast(error.message);
        sendButton.disabled = false;
      }
    };
  };
}

async function enhanceAuthHome() {
  addForgotPasswordLink();
  addLegacyInboxShortcut();
  await syncGoogleAuthButton();
}

home = async function homeWithAuthEnhancements(...args) {
  await picnymBaseHome(...args);
  await enhanceAuthHome();
};

async function resetPasswordPage() {
  stopDashboardRefresh?.();
  const session = await authSession();
  app.innerHTML = `${topbar('<a class="top-action" href="/">Home</a>')}<main class="page"><div class="section-kicker">Account recovery</div><h1>Choose a new password</h1><section class="card">${session ? '<form id="newPasswordForm"><div class="field"><label>New password</label><input name="password" type="password" minlength="8" autocomplete="new-password" required></div><div class="field"><label>Confirm password</label><input name="confirmPassword" type="password" minlength="8" autocomplete="new-password" required></div><button class="btn primary" type="submit">Update password</button></form>' : '<p>Open the most recent recovery link from your email on this device. If the link has expired, request another one from the sign-in screen.</p><a class="btn primary" href="/?auth=signin">Back to sign in</a>'}</section></main>`;
  $('#newPasswordForm')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.submitter;
    if (button) button.disabled = true;
    try {
      const form = new FormData(event.currentTarget);
      const password = String(form.get('password') || '');
      const confirmPassword = String(form.get('confirmPassword') || '');
      if (password !== confirmPassword) throw new Error('The passwords do not match.');
      await PicnymAuth.updatePassword(password);
      toast('Password updated.');
      nav('/account');
    } catch (error) {
      toast(error.message);
      if (button) button.disabled = false;
    }
  });
}

route = function routeWithRecovery() {
  if (location.pathname === '/reset-password' || location.pathname === '/reset-password/') {
    return resetPasswordPage();
  }
  return picnymBaseRoute();
};

(function injectAuthUiStyles() {
  if ($('#picnymAuthUiStyles')) return;
  const style = document.createElement('style');
  style.id = 'picnymAuthUiStyles';
  style.textContent = '.auth-text-button{display:block;margin:12px auto 0;border:0;background:transparent;color:#526a56;font-weight:800;cursor:pointer;padding:4px 8px}.auth-text-button:hover{text-decoration:underline}';
  document.head.appendChild(style);
})();

PicnymAuth.onChange((event) => {
  if (event === 'PASSWORD_RECOVERY') route();
});

if (location.pathname === '/reset-password' || location.pathname === '/reset-password/') route();
else enhanceAuthHome();
