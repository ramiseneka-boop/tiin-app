/* TIIN spending limits: total and category limits for day/month.
   Limits remain local-first and are included in the existing sync document set. */
(function () {
  'use strict';

  // Kept under the existing `budgets` document so it is included in TIIN Cloud
  // sync on older installations too.
  const KEY = 'budgets';
  const ru = {
    title: 'Лимиты расходов', set: 'Установить лимиты', save: 'Сохранить лимиты',
    total: 'Общий лимит', daily: 'В день', monthly: 'В месяц', categories: 'По категориям',
    spent: 'Потрачено', left: 'Осталось', over: 'Сверх лимита', noLimits: 'Лимиты ещё не установлены',
    warning: 'Превышен лимит', transactionOver: 'Сверх лимита', allGood: 'Лимиты в норме',
    day: 'За сегодня', month: 'За месяц', limitSaved: 'Лимиты сохранены ✓'
  };
  const kz = {
    title: 'Шығын лимиттері', set: 'Лимиттерді орнату', save: 'Лимиттерді сақтау',
    total: 'Жалпы лимит', daily: 'Күніне', monthly: 'Айына', categories: 'Санаттар бойынша',
    spent: 'Жұмсалды', left: 'Қалды', over: 'Лимиттен тыс', noLimits: 'Лимиттер әлі орнатылмаған',
    warning: 'Лимит асты', transactionOver: 'Лимиттен тыс', allGood: 'Лимиттер қалыпты',
    day: 'Бүгін', month: 'Айда', limitSaved: 'Лимиттер сақталды ✓'
  };
  const copy = () => window.currentLang === 'kz' ? kz : ru;
  const number = value => Math.max(0, Number(value) || 0);

  function normalise(raw) {
    const legacy = raw && !raw.global && !raw.categories ? raw : null;
    return {
      global: { daily: number(raw?.global?.daily), monthly: number(raw?.global?.monthly) },
      categories: Object.fromEntries(EXPENSE_CATS.map(cat => [cat.id, {
        daily: number(raw?.categories?.[cat.id]?.daily),
        monthly: number(raw?.categories?.[cat.id]?.monthly || legacy?.[cat.id])
      }]))
    };
  }
  function limits() {
    try {
      // Older TIIN saved just { food: 50000, ... }; normalise keeps it intact.
      return normalise(JSON.parse(localStorage.getItem(KEY) || 'null'));
    } catch (_) { return normalise(null); }
  }
  function saveLimits(value) { localStorage.setItem(KEY, JSON.stringify(normalise(value))); }
  function allMonthExpenses(year, month) { return getTxns(year, month).filter(tx => tx.type === 'expense'); }
  function sameDay(txns, date) { return txns.filter(tx => tx.date === date); }
  function total(txns) { return txns.reduce((sum, tx) => sum + number(tx.amount), 0); }
  function byCategory(txns, category) { return total(txns.filter(tx => tx.category === category)); }
  function excess(spent, limit) { return limit > 0 ? Math.max(0, spent - limit) : 0; }

  // Computes the amount that crossed any active limit. The calculation is derived,
  // so editing a limit updates old records and never modifies financial data.
  function transactionOverage(tx) {
    if (!tx || tx.type !== 'expense') return 0;
    const l = limits(); const d = new Date(tx.date + 'T00:00:00');
    const list = allMonthExpenses(d.getFullYear(), d.getMonth())
      .filter(item => item.id !== tx.id && (item.date < tx.date || (item.date === tx.date && Number(item.id) < Number(tx.id))));
    const beforeDay = sameDay(list, tx.date), beforeMonth = list;
    const values = [
      excess(total(beforeDay) + number(tx.amount), l.global.daily),
      excess(total(beforeMonth) + number(tx.amount), l.global.monthly),
      excess(byCategory(beforeDay, tx.category) + number(tx.amount), l.categories[tx.category]?.daily),
      excess(byCategory(beforeMonth, tx.category) + number(tx.amount), l.categories[tx.category]?.monthly)
    ];
    return Math.min(number(tx.amount), Math.max(...values));
  }

  function stats(year, month, date) {
    const l = limits(), expenses = allMonthExpenses(year, month), dayExpenses = sameDay(expenses, date);
    const totalMonth = total(expenses), totalDay = total(dayExpenses);
    const categoryRows = EXPENSE_CATS.map(cat => {
      const rule = l.categories[cat.id] || {};
      const monthSpent = byCategory(expenses, cat.id), daySpent = byCategory(dayExpenses, cat.id);
      return { cat, daily: rule.daily, monthly: rule.monthly, daySpent, monthSpent,
        dayOver: excess(daySpent, rule.daily), monthOver: excess(monthSpent, rule.monthly) };
    }).filter(row => row.daily || row.monthly || row.daySpent || row.monthSpent);
    const totalOver = expenses.reduce((sum, tx) => sum + transactionOverage(tx), 0);
    return { l, totalDay, totalMonth, dayOver: excess(totalDay, l.global.daily), monthOver: excess(totalMonth, l.global.monthly), categoryRows, totalOver };
  }
  function ratio(spent, limit) { return limit ? Math.min(100, Math.round(spent / limit * 100)) : 0; }
  function colour(spent, limit) { return limit && spent > limit ? '#F87171' : limit && spent / limit >= .8 ? '#FBBF24' : '#34D399'; }
  function valueCell(label, spent, limit, over) {
    if (!limit) return '';
    const tone = colour(spent, limit), status = over ? `${copy().over}: ${fmt(over)}` : `${copy().left}: ${fmt(Math.max(0, limit - spent))}`;
    return `<div class="limit-row"><div class="limit-row-top"><span>${label}</span><b style="color:${tone}">${fmt(spent)} / ${fmt(limit)}</b></div><div class="limit-track"><i style="width:${ratio(spent,limit)}%;background:${tone}"></i></div><small class="${over ? 'limit-over' : ''}">${status}</small></div>`;
  }

  window.openSpendingLimits = function openSpendingLimits() {
    const l = limits(), c = copy();
    let html = `<div class="limits-modal"><h3>🎯 ${c.title}</h3><p class="limits-help">${c.total}: ${c.daily} / ${c.monthly}</p><div class="limits-grid"><label>${c.daily}<input type="number" class="form-input" id="limit_global_daily" value="${l.global.daily || ''}" placeholder="0" inputmode="numeric"></label><label>${c.monthly}<input type="number" class="form-input" id="limit_global_monthly" value="${l.global.monthly || ''}" placeholder="0" inputmode="numeric"></label></div><h4>${c.categories}</h4>`;
    EXPENSE_CATS.forEach(cat => { const item = l.categories[cat.id] || {}; html += `<div class="limit-input-row"><span>${cat.icon} ${cat.name}</span><input type="number" class="form-input" id="limit_${cat.id}_daily" value="${item.daily || ''}" placeholder="${c.daily}" inputmode="numeric"><input type="number" class="form-input" id="limit_${cat.id}_monthly" value="${item.monthly || ''}" placeholder="${c.monthly}" inputmode="numeric"></div>`; });
    html += `<button class="btn btn-gold" onclick="saveSpendingLimits()" style="width:100%;margin-top:14px">${c.save}</button>`;
    document.getElementById('modal').innerHTML = html; document.getElementById('modalOverlay').classList.add('open');
  };
  window.saveSpendingLimits = function saveSpendingLimits() {
    const next = { global: { daily:number(document.getElementById('limit_global_daily').value), monthly:number(document.getElementById('limit_global_monthly').value) }, categories:{} };
    EXPENSE_CATS.forEach(cat => { next.categories[cat.id] = { daily:number(document.getElementById('limit_'+cat.id+'_daily').value), monthly:number(document.getElementById('limit_'+cat.id+'_monthly').value) }; });
    saveLimits(next); closeModal(); toast(copy().limitSaved); render();
  };

  function renderLimitsCard() {
    const el = document.getElementById('tab-analytics'); if (!el) return;
    const date = (currentYear === new Date().getFullYear() && currentMonth === new Date().getMonth()) ? localDateString() : `${currentYear}-${String(currentMonth + 1).padStart(2,'0')}-01`;
    const s = stats(currentYear, currentMonth, date), c = copy();
    const configured = s.l.global.daily || s.l.global.monthly || s.categoryRows.some(row => row.daily || row.monthly);
    let html = `<section class="card limits-card"><div class="limits-title"><h3 class="gold">🎯 ${c.title}</h3><button class="btn btn-ghost btn-sm" onclick="openSpendingLimits()">${configured ? c.set : c.set}</button></div>`;
    if (!configured) html += `<p class="limits-empty">${c.noLimits}</p>`;
    else {
      html += `<div class="limits-summary">${valueCell(c.day, s.totalDay, s.l.global.daily, s.dayOver)}${valueCell(c.month, s.totalMonth, s.l.global.monthly, s.monthOver)}</div>`;
      const overs = s.dayOver + s.monthOver + s.categoryRows.reduce((sum,row) => sum + row.dayOver + row.monthOver, 0);
      html += `<div class="limits-overview ${overs ? 'has-over' : ''}"><span>${overs ? '⚠️ ' + c.warning : '✓ ' + c.allGood}</span><b>${c.over}: ${fmt(s.totalOver)}</b></div>`;
      if (s.categoryRows.length) { html += `<div class="limits-category-title">${c.categories}</div>`; s.categoryRows.forEach(row => { html += `<div class="limit-category"><b>${row.cat.icon} ${row.cat.name}</b>${valueCell(c.day, row.daySpent, row.daily, row.dayOver)}${valueCell(c.month, row.monthSpent, row.monthly, row.monthOver)}</div>`; }); }
    }
    html += '</section>'; el.insertAdjacentHTML('beforeend', html);
  }

  function flagVisibleTransactions() {
    const records = getTxns(currentYear, currentMonth); const c = copy();
    document.querySelectorAll('#tab-transactions [data-tx-id]').forEach(node => {
      const id = decodeURIComponent(node.dataset.txId); const tx = records.find(item => String(item.id) === id); const over = transactionOverage(tx);
      node.classList.toggle('limit-exceeded-tx', Boolean(over));
      node.querySelector('.limit-tx-badge')?.remove();
      if (over) { const info = node.querySelector('.tx-info'); if (info) info.insertAdjacentHTML('beforeend', `<div class="limit-tx-badge">⚠ ${c.transactionOver}: ${fmt(over)}</div>`); }
    });
  }
  function alertFor(tx) { const over = transactionOverage(tx); if (over) toast(`⚠️ ${copy().warning}: ${fmt(over)}`); }

  const style = document.createElement('style');
  style.textContent = '.limits-card{border-color:rgba(212,175,90,.24)}.limits-title{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.limits-title h3{margin:0;font-size:16px}.limits-empty,.limits-help{color:var(--text2);font-size:13px;line-height:1.5;margin:0}.limits-summary{display:grid;grid-template-columns:1fr 1fr;gap:12px}.limit-row{padding:10px 0}.limit-row-top{display:flex;justify-content:space-between;gap:8px;font-size:12px;align-items:baseline}.limit-row-top span{color:var(--text2)}.limit-track{height:6px;border-radius:999px;background:rgba(255,255,255,.08);overflow:hidden;margin:7px 0 4px}.limit-track i{display:block;height:100%;border-radius:inherit}.limit-row small{color:var(--text2);font-size:11px}.limit-row small.limit-over{color:#F87171;font-weight:700}.limits-overview{display:flex;justify-content:space-between;gap:10px;margin:8px 0 2px;padding:10px 12px;border-radius:12px;background:rgba(52,211,153,.08);color:#6ee7b7;font-size:12px}.limits-overview.has-over{background:rgba(248,113,113,.12);color:#fca5a5}.limits-category-title{margin-top:14px;padding-top:12px;border-top:1px solid var(--border);color:var(--text2);font-size:11px;text-transform:uppercase;letter-spacing:.06em}.limit-category{padding:10px 0;border-bottom:1px solid rgba(255,255,255,.06);font-size:13px}.limit-category>b{display:block;margin-bottom:2px}.limits-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.limits-grid label{display:grid;gap:6px;color:var(--text2);font-size:12px}.limits-modal h4{margin:18px 0 8px;font-size:14px;color:var(--gold1)}.limit-input-row{display:grid;grid-template-columns:minmax(0,1fr) 92px 92px;gap:8px;align-items:center;margin:8px 0}.limit-input-row span{font-size:12px;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.limit-input-row .form-input{min-width:0;padding:10px 8px;text-align:right;font-size:13px}.limit-exceeded-tx{border:1px solid rgba(248,113,113,.72)!important;box-shadow:0 0 0 1px rgba(248,113,113,.1),0 8px 20px rgba(248,113,113,.1)!important}.limit-tx-badge{color:#fca5a5;font-size:10px;font-weight:700;margin-top:4px}@media(max-width:480px){.limits-summary{grid-template-columns:1fr}.limit-input-row{grid-template-columns:minmax(0,1fr) 78px 78px;gap:6px}.limits-grid{gap:8px}}';
  document.head.appendChild(style);

  // The old monthly category UI remains available, but now reads and writes the
  // new structure so existing screens and the new limits card always agree.
  window.getBudgets = function () { return Object.fromEntries(EXPENSE_CATS.map(cat => [cat.id, limits().categories[cat.id]?.monthly]).filter(([, value]) => value)); };
  window.saveBudgets = function (legacy) {
    const next = limits();
    EXPENSE_CATS.forEach(cat => { next.categories[cat.id].monthly = number(legacy?.[cat.id]); });
    saveLimits(next);
  };

  const nativeRenderAnalytics = window.renderAnalytics;
  window.renderAnalytics = function () { nativeRenderAnalytics(); renderLimitsCard(); };
  const nativeRenderTransactions = window.renderTransactions;
  window.renderTransactions = function () { nativeRenderTransactions(); flagVisibleTransactions(); };
  const nativeSaveTx = window.saveTx;
  window.saveTx = function (type) {
    const before = new Set();
    for (let index = 0; index < localStorage.length; index += 1) { const key = localStorage.key(index); if (key?.startsWith('txns_')) JSON.parse(localStorage.getItem(key) || '[]').forEach(tx => before.add(String(tx.id))); }
    nativeSaveTx(type);
    if (type !== 'expense') return;
    for (let index = 0; index < localStorage.length; index += 1) { const key = localStorage.key(index); if (!key || !key.startsWith('txns_')) continue; const added = JSON.parse(localStorage.getItem(key) || '[]').find(tx => !before.has(String(tx.id)) && tx.type === 'expense'); if (added) { alertFor(added); return; } }
  };
  const nativeSaveEditedTx = window.saveEditedTx;
  window.saveEditedTx = function (id) { nativeSaveEditedTx(id); for (let index = 0; index < localStorage.length; index += 1) { const key = localStorage.key(index); if (!key || !key.startsWith('txns_')) continue; const tx = JSON.parse(localStorage.getItem(key) || '[]').find(item => String(item.id) === String(id)); if (tx?.type === 'expense') { alertFor(tx); return; } } };
})();
