/* TIIN reports: drill-down cards and printable PDF-ready statements.
   Reads the existing transaction storage and never mutates user data. */
(function () {
  'use strict';
  const tr = (ru, kz, en) => window.tiinText ? window.tiinText(ru, kz, en) : ru;
  const amount = value => Number(value || 0);
  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#039;' }[c]));
  const locale = () => window.tiinLocale ? window.tiinLocale() : 'ru-RU';
  const dateLabel = iso => new Date(`${iso}T00:00:00`).toLocaleDateString(locale(), { weekday:'short', day:'numeric', month:'long', year:'numeric' });
  const shortDate = iso => new Date(`${iso}T00:00:00`).toLocaleDateString(locale(), { day:'numeric', month:'short', year:'numeric' });

  function allTransactions() {
    const result = [];
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index);
      const match = /^txns_(\d{4})_(\d{1,2})$/.exec(key || '');
      if (!match) continue;
      try {
        const rows = JSON.parse(localStorage.getItem(key) || '[]');
        if (!Array.isArray(rows)) continue;
        rows.forEach(row => result.push({ ...row, date: row.date || `${match[1]}-${String(Number(match[2]) + 1).padStart(2, '0')}-01` }));
      } catch (_) { /* A damaged old record is skipped rather than breaking reports. */ }
    }
    // Never include a dated future plan in a factual balance or export. This
    // additionally protects reports made from records created by older builds.
    const actual = typeof isActualTransaction === 'function' ? result.filter(isActualTransaction) : result;
    return typeof filterTxnsByWallet === 'function' ? filterTxnsByWallet(actual) : actual;
  }

  function totals(rows) {
    const income = rows.filter(row => row.type === 'income').reduce((sum, row) => sum + amount(row.amount), 0);
    const expense = rows.filter(row => row.type === 'expense').reduce((sum, row) => sum + amount(row.amount), 0);
    return { income, expense, net: income - expense };
  }

  function category(row) {
    const found = [...(window.EXPENSE_CATS || []), ...(window.INCOME_CATS || [])].find(item => item.id === row.category);
    return found || { icon:'•', name: tr('Категория', 'Санат', 'Category') };
  }

  function rowsByDate(rows) {
    return rows.slice().sort((a, b) => `${b.date}|${b.id}`.localeCompare(`${a.date}|${a.id}`));
  }

  function reportMarkup(rows, heading, subheading) {
    const values = totals(rows);
    const grouped = rows.reduce((all, row) => ((all[row.date] ||= []).push(row), all), {});
    const dates = Object.keys(grouped).sort().reverse();
    const list = dates.length ? dates.map(date => {
      const dayRows = rowsByDate(grouped[date]);
      const day = totals(dayRows);
      return `<section class="tiin-report-day"><header><div><b>${dateLabel(date)}</b><small>${tr('Доход', 'Кіріс', 'Income')}: <em class="income">+${fmt(day.income)}</em> · ${tr('Расход', 'Шығыс', 'Expense')}: <em class="expense">−${fmt(day.expense)}</em></small></div><strong class="${day.net >= 0 ? 'income' : 'expense'}">${day.net >= 0 ? '+' : '−'}${fmt(Math.abs(day.net))}</strong></header>${dayRows.map(row => {
        const cat = category(row); const income = row.type === 'income';
        return `<div class="tiin-report-row"><span class="tiin-report-icon">${cat.icon}</span><div><b>${escapeHtml(cat.name)}</b>${row.comment ? `<small>${escapeHtml(row.comment)}</small>` : ''}${row.wallet === 'business' ? `<small>💼 ${tr('Бизнес', 'Бизнес', 'Business')}</small>` : ''}</div><strong class="${income ? 'income' : 'expense'}">${income ? '+' : '−'}${fmt(row.amount)}</strong></div>`;
      }).join('')}</section>`;
    }).join('') : `<div class="tiin-report-empty">📭<p>${tr('За этот период операций нет.', 'Осы кезеңде операциялар жоқ.', 'There are no transactions for this period.')}</p></div>`;
    return `<div class="tiin-sheet tiin-report"><div class="tiin-sheet-handle"></div><h2>${heading}</h2><p class="tiin-report-subtitle">${subheading}</p><div class="tiin-report-totals"><div><small>${tr('Доход', 'Кіріс', 'Income')}</small><b class="income">+${fmt(values.income)}</b></div><div><small>${tr('Расход', 'Шығыс', 'Expense')}</small><b class="expense">−${fmt(values.expense)}</b></div><div><small>${tr('Итог', 'Нәтиже', 'Total')}</small><b>${values.net >= 0 ? '+' : '−'}${fmt(Math.abs(values.net))}</b></div></div><div class="tiin-report-list">${list}</div></div>`;
  }

  window.openTIINStatement = function openTIINStatement(scope) {
    const monthly = typeof getTxns === 'function' ? filterTxnsByWallet(getTxns(currentYear, currentMonth)) : [];
    const isIncome = scope === 'month-income';
    let rows = monthly;
    let heading = tr('Операции за месяц', 'Айлық операциялар', 'Monthly transactions');
    let subheading = `${t('months_arr')[currentMonth]} ${currentYear}`;
    if (scope === 'month-income' || scope === 'month-expense') {
      rows = monthly.filter(row => row.type === (isIncome ? 'income' : 'expense'));
      heading = isIncome ? tr('Доход за месяц', 'Айлық кіріс', 'Income for the month') : tr('Расход за месяц', 'Айлық шығыс', 'Expense for the month');
    }
    if (scope === 'lifetime-balance') {
      rows = allTransactions();
      heading = tr('Общий баланс — вся история', 'Жалпы баланс — бүкіл тарих', 'Total balance — all history');
      subheading = tr('Все доходы и расходы за время использования', 'Пайдалану кезіндегі барлық кірістер мен шығыстар', 'All income and expenses since you started using TIIN');
    }
    document.getElementById('modal').innerHTML = reportMarkup(rows, heading, subheading);
    document.getElementById('modalOverlay').classList.add('open');
  };

  function selectedRange() {
    const kind = document.querySelector('[name="tiin_pdf_range"]:checked')?.value || '1';
    if (kind === 'all') return { kind, rows: allTransactions(), label: tr('За всё время', 'Барлық уақыт', 'All time') };
    if (kind === 'custom') {
      const start = document.getElementById('tiinPdfFrom')?.value;
      const end = document.getElementById('tiinPdfTo')?.value;
      if (!start || !end || start > end) return { error: tr('Выбери корректный период.', 'Дұрыс кезеңді таңдаңыз.', 'Choose a valid date range.') };
      return { kind, rows: allTransactions().filter(row => row.date >= start && row.date <= end), label: `${shortDate(start)} — ${shortDate(end)}` };
    }
    const months = Number(kind);
    const end = new Date(currentYear, currentMonth + 1, 0);
    const start = new Date(currentYear, currentMonth - months + 1, 1);
    const pad = n => String(n).padStart(2, '0');
    const min = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-01`;
    const max = `${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
    return { kind, rows: allTransactions().filter(row => row.date >= min && row.date <= max), label: `${shortDate(min)} — ${shortDate(max)}` };
  }

  window.openPDFExportModal = function openPDFExportModal() {
    document.getElementById('modal').innerHTML = `<div class="tiin-sheet tiin-pdf-picker"><div class="tiin-sheet-handle"></div><h2>PDF</h2><p>${tr('Выбери период. В отчёте будут все доходы и расходы: дата, категория, комментарий и сумма.', 'Кезеңді таңдаңыз. Есепте барлық кірістер мен шығыстар: күні, санаты, түсініктемесі және сомасы көрсетіледі.', 'Choose a period. The report includes every income and expense with date, category, note, and amount.')}</p><div class="tiin-range-list"><label><input type="radio" name="tiin_pdf_range" value="1" checked><span>${tr('За 1 месяц', '1 айға', 'For 1 month')}</span></label><label><input type="radio" name="tiin_pdf_range" value="2"><span>${tr('За 2 месяца', '2 айға', 'For 2 months')}</span></label><label><input type="radio" name="tiin_pdf_range" value="3"><span>${tr('За 3 месяца', '3 айға', 'For 3 months')}</span></label><label><input type="radio" name="tiin_pdf_range" value="all"><span>${tr('За всё время', 'Барлық уақытқа', 'All time')}</span></label><label><input type="radio" name="tiin_pdf_range" value="custom"><span>${tr('Свой период', 'Өз кезеңіңіз', 'Custom period')}</span></label></div><div class="tiin-custom-range"><label>${tr('С', 'Бастап', 'From')}<input type="date" class="form-input" id="tiinPdfFrom"></label><label>${tr('По', 'Дейін', 'To')}<input type="date" class="form-input" id="tiinPdfTo"></label></div><button class="btn btn-gold" onclick="TIINCreatePDF()">${tr('Сформировать PDF', 'PDF жасау', 'Create PDF')}</button></div>`;
    document.getElementById('modalOverlay').classList.add('open');
  };

  function printableHtml(rows, rangeLabel) {
    const sum = totals(rows);
    const sorted = rowsByDate(rows);
    const title = tr('Отчёт TIIN', 'TIIN есебі', 'TIIN report');
    const table = sorted.length ? sorted.map(row => {
      const cat = category(row); const positive = row.type === 'income';
      return `<tr><td>${escapeHtml(shortDate(row.date))}</td><td>${positive ? tr('Доход', 'Кіріс', 'Income') : tr('Расход', 'Шығыс', 'Expense')}</td><td>${cat.icon} ${escapeHtml(cat.name)}</td><td>${escapeHtml(row.comment || '—')}</td><td>${row.wallet === 'business' ? tr('Бизнес', 'Бизнес', 'Business') : tr('Личный', 'Жеке', 'Personal')}</td><td class="${positive ? 'plus' : 'minus'}">${positive ? '+' : '−'}${fmt(row.amount)}</td></tr>`;
    }).join('') : `<tr><td colspan="6">${tr('Нет операций за выбранный период.', 'Таңдалған кезеңде операциялар жоқ.', 'No transactions for the selected period.')}</td></tr>`;
    return `<!doctype html><html lang="${window.currentLang || 'ru'}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;color:#152038;margin:30px;line-height:1.35}h1{margin:0;color:#162443;font-size:24px}.period{margin:5px 0 24px;color:#667085}.totals{display:flex;gap:12px;margin-bottom:22px}.total{border:1px solid #d9e0eb;border-radius:10px;padding:11px 14px;min-width:150px}.total small{display:block;color:#667085}.total b{font-size:18px}.plus{color:#087f5b}.minus{color:#c63f4f}table{width:100%;border-collapse:collapse;font-size:11px}th{text-align:left;background:#f3f5f8}th,td{border-bottom:1px solid #e3e7ee;padding:9px 7px;vertical-align:top}.footer{margin-top:20px;color:#778196;font-size:10px}@media print{body{margin:15mm}.footer{position:fixed;bottom:0}}</style></head><body><h1>${title}</h1><div class="period">${escapeHtml(rangeLabel)}</div><div class="totals"><div class="total"><small>${tr('Доход', 'Кіріс', 'Income')}</small><b class="plus">+${fmt(sum.income)}</b></div><div class="total"><small>${tr('Расход', 'Шығыс', 'Expense')}</small><b class="minus">−${fmt(sum.expense)}</b></div><div class="total"><small>${tr('Итог', 'Нәтиже', 'Total')}</small><b>${sum.net >= 0 ? '+' : '−'}${fmt(Math.abs(sum.net))}</b></div></div><table><thead><tr><th>${tr('Дата', 'Күні', 'Date')}</th><th>${tr('Тип', 'Түрі', 'Type')}</th><th>${tr('Категория', 'Санат', 'Category')}</th><th>${tr('Куда / на что', 'Қайда / не үшін', 'Where / purpose')}</th><th>${tr('Кошелёк', 'Әмиян', 'Wallet')}</th><th>${tr('Сумма', 'Сома', 'Amount')}</th></tr></thead><tbody>${table}</tbody></table><p class="footer">TIIN · ${tr('Сформировано', 'Жасалды', 'Generated')}: ${new Date().toLocaleString(locale())}</p><script>window.onload=()=>setTimeout(()=>window.print(),200)<\/script></body></html>`;
  }

  window.TIINCreatePDF = function TIINCreatePDF() {
    const selection = selectedRange();
    if (selection.error) { toast(selection.error); return; }
    // Browser print uses system fonts and therefore produces correct Cyrillic,
    // Kazakh and English characters. From the print sheet the user saves a real PDF.
    const reportWindow = window.open('', '_blank');
    if (!reportWindow) { toast(tr('Разреши открыть окно отчёта и повтори.', 'Есеп терезесін ашуға рұқсат беріп, қайталаңыз.', 'Allow the report window and try again.')); return; }
    reportWindow.document.open(); reportWindow.document.write(printableHtml(selection.rows, selection.label)); reportWindow.document.close();
    closeModal();
    toast(tr('Отчёт открыт — выбери «Сохранить как PDF».', 'Есеп ашылды — «PDF ретінде сақтау» таңдаңыз.', 'Report opened — choose “Save as PDF”.'));
  };

  // Retain the public exportPDF API used by settings, but make it ask for a period first.
  window.exportPDF = window.openPDFExportModal;

  function installCardDrilldown() {
    if (document.body.dataset.tiinReportsInstalled) return;
    document.body.dataset.tiinReportsInstalled = '1';
    document.addEventListener('click', event => {
      const income = event.target.closest('#totalIncome');
      const expense = event.target.closest('#totalExpense');
      const hero = event.target.closest('.balance-hero');
      if (income) return window.openTIINStatement('month-income');
      if (expense) return window.openTIINStatement('month-expense');
      if (hero) return window.openTIINStatement('lifetime-balance');
    });
    document.addEventListener('keydown', event => {
      if ((event.key === 'Enter' || event.key === ' ') && document.activeElement?.matches?.('[data-tiin-report]')) {
        event.preventDefault(); window.openTIINStatement(document.activeElement.dataset.tiinReport);
      }
    });
  }

  function markInteractiveCards() {
    const income = document.getElementById('totalIncome')?.closest('.summary-item');
    const expense = document.getElementById('totalExpense')?.closest('.summary-item');
    const hero = document.querySelector('.balance-hero');
    [[income, 'month-income'], [expense, 'month-expense'], [hero, 'lifetime-balance']].forEach(([element, scope]) => {
      if (!element) return;
      element.dataset.tiinReport = scope;
      element.setAttribute('role', 'button'); element.tabIndex = 0;
      element.setAttribute('aria-label', tr('Открыть детализацию', 'Толық мәліметті ашу', 'Open details'));
    });
  }

  const baseRender = window.render;
  window.render = function renderWithReports() { baseRender(); markInteractiveCards(); };
  installCardDrilldown();
  setTimeout(markInteractiveCards, 0);

  const style = document.createElement('style');
  style.textContent = `.summary-item[data-tiin-report],.balance-hero[data-tiin-report]{cursor:pointer}.summary-item[data-tiin-report]:focus-visible,.balance-hero[data-tiin-report]:focus-visible{outline:2px solid var(--gold1);outline-offset:3px}.tiin-report{max-height:min(76vh,700px);overflow:auto;padding-bottom:10px}.tiin-report h2{font-size:21px}.tiin-report-subtitle{text-align:center!important;font-size:12px!important;margin:-4px 0 14px!important}.tiin-report-totals{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:7px;margin:12px 0 16px}.tiin-report-totals>div{padding:10px 7px;border:1px solid var(--border);background:var(--card);border-radius:12px}.tiin-report-totals small,.tiin-report-day small,.tiin-report-row small{display:block;color:var(--text2);font-size:10px;line-height:1.35}.tiin-report-totals b{display:block;margin-top:5px;font-size:13px}.tiin-report-day{border:1px solid var(--border);border-radius:15px;background:var(--card);overflow:hidden;margin:9px 0}.tiin-report-day header{display:flex;justify-content:space-between;gap:8px;padding:11px;border-bottom:1px solid var(--border)}.tiin-report-day header>b{font-size:12px}.tiin-report-day header>strong{font-size:12px;text-align:right}.tiin-report-row{display:grid;grid-template-columns:30px minmax(0,1fr) auto;gap:8px;align-items:center;padding:10px 11px;border-top:1px solid rgba(148,163,184,.12)}.tiin-report-row:first-of-type{border-top:0}.tiin-report-row b{display:block;font-size:12px}.tiin-report-row>strong{font-size:12px;text-align:right}.tiin-report-icon{font-size:18px;text-align:center}.tiin-report-empty{text-align:center;color:var(--text2);padding:28px 10px}.tiin-report-empty p{margin:8px}.tiin-pdf-picker p{font-size:13px}.tiin-range-list{display:grid;gap:7px;margin:18px 0 12px}.tiin-range-list label{display:flex;gap:9px;align-items:center;padding:12px;border:1px solid var(--border);border-radius:12px;background:var(--card);font-size:13px}.tiin-range-list input{accent-color:var(--gold1)}.tiin-custom-range{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0 14px}.tiin-custom-range label{display:grid;gap:5px;color:var(--text2);font-size:11px}.tiin-custom-range .form-input{width:100%}.tiin-pdf-picker .btn{width:100%}@media(max-width:380px){.tiin-report-totals{gap:5px}.tiin-report-totals>div{padding:8px 5px}.tiin-report-totals b{font-size:11px}.tiin-custom-range{grid-template-columns:1fr}}`;
  document.head.appendChild(style);
})();
