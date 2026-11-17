/* Categories have stable IDs. Hiding a category never changes historical transactions. */
(function () {
  'use strict';
  const KEY = 'tiin_category_catalog_v1';
  const legacyKey = 'custom_categories';
  const defaults = {
    credits: ['Банк', 'Кредитная карта', 'Рассрочка', 'Другое'],
    food: ['Кафе', 'Ресторан', 'Доставка', 'Перекус', 'Другое'],
    transport: ['Такси', 'Бензин', 'Общественный транспорт', 'Мопед', 'Парковка', 'Ремонт', 'Другое'],
    health: ['Врач', 'Аптека', 'Анализы', 'Стоматология', 'Другое'],
    leisure: ['Развлечения', 'Поездка', 'Спорт', 'Другое'],
    shop: ['Супермаркет', 'Рынок', 'Продуктовый', 'Бытовые товары', 'Одежда', 'Техника', 'Другое'],
    subscriptions: ['Сервисы', 'Приложения', 'Связь', 'Другое'],
    business_cost: ['Закупка', 'Материалы', 'Размещение', 'Подрядчик', 'Доставка заказа', 'Другое'],
    utilities: ['Электричество', 'Вода', 'Газ', 'Обслуживание', 'Другое'],
    internet: ['Домашний', 'Мобильный', 'Офисный', 'Другое'],
    taxes: ['Личные', 'Бизнес', 'Другое'],
    rent_home: ['Квартира', 'Дом', 'Временное жильё', 'Другое'],
    rent_office: ['Офис', 'Коворкинг', 'Другое']
  };
  const ruNames = {
    credits:'Кредиты', food:'Еда', transport:'Дорога', health:'Здоровье', leisure:'Отдых',
    extra:'Доп. расходы', rent_home:'Аренда жилья', rent_office:'Аренда офиса', internet:'Интернет',
    subscriptions:'Подписки', taxes:'Налоги', utilities:'Ком. услуги', shop:'Магазин',
    business_cost:'Себестоимость', other_exp:'Другое', salary:'Зарплата', business:'Бизнес', other_inc:'Другое'
  };
  const people = [
    ['self','👤','Я','Мен','Me'], ['wife','❤️','Жена','Жұбайым','Wife'],
    ['child','👶','Ребёнок','Бала','Child'], ['family','🏠','Общий расход','Ортақ шығыс','Shared expense']
  ];
  const tr = (ru, kk, en) => currentLang === 'kz' ? (kk || ru) : currentLang === 'en' ? (en || ru) : ru;
  const html = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uid = prefix => prefix + '_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const oldCost = name => /^(?:себеска|себестоимость)$/i.test(String(name || '').trim());
  const oldPerson = name => /^(?:жена|доча|дочь|ребёнок|ребенок|я|вся семья)$/i.test(String(name || '').trim());
  const parse = (value, fallback) => { try { return JSON.parse(value) || fallback; } catch (_) { return fallback; } };
  const get = () => parse(localStorage.getItem(KEY), []);
  const put = rows => { localStorage.setItem(KEY, JSON.stringify(rows)); apply(rows); };
  const subList = names => names.map((name, i) => ({id:'sub_' + i, name, hidden:false}));
  const recentlyUsed = () => {
    const counts = {categories:{},subs:{},items:{}};
    const now = new Date();
    for (let offset = 0; offset < 24; offset++) {
      const date = new Date(now.getFullYear(), now.getMonth() - offset, 1);
      for (const tx of getTxns(date.getFullYear(), date.getMonth())) {
        if (tx.type !== 'expense') continue;
        counts.categories[tx.category] = (counts.categories[tx.category] || 0) + 1;
        if (tx.subcategory) counts.subs[tx.category + '/' + tx.subcategory] = (counts.subs[tx.category + '/' + tx.subcategory] || 0) + 1;
        for (const item of tx.itemSelections || tx.itemBreakdown || []) counts.items[tx.category + '/' + tx.subcategory + '/' + item.id] = (counts.items[tx.category + '/' + tx.subcategory + '/' + item.id] || 0) + 1;
      }
    }
    return counts;
  };
  const sortFrequent = (entries, counts, key) => [...entries].sort((a,b) => (counts[key(b)] || 0) - (counts[key(a)] || 0));

  function initialCatalog() {
    const rows = [];
    for (const [type, list] of [['expense',EXPENSE_CATS], ['income',INCOME_CATS]]) {
      for (const cat of list) rows.push({id:cat.id, type, name:cat.custom ? cat.name : (ruNames[cat.id] || cat.name), icon:cat.icon,
        custom:!!cat.custom, renamed:!!cat.custom, hidden:!!cat.custom && (oldCost(cat.name) || oldPerson(cat.name)),
        costAlias:!!cat.custom && oldCost(cat.name), subcategories:subList(defaults[cat.id] || [])});
    }
    // Older custom categories were saved separately. Keep their original IDs.
    for (const cat of parse(localStorage.getItem(legacyKey), [])) {
      if (!rows.some(row => row.id === cat.id)) rows.push({id:cat.id, type:cat.type === 'income' ? 'income' : 'expense',
        name:cat.name, icon:cat.icon || '🏷️', custom:true, renamed:true,
        hidden:oldCost(cat.name) || oldPerson(cat.name), costAlias:oldCost(cat.name), subcategories:[]});
    }
    return rows;
  }
  function catalog() {
    let rows = get();
    if (!Array.isArray(rows) || !rows.length) { rows = initialCatalog(); put(rows); }
    // Sync can download the earlier custom-category document after this script starts.
    const legacy = parse(localStorage.getItem(legacyKey), []);
    let changed = false;
    for (const cat of Array.isArray(legacy) ? legacy : []) {
      if (!cat?.id || rows.some(row => row.id === cat.id)) continue;
      rows.push({id:cat.id, type:cat.type === 'income' ? 'income' : 'expense', name:cat.name || 'Категория',
        icon:cat.icon || '🏷️', custom:true, renamed:true,
        hidden:oldCost(cat.name) || oldPerson(cat.name), costAlias:oldCost(cat.name), subcategories:[]});
      changed = true;
    }
    if (changed) put(rows);
    return rows;
  }
  function apply(rows) {
    for (const row of rows) {
      const list = row.type === 'income' ? INCOME_CATS : EXPENSE_CATS;
      const index = list.findIndex(cat => cat.id === row.id);
      if (index < 0) list.push({id:row.id, icon:row.icon || '🏷️', name:row.name, custom:true});
      else if (row.renamed || row.custom || list[index].icon !== row.icon) {
        // Built-in names use translation getters; replace only when the user edits them.
        list[index] = {id:row.id, icon:row.icon || '🏷️', name:row.name, custom:!!row.custom};
      }
    }
  }
  function selectable(type, selected) {
    const rows = catalog(); apply(rows);
    const allowed = new Set(rows.filter(row => row.type === type && (!row.hidden || row.id === selected)).map(row => row.id));
    return (type === 'income' ? INCOME_CATS : EXPENSE_CATS).filter(cat => allowed.has(cat.id));
  }
  window.tiinSelectableCats = selectable;
  window.tiinIsCategoryActive = id => catalog().some(row => row.id === id && !row.hidden);
  window.tiinIsCostCategory = id => id === 'business_cost' || catalog().some(row => row.id === id && row.costAlias);
  function category(id) { return catalog().find(row => row.id === id); }
  function subLabel(tx) {
    const row = category(tx.category);
    return row?.subcategories?.find(sub => sub.id === tx.subcategory)?.name || tx.subcategoryName || '';
  }
  const itemName = (tx, item) => category(tx.category)?.subcategories?.find(sub => sub.id === tx.subcategory)?.items?.find(entry => entry.id === item.id)?.name || item.name || '';
  window.tiinTransactionDetail = function (tx) {
    if (!tx || tx.type !== 'expense') return '';
    const products = (tx.itemSelections || tx.itemBreakdown || []).map(item => itemName(tx,item)).join(', ');
    const detail = [subLabel(tx), products, people.find(p => p[0] === tx.beneficiary)?.[currentLang === 'kz' ? 3 : currentLang === 'en' ? 4 : 2]]
      .filter(Boolean).join(' · ');
    return detail ? detail + (tx.comment ? ' · ' + tx.comment : '') : (tx.comment || '');
  };

  const originalOpen = window.openModal;
  window.openModal = function (type) {
    apply(catalog());
    originalOpen(type);
    if (type === 'expense') picker('catChips', null, true);
    else replaceOtherChips('catChips', 'income');
  };
  const originalEdit = window.editTx;
  window.editTx = function (id) {
    const tx = getTxns(currentYear, currentMonth).find(item => String(item.id) === String(id));
    apply(catalog());
    originalEdit(id);
    if (tx?.type === 'expense') picker('editCatChips', tx, false);
    else if (tx) replaceOtherChips('editCatChips', 'income', tx.category);
  };
  function replaceOtherChips(id, type, selected) {
    const host = document.getElementById(id);
    if (!host) return;
    host.innerHTML = selectable(type, selected).map(cat => `<button type="button" class="chip ${cat.id === selected ? 'selected' : ''}" data-id="${html(cat.id)}" onclick="selectChip(this)">${html(cat.icon)} ${html(cat.name)}</button>`).join('');
  }
  function picker(id, tx, isNew) {
    const host = document.getElementById(id);
    if (!host) return;
    const parent = host.closest('.form-group');
    const personId = id + 'Person', subId = id + 'Sub', itemId = id + 'Items';
    const beneficiary = tx?.beneficiary || 'family';
    parent.insertAdjacentHTML('beforebegin', `<div class="form-group tiin-person-group"><label>${tr('1. Для кого','1. Кім үшін','1. For whom')}</label><div class="chips" id="${personId}">${people.map(p => `<button type="button" class="chip ${beneficiary === p[0] ? 'selected' : ''}" data-id="${p[0]}" onclick="tiinSelectPerson(this,'${id}')">${p[1]} ${html(p[currentLang === 'kz' ? 3 : currentLang === 'en' ? 4 : 2])}</button>`).join('')}</div></div>`);
    parent.querySelector('label').textContent = tr('2. Категория','2. Санат','2. Category');
    parent.classList.add('tiin-category-group');
    const addButton = `<button type="button" class="tiin-manage-link" onclick="openTIINCategories()">＋ ${tr('Настроить категории','Санаттарды реттеу','Manage categories')}</button>`;
    parent.insertAdjacentHTML('afterend', addButton);
    parent.insertAdjacentHTML('afterend', `<div class="form-group tiin-sub-group"><label>${tr('3. Подкатегория','3. Ішкі санат','3. Subcategory')}</label><div class="chips" id="${subId}"></div></div>`);
    document.getElementById(subId).closest('.form-group').insertAdjacentHTML('afterend', `<div class="form-group tiin-item-group" hidden><label>${tr('4. Что купили / какая услуга','4. Не сатып алдыңыз','4. What did you buy')}</label><div class="tiin-item-hint">${tr('Можно отметить несколько позиций без разбивки чека','Бір чекте бірнеше позицияны белгілеуге болады','Select several items without splitting the receipt')}</div><div class="chips" id="${itemId}"></div><div class="tiin-quick-item"><input type="text" class="form-input" id="${itemId}New" maxlength="60" placeholder="${tr('Свой товар или услуга','Өз тауарыңыз не қызметіңіз','Product or service')}" onkeydown="if(event.key==='Enter'){event.preventDefault();tiinQuickItem('${id}')}"><button type="button" onclick="tiinQuickItem('${id}')" aria-label="${tr('Добавить позицию','Позиция қосу','Add item')}">＋</button></div></div>`);
    const choices = selectable('expense', tx?.category);
    const ordinary = sortFrequent(choices.filter(cat => cat.id !== 'business_cost'), recentlyUsed().categories, cat => cat.id);
    const frequent = ordinary.slice(0, 6);
    host.innerHTML = `<div class="tiin-frequent-chips">${frequent.map(cat => mainChip(cat, id, tx)).join('')}</div>` +
      `<button type="button" class="tiin-expand-cats" aria-expanded="${!!(tx?.category && !frequent.some(cat => cat.id === tx.category))}" onclick="tiinToggleCats(this)">${tr('Все категории','Барлық санаттар','All categories')} <span>⌄</span></button>` +
      `<div class="tiin-more-chips" ${tx?.category && !frequent.some(cat => cat.id === tx.category) ? '' : 'hidden'}>${ordinary.slice(6).map(cat => mainChip(cat,id,tx)).join('')}</div>` +
      `<div class="tiin-special-label">✦ ${tr('Специальная категория','Арнайы санат','Special category')}</div>` +
      choices.filter(cat => cat.id === 'business_cost').map(cat => `<button type="button" class="chip tiin-cost-chip ${tx?.category === cat.id ? 'selected' : ''}" data-id="business_cost" onclick="tiinSelectMain(this,'${id}')">🏭 ${html(cat.name)} <small>${tr('Не из бюджета на жизнь','Тұрмыс бюджетінен емес','Outside living budget')}</small></button>`).join('');
    if (tx?.category) fillSub(id, tx.category, tx.subcategory, tx);
    else document.getElementById(subId).closest('.form-group').hidden = true;
  }
  function mainChip(cat,id,tx) { return `<button type="button" class="chip ${tx?.category === cat.id ? 'selected' : ''}" data-id="${html(cat.id)}" onclick="tiinSelectMain(this,'${id}')">${html(cat.icon)} ${html(cat.name)}</button>`; }
  window.tiinToggleCats = button => { const more = button.nextElementSibling; more.hidden = !more.hidden; button.setAttribute('aria-expanded', String(!more.hidden)); };
  window.tiinSelectPerson = function (button, id) {
    selectChip(button);
    document.getElementById(id)?.closest('.form-group')?.classList.remove('tiin-await-person');
  };
  window.tiinSelectMain = function (button, id) {
    document.querySelectorAll('#' + id + ' .chip.selected').forEach(chip => chip.classList.remove('selected'));
    button.classList.add('selected');
    fillSub(id, button.dataset.id);
  };
  function fillSub(id, categoryId, selected, tx) {
    const row = category(categoryId);
    const host = document.getElementById(id + 'Sub');
    if (!host) return;
    const entries = sortFrequent((row?.subcategories || []).filter(sub => !sub.hidden || sub.id === selected), recentlyUsed().subs, sub => categoryId + '/' + sub.id);
    host.closest('.form-group').hidden = entries.length === 0;
    host.innerHTML = entries.map(sub => `<button type="button" class="chip ${sub.id === selected ? 'selected' : ''}" data-id="${html(sub.id)}" onclick="tiinSelectSub(this,'${id}')">${html(sub.name)}</button>`).join('') +
      `<button type="button" class="chip ${!selected ? 'selected' : ''}" data-id="" onclick="tiinSelectSub(this,'${id}')">${tr('Без уточнения','Нақтыламай','No detail')}</button>`;
    fillItems(id, categoryId, selected, tx);
  }
  window.tiinSelectSub = function(button,id) { selectChip(button); fillItems(id, document.querySelector('#'+id+' .chip.selected')?.dataset.id, button.dataset.id); };
  function fillItems(id, categoryId, subId, tx) {
    const host = document.getElementById(id + 'Items'); if (!host) return;
    const group = host.closest('.form-group');
    const sub = category(categoryId)?.subcategories?.find(s => s.id === subId);
    group.hidden = !sub;
    if (!sub) { host.innerHTML = ''; return; }
    const selected = tx?.itemSelections || tx?.itemBreakdown || [];
    const items = sortFrequent((sub.items || []).filter(item => !item.hidden || selected.some(v => v.id === item.id)), recentlyUsed().items, item => categoryId+'/'+subId+'/'+item.id);
    host.innerHTML = items.map(item => `<button type="button" class="chip ${selected.some(v => v.id === item.id) ? 'selected' : ''}" data-id="${html(item.id)}" aria-pressed="${selected.some(v => v.id === item.id)}" onclick="tiinToggleItem(this,'${id}')">${html(item.name)}</button>`).join('');
  }
  window.tiinToggleItem = function(button) {
    button.classList.toggle('selected'); button.setAttribute('aria-pressed',String(button.classList.contains('selected')));
  };
  window.tiinQuickItem = function(id) {
    const cat = document.querySelector('#'+id+' .chip.selected')?.dataset.id;
    const sub = document.querySelector('#'+id+'Sub .chip.selected')?.dataset.id;
    if (!cat || !sub) return;
    const input = document.getElementById(id+'ItemsNew');
    const name = input?.value.trim();
    if (!name) return;
    const rows = catalog(), entry = rows.find(row => row.id === cat)?.subcategories?.find(row => row.id === sub);
    if (!entry) return;
    entry.items ||= []; const item = {id:uid('item'),name:name.slice(0,60),hidden:false}; entry.items.push(item); put(rows);
    fillItems(id,cat,sub);
    const chip = [...document.querySelectorAll('#'+id+'Items .chip')].find(c=>c.dataset.id===item.id); if (chip) {chip.classList.add('selected');chip.setAttribute('aria-pressed','true');}
    input.value = ''; input.focus();
  };
  window.tiinExpenseFields = function (sourceId) {
    const id = sourceId || (document.getElementById('editCatChips') ? 'editCatChips' : 'catChips');
    const sub = document.querySelector('#' + id + 'Sub .chip.selected');
    const cat = document.querySelector('#'+id+' .chip.selected')?.dataset.id;
    const itemSelections = [...document.querySelectorAll('#'+id+'Items .chip.selected')].map(chip => ({id:chip.dataset.id, name:chip.textContent.trim()}));
    return {beneficiary:document.querySelector('#' + id + 'Person .chip.selected')?.dataset.id || null,
      subcategory:sub?.dataset.id || null,
      subcategoryName:sub?.dataset.id ? (sub.textContent || '').trim() : null,
      itemSelections};
  };
  // New expenses must choose a beneficiary before the category becomes available.
  const originalSave = window.saveTx;
  window.saveTx = function (type) {
    if (type === 'expense' && !document.querySelector('#catChipsPerson .chip.selected')) {
      toast(tr('Сначала выберите, для кого расход','Алдымен кім үшін екенін таңдаңыз','Choose who the expense is for first')); return;
    }
    originalSave(type);
  };
  const originalTemplateOpen = window.openTemplateModal;
  window.openTemplateModal = function () {
    apply(catalog()); originalTemplateOpen(); picker('tplCatChips', null, true);
  };
  const originalTemplateType = window.setTemplateType;
  window.setTemplateType = function (button) {
    document.querySelector('.tiin-person-group')?.remove();
    document.querySelector('.tiin-sub-group')?.remove();
    document.querySelector('.tiin-item-group')?.remove();
    document.querySelector('.tiin-manage-link')?.remove();
    const parent = document.getElementById('tplCatChips')?.closest('.form-group');
    parent?.classList.remove('tiin-await-person');
    if (parent) parent.querySelector('label').textContent = t('category');
    originalTemplateType(button);
    if (button.dataset.id === 'expense') picker('tplCatChips', null, true);
  };
  const originalTemplateSave = window.saveTemplate;
  window.saveTemplate = function () {
    if (document.querySelector('#tplTypeChips .chip.selected')?.dataset.id === 'expense' &&
        !document.querySelector('#tplCatChipsPerson .chip.selected')) {
      toast(tr('Сначала выберите, для кого расход','Алдымен кім үшін екенін таңдаңыз','Choose who the expense is for first')); return;
    }
    originalTemplateSave();
  };

  function manager() {
    const rows = catalog(); apply(rows);
    const selectedType = document.getElementById('tiinManagerType')?.value || window.tiinManagerType || 'expense';
    const list = rows.filter(row => row.type === selectedType);
    document.getElementById('modal').innerHTML = `<div class="tiin-sheet tiin-category-manager"><div class="tiin-sheet-handle"></div><h2>✦ ${tr('Категории, подкатегории и товары','Санаттар, ішкі санаттар мен тауарлар','Categories, subcategories and items')}</h2><p>${tr('Создавайте свои, меняйте базовые. Удалённые скрываются из выбора, история сохраняется.','Өзіңіздікін қосыңыз. Жойылғандары тарихта сақталады.','Create and edit your own. Deleted items remain in history.')}</p>
      <label class="tiin-manager-switch">${tr('Тип','Түрі','Type')} <select id="tiinManagerType" class="form-input" onchange="openTIINCategories()"><option value="expense" ${selectedType === 'expense' ? 'selected' : ''}>${tr('Расходы','Шығыстар','Expenses')}</option><option value="income" ${selectedType === 'income' ? 'selected' : ''}>${tr('Доходы','Кірістер','Income')}</option></select></label>
      <div class="tiin-manager-list">${list.map(row => `<div class="tiin-manager-card ${row.hidden ? 'is-hidden' : ''}"><div class="tiin-manager-head"><strong>${html(row.icon)} ${html(row.name)} ${row.id === 'business_cost' ? '<small>✦</small>' : ''}</strong><span><button type="button" onclick="tiinEditCategory('${html(row.id)}')">${tr('Изменить','Өзгерту','Edit')}</button><button type="button" onclick="tiinToggleCategory('${html(row.id)}')">${row.hidden ? tr('Вернуть','Қайтару','Restore') : tr('Удалить','Жою','Delete')}</button></span></div><div class="tiin-manager-sub">${(row.subcategories || []).map(sub => `<span class="tiin-sub-pill ${sub.hidden ? 'is-hidden' : ''}">${html(sub.name)} <button type="button" title="${tr('Товары и услуги','Тауарлар мен қызметтер','Products and services')}" onclick="tiinManageItems('${html(row.id)}','${html(sub.id)}')">▸ ${tr('Позиции','Позициялар','Items')}</button><button type="button" title="${tr('Изменить','Өзгерту','Edit')}" onclick="tiinEditSub('${html(row.id)}','${html(sub.id)}')">✎</button><button type="button" title="${sub.hidden ? tr('Вернуть','Қайтару','Restore') : tr('Удалить','Жою','Delete')}" onclick="tiinToggleSub('${html(row.id)}','${html(sub.id)}')">${sub.hidden ? '↺' : '×'}</button></span>`).join('')}<button type="button" class="tiin-add-sub" onclick="tiinEditSub('${html(row.id)}')">＋ ${tr('Подкатегория','Ішкі санат','Subcategory')}</button></div></div>`).join('')}</div>
      <button type="button" class="btn btn-gold" onclick="tiinEditCategory()">＋ ${tr('Основная категория','Негізгі санат','Main category')}</button><button type="button" class="tiin-manage-link" onclick="closeModal()">${tr('Готово','Дайын','Done')}</button></div>`;
    document.getElementById('modalOverlay').classList.add('open');
  }
  window.openTIINCategories = manager;
  window.tiinEditCategory = function (id) {
    const row = id ? category(id) : null;
    const type = row?.type || document.getElementById('tiinManagerType')?.value || 'expense';
    document.getElementById('modal').innerHTML = `<div class="tiin-sheet tiin-category-manager"><h2>${row ? tr('Изменить категорию','Санатты өзгерту','Edit category') : tr('Новая категория','Жаңа санат','New category')}</h2>
      <div class="form-group"><label>${tr('Название','Атауы','Name')}</label><input id="tiinCatName" class="form-input" maxlength="40" value="${html(row?.name || '')}"></div><div class="form-group"><label>${tr('Эмодзи','Эмодзи','Emoji')}</label><input id="tiinCatIcon" class="form-input" maxlength="8" value="${html(row?.icon || '🏷️')}"></div><button type="button" class="btn btn-gold" onclick="tiinSaveCategory('${html(id || '')}','${type}')">${tr('Сохранить','Сақтау','Save')}</button><button type="button" class="tiin-manage-link" onclick="openTIINCategories()">${tr('Назад','Артқа','Back')}</button></div>`;
    document.getElementById('tiinCatName').focus();
  };
  window.tiinSaveCategory = function (id, type) {
    const name = document.getElementById('tiinCatName').value.trim();
    const icon = document.getElementById('tiinCatIcon').value.trim() || '🏷️';
    if (!name) { toast(tr('Введите название','Атауын енгізіңіз','Enter a name')); return; }
    const rows = catalog(), row = rows.find(item => item.id === id);
    if (row) { row.name = name; row.icon = icon; row.renamed = true; }
    else rows.push({id:uid('custom_' + type), type, name, icon, custom:true, renamed:true, hidden:false, subcategories:[]});
    put(rows); window.tiinManagerType = type; manager(); window.render?.();
  };
  window.tiinToggleCategory = function (id) {
    if (id === 'business_cost') { toast(tr('Себестоимость нельзя удалить: от неё зависит учёт баланса','Өзіндік құнды жоюға болмайды','Cost of goods cannot be deleted')); return; }
    const rows = catalog(), row = rows.find(item => item.id === id); if (!row) return;
    if (!row.hidden && !confirm(tr('Убрать категорию из выбора? Старые операции останутся.','Санатты таңдаудан алып тастау керек пе?','Remove category from choices? Past transactions stay.'))) return;
    row.hidden = !row.hidden; put(rows); manager(); window.render?.();
  };
  window.tiinEditSub = function (id, subId) {
    const row = category(id), sub = row?.subcategories?.find(item => item.id === subId);
    if (!row) return;
    document.getElementById('modal').innerHTML = `<div class="tiin-sheet tiin-category-manager"><h2>${html(row.icon)} ${html(row.name)}</h2><div class="form-group"><label>${tr('Подкатегория','Ішкі санат','Subcategory')}</label><input id="tiinSubName" class="form-input" maxlength="40" value="${html(sub?.name || '')}"></div><button type="button" class="btn btn-gold" onclick="tiinSaveSub('${html(id)}','${html(subId || '')}')">${tr('Сохранить','Сақтау','Save')}</button><button type="button" class="tiin-manage-link" onclick="openTIINCategories()">${tr('Назад','Артқа','Back')}</button></div>`;
    document.getElementById('tiinSubName').focus();
  };
  window.tiinSaveSub = function (id, subId) {
    const name = document.getElementById('tiinSubName').value.trim();
    if (!name) { toast(tr('Введите название','Атауын енгізіңіз','Enter a name')); return; }
    const rows = catalog(), row = rows.find(item => item.id === id); if (!row) return;
    const sub = row.subcategories.find(item => item.id === subId);
    if (sub) sub.name = name;
    else row.subcategories.push({id:uid('sub'), name, hidden:false});
    put(rows); manager();
  };
  window.tiinToggleSub = function (id, subId) {
    const rows = catalog(), sub = rows.find(item => item.id === id)?.subcategories?.find(item => item.id === subId);
    if (!sub) return;
    if (!sub.hidden && !confirm(tr('Убрать подкатегорию из выбора? Старые операции останутся.','Ішкі санатты таңдаудан алып тастау керек пе?','Remove subcategory from choices? Past transactions stay.'))) return;
    sub.hidden = !sub.hidden; put(rows); manager();
  };
  window.tiinManageItems = function(id, subId) {
    const row = category(id), sub = row?.subcategories?.find(s => s.id === subId); if (!sub) return;
    document.getElementById('modal').innerHTML = `<div class="tiin-sheet tiin-category-manager"><h2>${html(row.icon)} ${html(row.name)} → ${html(sub.name)}</h2><p>${tr('Товары и услуги внутри подкатегории. Их можно выбирать по несколько за одну покупку.','Ішкі санаттағы тауарлар мен қызметтер.','Products and services inside this subcategory.')}</p><div class="tiin-manager-list">${(sub.items || []).map(item => `<div class="tiin-manager-card ${item.hidden ? 'is-hidden' : ''}"><div class="tiin-manager-head"><strong>${html(item.name)}</strong><span><button type="button" onclick="tiinEditItem('${html(id)}','${html(subId)}','${html(item.id)}')">${tr('Изменить','Өзгерту','Edit')}</button><button type="button" onclick="tiinToggleItemCatalog('${html(id)}','${html(subId)}','${html(item.id)}')">${item.hidden ? tr('Вернуть','Қайтару','Restore') : tr('Удалить','Жою','Delete')}</button></span></div></div>`).join('')}</div><button type="button" class="btn btn-gold" onclick="tiinEditItem('${html(id)}','${html(subId)}')">＋ ${tr('Товар или услуга','Тауар не қызмет','Product or service')}</button><button type="button" class="tiin-manage-link" onclick="openTIINCategories()">${tr('Назад','Артқа','Back')}</button></div>`;
  };
  window.tiinEditItem = function(id,subId,itemId) {
    const item = category(id)?.subcategories?.find(s=>s.id===subId)?.items?.find(v=>v.id===itemId);
    document.getElementById('modal').innerHTML = `<div class="tiin-sheet tiin-category-manager"><h2>${item ? tr('Изменить позицию','Позицияны өзгерту','Edit item') : tr('Новая позиция','Жаңа позиция','New item')}</h2><div class="form-group"><label>${tr('Название товара или услуги','Тауар не қызмет атауы','Product or service name')}</label><input id="tiinItemName" class="form-input" maxlength="60" value="${html(item?.name || '')}"></div><button type="button" class="btn btn-gold" onclick="tiinSaveItem('${html(id)}','${html(subId)}','${html(itemId || '')}')">${tr('Сохранить','Сақтау','Save')}</button><button type="button" class="tiin-manage-link" onclick="tiinManageItems('${html(id)}','${html(subId)}')">${tr('Назад','Артқа','Back')}</button></div>`;
    document.getElementById('tiinItemName').focus();
  };
  window.tiinSaveItem = function(id,subId,itemId) {
    const name = document.getElementById('tiinItemName').value.trim(); if (!name) { toast(tr('Введите название','Атауын енгізіңіз','Enter a name'));return; }
    const rows = catalog(), sub = rows.find(r=>r.id===id)?.subcategories?.find(s=>s.id===subId); if (!sub) return;
    sub.items ||= []; const item = sub.items.find(v=>v.id===itemId);
    if (item) item.name = name; else sub.items.push({id:uid('item'),name,hidden:false});
    put(rows); window.tiinManageItems(id,subId);
  };
  window.tiinToggleItemCatalog = function(id,subId,itemId) {
    const rows = catalog(), item = rows.find(r=>r.id===id)?.subcategories?.find(s=>s.id===subId)?.items?.find(v=>v.id===itemId);
    if (!item) return;
    if (!item.hidden && !confirm(tr('Убрать позицию из выбора? История останется.','Позицияны таңдаудан алып тастайсыз ба?','Remove item from choices? History stays.'))) return;
    item.hidden = !item.hidden; put(rows); window.tiinManageItems(id,subId);
  };
  // Preserve the selected tab when re-rendering the manager after edits.
  const originalManager = manager;
  window.openTIINCategories = function () {
    const selected = document.getElementById('tiinManagerType')?.value || window.tiinManagerType || 'expense';
    window.tiinManagerType = selected;
    originalManager();
    document.getElementById('tiinManagerType').value = selected;
  };

  // An unsplit receipt is counted exactly once. Multiple selected items record
  // what appeared on the receipt, but never invent a price for each product.
  window.openAnalyticsCategory = function(categoryId) { window.tiinAnalyticsDetails(categoryId); };
  window.tiinAnalyticsDetails = function(categoryId, subId, itemId) {
    const row = category(categoryId) || {name:categoryId,icon:'•',subcategories:[]};
    const sub = row.subcategories?.find(entry => entry.id === subId);
    const rows = filterTxnsByWallet(getTxns(currentYear,currentMonth)).filter(tx => tx.type === 'expense' && tx.category === categoryId && (!subId || (tx.subcategory || '__none') === subId));
    const sum = list => list.reduce((value,tx) => value + Number(tx.amount || 0),0);
    const month = new Date(currentYear,currentMonth,1).toLocaleDateString(currentLang === 'en' ? 'en-US' : currentLang === 'kz' ? 'kk-KZ' : 'ru-RU',{month:'long',year:'numeric'});
    const itemList = tx => tx.itemSelections || tx.itemBreakdown || [];
    const grouped = new Map();
    if (!subId) {
      for (const tx of rows) {
        const key = tx.subcategory || '__none';
        if (!grouped.has(key)) grouped.set(key, {name:row.subcategories?.find(s=>s.id===key)?.name || tx.subcategoryName || tr('Без уточнения','Нақтыламай','No detail'),rows:[]});
        grouped.get(key).rows.push(tx);
      }
    } else if (!itemId) {
      for (const tx of rows) {
        const items = itemList(tx);
        const key = items.length === 1 ? items[0].id : items.length > 1 ? '__multiple' : '__none';
        const name = key === '__multiple' ? tr('Несколько позиций','Бірнеше позиция','Multiple items') : key === '__none' ? tr('Без позиции','Позициясыз','No item') : itemName(tx,items[0]);
        if (!grouped.has(key)) grouped.set(key,{name,rows:[]});
        grouped.get(key).rows.push(tx);
      }
    }
    const occurrenceId = itemId?.startsWith('@') ? itemId.slice(1) : null;
    const shown = itemId ? rows.filter(tx => occurrenceId ? itemList(tx).some(item=>item.id===occurrenceId) : itemId === '__multiple' ? itemList(tx).length > 1 : itemId === '__none' ? !itemList(tx).length : itemList(tx).length === 1 && itemList(tx)[0].id === itemId) : rows;
    const heading = itemId ? (grouped.get(itemId)?.name || (itemId === '__multiple' ? tr('Несколько позиций','Бірнеше позиция','Multiple items') : itemId === '__none' ? tr('Без позиции','Позициясыз','No item') : sub?.items?.find(item=>item.id===(occurrenceId || itemId))?.name || rows.flatMap(itemList).find(item=>item.id===(occurrenceId || itemId))?.name || itemId)) : subId ? sub?.name || rows[0]?.subcategoryName || tr('Без уточнения','Нақтыламай','No detail') : row.name;
    const groupHtml = [...grouped.entries()].sort((a,b)=>sum(b[1].rows)-sum(a[1].rows)).map(([key,group]) => `<button type="button" class="tiin-analytics-drill" onclick="tiinAnalyticsDetails('${html(categoryId)}','${html(subId || key)}'${subId ? `,'${html(key)}'` : ''})"><span>${html(group.name)}<small>${group.rows.length} ${tr('операций','операция','transactions')}</small></span><strong>${fmt(sum(group.rows))} ›</strong></button>`).join('');
    const occurrences = subId && !itemId ? (() => {
      const count = new Map();
      for (const tx of rows) for (const item of itemList(tx)) {
        const name = itemName(tx,item); const entry = count.get(item.id) || {name,count:0};entry.count++;count.set(item.id,entry);
      }
      return [...count.entries()].sort((a,b)=>b[1].count-a[1].count).map(([id,entry])=>`<button type="button" class="tiin-occurrence" onclick="tiinAnalyticsDetails('${html(categoryId)}','${html(subId)}','@${html(id)}')">${html(entry.name)} · ${entry.count} ›</button>`).join('');
    })() : '';
    const history = (itemId ? shown : []).sort((a,b)=>b.date.localeCompare(a.date)).map(tx => `<div class="tiin-analytics-history"><span>${html(tx.date)} · ${html(itemList(tx).map(item=>itemName(tx,item)).join(', ') || tx.comment || heading)}</span><b>${fmt(tx.amount)}</b></div>`).join('');
    document.getElementById('modal').innerHTML = `<div class="tiin-sheet tiin-analytics-sheet"><div class="tiin-sheet-handle"></div><button type="button" class="tiin-analytics-back" onclick="${itemId ? `tiinAnalyticsDetails('${html(categoryId)}','${html(subId)}')` : subId ? `tiinAnalyticsDetails('${html(categoryId)}')` : 'closeModal()'}">← ${tr('Назад','Артқа','Back')}</button><h2>${html(row.icon)} ${html(heading)}</h2><p>${html(month)}</p><div class="tiin-analytics-total"><small>${occurrenceId ? tr('Сумма чеков с этой позицией','Осы позициясы бар чектер сомасы','Receipts containing this item') : tr('Всего','Барлығы','Total')} · ${shown.length} ${tr('операций','операция','transactions')}</small><strong>${fmt(sum(shown))}</strong></div>${itemId === '__multiple' || occurrenceId ? `<p>${tr('Это сумма целых чеков. Цены отдельных товаров неизвестны.','Бұл толық чектер сомасы. Жеке бағалар белгісіз.','These are whole receipt totals; individual item prices are unknown.')}</p>` : ''}${groupHtml}${occurrences ? `<div class="tiin-occurrence-box"><h3>${tr('Что встречалось в чеках','Чектерде не болды','Items on receipts')}</h3><p>${tr('Частота без оценки цены отдельных товаров','Жеке баға көрсетілмейді','Frequency only; no individual prices')}</p>${occurrences}</div>` : ''}${history}</div>`;
    document.getElementById('modalOverlay').classList.add('open');
  };

  apply(catalog());
  const originalRender = window.render;
  window.render = function (...args) { apply(catalog()); return originalRender.apply(this, args); };
  if (window.visualViewport) {
    const resizeModal = () => {
      const overlay = document.getElementById('modalOverlay');
      if (!overlay?.classList.contains('open')) return;
      if (document.activeElement?.matches('#modal input, #modal textarea')) {
        overlay.style.height = window.visualViewport.height + 'px';
        overlay.style.top = window.visualViewport.offsetTop + 'px';
      } else { overlay.style.height = ''; overlay.style.top = ''; }
    };
    window.visualViewport.addEventListener('resize', resizeModal);
    window.visualViewport.addEventListener('scroll', resizeModal);
    document.addEventListener('focusout', () => setTimeout(resizeModal, 100));
  }
  const originalCloseModal = window.closeModal;
  window.closeModal = function (...args) {
    const overlay = document.getElementById('modalOverlay');
    overlay.style.height = ''; overlay.style.top = '';
    return originalCloseModal.apply(this,args);
  };
  queueMicrotask(() => window.render());
})();
