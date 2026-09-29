/* TIIN 2.0 behavior layer. It deliberately reads the legacy localStorage schema. */
(function () {
  'use strict';

  window.localDateString = function localDateString(date = new Date()) {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60_000).toISOString().slice(0, 10);
  };

  function dayStatus(date) {
    const target = new Date(date + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const diff = Math.round((target - today) / 86400000);
    if (diff < 0) return { key:'overdue', label: currentLang === 'kz' ? 'Мерзімі өтті' : 'Просрочено' };
    if (diff === 0) return { key:'today', label: currentLang === 'kz' ? 'Бүгін' : 'Сегодня' };
    if (diff === 1) return { key:'waiting', label: currentLang === 'kz' ? 'Ертең' : 'Завтра' };
    return { key:'waiting', label: currentLang === 'kz' ? `${diff} күннен кейін` : `Через ${diff} дн.` };
  }

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
      const totals = dayTotals(items); const state = dayStatus(date);
      html += `<section class="day-group"><header class="day-header"><div><div class="day-title">${label}</div><span class="day-status ${state.key}">${state.label}</span></div><div class="day-totals"><span>${currentLang === 'kz' ? 'Кіріс' : 'Доход'} <b class="income">+${fmt(totals.income)}</b></span><span>${currentLang === 'kz' ? 'Шығыс' : 'Расход'} <b class="expense">−${fmt(totals.expense)}</b></span><span>${currentLang === 'kz' ? 'Нәтиже' : 'Итог'} <b class="net">${totals.net >= 0 ? '+' : '−'}${fmt(Math.abs(totals.net))}</b></span></div></header>`;
      items.forEach(tx => {
        const cat = allCats.find(item => item.id === tx.category) || { icon:'•', name: currentLang === 'kz' ? 'Санат' : 'Категория' };
        const isIncome = tx.type === 'income'; const tags = tx.tags?.length ? `<div class="tx-tags">${tx.tags.map(tag => `#${tag}`).join(' ')}</div>` : '';
        const wallet = tx.wallet === 'business' ? '💼 ' : '';
        html += `<article class="tx-item" onclick="editTx(${JSON.stringify(String(tx.id))})"><div class="tx-icon">${cat.icon}</div><div class="tx-info"><div class="tx-cat">${wallet}${cat.name}</div><div class="tx-comment">${tx.comment || ''}</div>${tags}</div><div class="tx-actions"><div class="tx-amount ${isIncome ? 'income' : 'expense'}">${isIncome ? '+' : '−'}${fmt(tx.amount)}</div><button class="tx-menu" aria-label="Редактировать" onclick="event.stopPropagation();editTx(${JSON.stringify(String(tx.id))})">⋮</button></div></article>`;
      });
      html += '</section>';
    });
    el.innerHTML = html;
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

  const originalDeleteTx = window.deleteTx;
  window.deleteTx = function deleteTxV2(id) { originalDeleteTx(Number.isNaN(Number(id)) ? id : Number(id)); };
  setTimeout(() => { render(); }, 0);
}());
