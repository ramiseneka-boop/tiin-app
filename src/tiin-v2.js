/* TIIN 2.0 behavior layer. It deliberately reads the legacy localStorage schema. */
(function () {
  'use strict';

  // Load v2 CSS after the legacy inline stylesheet so the new desktop layer wins.
  if (!document.getElementById('tiinV2FinalStyles')) {
    const styles = document.createElement('link');
    styles.id = 'tiinV2FinalStyles';
    styles.rel = 'stylesheet';
    styles.href = 'styles/tiin-v2.css?v=9';
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
    balanceKpi.querySelector('.label').textContent = currentLang === 'kz' ? 'БАЛАНС · ОСЫ АЙ' : 'БАЛАНС · ЗА МЕСЯЦ';
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
  // Native-feeling mobile sheet dismissal: drag the visible handle area down.
  (function enableModalDragDismiss() {
    const overlay = document.getElementById('modalOverlay');
    const modal = document.getElementById('modal');
    if (!overlay || !modal) return;
    let startY = null;
    let lastY = null;

    modal.addEventListener('pointerdown', event => {
      const top = modal.getBoundingClientRect().top;
      if (event.clientY - top > 56) return;
      startY = event.clientY;
      lastY = event.clientY;
      modal.setPointerCapture?.(event.pointerId);
    });
    modal.addEventListener('pointermove', event => {
      if (startY === null) return;
      lastY = event.clientY;
      const distance = Math.max(0, lastY - startY);
      modal.style.transform = `translateY(${Math.min(distance, 180)}px)`;
    });
    function finishDrag() {
      if (startY === null) return;
      const distance = Math.max(0, (lastY || startY) - startY);
      modal.style.transform = '';
      startY = null;
      lastY = null;
      if (distance >= 80) closeModal();
    }
    modal.addEventListener('pointerup', finishDrag);
    modal.addEventListener('pointercancel', finishDrag);
  }());

  setTimeout(() => { render(); }, 0);
}());
