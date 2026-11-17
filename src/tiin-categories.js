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
    ['child','👶','Ребёнок','Бала','Child'], ['family','🏠','Вся семья','Бүкіл отбасы','Whole family']
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
  window.tiinTransactionDetail = function (tx) {
    if (!tx || tx.type !== 'expense') return '';
    const detail = [subLabel(tx), people.find(p => p[0] === tx.beneficiary)?.[currentLang === 'kz' ? 3 : currentLang === 'en' ? 4 : 2]]
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
    const personId = id + 'Person', subId = id + 'Sub';
    parent.insertAdjacentHTML('beforebegin', `<div class="form-group tiin-person-group"><label>${tr('1. Для кого','1. Кім үшін','1. For whom')}</label><div class="chips" id="${personId}">${people.map(p => `<button type="button" class="chip ${tx?.beneficiary === p[0] ? 'selected' : ''}" data-id="${p[0]}" onclick="tiinSelectPerson(this,'${id}')">${p[1]} ${html(p[currentLang === 'kz' ? 3 : currentLang === 'en' ? 4 : 2])}</button>`).join('')}</div></div>`);
    parent.querySelector('label').textContent = tr('2. Категория','2. Санат','2. Category');
    parent.classList.add('tiin-category-group');
    const addButton = `<button type="button" class="tiin-manage-link" onclick="openTIINCategories()">＋ ${tr('Настроить категории','Санаттарды реттеу','Manage categories')}</button>`;
    parent.insertAdjacentHTML('afterend', addButton);
    parent.insertAdjacentHTML('afterend', `<div class="form-group tiin-sub-group"><label>${tr('3. Подкатегория','3. Ішкі санат','3. Subcategory')}</label><div class="chips" id="${subId}"></div></div>`);
    const choices = selectable('expense', tx?.category);
    host.innerHTML = choices.filter(cat => cat.id !== 'business_cost').map(cat => `<button type="button" class="chip ${tx?.category === cat.id ? 'selected' : ''}" data-id="${html(cat.id)}" onclick="tiinSelectMain(this,'${id}')">${html(cat.icon)} ${html(cat.name)}</button>`).join('') +
      `<div class="tiin-special-label">✦ ${tr('Специальная категория','Арнайы санат','Special category')}</div>` +
      choices.filter(cat => cat.id === 'business_cost').map(cat => `<button type="button" class="chip tiin-cost-chip ${tx?.category === cat.id ? 'selected' : ''}" data-id="business_cost" onclick="tiinSelectMain(this,'${id}')">🏭 ${html(cat.name)} <small>${tr('Не из бюджета на жизнь','Тұрмыс бюджетінен емес','Outside living budget')}</small></button>`).join('');
    if (isNew) parent.classList.add('tiin-await-person');
    if (tx?.category) fillSub(id, tx.category, tx.subcategory);
    else document.getElementById(subId).closest('.form-group').hidden = true;
  }
  window.tiinSelectPerson = function (button, id) {
    selectChip(button);
    document.getElementById(id)?.closest('.form-group')?.classList.remove('tiin-await-person');
  };
  window.tiinSelectMain = function (button, id) {
    selectChip(button);
    fillSub(id, button.dataset.id);
  };
  function fillSub(id, categoryId, selected) {
    const row = category(categoryId);
    const host = document.getElementById(id + 'Sub');
    if (!host) return;
    const entries = (row?.subcategories || []).filter(sub => !sub.hidden || sub.id === selected);
    host.closest('.form-group').hidden = entries.length === 0;
    host.innerHTML = entries.map(sub => `<button type="button" class="chip ${sub.id === selected ? 'selected' : ''}" data-id="${html(sub.id)}" onclick="selectChip(this)">${html(sub.name)}</button>`).join('') +
      `<button type="button" class="chip ${!selected ? 'selected' : ''}" data-id="" onclick="selectChip(this)">${tr('Без уточнения','Нақтыламай','No detail')}</button>`;
  }
  window.tiinExpenseFields = function (sourceId) {
    const id = sourceId || (document.getElementById('editCatChips') ? 'editCatChips' : 'catChips');
    const sub = document.querySelector('#' + id + 'Sub .chip.selected');
    return {beneficiary:document.querySelector('#' + id + 'Person .chip.selected')?.dataset.id || null,
      subcategory:sub?.dataset.id || null,
      subcategoryName:sub?.dataset.id ? (sub.textContent || '').trim() : null};
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
    document.getElementById('modal').innerHTML = `<div class="tiin-sheet tiin-category-manager"><div class="tiin-sheet-handle"></div><h2>✦ ${tr('Категории и подкатегории','Санаттар мен ішкі санаттар','Categories and subcategories')}</h2><p>${tr('Создавайте свои, меняйте базовые. Удалённые скрываются из выбора, история сохраняется.','Өзіңіздікін қосыңыз. Жойылғандары тарихта сақталады.','Create and edit your own. Deleted items remain in history.')}</p>
      <label class="tiin-manager-switch">${tr('Тип','Түрі','Type')} <select id="tiinManagerType" class="form-input" onchange="openTIINCategories()"><option value="expense" ${selectedType === 'expense' ? 'selected' : ''}>${tr('Расходы','Шығыстар','Expenses')}</option><option value="income" ${selectedType === 'income' ? 'selected' : ''}>${tr('Доходы','Кірістер','Income')}</option></select></label>
      <div class="tiin-manager-list">${list.map(row => `<div class="tiin-manager-card ${row.hidden ? 'is-hidden' : ''}"><div class="tiin-manager-head"><strong>${html(row.icon)} ${html(row.name)} ${row.id === 'business_cost' ? '<small>✦</small>' : ''}</strong><span><button type="button" onclick="tiinEditCategory('${html(row.id)}')">${tr('Изменить','Өзгерту','Edit')}</button><button type="button" onclick="tiinToggleCategory('${html(row.id)}')">${row.hidden ? tr('Вернуть','Қайтару','Restore') : tr('Удалить','Жою','Delete')}</button></span></div><div class="tiin-manager-sub">${(row.subcategories || []).map(sub => `<span class="tiin-sub-pill ${sub.hidden ? 'is-hidden' : ''}">${html(sub.name)} <button type="button" title="${tr('Изменить','Өзгерту','Edit')}" onclick="tiinEditSub('${html(row.id)}','${html(sub.id)}')">✎</button><button type="button" title="${sub.hidden ? tr('Вернуть','Қайтару','Restore') : tr('Удалить','Жою','Delete')}" onclick="tiinToggleSub('${html(row.id)}','${html(sub.id)}')">${sub.hidden ? '↺' : '×'}</button></span>`).join('')}<button type="button" class="tiin-add-sub" onclick="tiinEditSub('${html(row.id)}')">＋ ${tr('Подкатегория','Ішкі санат','Subcategory')}</button></div></div>`).join('')}</div>
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
  // Preserve the selected tab when re-rendering the manager after edits.
  const originalManager = manager;
  window.openTIINCategories = function () {
    const selected = document.getElementById('tiinManagerType')?.value || window.tiinManagerType || 'expense';
    window.tiinManagerType = selected;
    originalManager();
    document.getElementById('tiinManagerType').value = selected;
  };

  apply(catalog());
  const originalRender = window.render;
  window.render = function (...args) { apply(catalog()); return originalRender.apply(this, args); };
  queueMicrotask(() => window.render());
})();
