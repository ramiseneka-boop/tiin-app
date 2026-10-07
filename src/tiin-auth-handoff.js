/* iOS PWA and Safari have separate storage. Relay only a PKCE code, never tokens.
   The code is useless without the verifier which stays on the initiating device. */
(function (root) {
  'use strict';
  const ENDPOINT = 'https://jtxewfrdlaygwsxhxtwg.supabase.co/functions/v1/tiin-auth-handoff';
  const PENDING_KEY = 'tiin_auth_pending_pkce_v1';
  let resuming = null;
  function read() {
    try { return JSON.parse(root.localStorage.getItem(PENDING_KEY) || 'null'); } catch (_) { return null; }
  }
  function random() {
    return Array.from(root.crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
  }
  async function hash(value) {
    return Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
  }
  async function request(body) {
    const response = await root.fetch(ENDPOINT, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store',
      signal: AbortSignal.timeout(15000)
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Подтверждение входа недоступно');
    return result;
  }
  async function prepare() {
    const standalone = Boolean(root.navigator.standalone || root.matchMedia?.('(display-mode: standalone)').matches);
    const pending = { id: random(), secret: random(), standalone, expiresAt: Date.now() + 10 * 60 * 1000 };
    const result = await request({ action: 'create', id: pending.id, claimHash: await hash(pending.secret) });
    pending.expiresAt = Date.parse(result.expiresAt);
    root.localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    // Verify storage works before sending a user out of the installed app.
    if (read()?.id !== pending.id) throw new Error('Не удалось сохранить вход на устройстве');
    const url = new URL(root.location.origin + root.location.pathname);
    url.searchParams.set('tiin_auth_return', pending.id);
    return url.href;
  }
  function callback() {
    const params = new URLSearchParams(root.location.search);
    const fragment = new URLSearchParams((root.location.hash || '').slice(1));
    return { id: params.get('tiin_auth_return'), code: params.get('code'), error: params.get('error_description') || params.get('error') || fragment.get('error_description') || fragment.get('error') };
  }
  function cleanUrl() { root.history.replaceState(null, '', root.location.pathname); }
  async function acknowledge(pending) {
    try { await request({ action: 'ack', id: pending.id, secret: pending.secret }); } catch (_) { /* expires automatically */ }
  }
  async function handleCallback(getClient) {
    const returned = callback();
    if (!returned.id && !returned.code && !returned.error) return { handled: false };
    if (returned.error) { cleanUrl(); throw new Error(returned.error); }
    if (!returned.code) throw new Error('Google не вернул подтверждение входа. Начните вход ещё раз в TIIN.');
    const pending = read();
    const standalone = Boolean(root.navigator.standalone || root.matchMedia?.('(display-mode: standalone)').matches);
    if (pending && pending.id === returned.id && (!pending.standalone || standalone)) {
      const client = await getClient();
      const { error } = await client.auth.exchangeCodeForSession(returned.code);
      if (error) throw error;
      root.localStorage.removeItem(PENDING_KEY);
      cleanUrl();
      void acknowledge(pending);
      return { handled: true, external: false };
    }
    if (!returned.id) throw new Error('Эта ссылка входа устарела. Начните новый вход в установленном TIIN.');
    await request({ action: 'complete', id: returned.id, code: returned.code });
    cleanUrl();
    return { handled: true, external: true };
  }
  async function resume(client) {
    if (resuming) return resuming;
    const pending = read();
    if (!pending) return { pending: false };
    if (Date.now() >= pending.expiresAt) {
      root.localStorage.removeItem(PENDING_KEY);
      return { pending: false, expired: true };
    }
    resuming = (async () => {
      const result = await request({ action: 'claim', id: pending.id, secret: pending.secret });
      if (!result.code) return { pending: true };
      // Only the PWA has the verifier. Safari does not receive access/refresh tokens.
      const { data, error } = await client.auth.exchangeCodeForSession(result.code);
      if (error) throw error;
      if (!data.session) throw new Error('Вход не завершён');
      root.localStorage.removeItem(PENDING_KEY);
      void acknowledge(pending);
      return { pending: false, session: data.session };
    })();
    try { return await resuming; } finally { resuming = null; }
  }
  root.TIINAuthHandoff = { prepare, callback, handleCallback, resume, pending: read };
})(window);
