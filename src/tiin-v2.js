/* TIIN 2.0 behavior layer. It deliberately reads the legacy localStorage schema. */
(function () {
  'use strict';

  // Load v2 CSS after the legacy inline stylesheet so the new desktop layer wins.
  if (!document.getElementById('tiinV2FinalStyles')) {
    const styles = document.createElement('link');
    styles.id = 'tiinV2FinalStyles';
    styles.rel = 'stylesheet';
    styles.href = 'styles/tiin-v2.css?v=17';
    document.head.appendChild(styles);
  }

  window.localDateString = function localDateString(date = new Date()) {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
  };

  function dayTotals(txns) {
    const income = txns.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    const expense = txns.filter(tx => tx.type === 'expense').reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    return { income, expense, net: income - expense };
  }

  window.renderTransactions = function renderTransactionsV2() {
    const el = document.getElementById('tab-transactions');
    let txns = filterTxnsByWallet(getTxns(currentYear, currentMonth));
    const allTags = getAllTags();
    let filters = `<div class="filter-row"><select class="filter-select" onchange="currentTagFilter=this.value;renderTransactions()"><option value="">${currentLang === 'kz' ? 'Барлық тегтер' : 'Все теги'}</option>${allTags.map(tag => `<option value="${tag}" ${currentTagFilter === tag ? 'selected' : ''}>#${tag}</option>`).join('')}</select></div>`;
    if (currentTagFilter) txns = txns.filter(tx => tx.tags && tx.tags.includes(currentTagFilter));
    if (!txns.length) { el.innerHTML = filters + `<div class="empty"><div class="emoji">📭</div><p>${t('noTransactions')}</p></div>`; return; }
    const grouped = txns.reduce((groups, tx) => ((groups[tx.date] ||= []).push(tx), groups), {});
    const allCats = [...EXPENSE_CATS, ...INCOME_CATS];
    let html = filters;
    Object.keys(grouped).sort().forEach(date => {
      const items = grouped[date].sort((a, b) => Number(a.id) - Number(b.id));
      const d = new Date(date + 'T00:00:00');
      const label = d.toLocaleDateString(currentLang === 'kz' ? 'kk-KZ' : 'ru-RU', { weekday:'short', day:'numeric', month:'long' });
      const totals = dayTotals(items);
      // Transaction dates are historical records, not planned payments. Never mark them overdue.
      // Only show a metric when it exists, except the day's final balance which is always useful.
      const incomeMetric = totals.income > 0 ? `<span class="day-metric income"><small>${currentLang === 'kz' ? 'Кіріс' : 'Доход'}</small><b>+${fmt(totals.income)}</b></span>` : '';
      const expenseMetric = totals.expense > 0 ? `<span class="day-metric expense"><small>${currentLang === 'kz' ? 'Шығыс' : 'Расход'}</small><b>−${fmt(totals.expense)}</b></span>` : '';
      const netSign = totals.net >= 0 ? '+' : '−';
      html += `<section class="day-group"><header class="day-header"><div class="day-heading"><div class="day-title">${label}</div><div class="day-caption">${currentLang === 'kz' ? 'Күн қорытындысы' : 'Итоги дня'}</div></div><div class="day-totals">${incomeMetric}${expenseMetric}<span class="day-metric net"><small>${currentLang === 'kz' ? 'Нәтиже' : 'Итог'}</small><b>${netSign}${fmt(Math.abs(totals.net))}</b></span></div></header>`;
      items.forEach(tx => {
        const cat = allCats.find(item => item.id === tx.category) || { icon:'•', name: currentLang === 'kz' ? 'Санат' : 'Категория' };
        const isIncome = tx.type === 'income'; const tags = tx.tags?.length ? `<div class="tx-tags">${tx.tags.map(tag => `#${tag}`).join(' ')}</div>` : '';
        const wallet = tx.wallet === 'business' ? '💼 ' : '';
        // Keeping the id in a data attribute avoids invalid nested quotes in inline handlers.
        const txId = encodeURIComponent(String(tx.id));
        html += `<article class="tx-item" data-tx-id="${txId}" onclick="editTx(decodeURIComponent(this.dataset.txId))"><div class="tx-icon">${cat.icon}</div><div class="tx-info"><div class="tx-cat">${wallet}${cat.name}</div><div class="tx-comment">${tx.comment || ''}</div>${tags}</div><div class="tx-actions"><div class="tx-amount ${isIncome ? 'income' : 'expense'}">${isIncome ? '+' : '−'}${fmt(tx.amount)}</div><button class="tx-menu" type="button" aria-label="Действия с операцией" onclick="event.stopPropagation();openTxActions('${txId}')">⋮</button></div></article>`;
      });
      html += '</section>';
    });
    el.innerHTML = html;
  };

  window.openTxActions = function openTxActions(encodedId) {
    const id = decodeURIComponent(encodedId);
    const txns = getTxns(currentYear, currentMonth);
    const tx = txns.find(item => String(item.id) === String(id));
    if (!tx) return;
    const label = tx.comment || (currentLang === 'kz' ? 'Операция' : 'Операция');
    document.getElementById('modal').innerHTML = `<div class="tx-action-sheet"><div class="tx-action-title">${label}</div><div class="tx-action-subtitle">${currentLang === 'kz' ? 'Әрекетті таңдаңыз' : 'Выберите действие'}</div><button class="btn btn-gold" onclick="editTx('${String(tx.id).replace(/'/g, "\\'")}')">${currentLang === 'kz' ? 'Өзгерту' : 'Изменить'}</button><button class="btn btn-danger" style="width:100%;margin-top:10px" onclick="deleteTx('${String(tx.id).replace(/'/g, "\\'")}')">${currentLang === 'kz' ? 'Жою' : 'Удалить'}</button><button class="tx-action-cancel" onclick="closeModal()">${currentLang === 'kz' ? 'Бас тарту' : 'Отмена'}</button></div>`;
    document.getElementById('modalOverlay').classList.add('open');
  };

  window.editTx = function editTx(id) {
    const txns = getTxns(currentYear, currentMonth); const tx = txns.find(item => String(item.id) === String(id));
    if (!tx) return;
    const cats = tx.type === 'income' ? INCOME_CATS : EXPENSE_CATS;
    document.getElementById('modal').innerHTML = `<h3>${currentLang === 'kz' ? 'Операцияны өңдеу' : 'Редактировать операцию'}</h3><div class="form-group"><label>${t('amount')}</label><input type="number" class="form-input big" id="editAmount" value="${tx.amount}" inputmode="decimal"></div><div class="form-group"><label>${t('category')}</label><div class="chips" id="editCatChips">${cats.map(cat => `<div class="chip ${cat.id === tx.category ? 'selected' : ''}" data-id="${cat.id}" onclick="selectChip(this)">${cat.icon} ${cat.name}</div>`).join('')}</div></div><div class="form-group"><label>${t('comment')}</label><input class="form-input" id="editComment" value="${String(tx.comment || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;')}"></div><div class="form-group"><label>${t('tag')}</label><input class="form-input" id="editTags" value="${(tx.tags || []).join(' ')}"></div><div class="form-group"><label>${t('wallet')}</label><div class="chips" id="editWalletChips"><div class="chip ${(tx.wallet || 'personal') !== 'business' ? 'selected' : ''}" data-id="personal" onclick="selectChip(this)">👤 ${t('personal')}</div><div class="chip ${tx.wallet === 'business' ? 'selected' : ''}" data-id="business" onclick="selectChip(this)">💼 ${t('business')}</div></div></div><div class="form-group"><label>${t('date')}</label><input type="date" class="form-input" id="editDate" value="${tx.date}"></div><button class="btn btn-gold" onclick="saveEditedTx('${String(tx.id)}')">${t('save')}</button><button class="btn btn-danger" style="width:100%;margin-top:10px" onclick="deleteTx('${String(tx.id)}')">${t('delete')}</button>`;
    document.getElementById('modalOverlay').classList.add('open');
  };

  window.saveEditedTx = function saveEditedTx(id) {
    const oldTxns = getTxns(currentYear, currentMonth); const tx = oldTxns.find(item => String(item.id) === String(id));
    const amount = Number(document.getElementById('editAmount').value); const cat = document.querySelector('#editCatChips .chip.selected'); const date = document.getElementById('editDate').value;
    if (!tx || !amount || amount <= 0 || !cat || !date) { toast(t('fillAllFields')); return; }
    const comment = document.getElementById('editComment').value.trim(); const tags = document.getElementById('editTags').value.trim().split(/[\s,]+/).filter(Boolean); const wallet = document.querySelector('#editWalletChips .chip.selected')?.dataset.id || 'personal';
    const targetDate = new Date(date + 'T00:00:00'); const targetY = targetDate.getFullYear(); const targetM = targetDate.getMonth();
    saveTxns(currentYear, currentMonth, oldTxns.filter(item => String(item.id) !== String(id)));
    const target = targetY === currentYear && targetM === currentMonth ? getTxns(targetY, targetM) : getTxns(targetY, targetM);
    target.push({ ...tx, amount, category:cat.dataset.id, comment, tags, wallet, date }); saveTxns(targetY, targetM, target);
    closeModal(); toast(currentLang === 'kz' ? 'Сақталды ✓' : 'Сохранено ✓'); render();
  };


  // Start the rolling balance at the last real month near the currently viewed one.
  // This deliberately ignores unrelated old/demo records from earlier years.
  function walletTransactions(year, month) {
    return filterTxnsByWallet(getTxns(year, month));
  }

  function monthNet(year, month) {
    return walletTransactions(year, month).reduce((total, tx) => {
      const amount = Number(tx.amount || 0);
      return total + (tx.type === 'income' ? amount : -amount);
    }, 0);
  }

  function balanceAnchorKey() {
    return `tiin_balance_anchor_v2_${currentWallet || 'all'}`;
  }

  function readBalanceAnchor() {
    try {
      const saved = JSON.parse(localStorage.getItem(balanceAnchorKey()) || 'null');
      return Number.isInteger(saved?.year) && Number.isInteger(saved?.month) ? saved : null;
    } catch (_) {
      return null;
    }
  }

  function findNearestActiveMonth(year, month) {
    // Ten years is ample while still avoiding an unbounded scan.
    for (let offset = 0; offset < 120; offset += 1) {
      const id = year * 12 + month - offset;
      const testYear = Math.floor(id / 12);
      const testMonth = ((id % 12) + 12) % 12;
      if (walletTransactions(testYear, testMonth).length) return { year: testYear, month: testMonth };
    }
    return null;
  }

  function carriedBalance(year, month) {
    let anchor = readBalanceAnchor();
    const selectedId = year * 12 + month;
    if (!anchor) {
      anchor = findNearestActiveMonth(year, month);
      if (!anchor) return 0;
      // Save only the boundary of the current real finance history; transaction data stays untouched.
      localStorage.setItem(balanceAnchorKey(), JSON.stringify(anchor));
    }
    const anchorId = anchor.year * 12 + anchor.month;
    if (selectedId < anchorId) return monthNet(year, month);
    let total = 0;
    for (let id = anchorId; id <= selectedId; id += 1) {
      const testYear = Math.floor(id / 12);
      const testMonth = id % 12;
      total += monthNet(testYear, testMonth);
    }
    return total;
  }


  // Balance artwork follows the device's local time, without using UTC.
  function applyTimeAwareBalanceArtwork(hero) {
    const hour = new Date().getHours();
    const daypart = hour >= 5 && hour < 10 ? 'morning'
      : hour >= 10 && hour < 17 ? 'day'
      : hour >= 17 && hour < 21 ? 'evening'
      : 'night';
    hero.dataset.daypart = daypart;
    hero.setAttribute('data-daypart', daypart);
  }

  function upgradeDashboard() {
    const balance = document.getElementById('totalBalance');
    const summary = document.querySelector('.summary');
    if (!balance || !summary) return;
    let hero = document.querySelector('.balance-hero');
    if (!hero) {
      hero = document.createElement('section');
      hero.className = 'balance-hero';
      hero.setAttribute('aria-label', currentLang === 'kz' ? 'Жалпы баланс' : 'Общий баланс');
      hero.innerHTML = `<div class="balance-hero-top"><span class="balance-hero-label"></span><span class="sync-status">${currentLang === 'kz' ? 'Синхрондау жергілікті' : 'Данные на устройстве'}</span></div><div class="balance-hero-period"></div>`;
      summary.parentNode.insertBefore(hero, summary);
      const oldCard = balance.closest('.summary-item');
      hero.insertBefore(balance, hero.querySelector('.balance-hero-period'));
      if (oldCard) oldCard.remove();
    }
    applyTimeAwareBalanceArtwork(hero);
    hero.querySelector('.balance-hero-label').textContent = currentLang === 'kz' ? 'Жалпы баланс' : 'Общий баланс';
    hero.querySelector('.balance-hero-period').textContent = `${t('months_arr')[currentMonth]} ${currentYear}`;
    const labels = summary.querySelectorAll('.summary-item .label');
    if (labels[0]) labels[0].textContent = `${t('income')} · ${currentLang === 'kz' ? 'осы ай' : 'за месяц'}`;
    if (labels[1]) labels[1].textContent = `${t('expense')} · ${currentLang === 'kz' ? 'осы ай' : 'за месяц'}`;
    let balanceKpi = document.getElementById('balanceKpi');
    if (!balanceKpi) {
      balanceKpi = document.createElement('div');
      balanceKpi.id = 'balanceKpi';
      balanceKpi.className = 'summary-item balance-kpi';
      balanceKpi.innerHTML = '<div class="label"></div><div class="value balance"></div>';
      summary.appendChild(balanceKpi);
    }
    // Carry the verified closing balance into the next month, then apply only new operations.
    const closingBalance = carriedBalance(currentYear, currentMonth);
    balance.textContent = fmt(closingBalance);
    balanceKpi.querySelector('.label').textContent = currentLang === 'kz' ? 'АЙ СОҢЫНДАҒЫ ҚАЛДЫҚ' : 'ОСТАТОК НА КОНЕЦ МЕСЯЦА';
    balanceKpi.querySelector('.value').textContent = balance.textContent;
  }

  const originalRender = window.render;
  function buildDesktopContext() {
    const actions = document.querySelector('.actions');
    if (!actions) return;
    let panel = document.getElementById('desktopContext');
    if (!panel) {
      panel = document.createElement('aside');
      panel.id = 'desktopContext';
      panel.className = 'desktop-context';
      actions.insertAdjacentElement('afterend', panel);
    }
    const txns = filterTxnsByWallet(getTxns(currentYear, currentMonth));
    const expense = txns.filter(tx => tx.type === 'expense').reduce((sum, tx) => sum + Number(tx.amount || 0), 0);
    panel.innerHTML = `<div class="desktop-context-title">${currentLang === 'kz' ? 'Осы ай' : 'Этот месяц'}</div>
      <div class="desktop-context-number">${fmt(expense)}</div>
      <div class="desktop-context-label">${currentLang === 'kz' ? 'шығындар' : 'расходы'}</div>
      <div class="desktop-context-divider"></div>
      <div class="desktop-context-row"><span>${currentLang === 'kz' ? 'Операциялар' : 'Операции'}</span><b>${txns.length}</b></div>
      <div class="desktop-context-row"><span>${currentLang === 'kz' ? 'Деректер' : 'Данные'}</span><b class="desktop-local">${currentLang === 'kz' ? 'Құрылғыда' : 'На устройстве'}</b></div>
      <button class="desktop-context-action" onclick="switchTab('analytics')">${currentLang === 'kz' ? 'Аналитиканы ашу' : 'Открыть аналитику'} →</button>`;
  }

  window.render = function renderV2() {
    originalRender();
    upgradeDashboard();
    buildDesktopContext();
    ensurePlanningAccess();
  };
  window.deleteTx = function deleteTxV2(id) {
    if (!confirm(t('confirmDelete'))) return;
    const txns = getTxns(currentYear, currentMonth);
    const remaining = txns.filter(item => String(item.id) !== String(id));
    if (remaining.length === txns.length) return;
    saveTxns(currentYear, currentMonth, remaining);
    closeModal();
    toast(t('deleted'));
    render();
  };
  // Sheet dismissal works with both iOS touch events and desktop pointer events.
  (function enableModalDragDismiss() {
    const overlay = document.getElementById('modalOverlay');
    const modal = document.getElementById('modal');
    if (!overlay || !modal) return;
    let startY = null, currentY = null, dragging = false;

    function begin(y) {
      const top = modal.getBoundingClientRect().top;
      if (y - top > 86) return false;
      startY = y; currentY = y; dragging = true;
      modal.style.transition = 'none';
      return true;
    }
    function move(y, event) {
      if (!dragging || startY === null) return;
      currentY = y;
      const distance = Math.max(0, y - startY);
      if (distance > 0) event?.preventDefault?.();
      modal.style.transform = `translateY(${Math.min(distance, 260)}px)`;
    }
    function end() {
      if (!dragging) return;
      const distance = Math.max(0, (currentY || startY) - startY);
      dragging = false; startY = null; currentY = null;
      modal.style.transition = '';
      modal.style.transform = '';
      if (distance >= 72) closeModal();
    }
    modal.addEventListener('pointerdown', event => {
      if (begin(event.clientY)) modal.setPointerCapture?.(event.pointerId);
    });
    modal.addEventListener('pointermove', event => move(event.clientY, event));
    modal.addEventListener('pointerup', end);
    modal.addEventListener('pointercancel', end);
    modal.addEventListener('touchstart', event => begin(event.touches[0].clientY), { passive: true });
    modal.addEventListener('touchmove', event => move(event.touches[0].clientY, event), { passive: false });
    modal.addEventListener('touchend', end);
    modal.addEventListener('touchcancel', end);
  }());

  // === Planning lists =======================================================
  // Planned items are intentionally separate from transactions until confirmed.
  const PLANNING_STORAGE_KEY = 'planning_lists';
  let planningView = 'active';
  let planningOpenListId = null;

  const planningText = {
    ru: {
      title: 'Списки', newList: '+ Новый список', expenses: 'Расходы', incomes: 'Доходы',
      active: 'Активные', archived: 'Архив', all: 'Все', planned: 'Запланировано',
      confirmed: 'Подтверждено', remaining: 'Осталось', create: 'Создать список',
      listName: 'Название списка', listType: 'Тип списка', planExpense: 'План расходов',
      planIncome: 'План доходов', wallet: 'Кошелёк', dateOptional: 'Плановая дата',
      commentOptional: 'Комментарий', addItem: '+ Добавить пункт', noLists: 'Пока нет списков',
      noListsHint: 'Запланируйте покупки, поездку или ожидаемые доходы — финансы изменятся только после подтверждения.',
      listDetails: 'Детали списка', itemName: 'Название пункта', quantity: 'Количество',
      unit: 'Единица', unitPlaceholder: 'шт., уп., мес.', unitPrice: 'Цена за единицу',
      plannedAmount: 'Плановая сумма', category: 'Категория', tags: 'Теги',
      save: 'Сохранить', cancel: 'Отмена', confirmExpense: 'Подтвердить расход',
      confirmIncome: 'Подтвердить доход', actualAmount: 'Фактическая сумма',
      confirm: 'Подтвердить', completed: 'Приобретено', received: 'Получено',
      plannedStatus: 'Планируется', cancelled: 'Отменено', actual: 'Фактически',
      edit: 'Изменить', archive: 'В архив', restore: 'Восстановить', duplicate: 'Дублировать',
      delete: 'Удалить', listActions: 'Действия со списком', itemActions: 'Действия с пунктом',
      completedOf: 'выполнено', difference: 'Отклонение', back: 'Назад',
      revertTitle: 'Снять отметку?', keepOperation: 'Оставить финансовую операцию',
      deleteOperation: 'Удалить связанную операцию', deleteOperationHint: 'Расход/доход будет удалён после подтверждения.',
      linkedOperation: 'Операция создана', missingAmount: 'Укажите сумму', enterName: 'Введите название',
      noPrice: 'Цена не указана', confirmDeleteList: 'Удалить список и все его пункты?',
      confirmDeleteItem: 'Удалить этот пункт?', completedTotal: 'Фактически подтверждено'
    },
    kz: {
      title: 'Тізімдер', newList: '+ Жаңа тізім', expenses: 'Шығыстар', incomes: 'Кірістер',
      active: 'Белсенді', archived: 'Мұрағат', all: 'Барлығы', planned: 'Жоспарланған',
      confirmed: 'Расталған', remaining: 'Қалды', create: 'Тізім құру',
      listName: 'Тізім атауы', listType: 'Тізім түрі', planExpense: 'Шығыс жоспары',
      planIncome: 'Кіріс жоспары', wallet: 'Әмиян', dateOptional: 'Жоспарланған күн',
      commentOptional: 'Түсініктеме', addItem: '+ Тармақ қосу', noLists: 'Тізімдер жоқ',
      noListsHint: 'Сатып алуды, сапарды не күтілетін кірісті жоспарлаңыз — қаржы тек растаудан кейін өзгереді.',
      listDetails: 'Тізім деректері', itemName: 'Тармақ атауы', quantity: 'Саны',
      unit: 'Өлшемі', unitPlaceholder: 'дана, қапт., ай', unitPrice: 'Бірлік бағасы',
      plannedAmount: 'Жоспарланған сома', category: 'Санат', tags: 'Тегтер',
      save: 'Сақтау', cancel: 'Бас тарту', confirmExpense: 'Шығысты растау',
      confirmIncome: 'Кірісті растау', actualAmount: 'Нақты сома',
      confirm: 'Растау', completed: 'Сатып алынды', received: 'Алынды',
      plannedStatus: 'Жоспарда', cancelled: 'Бас тартылды', actual: 'Нақты',
      edit: 'Өзгерту', archive: 'Мұрағатқа', restore: 'Қалпына келтіру', duplicate: 'Көшіру',
      delete: 'Жою', listActions: 'Тізім әрекеттері', itemActions: 'Тармақ әрекеттері',
      completedOf: 'орындалды', difference: 'Айырма', back: 'Артқа',
      revertTitle: 'Белгіні алып тастау?', keepOperation: 'Қаржы операциясын қалдыру',
      deleteOperation: 'Байланысты операцияны жою', deleteOperationHint: 'Шығыс/кіріс расталғаннан кейін жойылады.',
      linkedOperation: 'Операция жасалды', missingAmount: 'Соманы енгізіңіз', enterName: 'Атауды енгізіңіз',
      noPrice: 'Баға көрсетілмеген', confirmDeleteList: 'Тізімді және барлық тармақтарды жою керек пе?',
      confirmDeleteItem: 'Бұл тармақты жою керек пе?', completedTotal: 'Нақты расталған'
    }
  };

  function pt(key) { return planningText[currentLang]?.[key] || planningText.ru[key] || key; }
  function esc(value) {
    return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function getPlanningLists() {
    try {
      const lists = JSON.parse(localStorage.getItem(PLANNING_STORAGE_KEY) || '[]');
      return Array.isArray(lists) ? lists : [];
    } catch (_) { return []; }
  }
  function savePlanningLists(lists) {
    localStorage.setItem(PLANNING_STORAGE_KEY, JSON.stringify(lists));
  }
  function planningList(id) { return getPlanningLists().find(list => list.id === id); }
  function listMetrics(list) {
    const items = list.items || [];
    const active = items.filter(item => item.status !== 'cancelled');
    const completed = active.filter(item => item.status === 'completed');
    const planned = active.reduce((sum, item) => sum + Number(item.plannedAmount || 0), 0);
    const completedTotal = completed.reduce((sum, item) => sum + Number(item.actualAmount ?? item.plannedAmount ?? 0), 0);
    const completedPlan = completed.reduce((sum, item) => sum + Number(item.plannedAmount || 0), 0);
    return { planned, completedTotal, remaining: planned - completedPlan, completedCount: completed.length, activeCount: active.length };
  }
  function moneyInput(value) { return Number(value || 0); }
  function listTypeLabel(type) { return type === 'income' ? pt('planIncome') : pt('planExpense'); }
  function listStatusPill(list) {
    return '<span class="planning-type ' + list.type + '">' + (list.type === 'income' ? '↑' : '↓') + ' ' + listTypeLabel(list.type) + '</span>';
  }
  function formatPlanningDate(value) {
    if (!value) return '';
    try { return new Date(value + 'T00:00:00').toLocaleDateString(currentLang === 'kz' ? 'kk-KZ' : 'ru-RU', { day: 'numeric', month: 'short' }); } catch (_) { return value; }
  }
  function planningWalletLabel(wallet) { return wallet === 'business' ? '💼 ' + t('business') : '👤 ' + t('personal'); }

  function ensurePlanningAccess() {
    const templates = document.getElementById('templatesScroll');
    if (templates && !document.getElementById('planningAccess')) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = 'planningAccess';
      button.className = 'template-chip planning-access';
      button.innerHTML = '☷ <span>' + pt('title') + '</span>';
      button.onclick = window.openPlanning;
      templates.appendChild(button);
    }
    const container = document.querySelector('.container');
    if (container && !document.getElementById('tab-planning')) {
      const panel = document.createElement('div');
      panel.id = 'tab-planning';
      panel.className = 'tab-content';
      container.appendChild(panel);
    }
  }

  window.openPlanning = function openPlanning() {
    ensurePlanningAccess();
    planningOpenListId = null;
    switchTab('planning');
  };

  function planningCategories(type) {
    return type === 'income' ? INCOME_CATS : EXPENSE_CATS;
  }

  function renderPlanning() {
    ensurePlanningAccess();
    const host = document.getElementById('tab-planning');
    if (!host) return;
    const lists = getPlanningLists();
    if (planningOpenListId) {
      const list = lists.find(item => item.id === planningOpenListId);
      if (list) { renderPlanningDetail(host, list); return; }
      planningOpenListId = null;
    }
    const visible = lists.filter(list => {
      if (planningView === 'active') return list.status !== 'archived';
      if (planningView === 'archived') return list.status === 'archived';
      if (planningView === 'expense') return list.status !== 'archived' && list.type === 'expense';
      if (planningView === 'income') return list.status !== 'archived' && list.type === 'income';
      return true;
    });
    host.innerHTML = '<section class="planning-screen">' +
      '<div class="planning-header"><div><div class="planning-eyebrow">' + pt('title') + '</div><h2>' + pt('title') + '</h2></div><button class="planning-add" onclick="openPlanningListModal()">＋ ' + pt('newList').replace('+ ', '') + '</button></div>' +
      '<div class="planning-filters">' +
      [['active',pt('active')],['expense',pt('expenses')],['income',pt('incomes')],['archived',pt('archived')]].map(filter => '<button class="' + (planningView === filter[0] ? 'active' : '') + '" onclick="setPlanningView(\'' + filter[0] + '\')">' + filter[1] + '</button>').join('') +
      '</div>' +
      (visible.length ? '<div class="planning-list-grid">' + visible.map(renderPlanningCard).join('') + '</div>' :
        '<div class="planning-empty"><div class="planning-empty-icon">☷</div><h3>' + pt('noLists') + '</h3><p>' + pt('noListsHint') + '</p><button class="btn btn-gold" onclick="openPlanningListModal()">' + pt('newList') + '</button></div>') +
      '</section>';
  }

  function renderPlanningCard(list) {
    const m = listMetrics(list);
    const progress = m.activeCount ? Math.round(m.completedCount / m.activeCount * 100) : 0;
    const meta = [planningWalletLabel(list.wallet), formatPlanningDate(list.plannedDate)].filter(Boolean).join(' · ');
    return '<article class="planning-card" onclick="openPlanningList(\'' + list.id + '\')">' +
      '<div class="planning-card-top"><div>' + listStatusPill(list) + '<h3>' + esc(list.title) + '</h3><p>' + esc(meta) + '</p></div><button class="planning-menu" onclick="event.stopPropagation();openPlanningListActions(\'' + list.id + '\')" aria-label="' + pt('listActions') + '">⋮</button></div>' +
      '<div class="planning-progress"><span style="width:' + progress + '%"></span></div><div class="planning-progress-label">' + m.completedCount + '/' + m.activeCount + ' ' + pt('completedOf') + '</div>' +
      '<div class="planning-metrics"><div><small>' + pt('planned') + '</small><b>' + fmt(m.planned) + '</b></div><div><small>' + pt('confirmed') + '</small><b class="' + list.type + '">' + fmt(m.completedTotal) + '</b></div><div><small>' + pt('remaining') + '</small><b>' + fmt(m.remaining) + '</b></div></div>' +
      '</article>';
  }

  window.setPlanningView = function setPlanningView(view) { planningView = view; planningOpenListId = null; renderPlanning(); };
  window.openPlanningList = function openPlanningList(id) { planningOpenListId = id; renderPlanning(); };
  window.closePlanningList = function closePlanningList() { planningOpenListId = null; renderPlanning(); };

  function renderPlanningDetail(host, list) {
    const m = listMetrics(list);
    const itemRows = (list.items || []).map(item => renderPlanningItem(list, item)).join('') || '<div class="planning-empty compact"><p>' + pt('noListsHint') + '</p></div>';
    host.innerHTML = '<section class="planning-screen planning-detail">' +
      '<div class="planning-detail-head"><button class="planning-back" onclick="closePlanningList()">←</button><div class="planning-title-wrap">' + listStatusPill(list) + '<h2>' + esc(list.title) + '</h2><p>' + esc(planningWalletLabel(list.wallet)) + (list.comment ? ' · ' + esc(list.comment) : '') + '</p></div><button class="planning-menu large" onclick="openPlanningListActions(\'' + list.id + '\')">⋮</button></div>' +
      '<div class="planning-summary"><div><small>' + pt('planned') + '</small><b>' + fmt(m.planned) + '</b></div><div><small>' + pt('completedTotal') + '</small><b class="' + list.type + '">' + fmt(m.completedTotal) + '</b></div><div><small>' + pt('remaining') + '</small><b>' + fmt(m.remaining) + '</b></div></div>' +
      '<div class="planning-detail-subhead"><span>' + m.completedCount + '/' + m.activeCount + ' ' + pt('completedOf') + '</span><button class="planning-add small" onclick="openPlanningItemModal(\'' + list.id + '\')">＋ ' + pt('addItem').replace('+ ', '') + '</button></div>' +
      '<div class="planning-items">' + itemRows + '</div>' +
      '</section>';
  }

  function renderPlanningItem(list, item) {
    const completed = item.status === 'completed';
    const cancelled = item.status === 'cancelled';
    const statusLabel = completed ? (list.type === 'income' ? pt('received') : pt('completed')) : (cancelled ? pt('cancelled') : pt('plannedStatus'));
    const amount = completed ? Number(item.actualAmount ?? item.plannedAmount ?? 0) : Number(item.plannedAmount || 0);
    const plannedText = item.plannedAmount ? fmt(item.plannedAmount) : pt('noPrice');
    const actualLine = completed ? '<span class="planning-item-actual">' + pt('actual') + ': ' + fmt(amount) + '</span>' : '';
    const qty = Number(item.quantity || 1) > 1 ? ' · ' + item.quantity + (item.unit ? ' ' + esc(item.unit) : '') : '';
    return '<article class="planning-item ' + (completed ? 'is-completed' : '') + (cancelled ? ' is-cancelled' : '') + '">' +
      '<button class="planning-check" aria-label="' + statusLabel + '" onclick="' + (completed ? 'openPlanningRevertModal' : 'openPlanningConfirmModal') + '(\'' + list.id + '\',\'' + item.id + '\')" ' + (cancelled ? 'disabled' : '') + '>' + (completed ? '✓' : '') + '</button>' +
      '<div class="planning-item-main" onclick="openPlanningItemModal(\'' + list.id + '\',\'' + item.id + '\')"><div class="planning-item-title">' + esc(item.title) + '</div><div class="planning-item-meta">' + statusLabel + qty + (item.category ? ' · ' + esc(item.category) : '') + '</div>' + actualLine + '</div>' +
      '<div class="planning-item-right"><b class="' + list.type + '">' + plannedText + '</b><button class="planning-menu" onclick="openPlanningItemActions(\'' + list.id + '\',\'' + item.id + '\')">⋮</button></div>' +
      '</article>';
  }

  function selectedChipHtml(id, label, selected) { return '<button type="button" class="chip ' + (selected ? 'selected' : '') + '" data-id="' + esc(id) + '" onclick="selectChip(this)">' + label + '</button>'; }

  window.openPlanningListModal = function openPlanningListModal(id) {
    const list = id ? planningList(id) : null;
    const draft = list || { title:'', type:'expense', wallet: currentWallet === 'business' ? 'business' : 'personal', plannedDate:'', comment:'', tags:[] };
    document.getElementById('modal').innerHTML = '<h3>' + (list ? pt('edit') : pt('newList')) + '</h3>' +
      '<div class="form-group"><label>' + pt('listName') + '</label><input class="form-input" id="planningListTitle" value="' + esc(draft.title) + '" placeholder="' + pt('listName') + '"></div>' +
      '<div class="form-group"><label>' + pt('listType') + '</label><div class="chips" id="planningTypeChips">' +
      selectedChipHtml('expense','↓ ' + pt('planExpense'),draft.type === 'expense') + selectedChipHtml('income','↑ ' + pt('planIncome'),draft.type === 'income') + '</div></div>' +
      '<div class="form-group"><label>' + pt('wallet') + '</label><div class="chips" id="planningWalletChips">' +
      selectedChipHtml('personal','👤 ' + t('personal'),draft.wallet !== 'business') + selectedChipHtml('business','💼 ' + t('business'),draft.wallet === 'business') + '</div></div>' +
      '<div class="form-group"><label>' + pt('dateOptional') + '</label><input type="date" class="form-input" id="planningListDate" value="' + esc(draft.plannedDate || '') + '"></div>' +
      '<div class="form-group"><label>' + pt('commentOptional') + '</label><input class="form-input" id="planningListComment" value="' + esc(draft.comment || '') + '"></div>' +
      '<div class="form-group"><label>' + pt('tags') + '</label><input class="form-input" id="planningListTags" value="' + esc((draft.tags || []).join(' ')) + '" placeholder="#"></div>' +
      '<button class="btn btn-gold" onclick="savePlanningList(' + (list ? '\'' + list.id + '\'' : 'null') + ')">' + pt('save') + '</button>';
    document.getElementById('modalOverlay').classList.add('open');
  };

  window.savePlanningList = function savePlanningList(id) {
    const title = document.getElementById('planningListTitle').value.trim();
    if (!title) { toast(pt('enterName')); return; }
    const type = document.querySelector('#planningTypeChips .chip.selected')?.dataset.id || 'expense';
    const wallet = document.querySelector('#planningWalletChips .chip.selected')?.dataset.id || 'personal';
    const date = document.getElementById('planningListDate').value || null;
    const comment = document.getElementById('planningListComment').value.trim();
    const tags = document.getElementById('planningListTags').value.trim().split(/[\\s,]+/).filter(Boolean);
    const lists = getPlanningLists();
    if (id) {
      const list = lists.find(item => item.id === id);
      if (!list) return;
      Object.assign(list, { title, type, wallet, plannedDate: date, comment, tags, updatedAt: new Date().toISOString() });
    } else {
      const now = new Date().toISOString();
      const list = { id: 'plan-' + Date.now(), title, type, wallet, plannedDate:date, comment, tags, status:'active', createdAt:now, updatedAt:now, items:[] };
      lists.unshift(list);
      planningOpenListId = list.id;
    }
    savePlanningLists(lists); closeModal(); renderPlanning();
  };

  window.openPlanningItemModal = function openPlanningItemModal(listId, itemId) {
    const list = planningList(listId); if (!list) return;
    const item = itemId ? list.items.find(row => row.id === itemId) : null;
    const draft = item || { title:'', quantity:1, unit:'шт.', plannedUnitPrice:'', plannedAmount:0, category:'', tags:[], plannedDate:list.plannedDate || '', comment:'' };
    const categories = planningCategories(list.type);
    document.getElementById('modal').innerHTML = '<h3>' + (item ? pt('edit') : pt('addItem')) + '</h3>' +
      '<div class="form-group"><label>' + pt('itemName') + '</label><input class="form-input" id="planningItemTitle" value="' + esc(draft.title) + '"></div>' +
      '<div class="planning-dual"><div class="form-group"><label>' + pt('quantity') + '</label><input type="number" min="0.01" step="any" class="form-input" id="planningItemQty" value="' + Number(draft.quantity || 1) + '"></div><div class="form-group"><label>' + pt('unit') + '</label><input class="form-input" id="planningItemUnit" value="' + esc(draft.unit || '') + '" placeholder="' + pt('unitPlaceholder') + '"></div></div>' +
      '<div class="form-group"><label>' + pt('unitPrice') + '</label><input type="number" min="0" step="any" class="form-input" id="planningItemPrice" value="' + (draft.plannedUnitPrice ?? '') + '" placeholder="0"></div>' +
      '<div class="form-group"><label>' + pt('category') + '</label><div class="chips" id="planningCatChips">' + categories.map(cat => selectedChipHtml(cat.id,cat.icon + ' ' + cat.name,cat.id === draft.category)).join('') + '</div></div>' +
      '<div class="form-group"><label>' + pt('dateOptional') + '</label><input type="date" class="form-input" id="planningItemDate" value="' + esc(draft.plannedDate || '') + '"></div>' +
      '<div class="form-group"><label>' + pt('commentOptional') + '</label><input class="form-input" id="planningItemComment" value="' + esc(draft.comment || '') + '"></div>' +
      '<div class="form-group"><label>' + pt('tags') + '</label><input class="form-input" id="planningItemTags" value="' + esc((draft.tags || []).join(' ')) + '"></div>' +
      '<button class="btn btn-gold" onclick="savePlanningItem(\'' + listId + '\',' + (item ? '\'' + item.id + '\'' : 'null') + ')">' + pt('save') + '</button>';
    document.getElementById('modalOverlay').classList.add('open');
  };

  window.savePlanningItem = function savePlanningItem(listId, itemId) {
    const title = document.getElementById('planningItemTitle').value.trim();
    if (!title) { toast(pt('enterName')); return; }
    const quantity = Math.max(0.01, Number(document.getElementById('planningItemQty').value || 1));
    const priceRaw = document.getElementById('planningItemPrice').value;
    const price = priceRaw === '' ? null : Math.max(0, Number(priceRaw));
    const list = planningList(listId); if (!list) return;
    const payload = {
      title, quantity, unit: document.getElementById('planningItemUnit').value.trim(),
      plannedUnitPrice: price, plannedAmount: price === null ? 0 : quantity * price,
      category: document.querySelector('#planningCatChips .chip.selected')?.dataset.id || null,
      plannedDate: document.getElementById('planningItemDate').value || null,
      comment: document.getElementById('planningItemComment').value.trim(),
      tags: document.getElementById('planningItemTags').value.trim().split(/[\\s,]+/).filter(Boolean)
    };
    const lists = getPlanningLists(); const target = lists.find(row => row.id === listId); if (!target) return;
    if (itemId) {
      const old = target.items.find(row => row.id === itemId); if (!old) return;
      Object.assign(old, payload);
    } else target.items.push({ id:'plan-item-' + Date.now(), status:'planned', actualAmount:null, transactionId:null, completedAt:null, ...payload });
    target.updatedAt = new Date().toISOString(); savePlanningLists(lists); closeModal(); renderPlanning();
  };

  function findTransactionById(id) {
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      const match = key && key.match(/^txns_(\d{4})_(\d{1,2})$/);
      if (!match) continue;
      const records = getTxns(Number(match[1]), Number(match[2]));
      const found = records.find(tx => String(tx.id) === String(id));
      if (found) return { tx: found, year: Number(match[1]), month: Number(match[2]) };
    }
    return null;
  }

  window.openPlanningConfirmModal = function openPlanningConfirmModal(listId, itemId) {
    const list = planningList(listId); const item = list?.items.find(row => row.id === itemId); if (!list || !item) return;
    const categories = planningCategories(list.type);
    const defaultAmount = item.plannedAmount || '';
    document.getElementById('modal').innerHTML = '<h3>' + (list.type === 'income' ? pt('confirmIncome') : pt('confirmExpense')) + '</h3>' +
      '<p class="planning-modal-description">' + esc(item.title) + '</p>' +
      '<div class="form-group"><label>' + pt('actualAmount') + '</label><input type="number" min="0.01" step="any" class="form-input big" id="planningActualAmount" value="' + defaultAmount + '"></div>' +
      '<div class="form-group"><label>' + t('date') + '</label><input type="date" class="form-input" id="planningActualDate" value="' + localDateString() + '"></div>' +
      '<div class="form-group"><label>' + pt('category') + '</label><div class="chips" id="planningConfirmCat">' + categories.map(cat => selectedChipHtml(cat.id,cat.icon + ' ' + cat.name,cat.id === item.category)).join('') + '</div></div>' +
      '<div class="form-group"><label>' + pt('wallet') + '</label><div class="chips" id="planningConfirmWallet">' + selectedChipHtml('personal','👤 ' + t('personal'),list.wallet !== 'business') + selectedChipHtml('business','💼 ' + t('business'),list.wallet === 'business') + '</div></div>' +
      '<button class="btn btn-gold" onclick="confirmPlanningItem(\'' + listId + '\',\'' + itemId + '\')">' + pt('confirm') + '</button>';
    document.getElementById('modalOverlay').classList.add('open');
  };

  window.confirmPlanningItem = function confirmPlanningItem(listId, itemId) {
    const amount = Number(document.getElementById('planningActualAmount').value);
    const date = document.getElementById('planningActualDate').value;
    const list = planningList(listId); const item = list?.items.find(row => row.id === itemId);
    if (!list || !item || !amount || amount <= 0) { toast(pt('missingAmount')); return; }
    if (item.transactionId) { toast(pt('linkedOperation')); closeModal(); return; }
    const category = document.querySelector('#planningConfirmCat .chip.selected')?.dataset.id || item.category || planningCategories(list.type)[0]?.id;
    const wallet = document.querySelector('#planningConfirmWallet .chip.selected')?.dataset.id || list.wallet;
    const targetDate = new Date(date + 'T00:00:00'); const year = targetDate.getFullYear(); const month = targetDate.getMonth();
    const tx = { id: Date.now(), type:list.type, amount, category, comment:item.comment || list.comment || item.title, tags:[...(list.tags || []), ...(item.tags || [])], wallet, date, planningListId:listId, planningItemId:itemId };
    const transactions = getTxns(year, month); transactions.push(tx); saveTxns(year, month, transactions);
    const lists = getPlanningLists(); const target = lists.find(row => row.id === listId); const targetItem = target?.items.find(row => row.id === itemId);
    if (targetItem) Object.assign(targetItem, { status:'completed', actualAmount:amount, transactionId:String(tx.id), completedAt:new Date().toISOString(), category, plannedDate: item.plannedDate || date });
    if (target) target.updatedAt = new Date().toISOString();
    savePlanningLists(lists); closeModal(); toast(list.type === 'income' ? t('incomeAdded') : t('expenseAdded')); render(); renderPlanning();
  };

  window.openPlanningRevertModal = function openPlanningRevertModal(listId, itemId) {
    const list = planningList(listId); const item = list?.items.find(row => row.id === itemId); if (!list || !item) return;
    document.getElementById('modal').innerHTML = '<div class="tx-action-sheet"><div class="tx-action-title">' + pt('revertTitle') + '</div><div class="tx-action-subtitle">' + esc(item.title) + '</div>' +
      '<button class="btn btn-gold" onclick="revertPlanningItem(\'' + listId + '\',\'' + itemId + '\',false)">' + pt('keepOperation') + '</button>' +
      '<button class="btn btn-danger" style="width:100%;margin-top:10px" onclick="revertPlanningItem(\'' + listId + '\',\'' + itemId + '\',true)">' + pt('deleteOperation') + '</button>' +
      '<p class="planning-delete-hint">' + pt('deleteOperationHint') + '</p><button class="tx-action-cancel" onclick="closeModal()">' + pt('cancel') + '</button></div>';
    document.getElementById('modalOverlay').classList.add('open');
  };

  window.revertPlanningItem = function revertPlanningItem(listId, itemId, deleteLinked) {
    const lists = getPlanningLists(); const list = lists.find(row => row.id === listId); const item = list?.items.find(row => row.id === itemId); if (!item) return;
    if (deleteLinked && item.transactionId) {
      const found = findTransactionById(item.transactionId);
      if (found && !confirm(pt('deleteOperation') + '?')) return;
      if (found) saveTxns(found.year, found.month, getTxns(found.year, found.month).filter(tx => String(tx.id) !== String(item.transactionId)));
    }
    Object.assign(item, { status:'planned', actualAmount:null, transactionId:null, completedAt:null });
    list.updatedAt = new Date().toISOString(); savePlanningLists(lists); closeModal(); render(); renderPlanning();
  };

  window.openPlanningListActions = function openPlanningListActions(id) {
    const list = planningList(id); if (!list) return;
    const archiveLabel = list.status === 'archived' ? pt('restore') : pt('archive');
    document.getElementById('modal').innerHTML = '<div class="tx-action-sheet"><div class="tx-action-title">' + esc(list.title) + '</div><div class="tx-action-subtitle">' + pt('listActions') + '</div>' +
      '<button class="btn btn-gold" onclick="openPlanningListModal(\'' + id + '\')">' + pt('edit') + '</button>' +
      '<button class="tx-action-cancel" onclick="duplicatePlanningList(\'' + id + '\')">' + pt('duplicate') + '</button>' +
      '<button class="tx-action-cancel" onclick="togglePlanningArchive(\'' + id + '\')">' + archiveLabel + '</button>' +
      '<button class="btn btn-danger" style="width:100%;margin-top:10px" onclick="deletePlanningList(\'' + id + '\')">' + pt('delete') + '</button></div>';
    document.getElementById('modalOverlay').classList.add('open');
  };
  window.duplicatePlanningList = function duplicatePlanningList(id) {
    const lists = getPlanningLists(); const source = lists.find(row => row.id === id); if (!source) return;
    const copy = JSON.parse(JSON.stringify(source)); copy.id = 'plan-' + Date.now(); copy.title = source.title + ' — копия'; copy.status = 'active'; copy.createdAt = new Date().toISOString(); copy.updatedAt = copy.createdAt;
    copy.items = copy.items.map((item, index) => ({ ...item, id:'plan-item-' + Date.now() + '-' + index, status:'planned', actualAmount:null, transactionId:null, completedAt:null }));
    lists.unshift(copy); savePlanningLists(lists); planningOpenListId = copy.id; closeModal(); renderPlanning();
  };
  window.togglePlanningArchive = function togglePlanningArchive(id) {
    const lists = getPlanningLists(); const list = lists.find(row => row.id === id); if (!list) return;
    list.status = list.status === 'archived' ? 'active' : 'archived'; list.updatedAt = new Date().toISOString(); savePlanningLists(lists); closeModal(); planningOpenListId = null; renderPlanning();
  };
  window.deletePlanningList = function deletePlanningList(id) {
    if (!confirm(pt('confirmDeleteList'))) return;
    savePlanningLists(getPlanningLists().filter(list => list.id !== id)); closeModal(); planningOpenListId = null; renderPlanning();
  };
  window.openPlanningItemActions = function openPlanningItemActions(listId, itemId) {
    document.getElementById('modal').innerHTML = '<div class="tx-action-sheet"><div class="tx-action-title">' + pt('itemActions') + '</div>' +
      '<button class="btn btn-gold" onclick="openPlanningItemModal(\'' + listId + '\',\'' + itemId + '\')">' + pt('edit') + '</button>' +
      '<button class="btn btn-danger" style="width:100%;margin-top:10px" onclick="deletePlanningItem(\'' + listId + '\',\'' + itemId + '\')">' + pt('delete') + '</button><button class="tx-action-cancel" onclick="closeModal()">' + pt('cancel') + '</button></div>';
    document.getElementById('modalOverlay').classList.add('open');
  };
  window.deletePlanningItem = function deletePlanningItem(listId, itemId) {
    if (!confirm(pt('confirmDeleteItem'))) return;
    const lists = getPlanningLists(); const list = lists.find(row => row.id === listId); if (!list) return;
    const item = list.items.find(row => row.id === itemId);
    if (item?.transactionId) { toast(pt('linkedOperation')); return; }
    list.items = list.items.filter(row => row.id !== itemId); list.updatedAt = new Date().toISOString(); savePlanningLists(lists); closeModal(); renderPlanning();
  };

  const originalRenderTabV2 = window.renderTab;
  window.renderTab = function renderTabWithPlanning() {
    if (currentTab === 'planning') renderPlanning();
    else originalRenderTabV2();
  };


  // === Custom categories ====================================================
  // Stored separately and injected into the existing category arrays so custom
  // categories are available in templates, manual operations and planning lists.
  const CUSTOM_CATEGORIES_KEY = 'custom_categories';
  function getCustomCategories() {
    try { const rows = JSON.parse(localStorage.getItem(CUSTOM_CATEGORIES_KEY) || '[]'); return Array.isArray(rows) ? rows : []; } catch (_) { return []; }
  }
  function persistCustomCategories(rows) { localStorage.setItem(CUSTOM_CATEGORIES_KEY, JSON.stringify(rows)); }
  function hydrateCustomCategories() {
    getCustomCategories().forEach(category => {
      const target = category.type === 'income' ? INCOME_CATS : EXPENSE_CATS;
      if (!target.some(item => item.id === category.id)) target.push({ id: category.id, icon: category.icon || '🏷️', name: category.name, custom: true });
    });
  }
  hydrateCustomCategories();

  function templateCats(type) { return type === 'income' ? INCOME_CATS : EXPENSE_CATS; }
  function renderTemplateCategoryChips(type, selectedId) {
    const holder = document.getElementById('tplCatChips');
    if (!holder) return;
    holder.innerHTML = templateCats(type).map(cat => '<button type="button" class="chip ' + (cat.id === selectedId ? 'selected' : '') + '" data-id="' + esc(cat.id) + '" onclick="selectChip(this)">' + cat.icon + ' ' + esc(cat.name) + '</button>').join('');
  }
  window.setTemplateType = function setTemplateType(button) {
    selectChip(button);
    renderTemplateCategoryChips(button.dataset.id, null);
  };
  window.addTemplateCustomCategory = function addTemplateCustomCategory() {
    const name = document.getElementById('tplCustomCategoryName')?.value.trim();
    const icon = document.getElementById('tplCustomCategoryIcon')?.value.trim() || '🏷️';
    const type = document.querySelector('#tplTypeChips .chip.selected')?.dataset.id || 'expense';
    if (!name) { toast(currentLang === 'kz' ? 'Санат атауын енгізіңіз' : 'Введите название категории'); return; }
    const id = 'custom_' + type + '_' + Date.now();
    const category = { id, name, icon: Array.from(icon)[0] || '🏷️', type };
    const rows = getCustomCategories(); rows.push(category); persistCustomCategories(rows);
    const target = type === 'income' ? INCOME_CATS : EXPENSE_CATS; target.push({ id, name, icon: category.icon, custom:true });
    renderTemplateCategoryChips(type, id);
    document.getElementById('tplCustomCategoryName').value = '';
    document.getElementById('tplCustomCategoryIcon').value = '🏷️';
  };
  window.openTemplateModal = function openTemplateModalWithCategories() {
    const existing = getTemplates();
    document.getElementById('modal').innerHTML = '<h3>' + t('newTemplate') + '</h3>' +
      '<div class="form-group"><label>' + t('goalName') + '</label><input type="text" class="form-input" id="tplName" placeholder="' + (currentLang === 'ru' ? 'Бензин' : 'Бензин') + '"></div>' +
      '<div class="form-group"><label>' + t('amount') + '</label><input type="number" class="form-input" id="tplAmount" placeholder="0" inputmode="numeric"></div>' +
      '<div class="form-group"><label>' + t('type') + '</label><div class="chips" id="tplTypeChips">' +
      '<button type="button" class="chip selected" data-id="expense" onclick="setTemplateType(this)">' + t('expense') + '</button>' +
      '<button type="button" class="chip" data-id="income" onclick="setTemplateType(this)">' + t('income') + '</button></div></div>' +
      '<div class="form-group"><label>' + t('category') + '</label><div class="chips" id="tplCatChips"></div>' +
      '<div class="custom-category-row"><input class="form-input custom-category-icon" id="tplCustomCategoryIcon" value="🏷️" maxlength="2" aria-label="Эмодзи"><input class="form-input" id="tplCustomCategoryName" placeholder="' + (currentLang === 'kz' ? 'Жаңа санат' : 'Новая категория') + '"><button type="button" class="planning-add" onclick="addTemplateCustomCategory()">＋</button></div><div class="custom-category-hint">' + (currentLang === 'kz' ? 'Өз санатыңызды және эмодзиіңізді қосыңыз' : 'Добавьте свою категорию и эмодзи') + '</div></div>' +
      '<button class="btn btn-gold" onclick="saveTemplate()" style="width:100%;margin-top:8px">' + t('create') + '</button>' +
      (existing.length ? '<div class="template-existing"><h4>' + t('existingTemplates') + '</h4>' + existing.map((tp,i) => '<div><span>' + esc(tp.name) + ' — ' + fmt(tp.amount) + '</span><button class="btn btn-danger btn-sm" onclick="deleteTemplate(' + i + ')">✕</button></div>').join('') + '</div>' : '');
    renderTemplateCategoryChips('expense', null);
    document.getElementById('modalOverlay').classList.add('open');
  };

  setTimeout(() => { render(); }, 0);
}());
