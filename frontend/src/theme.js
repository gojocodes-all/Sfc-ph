(function () {
  const KEY = 'picnym-theme';
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  function normalize(value) { return ['system','light','dark'].includes(value) ? value : 'system'; }
  function currentPreference() { return normalize(localStorage.getItem(KEY) || 'system'); }
  function resolved(preference = currentPreference()) { return preference === 'system' ? (media?.matches ? 'dark' : 'light') : preference; }
  function apply(preference, persist = true) {
    const next = normalize(preference);
    if (persist) localStorage.setItem(KEY, next);
    document.documentElement.dataset.themePreference = next;
    document.documentElement.dataset.theme = resolved(next);
    document.documentElement.style.colorScheme = resolved(next);
    window.dispatchEvent(new CustomEvent('picnym-theme-change', { detail: { preference: next, resolved: resolved(next) } }));
    return next;
  }
  media?.addEventListener?.('change', () => { if (currentPreference() === 'system') apply('system', false); });
  window.PicnymTheme = { apply, currentPreference, resolved, key: KEY };
  apply(currentPreference(), false);
})();
