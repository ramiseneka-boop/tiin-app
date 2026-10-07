/* TIIN Release 1 — Supabase Auth and offline-safe document sync.
   The legacy app remains local-first. Cloud writes only begin after the user confirms migration. */
(function () {
  'use strict';

  const CONFIG = {
    url: 'https://jtxewfrdlaygwsxhxtwg.supabase.co',
    publishableKey: 'sb_publishable_b_3Y-lGeW-IJ-yWdYN2tqw_7RjPzxeZ',
    cacheKey: 'tiin_sync_queue_v1',
    migrationKey: 'tiin_cloud_migration_confirmed_v1'
  };
  const DATA_KEYS = new Set([
    'goals', 'templates', 'recurring', 'budgets', 'spending_limits_v2', 'financial_plan', 'payday',
    'payment_items', 'custom_categories', 'planning_lists', 'lang', 'theme'
  ]);
  const DATA_KEY_RE = /^(txns_\d{4}_\d{1,2}|payment_status_\d{4}_\d{1,2}|tiin_balance_anchor_v2_(all|personal|business))$/;
  const state = { client: null, clientPromise: null, user: null, timer: null, syncing: false, applyingCloud: false, pollingAuth: false };
  const authIntroKey = 'tiin_auth_intro_seen_v1';

  function isDataKey(key) { return DATA_KEYS.has(key) || DATA_KEY_RE.test(key); }
  function locale() { return window.currentLang === 'kz' ? 'kk' : 'ru'; }
  function text(ru, kk) { return locale() === 'kk' ? (kk || ru) : ru; }
  function escapeHtml(value) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])); }
  function setStatus(label, kind) {
    document.querySelectorAll('.sync-status').forEach(el => {
      el.textContent = label;
      el.dataset.sync = kind || '';
      el.title = text('Нажмите для управления синхронизацией', 'Синхрондауды басқару үшін басыңыз');
      el.style.cursor = 'pointer';
      el.onclick = openAccount;
    });
  }

  function refreshAccountButton() {
    const controls = document.querySelector('.top-controls');
    if (!controls) return;
    let button = document.getElementById('tiinAccountButton');
    if (!button) {
      button = document.createElement('button');
      button.id = 'tiinAccountButton';
      button.type = 'button';
      button.className = 'tiin-account-button';
      button.onclick = openAccount;
      controls.appendChild(button);
    }
    const signedIn = Boolean(state.user);
    const initial = signedIn ? (state.user.email || '?').charAt(0).toUpperCase() : '';
    button.classList.toggle('is-signed-in', signedIn);
    button.setAttribute('aria-label', signedIn ? text('Аккаунт и синхронизация', 'Аккаунт және синхрондау') : text('Войти или создать аккаунт', 'Кіру немесе аккаунт ашу'));
    button.title = button.getAttribute('aria-label');
    button.innerHTML = signedIn
      ? '<span class="tiin-account-avatar" aria-hidden="true">' + initial + '</span>'
      : '<svg class="tiin-account-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="3.4"></circle><path d="M5.5 20c.8-3.8 3.1-5.8 6.5-5.8s5.7 2 6.5 5.8"></path></svg><span>' + text('Войти', 'Кіру') + '</span>';
  }
  function hasExistingFinanceData() {
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !isDataKey(key) || key === 'lang' || key === 'theme') continue;
      const value = localStorage.getItem(key);
      if (value && value !== '[]' && value !== '{}') return true;
    }
    return false;
  }
  function continueWithoutAccount() {
    localStorage.setItem(authIntroKey, '1');
    close();
  }
  function renderWelcome() {
    modal('<div class="tiin-auth tiin-welcome"><div class="tiin-auth-kicker">TIIN</div><h3>' + text('Деньги — под контролем', 'Қаржыңыз — бақылауда') + '</h3><p>' + text('Войдите через Google, чтобы безопасно синхронизировать данные между телефоном и компьютером.', 'Телефон мен компьютер арасындағы деректерді қауіпсіз синхрондау үшін Google арқылы кіріңіз.') + '</p><button class="btn tiin-google-button" onclick="TIINCloud.signInWithGoogle()"><span>G</span>' + text('Продолжить с Google', 'Google арқылы жалғастыру') + '</button><button class="btn btn-ghost" style="width:100%;margin-top:10px" onclick="TIINCloud.openEmailLogin()">' + text('Войти по email', 'Email арқылы кіру') + '</button><button class="tx-action-cancel" onclick="TIINCloud.continueWithoutAccount()">' + text('Пока без аккаунта', 'Әзірге аккаунтсыз') + '</button></div>');
  }

  async function getClient() {
    if (state.client) return state.client;
    if (state.clientPromise) return state.clientPromise;
    state.clientPromise = createClient();
    try { return await state.clientPromise; } finally { state.clientPromise = null; }
  }
  async function createClient() {
    if (!window.supabase) {
      await new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.57.4/dist/umd/supabase.min.js';
        s.async = true;
        s.onload = resolve;
        s.onerror = () => reject(new Error('Supabase library unavailable'));
        document.head.appendChild(s);
      });
    }
    state.client = window.supabase.createClient(CONFIG.url, CONFIG.publishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, flowType: 'pkce', storage: window.localStorage }
    });
    return state.client;
  }

  async function getPersistedUser(client) {
    const { data, error } = await client.auth.getSession();
    if (error) throw error;
    return data.session?.user || null;
  }

  function safeJson(value, fallback) {
    try { return JSON.parse(value); } catch (_) { return fallback; }
  }
  function migrationConfirmed() { return Boolean(state.user && localStorage.getItem(CONFIG.migrationKey + ':' + state.user.id)); }
  function markMigrated() { localStorage.setItem(CONFIG.migrationKey + ':' + state.user.id, '1'); }
  function baselineKey() { return 'tiin_sync_baseline_v1:' + state.user.id; }
  function baseline() { return safeJson(localStorage.getItem(baselineKey()), {}) || {}; }
  function setBaseline(key, value) { const values = baseline(); values[key] = value; localStorage.setItem(baselineKey(), JSON.stringify(values)); }
  // Older TIIN builds could leave a non-array value in localStorage.
  // Treat it as an empty queue rather than blocking sync or touching finance records.
  function queue() {
    const stored = safeJson(localStorage.getItem(CONFIG.cacheKey), []);
    return Array.isArray(stored) ? stored : [];
  }
  function saveQueue(items) {
    localStorage.setItem(CONFIG.cacheKey, JSON.stringify(Array.isArray(items) ? items : []));
  }
  function queueDocument(key) {
    if (!isDataKey(key) || state.applyingCloud) return;
    const value = localStorage.getItem(key);
    const pending = queue().filter(item => item.key !== key);
    pending.push({ key, value, changedAt: new Date().toISOString() });
    saveQueue(pending);
    setStatus(text('Есть несинхронизированные изменения', 'Синхрондалмаған өзгерістер бар'), 'pending');
    scheduleFlush();
  }
  function collectLocalDocuments() {
    const docs = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !isDataKey(key)) continue;
      docs.push({ key, value: localStorage.getItem(key) });
    }
    return docs;
  }
  const recoveryKey = 'tiin_local_recovery_backup_v1';

  function hasMeaningfulValue(value) {
    if (!value || value === '[]' || value === '{}') return false;
    return true;
  }
  function meaningfulDocuments(docs) {
    return (docs || []).filter(doc => doc.key !== 'lang' && doc.key !== 'theme' && hasMeaningfulValue(doc.value));
  }
  // A single local snapshot is kept before any cloud read or migration. It is never synced.
  function createRecoveryBackup(reason) {
    const docs = collectLocalDocuments();
    if (!meaningfulDocuments(docs).length) return false;
    try {
      localStorage.setItem(recoveryKey, JSON.stringify({ created_at: new Date().toISOString(), reason, docs }));
      return true;
    } catch (error) {
      console.warn('TIIN recovery snapshot unavailable:', error.message);
      return false;
    }
  }
  function readRecoveryBackup() {
    const backup = safeJson(localStorage.getItem(recoveryKey), null);
    return Array.isArray(backup?.docs) ? backup : null;
  }
  function restoreRecoveryBackup() {
    const backup = readRecoveryBackup();
    if (!backup) { alert(text('Локальная копия не найдена', 'Жергілікті көшірме табылмады')); return; }
    // Do not write a recovery restore to the cloud automatically; the user must review it first.
    localStorage.removeItem(CONFIG.migrationKey);
    if (state.user) localStorage.removeItem(CONFIG.migrationKey + ':' + state.user.id);
    backup.docs.forEach(doc => {
      if (isDataKey(doc.key) && typeof doc.value === 'string') localStorage.setItem(doc.key, doc.value);
    });
    saveQueue([]);
    close();
    setStatus(text('Локальная копия восстановлена', 'Жергілікті көшірме қалпына келтірілді'), 'local');
    if (typeof window.render === 'function') window.render();
  }
  function mergeDocumentValues(localValue, remoteValue) {
    const local = safeJson(localValue, null), remote = safeJson(remoteValue, null);
    if (Array.isArray(local) && Array.isArray(remote)) {
      const seen = new Map();
      remote.forEach((item, index) => seen.set(item && item.id != null ? 'id:' + item.id : 'raw:' + JSON.stringify(item) + ':' + index, item));
      local.forEach((item, index) => seen.set(item && item.id != null ? 'id:' + item.id : 'raw:' + JSON.stringify(item) + ':' + index, item));
      return JSON.stringify(Array.from(seen.values()));
    }
    if (local && remote && typeof local === 'object' && typeof remote === 'object') return JSON.stringify({ ...remote, ...local });
    return localValue;
  }

  // Apply only local changes since the last downloaded document, keeping edits
  // from the other device. IDs distinguish edits/deletes from concurrent adds.
  function mergeWithBaseline(localValue, remoteValue, previousValue) {
    if (previousValue === undefined) return mergeDocumentValues(localValue, remoteValue);
    const local = safeJson(localValue, null), remote = safeJson(remoteValue, null), previous = safeJson(previousValue, null);
    if (Array.isArray(local) && Array.isArray(remote) && Array.isArray(previous) && [...local, ...remote, ...previous].every(item => item && item.id != null)) {
      const old = new Map(previous.map(item => [String(item.id), item]));
      const next = new Map(local.map(item => [String(item.id), item]));
      const merged = new Map(remote.map(item => [String(item.id), item]));
      old.forEach((_, id) => { if (!next.has(id)) merged.delete(id); });
      next.forEach((item, id) => { if (JSON.stringify(item) !== JSON.stringify(old.get(id))) merged.set(id, item); });
      return JSON.stringify(Array.from(merged.values()));
    }
    if (local && remote && previous && !Array.isArray(local) && typeof local === 'object' && typeof remote === 'object' && typeof previous === 'object') {
      const merged = { ...remote };
      Object.keys(previous).forEach(key => { if (!(key in local)) delete merged[key]; });
      Object.keys(local).forEach(key => { if (JSON.stringify(local[key]) !== JSON.stringify(previous[key])) merged[key] = local[key]; });
      return JSON.stringify(merged);
    }
    return localValue === previousValue ? remoteValue : localValue;
  }

  function migrationSummary(docs) {
    let transactions = 0, templates = 0, payments = 0, goals = 0, lists = 0;
    docs.forEach(doc => {
      const data = safeJson(doc.value, []);
      if (doc.key.startsWith('txns_') && Array.isArray(data)) transactions += data.length;
      if (doc.key === 'templates' && Array.isArray(data)) templates = data.length;
      if ((doc.key === 'payment_items' || doc.key.startsWith('payment_status_')) && Array.isArray(data)) payments += data.length;
      if (doc.key === 'goals' && Array.isArray(data)) goals = data.length;
      if (doc.key === 'planning_lists' && Array.isArray(data)) lists = data.length;
    });
    return { transactions, templates, payments, goals, lists };
  }

  async function ensureProfile() {
    const client = await getClient();
    if (!state.user) return;
    const { error } = await client.from('profiles').upsert({
      user_id: state.user.id,
      locale: locale(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
    if (error) throw error;
  }
  async function uploadDocuments(docs) {
    const client = await getClient();
    if (!state.user || !docs.length) return;
    for (const doc of docs) {
      let committed = false;
      for (let attempt = 0; attempt < 4 && !committed; attempt += 1) {
        const { data: remote, error: readError } = await client.from('sync_documents').select('payload,version').eq('user_id', state.user.id).eq('document_key', doc.key).maybeSingle();
        if (readError) throw readError;
        const value = remote ? mergeWithBaseline(doc.value, remote.payload.value, baseline()[doc.key]) : doc.value;
        const row = { user_id: state.user.id, document_key: doc.key, payload: { value }, version: (remote?.version || 0) + 1, updated_at: new Date().toISOString() };
        const write = remote
          ? client.from('sync_documents').update(row).eq('user_id', state.user.id).eq('document_key', doc.key).eq('version', remote.version).select('document_key')
          : client.from('sync_documents').insert(row).select('document_key');
        const { data, error } = await write;
        if (error && error.code !== '23505') throw error;
        if (!error && data?.length) {
          committed = true;
          setBaseline(doc.key, value);
          // A user can add another entry while the request is in flight.
          if (localStorage.getItem(doc.key) === doc.value) {
            state.applyingCloud = true;
            try { localStorage.setItem(doc.key, value); } finally { state.applyingCloud = false; }
          }
        }
      }
      if (!committed) throw new Error('Конфликт синхронизации. Изменения сохранены на устройстве.');
    }
  }
  async function flush() {
    if (!state.user || state.syncing || !migrationConfirmed() || !navigator.onLine) return;
    const pending = queue().filter(item => isDataKey(item.key));
    if (!pending.length) {
      setStatus(text('Синхронизировано', 'Синхрондалды'), 'ok');
      return;
    }
    state.syncing = true;
    setStatus(text('Синхронизация…', 'Синхрондау…'), 'busy');
    try {
      await uploadDocuments(pending);
      saveQueue(queue().filter(item => !pending.some(sent => sent.key === item.key && sent.value === item.value && sent.changedAt === item.changedAt)));
      setStatus(queue().length ? text('Есть несинхронизированные изменения', 'Синхрондалмаған өзгерістер бар') : text('Синхронизировано', 'Синхрондалды'), queue().length ? 'pending' : 'ok');
    } catch (error) {
      console.warn('TIIN sync deferred:', error.message);
      setStatus(text('Есть несинхронизированные изменения', 'Синхрондалмаған өзгерістер бар'), 'pending');
    } finally {
      state.syncing = false;
      if (queue().length && navigator.onLine) { clearTimeout(state.timer); state.timer = setTimeout(flush, 10000); }
    }
  }
  function scheduleFlush() {
    clearTimeout(state.timer);
    state.timer = setTimeout(flush, 900);
  }
  async function pullCloudDocuments() {
    const client = await getClient();
    const { data, error } = await client.from('sync_documents')
      .select('document_key,payload,updated_at')
      .eq('user_id', state.user.id).order('updated_at', { ascending: true });
    if (error) throw error;
    (data || []).forEach(doc => {
      if (!isDataKey(doc.document_key) || typeof doc.payload?.value !== 'string') return;
      if (queue().some(item => item.key === doc.document_key)) return;
      setBaseline(doc.document_key, doc.payload.value);
      state.applyingCloud = true;
      try { localStorage.setItem(doc.document_key, doc.payload.value); } finally { state.applyingCloud = false; }
    });
    return data || [];
  }

  function close() {
    if (typeof window.closeModal === 'function') window.closeModal();
    else document.getElementById('modalOverlay')?.classList.remove('open');
  }
  function modal(html) {
    const box = document.getElementById('modal');
    const overlay = document.getElementById('modalOverlay');
    if (!box || !overlay) return;
    box.innerHTML = html;
    overlay.classList.add('open');
  }
  function renderLogin(message) {
    modal('<div class="tiin-auth"><div class="tiin-auth-kicker">TIIN Cloud</div><h3>' + text('Синхронизация между устройствами', 'Құрылғылар арасындағы синхрондау') + '</h3><p>' + (escapeHtml(message) || text('Войдите через Google или email. После входа вы сами подтвердите перенос локальных данных.', 'Google немесе email арқылы кіріңіз. Кейін жергілікті деректерді көшіруді өзіңіз растайсыз.')) + '</p><button class="btn" style="width:100%;margin-top:14px;border:1px solid rgba(255,255,255,.18);background:#fff;color:#182033" onclick="TIINCloud.signInWithGoogle()">G&nbsp; ' + text('Войти через Google', 'Google арқылы кіру') + '</button><div style="display:flex;align-items:center;gap:10px;margin:16px 0;color:#8f9bb2;font-size:12px"><span style="height:1px;background:currentColor;flex:1"></span>' + text('или по email', 'немесе email арқылы') + '<span style="height:1px;background:currentColor;flex:1"></span></div><label>' + text('Email', 'Email') + '</label><input id="tiinAuthEmail" class="form-input" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com"><button class="btn btn-gold" style="width:100%;margin-top:14px" onclick="TIINCloud.sendMagicLink()">' + text('Получить ссылку для входа', 'Кіру сілтемесін алу') + '</button><button class="tx-action-cancel" onclick="closeModal()">' + text('Отмена', 'Бас тарту') + '</button></div>');
  }
  async function signInWithGoogle() {
    try {
      const client = await getClient();
      const redirectTo = await window.TIINAuthHandoff.prepare();
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, skipBrowserRedirect: true }
      });
      if (error) throw error;
      if (!data.url) throw new Error('Google не вернул адрес входа');
      // Store the PKCE verifier before leaving the installed app.
      window.location.assign(data.url);
    } catch (error) {
      renderLogin(text('Не удалось открыть вход через Google: ', 'Google арқылы кіруді ашу мүмкін болмады: ') + error.message);
    }
  }

  async function sendMagicLink() {
    const email = document.getElementById('tiinAuthEmail')?.value.trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) { alert(text('Введите корректный email', 'Дұрыс email енгізіңіз')); return; }
    try {
      const client = await getClient();
      const redirectTo = await window.TIINAuthHandoff.prepare();
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: redirectTo }
      });
      if (error) throw error;
      renderLogin(text('Ссылка отправлена. Откройте последнее письмо, затем вернитесь в TIIN. Вход завершится здесь автоматически.', 'Сілтеме жіберілді. Соңғы хатты ашып, TIIN-ге оралыңыз. Кіру осы жерде автоматты аяқталады.'));
      pollAuth();
    } catch (error) {
      const rateLimited = /rate limit/i.test(error.message || '');
      renderLogin(rateLimited
        ? text('Лимит писем временно исчерпан. Не отправляйте ещё раз — дождитесь следующего часа и запросите одну ссылку.', 'Хат лимиті уақытша таусылды. Қайта жібермеңіз — келесі сағатты күтіп, бір сілтеме сұратыңыз.')
        : text('Не удалось отправить ссылку: ', 'Сілтемені жіберу мүмкін болмады: ') + error.message);
    }
  }

  async function confirmMigration() {
    const docs = collectLocalDocuments();
    try {
      if (meaningfulDocuments(docs).length && !createRecoveryBackup('before_first_cloud_migration')) throw new Error('Не удалось сохранить резервную копию. Освободите память устройства и повторите.');
      setStatus(text('Синхронизация…', 'Синхрондау…'), 'busy');
      await ensureProfile();
      const client = await getClient();
      // Merge per document first: a pre-existing cloud document must never erase a different local operation.
      const { data: cloudDocs, error: cloudError } = await client.from('sync_documents').select('document_key,payload').eq('user_id', state.user.id);
      if (cloudError) throw cloudError;
      const remoteByKey = new Map((cloudDocs || []).map(doc => [doc.document_key, doc.payload?.value]));
      const mergedDocs = docs.map(doc => remoteByKey.has(doc.key)
        ? { ...doc, value: mergeDocumentValues(doc.value, remoteByKey.get(doc.key)) }
        : doc);
      await uploadDocuments(mergedDocs);
      const { error: profileError } = await client.from('profiles').update({
        migration_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('user_id', state.user.id);
      if (profileError) throw profileError;
      const { data: verified, error: verifyError } = await client.from('sync_documents').select('document_key,payload').eq('user_id', state.user.id);
      if (verifyError) throw verifyError;
      if (!mergedDocs.every(doc => verified.some(saved => saved.document_key === doc.key && saved.payload.value === baseline()[doc.key]))) throw new Error('Не удалось проверить серверную копию');
      markMigrated();
      saveQueue(queue().filter(item => !docs.some(sent => sent.key === item.key && sent.value === item.value)));
      await pullCloudDocuments();
      close();
      setStatus(text('Синхронизировано', 'Синхрондалды'), 'ok');
      if (typeof window.render === 'function') window.render();
    } catch (error) {
      setStatus(text('Есть несинхронизированные изменения', 'Синхрондалмаған өзгерістер бар'), 'pending');
      alert(text('Копия не создана. Локальные данные остались на устройстве. ', 'Көшірме жасалмады. Жергілікті деректер құрылғыда қалды. ') + error.message);
    }
  }
  function renderMigration(docs) {
    const c = migrationSummary(docs);
    modal(`<div class="tiin-auth"><div class="tiin-auth-kicker">TIIN Cloud</div><h3>${text('Найдены локальные данные TIIN', 'TIIN жергілікті деректері табылды')}</h3><p>${text('На устройстве: ', 'Құрылғыда: ')}${c.transactions} ${text('операций', 'операция')}, ${c.templates} ${text('шаблонов', 'үлгі')}, ${c.payments} ${text('платежей', 'төлем')}, ${c.goals} ${text('целей', 'мақсат')}, ${c.lists} ${text('списков', 'тізім')}.</p><p class="tiin-auth-note">${text('Перенос создаёт копию в аккаунте. Локальные данные не удаляются.', 'Көшіру аккаунтта көшірме жасайды. Жергілікті деректер жойылмайды.')}</p><button class="btn btn-gold" style="width:100%;margin-top:14px" onclick="TIINCloud.confirmMigration()">${text('Перенести в аккаунт', 'Аккаунтқа көшіру')}</button>${readRecoveryBackup() ? '<button class="tx-action-cancel" onclick="TIINCloud.restoreBackup()">' + text('Восстановить локальную копию', 'Жергілікті көшірмені қалпына келтіру') + '</button>' : ''}<button class="tx-action-cancel" onclick="closeModal()">${text('Позже', 'Кейін')}</button></div>`);
  }
  async function openAccount() {
    try {
      const client = await getClient();
      const user = await getPersistedUser(client);
      if (!user) { renderLogin(); return; }
      state.user = user;
      const localDocs = collectLocalDocuments();
      const { data: remote, error } = await client.from('sync_documents').select('document_key').eq('user_id', user.id).limit(1);
      if (error) throw error;
      // Never replace device data with the cloud merely because a person just signed in.
      if (!migrationConfirmed() && meaningfulDocuments(localDocs).length) {
        createRecoveryBackup('before_migration_prompt');
        renderMigration(localDocs);
        return;
      }
      if (!migrationConfirmed() && !remote?.length) {
        await ensureProfile();
        markMigrated();
      }
      modal(`<div class="tiin-auth"><div class="tiin-auth-kicker">TIIN Cloud</div><h3>${text('Синхронизация включена', 'Синхрондау қосулы')}</h3><p>${escapeHtml(user.email || '')}</p><button class="btn btn-gold" style="width:100%;margin-top:14px" onclick="TIINCloud.syncNow()">${text('Синхронизировать сейчас', 'Қазір синхрондау')}</button><button class="tx-action-cancel" onclick="TIINCloud.signOut()">${text('Выйти из аккаунта', 'Аккаунттан шығу')}</button><button class="tx-action-cancel" onclick="closeModal()">${text('Закрыть', 'Жабу')}</button></div>`);
    } catch (error) {
      modal('<div class="tiin-auth"><h3>' + text('Аккаунт сохранён', 'Аккаунт сақталды') + '</h3><p>' + text('Облако временно недоступно. Данные остаются на устройстве.', 'Бұлт уақытша қолжетімсіз. Деректер құрылғыда қалады.') + '</p><button class="tx-action-cancel" onclick="closeModal()">' + text('Закрыть', 'Жабу') + '</button></div>');
    }
  }
  async function syncNow() {
    if (!state.user) return;
    try {
      const localDocs = collectLocalDocuments();
      // First device: require the explicit migration screen. A cloud read cannot wipe local records.
      if (!migrationConfirmed() && meaningfulDocuments(localDocs).length) {
        createRecoveryBackup('before_sync_migration_prompt');
        renderMigration(localDocs);
        return;
      }
      await ensureProfile();
      if (!migrationConfirmed() && !meaningfulDocuments(localDocs).length) saveQueue([]);
      if (migrationConfirmed()) {
        await flush();
        if (queue().length || state.syncing) return;
      }
      // New/empty device: download only if the account really contains cloud data.
      createRecoveryBackup('before_cloud_download');
      const remote = await pullCloudDocuments();
      if (!remote.length) {
        setStatus(text('В аккаунте пока нет данных', 'Аккаунтта әзірге деректер жоқ'), 'local');
        close();
        return;
      }
      markMigrated();
      setStatus(text('Синхронизировано', 'Синхрондалды'), 'ok');
      close();
      if (typeof window.render === 'function') window.render();
    } catch (error) { alert(error.message); }
  }
  async function signOut() {
    const client = await getClient();
    const { error } = await client.auth.signOut({ scope: 'local' });
    if (error) { alert(text('Не удалось выйти. Попробуйте снова.', 'Шығу мүмкін болмады. Қайта көріңіз.')); return; }
    state.user = null;
    close();
    setStatus(text('Данные на устройстве', 'Құрылғыдағы деректер'), 'local');
  }
  async function reconcileSession(client) {
    const user = await getPersistedUser(client);
    state.user = user;
    refreshAccountButton();
    if (!user) return;
    if (migrationConfirmed()) {
      await flush();
      if (!state.syncing && !queue().length && navigator.onLine) {
        await pullCloudDocuments();
        if (typeof window.render === 'function') window.render();
      }
    } else if (meaningfulDocuments(collectLocalDocuments()).length) {
      setStatus(text('Нужен перенос данных', 'Деректерді көшіру керек'), 'pending');
      renderMigration(collectLocalDocuments());
    } else {
      await syncNow();
      // A new account starts without finance records but can sync new entries.
      if (!migrationConfirmed()) { await ensureProfile(); markMigrated(); }
    }
  }
  async function pollAuth() {
    if (state.pollingAuth || document.hidden || !window.TIINAuthHandoff.pending()) return;
    state.pollingAuth = true;
    try {
      const client = await getClient();
      const result = await window.TIINAuthHandoff.resume(client);
      if (result.session) { close(); await reconcileSession(client); }
      if (result.expired) renderLogin(text('Время подтверждения истекло. Нажмите «Войти через Google» ещё раз.', 'Растау уақыты аяқталды. Google арқылы қайта кіріңіз.'));
    } catch (_) {
      // Transient offline/relay errors do not delete a pending login or session.
      setStatus(navigator.onLine ? text('Ожидаем подтверждение входа', 'Кіруді растау күтілуде') : text('Нет сети', 'Желі жоқ'), 'pending');
    } finally {
      state.pollingAuth = false;
      if (!document.hidden && window.TIINAuthHandoff.pending()) setTimeout(pollAuth, 2000);
    }
  }
  async function boot() {
    const returned = window.TIINAuthHandoff.callback();
    if (returned.id || returned.code || returned.error) {
      try {
        const result = await window.TIINAuthHandoff.handleCallback(getClient);
        if (result.external) {
          document.getElementById('app').style.visibility = 'hidden';
          modal('<div class="tiin-auth"><div class="tiin-auth-kicker">TIIN Cloud</div><h3>' + text('Вход подтверждён', 'Кіру расталды') + '</h3><p>' + text('Теперь закройте это окно кнопкой × или вернитесь в установленный TIIN через переключение приложений. Вход завершится в приложении автоматически. Данные из Safari переносить не нужно.', 'Бұл терезені × арқылы жауып, орнатылған TIIN-ге оралыңыз. Кіру қолданбада автоматты аяқталады.') + '</p></div>');
          return;
        }
      } catch (error) { renderLogin(error.message); return; }
    }
    // Snapshot existing financial data before the authentication state can trigger any cloud action.
    createRecoveryBackup('app_start');
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      nativeSetItem.call(this, key, value);
      if (this === localStorage && isDataKey(key) && key !== CONFIG.cacheKey) queueDocument(key);
    };
    window.addEventListener('online', () => { pollAuth(); syncNowQuietly(); });
    try {
      const client = await getClient();
      const user = await getPersistedUser(client);
      state.user = user;
      refreshAccountButton();
      if (!user) {
        setStatus(text('Данные на устройстве', 'Құрылғыдағы деректер'), 'local');
        if (!localStorage.getItem(authIntroKey) && !hasExistingFinanceData()) {
          requestAnimationFrame(renderWelcome);
        }
      } else { await reconcileSession(client); }
      client.auth.onAuthStateChange((event, session) => {
        state.user = session?.user || null;
        refreshAccountButton();
        // Supabase auth callbacks run under a lock: never call its APIs here.
        if (event === 'SIGNED_IN') setTimeout(() => reconcileSession(client).catch(() => setStatus(text('Облако временно недоступно', 'Бұлт уақытша қолжетімсіз'), 'pending')), 0);
        if (event === 'SIGNED_OUT') setStatus(text('Данные на устройстве', 'Құрылғыдағы деректер'), 'local');
      });
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) return;
        client.auth.startAutoRefresh();
        pollAuth();
        syncNowQuietly();
      });
      window.addEventListener('pageshow', () => { pollAuth(); syncNowQuietly(); });
      window.addEventListener('focus', () => { pollAuth(); syncNowQuietly(); });
      setInterval(() => { if (!document.hidden) syncNowQuietly(); }, 30000);
      pollAuth();
    } catch (_) {
      setStatus(text('Нет сети', 'Желі жоқ'), 'offline');
    }
  }
  let resumeBusy = false;
  async function syncNowQuietly() {
    if (resumeBusy || !navigator.onLine || window.TIINAuthHandoff.pending()) return;
    resumeBusy = true;
    try { await reconcileSession(await getClient()); }
    catch (_) { setStatus(text('Нет связи с облаком. Данные сохранены локально.', 'Бұлтқа байланыс жоқ. Деректер жергілікті сақталды.'), 'offline'); }
    finally { resumeBusy = false; }
  }
  window.TIINCloud = { open: openAccount, openEmailLogin: renderLogin, signInWithGoogle, sendMagicLink, confirmMigration, syncNow, signOut, continueWithoutAccount, restoreBackup: restoreRecoveryBackup };
  document.addEventListener('DOMContentLoaded', boot);
})();
