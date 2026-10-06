/* TIIN multi-currency transactions.
   Ledger totals stay in KZT; each foreign transaction retains original amount and fixed conversion rate. */
(function () {
  'use strict';

  const CURRENCIES = [
    { code: 'KZT', symbol: '₸', decimals: 0 },
    { code: 'USD', symbol: '$', decimals: 2 },
    { code: 'VND', symbol: '₫', decimals: 0 },
    { code: 'EUR', symbol: '€', decimals: 2 },
    { code: 'RUB', symbol: '₽', decimals: 2 }
  ];
  const LAST_CURRENCY_KEY = 'tiin_last_transaction_currency_v1';
  let rateSnapshot = null;

  function ru(value, kk) { return window.currentLang === 'kz' ? (kk || value) : value; }
  function currency(code) { return CURRENCIES.find(item => item.code === code) || CURRENCIES[0]; }
  function escape(value) { return String(value || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;'); }
  function format(value, code) {
    const item = currency(code);
    return new Intl.NumberFormat(window.currentLang === 'kz' ? 'kk-KZ' : 'ru-RU', {
      minimumFractionDigits: 0, maximumFractionDigits: item.decimals
    }).format(Number(value || 0)) + ' ' + item.symbol;
  }
  function selector(id, selected) {
    return '<select class="currency-select" id="' + id + '">' + CURRENCIES.map(item =>
      '<option value="' + item.code + '"' + (item.code === selected ? ' selected' : '') + '>' + item.code + ' · ' + item.symbol + '</option>'
    ).join('') + '</select>';
  }
  async function ensureRates(force) {
    if (rateSnapshot && !force) return rateSnapshot;
    if (!window.TIINCurrency?.getRateSnapshot) throw new Error('Currency service unavailable');
    rateSnapshot = await window.TIINCurrency.getRateSnapshot(force);
    return rateSnapshot;
  }
  function rateToKzt(code, snapshot) {
    if (code === 'KZT') return 1;
    const rates = snapshot?.rates;
    if (!rates?.KZT || !rates?.[code]) return null;
    return rates.KZT / rates[code];
  }
  function preview(inputId, currencyId, outputId, rateLineId, fixedRate) {
    const amount = Number(document.getElementById(inputId)?.value || 0);
    const code = document.getElementById(currencyId)?.value || 'KZT';
    const rate = fixedRate || rateToKzt(code, rateSnapshot);
    const output = document.getElementById(outputId);
    const line = document.getElementById(rateLineId);
    if (!output || !line) return;
    if (code !== 'KZT' && !rate) {
      output.textContent = ru('Загружаем курс…', 'Курс жүктелуде…');
      line.textContent = '';
      return;
    }
    const base = Math.round(amount * (rate || 1));
    output.textContent = amount > 0 ? '≈ ' + window.fmt(base) : '—';
    line.textContent = code === 'KZT' ? ru('Основная валюта учёта', 'Есептің негізгі валютасы') : '1 ' + code + ' = ' + window.fmt(rate);
  }
  function newCurrencyBlock() {
    const selected = localStorage.getItem(LAST_CURRENCY_KEY) || 'KZT';
    return '<div class="form-group tx-currency-group"><label>' + ru('Валюта операции', 'Операция валютасы') + '</label>' +
      '<div class="tx-currency-row">' + selector('txCurrency', selected) + '<button type="button" class="currency-refresh" onclick="TIINTransactionCurrency.refreshNewRate()" aria-label="refresh">↻</button></div>' +
      '<div class="tx-currency-preview" id="txCurrencyPreview">—</div><div class="tx-currency-rate" id="txCurrencyRate"></div></div>';
  }
  function attachNewCurrencyUi() {
    const amount = document.getElementById('txAmount');
    if (!amount || document.getElementById('txCurrency')) return;
    amount.closest('.form-group')?.insertAdjacentHTML('afterend', newCurrencyBlock());
    document.getElementById('txCurrency').addEventListener('change', async () => {
      localStorage.setItem(LAST_CURRENCY_KEY, document.getElementById('txCurrency').value);
      try { await ensureRates(false); } catch (_) {}
      preview('txAmount', 'txCurrency', 'txCurrencyPreview', 'txCurrencyRate');
    });
    amount.addEventListener('input', () => preview('txAmount', 'txCurrency', 'txCurrencyPreview', 'txCurrencyRate'));
    ensureRates(false).then(() => preview('txAmount', 'txCurrency', 'txCurrencyPreview', 'txCurrencyRate')).catch(() => preview('txAmount', 'txCurrency', 'txCurrencyPreview', 'txCurrencyRate'));
  }
  const legacyOpenModal = window.openModal;
  window.openModal = function openCurrencyAwareModal(type) {
    legacyOpenModal(type);
    attachNewCurrencyUi();
  };
  const legacySaveTx = window.saveTx;
  window.saveTx = async function saveCurrencyAwareTx(type) {
    const currencyCode = document.getElementById('txCurrency')?.value || 'KZT';
    if (!document.getElementById('txCurrency')) return legacySaveTx(type);
    calcAmount();
    const originalAmount = Number(document.getElementById('txAmount')?.value);
    const cat = document.querySelector('#catChips .chip.selected');
    const comment = document.getElementById('txComment')?.value.trim() || '';
    const date = document.getElementById('txDate')?.value;
    const tag = document.getElementById('txTag')?.value.trim() || '';
    const wallet = document.querySelector('#walletChips .chip.selected')?.dataset.id || 'personal';
    if (!originalAmount || originalAmount <= 0) { toast(t('enterAmount')); return; }
    if (!cat) { toast(t('selectCategory')); return; }
    if (!date) { toast(t('selectDate')); return; }
    let rate = 1, sourceTime = null;
    try {
      if (currencyCode !== 'KZT') {
        const snapshot = await ensureRates(false);
        rate = rateToKzt(currencyCode, snapshot);
        sourceTime = snapshot.updatedAt || null;
        if (!rate) throw new Error('rate missing');
      }
    } catch (_) {
      toast(ru('Нет актуального курса. Проверь интернет и повтори.', 'Өзекті курс жоқ. Интернетті тексеріп, қайталаңыз.'));
      return;
    }
    const baseAmount = Math.round(originalAmount * rate);
    const d = new Date(date + 'T00:00:00');
    const txns = getTxns(d.getFullYear(), d.getMonth());
    txns.push({
      id: Date.now(), type, amount: baseAmount, originalAmount, currency: currencyCode,
      rateToKzt: rate, rateUpdatedAt: sourceTime, category: cat.dataset.id, comment, date, wallet,
      tags: tag ? tag.split(/[,\s]+/).filter(Boolean) : []
    });
    localStorage.setItem(LAST_CURRENCY_KEY, currencyCode);
    saveTxns(d.getFullYear(), d.getMonth(), txns);
    closeModal();
    toast(type === 'income' ? t('incomeAdded') : t('expenseAdded'));
    if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) render();
  };

  function editCurrencyBlock(tx) {
    const code = tx.currency || 'KZT';
    const original = Number(tx.originalAmount || tx.amount || 0);
    const rate = Number(tx.rateToKzt || 1);
    return '<div class="form-group tx-currency-group"><label>' + ru('Валюта операции', 'Операция валютасы') + '</label>' +
      '<div class="tx-currency-row">' + selector('editCurrency', code) + '<button type="button" class="currency-refresh" onclick="TIINTransactionCurrency.refreshEditRate()" aria-label="refresh">↻</button></div>' +
      '<input type="hidden" id="editRateToKzt" value="' + rate + '"><div class="tx-currency-preview" id="editCurrencyPreview"></div><div class="tx-currency-rate" id="editCurrencyRate"></div></div>';
  }
  function editPreview() {
    const fixedRate = Number(document.getElementById('editRateToKzt')?.value || 1);
    preview('editAmount', 'editCurrency', 'editCurrencyPreview', 'editCurrencyRate', fixedRate);
  }
  window.TIINTransactionCurrency = {
    refreshNewRate: async function () {
      try { await ensureRates(true); preview('txAmount', 'txCurrency', 'txCurrencyPreview', 'txCurrencyRate'); }
      catch (_) { toast(ru('Не удалось обновить курс', 'Курсты жаңарту мүмкін болмады')); }
    },
    refreshEditRate: async function () {
      const code = document.getElementById('editCurrency')?.value || 'KZT';
      try {
        const snapshot = await ensureRates(true);
        const rate = rateToKzt(code, snapshot);
        if (!rate) throw new Error('rate missing');
        document.getElementById('editRateToKzt').value = rate;
        editPreview();
      } catch (_) { toast(ru('Не удалось обновить курс', 'Курсты жаңарту мүмкін болмады')); }
    },
    updateEditPreview: editPreview
  };

  window.editTx = function editCurrencyAwareTx(id) {
    const tx = getTxns(currentYear, currentMonth).find(item => String(item.id) === String(id));
    if (!tx) return;
    const cats = tx.type === 'income' ? INCOME_CATS : EXPENSE_CATS;
    const amount = Number(tx.originalAmount || tx.amount || 0);
    document.getElementById('modal').innerHTML = '<h3>' + ru('Редактировать операцию', 'Операцияны өңдеу') + '</h3>' +
      '<div class="form-group"><label>' + t('amount') + '</label><input type="number" class="form-input big" id="editAmount" value="' + amount + '" inputmode="decimal"></div>' +
      editCurrencyBlock(tx) +
      '<div class="form-group"><label>' + t('category') + '</label><div class="chips" id="editCatChips">' + cats.map(cat => '<div class="chip ' + (cat.id === tx.category ? 'selected' : '') + '" data-id="' + cat.id + '" onclick="selectChip(this)">' + cat.icon + ' ' + cat.name + '</div>').join('') + '</div></div>' +
      '<div class="form-group"><label>' + t('comment') + '</label><input class="form-input" id="editComment" value="' + escape(tx.comment) + '"></div>' +
      '<div class="form-group"><label>' + t('tag') + '</label><input class="form-input" id="editTags" value="' + escape((tx.tags || []).join(' ')) + '"></div>' +
      '<div class="form-group"><label>' + t('wallet') + '</label><div class="chips" id="editWalletChips"><div class="chip ' + ((tx.wallet || 'personal') !== 'business' ? 'selected' : '') + '" data-id="personal" onclick="selectChip(this)">👤 ' + t('personal') + '</div><div class="chip ' + (tx.wallet === 'business' ? 'selected' : '') + '" data-id="business" onclick="selectChip(this)">💼 ' + t('business') + '</div></div></div>' +
      '<div class="form-group"><label>' + t('date') + '</label><input type="date" class="form-input" id="editDate" value="' + tx.date + '"></div>' +
      '<button class="btn btn-gold" onclick="saveEditedTx(\'' + String(tx.id).replace(/'/g, "\\'") + '\')">' + t('save') + '</button><button class="btn btn-danger" style="width:100%;margin-top:10px" onclick="deleteTx(\'' + String(tx.id).replace(/'/g, "\\'") + '\')">' + t('delete') + '</button>';
    document.getElementById('modalOverlay').classList.add('open');
    document.getElementById('editAmount').addEventListener('input', editPreview);
    document.getElementById('editCurrency').addEventListener('change', async () => {
      const code = document.getElementById('editCurrency').value;
      if (code === (tx.currency || 'KZT')) { document.getElementById('editRateToKzt').value = Number(tx.rateToKzt || 1); editPreview(); return; }
      try {
        const snapshot = await ensureRates(false);
        document.getElementById('editRateToKzt').value = rateToKzt(code, snapshot) || 1;
      } catch (_) {}
      editPreview();
    });
    editPreview();
  };

  window.saveEditedTx = async function saveCurrencyAwareEditedTx(id) {
    const oldTxns = getTxns(currentYear, currentMonth);
    const tx = oldTxns.find(item => String(item.id) === String(id));
    const originalAmount = Number(document.getElementById('editAmount')?.value);
    const code = document.getElementById('editCurrency')?.value || 'KZT';
    const rate = Number(document.getElementById('editRateToKzt')?.value || 1);
    const cat = document.querySelector('#editCatChips .chip.selected');
    const date = document.getElementById('editDate')?.value;
    if (!tx || !originalAmount || originalAmount <= 0 || !cat || !date || !rate) { toast(t('fillAllFields')); return; }
    const targetDate = new Date(date + 'T00:00:00');
    const comment = document.getElementById('editComment')?.value.trim() || '';
    const tags = (document.getElementById('editTags')?.value.trim() || '').split(/[\s,]+/).filter(Boolean);
    const wallet = document.querySelector('#editWalletChips .chip.selected')?.dataset.id || 'personal';
    saveTxns(currentYear, currentMonth, oldTxns.filter(item => String(item.id) !== String(id)));
    const target = getTxns(targetDate.getFullYear(), targetDate.getMonth());
    target.push({ ...tx, amount: Math.round(originalAmount * rate), originalAmount, currency: code, rateToKzt: rate, category: cat.dataset.id, comment, tags, wallet, date });
    saveTxns(targetDate.getFullYear(), targetDate.getMonth(), target);
    localStorage.setItem(LAST_CURRENCY_KEY, code);
    closeModal(); toast(ru('Сохранено ✓', 'Сақталды ✓')); render();
  };
}());
