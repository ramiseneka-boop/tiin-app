/* TIIN Currency Center — live converter. Existing finance records remain stored in KZT. */
(function () {
  'use strict';

  const API_URL = 'https://open.er-api.com/v6/latest/USD';
  const CACHE_KEY = 'tiin_currency_rates_v1';
  const CURRENCIES = [
    { code: 'KZT', symbol: '₸', name: 'Казахстанский тенге', decimals: 0 },
    { code: 'USD', symbol: '$', name: 'Доллар США', decimals: 2 },
    { code: 'VND', symbol: '₫', name: 'Вьетнамский донг', decimals: 0 },
    { code: 'EUR', symbol: '€', name: 'Евро', decimals: 2 },
    { code: 'RUB', symbol: '₽', name: 'Российский рубль', decimals: 2 }
  ];
  let rates = null;
  let sourceTime = null;

  function locale() { return window.currentLang === 'kz' ? 'kk-KZ' : 'ru-RU'; }
  function labels() {
    return window.currentLang === 'kz'
      ? { title: 'Валюта конвертері', from: 'Беремін', to: 'Аламын', amount: 'Сома', result: 'Нәтиже', refresh: 'Курсты жаңарту', offline: 'Соңғы сақталған курс', updated: 'Жаңартылды', live: 'Нарықтық курс', error: 'Курсты жаңарту мүмкін болмады' }
      : { title: 'Конвертер валют', from: 'Отдаю', to: 'Получаю', amount: 'Сумма', result: 'Результат', refresh: 'Обновить курс', offline: 'Последний сохранённый курс', updated: 'Обновлено', live: 'Рыночный курс', error: 'Не удалось обновить курс' };
  }
  function getCurrency(code) { return CURRENCIES.find(item => item.code === code) || CURRENCIES[0]; }
  function format(value, code) {
    const c = getCurrency(code);
    return new Intl.NumberFormat(locale(), { minimumFractionDigits: 0, maximumFractionDigits: c.decimals }).format(Number(value || 0)) + ' ' + c.symbol;
  }
  function saved() {
    try {
      const value = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      return value && value.rates ? value : null;
    } catch (_) { return null; }
  }
  function useSaved() {
    const value = saved();
    if (!value) return false;
    rates = value.rates;
    sourceTime = value.updatedAt || null;
    return true;
  }
  async function getRates(force) {
    if (rates && !force) return { cached: false };
    if (!navigator.onLine && useSaved()) return { cached: true };
    try {
      const response = await fetch(API_URL, { cache: 'no-store' });
      if (!response.ok) throw new Error('rate service unavailable');
      const payload = await response.json();
      if (payload.result !== 'success' || !payload.rates) throw new Error('invalid rate response');
      const next = { USD: 1 };
      CURRENCIES.forEach(currency => {
        if (currency.code !== 'USD' && typeof payload.rates[currency.code] !== 'number') throw new Error('missing ' + currency.code);
        next[currency.code] = currency.code === 'USD' ? 1 : payload.rates[currency.code];
      });
      rates = next;
      sourceTime = payload.time_last_update_utc || new Date().toISOString();
      localStorage.setItem(CACHE_KEY, JSON.stringify({ rates, updatedAt: sourceTime }));
      return { cached: false };
    } catch (error) {
      if (useSaved()) return { cached: true, error };
      throw error;
    }
  }
  function converted(amount, from, to) {
    if (!rates || !rates[from] || !rates[to]) return 0;
    return Number(amount || 0) / rates[from] * rates[to];
  }
  function selector(id, selected) {
    return '<select class="currency-select" id="' + id + '">' + CURRENCIES.map(currency =>
      '<option value="' + currency.code + '"' + (currency.code === selected ? ' selected' : '') + '>' + currency.code + ' · ' + currency.symbol + '</option>'
    ).join('') + '</select>';
  }
  function statusText(cached) {
    const l = labels();
    const date = sourceTime ? new Date(sourceTime).toLocaleString(locale(), { dateStyle: 'medium', timeStyle: 'short' }) : '';
    return (cached ? l.offline : l.live) + (date ? ' · ' + l.updated + ': ' + date : '');
  }
  function renderModal(cached) {
    const l = labels();
    const box = document.getElementById('modal');
    const overlay = document.getElementById('modalOverlay');
    if (!box || !overlay) return;
    box.innerHTML = '<div class="currency-modal"><div class="currency-kicker">TIIN</div><h3>' + l.title + '</h3>' +
      '<p class="currency-status" id="currencyStatus">' + statusText(cached) + '</p>' +
      '<div class="currency-fields"><div class="form-group"><label>' + l.amount + '</label><input id="currencyAmount" class="form-input currency-amount" type="number" inputmode="decimal" min="0" value="1"></div>' +
      '<div class="currency-pair"><div><label>' + l.from + '</label>' + selector('currencyFrom', 'USD') + '</div><button type="button" class="currency-swap" onclick="TIINCurrency.swap()" aria-label="swap">⇄</button><div><label>' + l.to + '</label>' + selector('currencyTo', 'KZT') + '</div></div></div>' +
      '<div class="currency-result"><span>' + l.result + '</span><strong id="currencyResult"></strong><small id="currencyRateLine"></small></div>' +
      '<div class="currency-list" id="currencyRates"></div>' +
      '<button class="btn btn-ghost" style="width:100%;margin-top:14px" onclick="TIINCurrency.refresh()">' + l.refresh + '</button></div>';
    overlay.classList.add('open');
    ['currencyAmount','currencyFrom','currencyTo'].forEach(id => document.getElementById(id).addEventListener('input', updateConversion));
    updateConversion();
  }
  function updateConversion() {
    const amount = Number(document.getElementById('currencyAmount')?.value || 0);
    const from = document.getElementById('currencyFrom')?.value || 'USD';
    const to = document.getElementById('currencyTo')?.value || 'KZT';
    const result = converted(amount, from, to);
    const resultEl = document.getElementById('currencyResult');
    const lineEl = document.getElementById('currencyRateLine');
    if (resultEl) resultEl.textContent = format(result, to);
    if (lineEl) lineEl.textContent = '1 ' + from + ' = ' + format(converted(1, from, to), to);
    const list = document.getElementById('currencyRates');
    if (list) list.innerHTML = CURRENCIES.filter(currency => currency.code !== 'KZT').map(currency =>
      '<div><span>1 ' + currency.code + '</span><b>' + format(converted(1, currency.code, 'KZT'), 'KZT') + '</b></div>'
    ).join('');
  }
  async function open() {
    try {
      const info = await getRates(false);
      renderModal(info.cached);
    } catch (_) {
      alert(labels().error);
    }
  }
  async function refresh() {
    const status = document.getElementById('currencyStatus');
    if (status) status.textContent = '…';
    try {
      const info = await getRates(true);
      renderModal(info.cached);
    } catch (_) {
      if (status) status.textContent = labels().error;
    }
  }
  function swap() {
    const from = document.getElementById('currencyFrom');
    const to = document.getElementById('currencyTo');
    const next = from.value; from.value = to.value; to.value = next;
    updateConversion();
  }
  function ensureAccess() {
    const templates = document.getElementById('templatesScroll');
    if (!templates || document.getElementById('currencyAccess')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'currencyAccess';
    button.className = 'template-chip currency-access';
    button.innerHTML = '⇄ <span>' + (window.currentLang === 'kz' ? 'Валюталар' : 'Валюты') + '</span>';
    button.onclick = open;
    templates.appendChild(button);
  }
  async function getRateSnapshot(force) {
    const info = await getRates(Boolean(force));
    return { rates: { ...rates }, updatedAt: sourceTime, cached: Boolean(info.cached) };
  }
  window.TIINCurrency = { open, refresh, swap, updateConversion, getRateSnapshot };
  document.addEventListener('DOMContentLoaded', ensureAccess);
  const previousRender = window.render;
  if (typeof previousRender === 'function') {
    window.render = function currencyRender() {
      previousRender();
      ensureAccess();
    };
  }
}());
