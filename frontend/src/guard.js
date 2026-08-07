for (const key of Object.keys(localStorage)) {
  if (
    key === 'owner_undefined' ||
    key === 'owner_null' ||
    (key.startsWith('owner_') && localStorage.getItem(key) === 'undefined')
  ) {
    localStorage.removeItem(key);
  }
}

if (/^\/dashboard\/(undefined|null)(?:\/|$)/.test(location.pathname)) {
  location.replace('/');
}
