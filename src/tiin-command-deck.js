/* TIIN Command Deck — non-destructive layout controller. */
(function () {
  'use strict';
  if (!document.getElementById('tiinLimitsScript')) {
    const limits = document.createElement('script');
    limits.id = 'tiinLimitsScript';
    limits.src = 'src/tiin-limits.js?v=2';
    limits.async = false;
    document.head.appendChild(limits);
  }
  if (!document.getElementById('tiinFinanceCoachScript')) {
    const coach = document.createElement('script');
    coach.id = 'tiinFinanceCoachScript';
    coach.src = 'src/tiin-finance-coach.js?v=19';
    coach.async = false;
    document.head.appendChild(coach);
  }

  var STYLE_ID = 'tiinCommandDeckStyles';
  var refreshTimer = null;
  var labels = {
    ru: { home: 'Главная', analytics: 'Аналитика', goals: 'Цели', payments: 'Платежи', more: 'Ещё', month: 'Этот месяц', income: 'Доход', expense: 'Расход', operations: 'Операции', lists: 'Списки', currencies: 'Валюты', openAnalytics: 'Аналитика' },
    kz: { home: 'Басты', analytics: 'Талдау', goals: 'Мақсаттар', payments: 'Төлемдер', more: 'Баптаулар', month: 'Осы ай', income: 'Кіріс', expense: 'Шығыс', operations: 'Операциялар', lists: 'Тізімдер', currencies: 'Валюталар', openAnalytics: 'Талдау' },
    en: { home: 'Home', analytics: 'Analytics', goals: 'Goals', payments: 'Payments', more: 'Settings', month: 'This month', income: 'Income', expense: 'Expense', operations: 'Transactions', lists: 'Lists', currencies: 'Currencies', openAnalytics: 'Analytics' }
  };

  function getLang() {
    return window.currentLang === 'kz' ? 'kz' : window.currentLang === 'en' ? 'en' : 'ru';
  }

  function copy() {
    return labels[getLang()];
  }

  function injectStyles() {
    if (!document.getElementById(STYLE_ID)) {
      var link = document.createElement('link');
      link.id = STYLE_ID;
      link.rel = 'stylesheet';
      link.href = 'styles/tiin-command-deck.css?v=8';
      document.head.appendChild(link);
    }
    if (!document.getElementById('tiinPolishStyles')) {
      const polish = document.createElement('link');
      polish.id = 'tiinPolishStyles';
      polish.rel = 'stylesheet';
    polish.href = 'styles/tiin-polish.css?v=13';
      document.head.appendChild(polish);
    }
    if (!document.getElementById('tiinObsidianStyles')) {
      var obsidian = document.createElement('link');
      obsidian.id = 'tiinObsidianStyles';
      obsidian.rel = 'stylesheet';
      obsidian.href = 'styles/tiin-obsidian.css?v=3';
      document.head.appendChild(obsidian);
    }
  }

  function commandDate() {
    var date = document.getElementById('todayDate');
    if (!date) return;
    var now = new Date();
    var locale = getLang() === 'kz' ? 'kk-KZ' : getLang() === 'en' ? 'en-GB' : 'ru-RU';
    var weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(now).replace('.', '');
    var month = new Intl.DateTimeFormat(locale, { month: 'short' }).format(now).replace('.', '');
    weekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    date.className = 'command-date obsidian-date-trigger';
    date.setAttribute('role', 'button');
    date.setAttribute('tabindex', '0');
    date.setAttribute('aria-label', getLang() === 'kz' ? 'Күнтізбені ашу' : getLang() === 'en' ? 'Open calendar' : 'Открыть календарь');
    date.innerHTML = '<strong>' + weekday + '</strong><i>·</i><span class="obsidian-date-day">' + now.getDate() + '</span><span class="obsidian-date-month"> ' + month + '</span>';
    date.onclick = function () { window.openTIINCalendar(); };
    date.onkeydown = function (event) { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); window.openTIINCalendar(); } };
  }

  var calendarView = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  function calendarHtml() {
    var locale = getLang() === 'kz' ? 'kk-KZ' : getLang() === 'en' ? 'en-GB' : 'ru-RU';
    var year = calendarView.getFullYear(), month = calendarView.getMonth();
    var first = (new Date(year, month, 1).getDay() + 6) % 7;
    var count = new Date(year, month + 1, 0).getDate();
    var today = new Date();
    var weekdays = getLang() === 'en' ? ['Mo','Tu','We','Th','Fr','Sa','Su'] : getLang() === 'kz' ? ['Дс','Сс','Ср','Бс','Жм','Сн','Жс'] : ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];
    var cells = Array(first).fill('<span class="obsidian-calendar-blank"></span>');
    for (var day = 1; day <= count; day++) {
      var isToday = year === today.getFullYear() && month === today.getMonth() && day === today.getDate();
      cells.push('<button type="button" class="obsidian-calendar-day' + (isToday ? ' is-today' : '') + '" data-day="' + day + '"' + (isToday ? ' aria-current="date"' : '') + '>' + day + '</button>');
    }
    var title = new Intl.DateTimeFormat(locale, { month:'long', year:'numeric' }).format(calendarView);
    return '<div class="obsidian-calendar"><div class="tiin-sheet-handle"></div><div class="obsidian-calendar-head"><div><span class="obsidian-calendar-kicker">' +
      (getLang() === 'en' ? 'CALENDAR' : getLang() === 'kz' ? 'КҮНТІЗБЕ' : 'КАЛЕНДАРЬ') +
      '</span><h2>' + title + '</h2></div><button type="button" class="obsidian-calendar-close" aria-label="Close">×</button></div>' +
      '<div class="obsidian-calendar-nav"><button type="button" data-shift="-1" aria-label="Previous month">‹</button><span>' + title + '</span><button type="button" data-shift="1" aria-label="Next month">›</button></div>' +
      '<div class="obsidian-calendar-grid">' + weekdays.map(function(w){return '<span class="obsidian-calendar-weekday">' + w + '</span>';}).join('') + cells.join('') + '</div>' +
      '<button type="button" class="obsidian-calendar-today">' + (getLang() === 'en' ? 'Today' : getLang() === 'kz' ? 'Бүгін' : 'Сегодня') + '</button></div>';
  }
  function wireCalendar() {
    var root = document.querySelector('#modal .obsidian-calendar');
    if (!root) return;
    root.querySelector('.obsidian-calendar-close').addEventListener('click', function (event) {
      event.stopPropagation();
      document.getElementById('modalOverlay').classList.remove('open');
    });
    root.querySelectorAll('[data-shift]').forEach(function (button) {
      button.addEventListener('click', function () { window.tiinCalendarShift(Number(button.dataset.shift)); });
    });
    root.querySelectorAll('[data-day]').forEach(function (button) {
      button.addEventListener('click', function () { window.tiinCalendarPick(Number(button.dataset.day)); });
    });
    root.querySelector('.obsidian-calendar-today').addEventListener('click', window.tiinCalendarToday);
  }
  window.openTIINCalendar = function () {
    calendarView = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    document.getElementById('modal').innerHTML = calendarHtml();
    wireCalendar();
    document.getElementById('modalOverlay').classList.add('open');
  };
  window.tiinCalendarShift = function (delta) {
    calendarView = new Date(calendarView.getFullYear(), calendarView.getMonth() + delta, 1);
    document.getElementById('modal').innerHTML = calendarHtml();
    wireCalendar();
  };
  window.tiinCalendarToday = function () {
    calendarView = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    window.tiinCalendarPick(new Date().getDate());
  };
  window.tiinCalendarPick = function (day) {
    var year = calendarView.getFullYear(), month = calendarView.getMonth();
    if (typeof currentYear !== 'undefined' && typeof currentMonth !== 'undefined') {
      currentYear = year; currentMonth = month;
      if (typeof render === 'function') render();
      if (typeof switchTab === 'function') switchTab('transactions');
    }
    document.getElementById('modalOverlay').classList.remove('open');
    var key = year + '-' + String(month + 1).padStart(2,'0') + '-' + String(day).padStart(2,'0');
    setTimeout(function () {
      var group = document.querySelector('#tab-transactions .day-group[data-date="' + key + '"]');
      if (group) group.scrollIntoView({ behavior:'smooth', block:'center' });
    }, 60);
  };

  function setupHeader() {
    var app = document.getElementById('app');
    var date = document.getElementById('todayDate');
    if (!app || !date) return;

    // Rendering happens often in the legacy app. Once the command bar exists,
    // never derive its parent from the logo again: that would nest the header.
    var readyHeader = app.querySelector(':scope > .command-header[data-command-deck="true"]');
    if (readyHeader) {
      commandDate();
      return;
    }

    var logo = app.querySelector('img[alt="TIIN"]');
    if (!logo) return;
    var logoWrap = logo.parentElement;
    var header = logoWrap && logoWrap.parentElement;
    if (!header) return;

    var controls = document.querySelector('.top-controls');
    var left = document.createElement('div');
    var center = document.createElement('div');
    var right = document.createElement('div');
    left.className = 'command-date-slot';
    center.className = 'command-logo-slot';
    right.className = 'command-control-slot';
    left.appendChild(date);
    logoWrap.innerHTML = '<span class="obsidian-brand" aria-label="TIIN"><span class="obsidian-coin" aria-hidden="true">T</span><span>TIIN</span></span>';
    center.appendChild(logoWrap);
    if (controls) right.appendChild(controls);
    header.replaceChildren(left, center, right);
    header.classList.add('command-header');
    header.dataset.commandDeck = 'true';
    commandDate();
  }

  function setupDock() {
    var names = {
      transactions: copy().home,
      analytics: copy().analytics,
      goals: copy().goals,
      payments: copy().payments,
      payment_tracker: copy().more,
      settings: window.currentLang === 'kz' ? 'Баптаулар' : window.currentLang === 'en' ? 'Settings' : 'Настройки',
      planning: copy().lists
    };
    document.querySelectorAll('.tabs .tab').forEach(function (tab) {
      var label = tab.querySelector('.command-nav-label');
      if (!label) {
        label = document.createElement('span');
        label.className = 'command-nav-label';
        tab.appendChild(label);
      }
      label.textContent = names[tab.dataset.tab] || copy().more;
      tab.setAttribute('aria-label', label.textContent);
    });
  }

  function amount(value) {
    if (typeof window.fmt === 'function') return window.fmt(value);
    if (typeof fmt === 'function') return fmt(value);
    return new Intl.NumberFormat(getLang() === 'kz' ? 'kk-KZ' : getLang() === 'en' ? 'en-GB' : 'ru-RU', { maximumFractionDigits: 0 }).format(Number(value || 0)) + ' ₸';
  }

  function metrics() {
    try {
      if (typeof getTxns !== 'function' || typeof filterTxnsByWallet !== 'function') return { income: 0, expense: 0, count: 0 };
      var txns = filterTxnsByWallet(getTxns(currentYear, currentMonth)) || [];
      return txns.reduce(function (result, tx) {
        var value = Number(tx.amount || 0);
        if (tx.type === 'income') result.income += value;
        if (tx.type === 'expense') result.expense += value;
        result.count += 1;
        return result;
      }, { income: 0, expense: 0, count: 0 });
    } catch (_) {
      return { income: 0, expense: 0, count: 0 };
    }
  }

  function composeKpis() {
    var summary = document.querySelector('.summary');
    var balance = document.getElementById('balanceKpi');
    if (!summary || !balance || !summary.parentNode) return;
    // The forecast is a full-width card immediately below the factual balance.
    if (balance.nextElementSibling !== summary) summary.parentNode.insertBefore(balance, summary);
    // Keep quick actions visible before secondary shortcuts, as in Obsidian.
    var actions = document.querySelector('.actions');
    var templates = document.querySelector('.templates-scroll');
    if (actions && templates && actions.parentNode === templates.parentNode && actions.nextElementSibling !== templates) {
      actions.after(templates);
    }
  }

  function updateDesktopContext() {
    var panel = document.getElementById('desktopContext');
    if (!panel) return;
    var text = copy();
    var data = metrics();
    panel.innerHTML =
      '<div class="command-side-eyebrow">TIIN</div>' +
      '<div class="command-side-title">' + text.month + '</div>' +
      '<div class="command-side-flow">' +
        '<div><span>' + text.income + '</span><b class="income">' + amount(data.income) + '</b></div>' +
        '<div><span>' + text.expense + '</span><b class="expense">' + amount(data.expense) + '</b></div>' +
      '</div>' +
      '<div class="command-side-divider"></div>' +
      '<div class="command-side-row"><span>' + text.operations + '</span><b>' + data.count + '</b></div>' +
      '<div class="command-side-row"><span>' + text.lists + '</span><b class="gold">☷</b></div>' +
      '<div class="command-side-row"><span>' + text.currencies + '</span><b class="gold">⇄</b></div>' +
      '<div class="command-side-actions">' +
        '<button type="button" onclick="window.openPlanning && window.openPlanning()">☷ ' + text.lists + '</button>' +
        '<button type="button" onclick="window.TIINCurrency && window.TIINCurrency.open()">⇄ ' + text.currencies + '</button>' +
      '</div>';
  }

  function refresh() {
    refreshTimer = null;
    setupHeader();
    setupDock();
    composeKpis();
    updateDesktopContext();
  }

  function scheduleRefresh() {
    if (refreshTimer) return;
    refreshTimer = window.setTimeout(refresh, 0);
  }

  function patchRender() {
    if (!window.render || window.render.__commandDeck) return;
    var originalRender = window.render;
    function wrappedRender() {
      var result = originalRender.apply(this, arguments);
      scheduleRefresh();
      return result;
    }
    wrappedRender.__commandDeck = true;
    window.render = wrappedRender;
  }

  function patchLanguage() {
    if (!window.toggleLang || window.toggleLang.__commandDeck) return;
    var originalToggleLang = window.toggleLang;
    function wrappedToggleLang() {
      var result = originalToggleLang.apply(this, arguments);
      scheduleRefresh();
      return result;
    }
    wrappedToggleLang.__commandDeck = true;
    window.toggleLang = wrappedToggleLang;
  }

  function patchDate() {
    if (!window.updateTodayDate || window.updateTodayDate.__commandDeck) return;
    var originalUpdateTodayDate = window.updateTodayDate;
    function wrappedUpdateTodayDate() {
      var result = originalUpdateTodayDate.apply(this, arguments);
      commandDate();
      return result;
    }
    wrappedUpdateTodayDate.__commandDeck = true;
    window.updateTodayDate = wrappedUpdateTodayDate;
  }

  function init() {
    injectStyles();
    patchRender();
    patchLanguage();
    patchDate();
    refresh();
    window.setTimeout(refresh, 250);
    window.setTimeout(refresh, 900);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) scheduleRefresh();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}());
