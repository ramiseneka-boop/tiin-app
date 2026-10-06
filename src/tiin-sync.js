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
    'goals', 'templates', 'recurring', 'budgets', 'payday',
    'payment_items', 'custom_categories', 'planning_lists', 'lang', 'theme'
  ]);
  const DATA_KEY_RE = /^(txns_\d{4}_\d{1,2}|payment_status_\d{4}_\d{1,2})$/;
  const state = { client: null, user: null, timer: null, syncing: false };
  const authIntroKey = 'tiin_auth_intro_seen_v1';

  function isDataKey(key) { return DATA_KEYS.has(key) || DATA_KEY_RE.test(key); }
  function locale() { return window.currentLang === 'kz' ? 'kk' : 'ru'; }
  function text(ru, kk) { return locale() === 'kk' ? (kk || ru) : ru; }
  function isIosBrowserOutsidePwa() {
    const ios = /iPhone|iPad|iPod/i.test(navigator.userAgent || '');
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true;
    return ios && !standalone;
  }
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
    modal('<div class="tiin-auth tiin-welcome"><div class="tiin-auth-kicker">TIIN</div><h3>' + text('Деньги — под контролем', 'Қаржыңыз — бақылауда') + '</h3><p>' + text('Войдите, чтобы безопасно синхронизировать данные между телефоном и компьютером.', 'Телефон мен компьютер арасындағы деректерді қауіпсіз синхрондау үшін кіріңіз.') + '</p><button class="btn tiin-google-button" onclick="TIINCloud.signInWithGoogle()"><span>G</span>' + text('Продолжить с Google', 'Google арқылы жалғастыру') + '</button><button class="btn btn-ghost" style="width:100%;margin-top:10px" onclick="TIINCloud.openEmailLogin()">' + text('Войти по email', 'Email арқылы кіру') + '</button><button class="tx-action-cancel" onclick="TIINCloud.continueWithoutAccount()">' + text('Пока без аккаунта', 'Әзірге аккаунтсыз') + '</button></div>');
  }

  async function getClient() {
    if (state.client) return state.client;
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
      // Use durable browser storage and restore the local session before any network request.
      // This is important for installed iPhone PWAs after the app has been closed.
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storage: window.localStorage
      }
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
    if (!isDataKey(key)) return;
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
    await client.from('profiles').upsert({
      user_id: state.user.id,
      locale: locale(),
      updated_at: new Date().toISOString()
    }, { onConflict: 'user_id' });
  }
  async function uploadDocuments(docs) {
    const client = await getClient();
    if (!state.user || !docs.length) return;
    const now = new Date().toISOString();
    const rows = docs.map(doc => ({
      user_id: state.user.id,
      document_key: doc.key,
      payload: { value: doc.value, changed_at: doc.changedAt || now },
      version: 1,
      updated_at: doc.changedAt || now
    }));
    const { error } = await client.from('sync_documents').upsert(rows, { onConflict: 'user_id,document_key' });
    if (error) throw error;
  }
  async function flush() {
    if (!state.user || state.syncing || !localStorage.getItem(CONFIG.migrationKey) || !navigator.onLine) return;
    const pending = queue().filter(item => isDataKey(item.key));
    if (!pending.length) {
      setStatus(text('Синхронизировано', 'Синхрондалды'), 'ok');
      return;
    }
    state.syncing = true;
    setStatus(text('Синхронизация…', 'Синхрондау…'), 'busy');
    try {
      await uploadDocuments(pending);
      saveQueue([]);
      setStatus(text('Синхронизировано', 'Синхрондалды'), 'ok');
    } catch (error) {
      console.warn('TIIN sync deferred:', error.message);
      setStatus(text('Есть несинхронизированные изменения', 'Синхрондалмаған өзгерістер бар'), 'pending');
    } finally {
      state.syncing = false;
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
      .order('updated_at', { ascending: true });
    if (error) throw error;
    (data || []).forEach(doc => {
      if (!isDataKey(doc.document_key) || typeof doc.payload?.value !== 'string') return;
      localStorage.setItem(doc.document_key, doc.payload.value);
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
  function renderIosReturnToApp() {
    modal('<div class="tiin-auth tiin-welcome"><div class="tiin-auth-kicker">TIIN Cloud</div><h3>' + text('Вход через Google выполнен', 'Google арқылы кіру аяқталды') + '</h3><p>' + text('Сейчас открыт Safari — у него отдельное хранилище от установленного TIIN, поэтому здесь нет ваших операций.', 'Қазір Safari ашық — оның орнатылған TIIN-нен бөлек қоймасы бар, сондықтан операциялар мұнда жоқ.') + '</p><p class="tiin-auth-note">' + text('Нажмите ✕ в левом верхнем углу, вернитесь в TIIN с домашнего экрана и откройте круглый значок аккаунта. Там появится перенос локальных данных в аккаунт.', 'Сол жақ жоғарыдағы ✕ басыңыз, басты экрандағы TIIN-ге оралып, аккаунт белгішесін ашыңыз. Сол жерде жергілікті деректерді аккаунтқа көшіру шығады.') + '</p><button class="btn btn-gold" style="width:100%;margin-top:14px" onclick="TIINCloud.returnToApp()">' + text('Понятно — вернуться в TIIN', 'Түсіндім — TIIN-ге оралу') + '</button></div>');
  }
  function returnToApp() {
    // iOS owns the authentication sheet. This closes the page when allowed;
    // otherwise the visible × is the reliable system control.
    try { window.close(); } catch (_) {}
  }

  function renderLogin(message) {
    modal(`<div class="tiin-auth"><div class="tiin-auth-kicker">TIIN Cloud</div><h3>${text('Синхронизация между устройствами', 'Құрылғылар арасындағы синхрондау')}</h3><p>${message || text('Войдите по email. После входа вы сами подтвердите перенос локальных данных.', 'Email арқылы кіріңіз. Кейін жергілікті деректерді көшіруді өзіңіз растайсыз.')}</p><button class="btn" style="width:100%;margin-top:14px;border:1px solid rgba(255,255,255,.18);background:#fff;color:#182033" onclick="TIINCloud.signInWithGoogle()">G&nbsp; ${text('Войти через Google', 'Google арқылы кіру')}</button><div style="display:flex;align-items:center;gap:10px;margin:16px 0;color:#8f9bb2;font-size:12px"><span style="height:1px;background:currentColor;flex:1"></span>${text('или по email', 'немесе email арқылы')}<span style="height:1px;background:currentColor;flex:1"></span></div><label>${text('Email', 'Email')}</label><input id="tiinAuthEmail" class="form-input" type="email" autocomplete="email" inputmode="email" placeholder="you@example.com"><button class="btn btn-gold" style="width:100%;margin-top:14px" onclick="TIINCloud.sendMagicLink()">${text('Получить ссылку для входа', 'Кіру сілтемесін алу')}</button><button class="tx-action-cancel" onclick="closeModal()">${text('Отмена', 'Бас тарту')}</button></div>`);
  }
  async function signInWithGoogle() {
    try {
      const client = await getClient();
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: window.location.origin + window.location.pathname }
      });
      if (error) throw error;
    } catch (error) {
      renderLogin(text('Не удалось открыть вход через Google: ', 'Google арқылы кіруді ашу мүмкін болмады: ') + error.message);
    }
  }
  async function sendMagicLink() {
    const email = document.getElementById('tiinAuthEmail')?.value.trim();
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) { alert(text('Введите корректный email', 'Дұрыс email енгізіңіз')); return; }
    try {
      const client = await getClient();
      const { error } = await client.auth.signInWithOtp({
        email,
        options: { emailRedirectTo: window.location.origin + window.location.pathname }
      });
      if (error) throw error;
      renderLogin(text('Ссылка отправлена. Откройте письмо на этом устройстве и вернитесь в TIIN.', 'Сілтеме жіберілді. Осы құрылғыда хатты ашып, TIIN-ге оралыңыз.'));
    } catch (error) {
      renderLogin(text('Не удалось отправить ссылку: ', 'Сілтемені жіберу мүмкін болмады: ') + error.message);
    }
  }
  async function confirmMigration() {
    const docs = collectLocalDocuments();
    try {
      createRecoveryBackup('before_first_cloud_migration');
      setStatus(text('Синхронизация…', 'Синхрондау…'), 'busy');
      await ensureProfile();
      const client = await getClient();
      // Merge per document first: a pre-existing cloud document must never erase a different local operation.
      const { data: cloudDocs, error: cloudError } = await client.from('sync_documents').select('document_key,payload');
      if (cloudError) throw cloudError;
      const remoteByKey = new Map((cloudDocs || []).map(doc => [doc.document_key, doc.payload?.value]));
      const mergedDocs = docs.map(doc => remoteByKey.has(doc.key)
        ? { ...doc, value: mergeDocumentValues(doc.value, remoteByKey.get(doc.key)) }
        : doc);
      await uploadDocuments(mergedDocs);
      await client.from('profiles').update({
        migration_completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }).eq('user_id', state.user.id);
      localStorage.setItem(CONFIG.migrationKey, '1');
      saveQueue([]);
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
      // getSession reads the saved session locally. getUser performs a network validation
      // and could wrongly make an offline/returning PWA look signed out.
      const user = await getPersistedUser(client);
      if (!user) { renderLogin(); return; }
      state.user = user;
      const localDocs = collectLocalDocuments();
      const { data: remote, error } = await client.from('sync_documents').select('document_key').limit(1);
      if (error) throw error;
      // Never replace device data with the cloud merely because a person just signed in.
      if (!localStorage.getItem(CONFIG.migrationKey) && meaningfulDocuments(localDocs).length) {
        createRecoveryBackup('before_migration_prompt');
        renderMigration(localDocs);
        return;
      }
      if (!localStorage.getItem(CONFIG.migrationKey) && !remote?.length) {
        if (isIosBrowserOutsidePwa()) {
          renderIosReturnToApp();
          return;
        }
        modal('<div class="tiin-auth"><div class="tiin-auth-kicker">TIIN Cloud</div><h3>' + text('В аккаунте пока нет данных', 'Аккаунтта әзірге деректер жоқ') + '</h3><p>' + text('На этом устройстве тоже не найдено финансовых записей. Ничего не будет перезаписано.', 'Бұл құрылғыда да қаржылық жазбалар табылмады. Ештеңе қайта жазылмайды.') + '</p><button class="tx-action-cancel" onclick="closeModal()">' + text('Закрыть', 'Жабу') + '</button></div>');
        return;
      }
      modal(`<div class="tiin-auth"><div class="tiin-auth-kicker">TIIN Cloud</div><h3>${text('Синхронизация включена', 'Синхрондау қосулы')}</h3><p>${user.email || ''}</p><button class="btn btn-gold" style="width:100%;margin-top:14px" onclick="TIINCloud.syncNow()">${text('Синхронизировать сейчас', 'Қазір синхрондау')}</button><button class="tx-action-cancel" onclick="TIINCloud.signOut()">${text('Выйти из аккаунта', 'Аккаунттан шығу')}</button><button class="tx-action-cancel" onclick="closeModal()">${text('Закрыть', 'Жабу')}</button></div>`);
    } catch (error) {
      renderLogin(text('Подключение к облаку недоступно: ', 'Бұлтқа қосылу қолжетімсіз: ') + error.message);
    }
  }
  async function syncNow() {
    if (!state.user) return;
    try {
      const localDocs = collectLocalDocuments();
      // First device: require the explicit migration screen. A cloud read cannot wipe local records.
      if (!localStorage.getItem(CONFIG.migrationKey) && meaningfulDocuments(localDocs).length) {
        createRecoveryBackup('before_sync_migration_prompt');
        renderMigration(localDocs);
        return;
      }
      await ensureProfile();
      // New/empty device: download only if the account really contains cloud data.
      createRecoveryBackup('before_cloud_download');
      const remote = await pullCloudDocuments();
      if (!remote.length) {
        setStatus(text('В аккаунте пока нет данных', 'Аккаунтта әзірге деректер жоқ'), 'local');
        close();
        return;
      }
      localStorage.setItem(CONFIG.migrationKey, '1');
      queueDocument('templates');
      await flush();
      close();
      if (typeof window.render === 'function') window.render();
    } catch (error) { alert(error.message); }
  }
  async function signOut() {
    const client = await getClient();
    await client.auth.signOut();
    state.user = null;
    close();
    setStatus(text('Данные на устройстве', 'Құрылғыдағы деректер'), 'local');
  }
  async function boot() {
    // Snapshot existing financial data before the authentication state can trigger any cloud action.
    createRecoveryBackup('app_start');
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      nativeSetItem.call(this, key, value);
      if (this === localStorage && isDataKey(key) && key !== CONFIG.cacheKey) queueDocument(key);
    };
    window.addEventListener('online', flush);
    try {
      const client = await getClient();
      // Restore the stored session immediately, including when the phone starts offline.
      const user = await getPersistedUser(client);
      state.user = user;
      refreshAccountButton();
      if (!user) {
        setStatus(text('Данные на устройстве', 'Құрылғыдағы деректер'), 'local');
        if (!localStorage.getItem(authIntroKey) && !hasExistingFinanceData()) {
          requestAnimationFrame(renderWelcome);
        }
      } else if (localStorage.getItem(CONFIG.migrationKey)) {
        setStatus(text('Синхронизировано', 'Синхрондалды'), 'ok');
        flush();
      } else {
        setStatus(text('Нужен перенос данных', 'Деректерді көшіру керек'), 'pending');
      }
      client.auth.onAuthStateChange((event, session) => {
        state.user = session?.user || null;
        refreshAccountButton();
        // Only open the migration dialog after a real new sign-in, not after every app relaunch.
        if (state.user && event === 'SIGNED_IN') openAccount();
      });
      // iOS may suspend a PWA completely. Re-read the persisted session when it returns.
      document.addEventListener('visibilitychange', async () => {
        if (document.hidden) return;
        try {
          const returningUser = await getPersistedUser(client);
          if (returningUser) {
            state.user = returningUser;
            refreshAccountButton();
          }
        } catch (_) { /* Keep the existing UI while offline. */ }
      });
    } catch (_) {
      setStatus(text('Нет сети', 'Желі жоқ'), 'offline');
    }
  }
  window.TIINCloud = { open: openAccount, openEmailLogin: renderLogin, signInWithGoogle, sendMagicLink, confirmMigration, syncNow, signOut, continueWithoutAccount, restoreBackup: restoreRecoveryBackup, returnToApp };
  document.addEventListener('DOMContentLoaded', boot);
})();