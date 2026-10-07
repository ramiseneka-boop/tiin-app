/* TIIN Command Deck — non-destructive layout controller. */
(function () {
  'use strict';

  var STYLE_ID = 'tiinCommandDeckStyles';
  var refreshTimer = null;
  var labels = {
    ru: { home: 'Главная', analytics: 'Аналитика', goals: 'Цели', payments: 'Платежи', more: 'Ещё', month: 'Этот месяц', income: 'Доход', expense: 'Расход', operations: 'Операции', lists: 'Списки', currencies: 'Валюты', openAnalytics: 'Аналитика' },
    kz: { home: 'Басты', analytics: 'Талдау', goals: 'Мақсаттар', payments: 'Төлемдер', more: 'Тағы', month: 'Осы ай', income: 'Кіріс', expense: 'Шығыс', operations: 'Операциялар', lists: 'Тізімдер', currencies: 'Валюталар', openAnalytics: 'Талдау' }
  };

  function getLang() {
    return window.currentLang === 'kz' ? 'kz' : 'ru';
  }

  function copy() {
    return labels[getLang()];
  }

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var link = document.createElement('link');
    link.id = STYLE_ID;
    link.rel = 'stylesheet';
    link.href = 'styles/tiin-command-deck.css?v=6';
    document.head.appendChild(link);
  }

  function commandDate() {
    var date = document.getElementById('todayDate');
    if (!date) return;
    var now = new Date();
    var locale = getLang() === 'kz' ? 'kk-KZ' : 'ru-RU';
    var weekday = new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(now).replace('.', '');
    var month = new Intl.DateTimeFormat(locale, { month: 'short' }).format(now).replace('.', '');
    weekday = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    date.className = 'command-date';
    date.innerHTML = '<strong>' + weekday + '</strong><i>·</i><span>' + now.getDate() + ' ' + month + '</span>';
  }

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
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Number(value || 0)) + ' ₸';
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
    if (!summary || !balance || balance.parentElement === summary) return;
    // Visual regrouping only: the existing balance calculation and values stay unchanged.
    summary.appendChild(balance);
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
