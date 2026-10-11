/* TIIN navigation, settings, onboarding and payment schedules.
   Additive layer: keeps legacy localStorage intact and stores new fields separately. */
(function () {
  'use strict';
  const PREF = 'tiin_preferences_v1';
  const TOUR = 'tiin_onboarding_v1';
  const SCHEDULES = 'tiin_payment_schedules_v2';
  const HIDDEN_CATS = 'tiin_hidden_categories_v1';
  const now = () => new Date();
  const pad = n => String(n).padStart(2, '0');
  const periodKey = (d = now()) => d.getFullYear() + '-' + pad(d.getMonth() + 1);
  const dateKey = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) || '') || fallback; } catch (_) { return fallback; } };
  const write = (key, value) => { localStorage.setItem(key, JSON.stringify(value)); window.TIINCloud?.scheduleSync?.(); };
  const amount = value => Math.max(0, Number(value) || 0);
  const escape = value => String(value || '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const fmtSafe = value => typeof window.fmt === 'function' ? window.fmt(value) : new Intl.NumberFormat('ru-RU').format(amount(value)) + ' ₸';
  const catName = id => (window.EXPENSE_CATS || []).find(c => c.id === id)?.name || id || 'Другое';
  const catIcon = id => (window.EXPENSE_CATS || []).find(c => c.id === id)?.icon || '📌';
  const prefs = () => Object.assign({mode:'full', daypart:'auto', notifications:{}}, read(PREF, {}));
  const savePrefs = patch => write(PREF, Object.assign(prefs(), patch));
  const schedules = () => read(SCHEDULES, []);
  const saveSchedules = value => write(SCHEDULES, value);
  // One-time, non-destructive migration: old tracker/recurring records become
  // schedules. Their historical transactions remain exactly where they were.
  function migrateLegacyPayments() {
    if (read('tiin_payment_schedules_migrated_v1', false)) return;
    const existing = schedules(); const known = new Set(existing.map(x => x.legacyKey));
    read('payment_items', []).forEach(item => {
      const key='tracker:'+item.id; if (known.has(key)) return;
      existing.push({id:'legacy-tracker-'+item.id,legacyKey:key,title:item.name||'Регулярный платёж',amount:amount(item.amount),category:item.category||'other',wallet:item.wallet||'personal',repeat:'monthly',day:Number(item.deadline)||15,priority:item.priority||'medium',reminder:false,createdAt:item.createdAt||Date.now()});
    });
    const recurring=read('recurring', []); let touched=false;
    recurring.forEach(item => {
      const key='recurring:'+item.id; if (!known.has(key)) existing.push({id:'legacy-recurring-'+item.id,legacyKey:key,autoRecurringId:'recurring_'+item.id,title:item.name||'Регулярный платёж',amount:amount(item.amount),category:item.category||'other',wallet:item.wallet||'personal',repeat:'monthly',day:Number(item.day)||15,priority:item.priority||'medium',reminder:false,createdAt:item.createdAt||Date.now()});
      if (!item.manual) { item.manual=true; touched=true; }
    });
    if (existing.length) saveSchedules(existing);
    if (touched) write('recurring', recurring);
    write('tiin_payment_schedules_migrated_v1', true);
  }
  function txns(year = currentYear, month = currentMonth) { return typeof getTxns === 'function' ? getTxns(year, month) : []; }
  function txKey(tx) { return String(tx.paymentScheduleId || '') + ':' + String(tx.paymentPeriod || ''); }
  function paymentTx(schedule, key = periodKey()) { return txns().find(t => t.type === 'expense' && (txKey(t) === schedule.id + ':' + key || (schedule.autoRecurringId && t.auto_recurring_id === schedule.autoRecurringId))); }
  function dueFor(schedule, ref = now()) {
    const y = ref.getFullYear(), m = ref.getMonth();
    if (schedule.repeat === 'once') return new Date(schedule.date + 'T00:00:00');
    if (schedule.repeat === 'weekly') {
      const weekday = Number(schedule.weekday || 1);
      const d = new Date(y, m, 1); d.setDate(1 + ((weekday - d.getDay() + 7) % 7)); return d;
    }
    return new Date(y, m, Math.min(Math.max(1, Number(schedule.day) || 1), new Date(y, m + 1, 0).getDate()));
  }
  function isInScope(schedule, ref = now()) {
    return schedule.repeat !== 'once' || schedule.date.slice(0,7) === periodKey(ref);
  }
  function isOverdue(schedule, ref = now()) {
    const due = dueFor(schedule, ref); const paid = paymentTx(schedule);
    return !paid && due < new Date(ref.getFullYear(), ref.getMonth(), ref.getDate()) && isInScope(schedule, ref);
  }
  function statusText(schedule) { const tx = paymentTx(schedule); if (tx) return 'Оплачен'; return isOverdue(schedule) ? 'Просрочен' : 'К оплате'; }
  function currentSchedules() { return schedules().filter(s => !s.archived && isInScope(s)); }

  function installNavigation() {
    const tabs = document.querySelectorAll('.tabs .tab');
    tabs.forEach(tab => {
      if (tab.dataset.tab === 'payment_tracker') {
        tab.dataset.tab = 'settings';
        tab.setAttribute('onclick', "switchTab('settings')");
        tab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.2 2.2-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20.4h-3.1v-.09A1.7 1.7 0 0 0 10.5 18.75a1.7 1.7 0 0 0-1.88.34l-.06.06-2.2-2.2.06-.06A1.7 1.7 0 0 0 6.76 15a1.7 1.7 0 0 0-1.56-1.03H5.1v-3.1h.1A1.7 1.7 0 0 0 6.76 9.84a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.2-2.2.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.56V4.45h3.1v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.2 2.2-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.03h.1v3.1h-.1A1.7 1.7 0 0 0 19.4 15Z"/></svg><span class="command-nav-label">Настройки</span>';
      }
      const label = tab.querySelector('.command-nav-label');
      if (label && tab.dataset.tab === 'settings') label.textContent = 'Настройки';
    });
    const old = document.getElementById('tab-payment_tracker');
    if (old) old.id = 'tab-settings';
  }

  function help(topic) {
    const map = {
      balance:['Свободный баланс','Это деньги, которые ещё не выделены на жизнь, цели и обязательства. Именно ими можно распоряжаться без нарушения плана.'],
      plan:['Финансовый план','Помогает разложить текущие деньги: на жизнь, накопления и свободный резерв. Расходы на жизнь уменьшают только выделенную часть.'],
      limits:['Лимиты','Лимит — это ориентир, а не блокировка. TIIN предупредит на 80% и пометит расходы сверх заданной суммы.'],
      goals:['Цели и автокопилка','Отложенные деньги лежат в цели отдельно. Автокопилка переводит заданный процент из новых доходов в выбранную цель.'],
      deals:['Сделки','До оплаты сделка — прогноз. После «Получить оплату» создаётся реальный доход, а чистая прибыль показывает экономику сделки.'],
      payments:['Платежи','После «Оплатить» создаётся реальный расход, уменьшается баланс и операция попадает в историю и аналитику.']
    };
    const x = map[topic] || map.balance;
    document.getElementById('modal').innerHTML = '<div class="tiin-sheet"><div class="tiin-sheet-handle"></div><h2>💡 '+x[0]+'</h2><p>'+x[1]+'</p><button class="btn btn-gold" onclick="closeModal()">Понятно</button></div>';
    document.getElementById('modalOverlay').classList.add('open');
  }
  window.openTIINHelp = help;

  function showPaymentModal(id) {
    const existing = schedules().find(s => s.id === id);
    const s = existing || {title:'',amount:'',category:'other',wallet:'personal',repeat:'monthly',day:15,priority:'medium',reminder:false,date:dateKey(now())};
    const cats = (window.EXPENSE_CATS || []).map(c => '<option value="'+c.id+'" '+(s.category===c.id?'selected':'')+'>'+c.icon+' '+c.name+'</option>').join('');
    document.getElementById('modal').innerHTML = '<div class="tiin-sheet tiin-payment-form"><div class="tiin-sheet-handle"></div><h2>'+ (existing ? 'Изменить платёж':'Новый платёж') +'</h2>'+
      '<label>Название<input id="tp_title" class="form-input" value="'+escape(s.title)+'" placeholder="Например, интернет"></label>'+
      '<label>Сумма<input id="tp_amount" class="form-input" type="number" inputmode="numeric" value="'+amount(s.amount)+'" placeholder="0"></label>'+
      '<div class="tiin-two"><label>Категория<select id="tp_category" class="form-input">'+cats+'</select></label><label>Кошелёк<select id="tp_wallet" class="form-input"><option value="personal" '+(s.wallet==='personal'?'selected':'')+'>Личный</option><option value="business" '+(s.wallet==='business'?'selected':'')+'>Бизнес</option></select></label></div>'+
      '<div class="tiin-two"><label>Повторяемость<select id="tp_repeat" class="form-input" onchange="TIINPaymentRepeatChanged()"><option value="monthly" '+(s.repeat==='monthly'?'selected':'')+'>Ежемесячно</option><option value="weekly" '+(s.repeat==='weekly'?'selected':'')+'>Еженедельно</option><option value="once" '+(s.repeat==='once'?'selected':'')+'>Разово</option></select></label><label>Приоритет<select id="tp_priority" class="form-input"><option value="high" '+(s.priority==='high'?'selected':'')+'>Высокий</option><option value="medium" '+(s.priority==='medium'?'selected':'')+'>Средний</option><option value="low" '+(s.priority==='low'?'selected':'')+'>Низкий</option></select></label></div>'+
      '<div id="tp_date_row"></div><label class="tiin-check"><input type="checkbox" id="tp_reminder" '+(s.reminder?'checked':'')+'> Напоминать за день и в день оплаты</label>'+
      '<button class="btn btn-gold" onclick="saveTIINPayment(\''+(id||'')+'\')">Сохранить</button></div>';
    document.getElementById('modalOverlay').classList.add('open'); window.TIINPaymentRepeatChanged(s);
  }
  window.TIINPaymentRepeatChanged = function(seed) {
    const repeat = document.getElementById('tp_repeat')?.value || seed?.repeat || 'monthly';
    const row = document.getElementById('tp_date_row'); if (!row) return;
    if (repeat === 'once') row.innerHTML='<label>Дата оплаты<input id="tp_date" class="form-input" type="date" value="'+(seed?.date || dateKey(now()))+'"></label>';
    else if (repeat === 'weekly') row.innerHTML='<label>День недели<select id="tp_weekday" class="form-input"><option value="1">Понедельник</option><option value="2">Вторник</option><option value="3">Среда</option><option value="4">Четверг</option><option value="5">Пятница</option><option value="6">Суббота</option><option value="0">Воскресенье</option></select></label>';
    else row.innerHTML='<label>День месяца<input id="tp_day" class="form-input" type="number" min="1" max="31" value="'+(seed?.day||15)+'"></label>';
    if (repeat === 'weekly' && seed) document.getElementById('tp_weekday').value = String(seed.weekday || 1);
  };
  window.openTIINPaymentModal = showPaymentModal;
  window.saveTIINPayment = function(id) {
    const title = document.getElementById('tp_title').value.trim(), value = amount(document.getElementById('tp_amount').value);
    if (!title || !value) { toast('Укажи название и сумму'); return; }
    const repeat = document.getElementById('tp_repeat').value;
    const record = {id:id||('payment-'+Date.now()),title,amount:value,category:document.getElementById('tp_category').value,wallet:document.getElementById('tp_wallet').value,repeat,priority:document.getElementById('tp_priority').value,reminder:document.getElementById('tp_reminder').checked,day:amount(document.getElementById('tp_day')?.value),weekday:amount(document.getElementById('tp_weekday')?.value),date:document.getElementById('tp_date')?.value || dateKey(now()),createdAt:Date.now()};
    const all=schedules(); const index=all.findIndex(x=>x.id===record.id); if(index>=0) all[index]=Object.assign(all[index],record); else all.push(record);
    saveSchedules(all); closeModal(); toast('Платёж сохранён'); renderPayments();
  };
  window.payTIINPayment = function(id) {
    const s=schedules().find(x=>x.id===id); if(!s || paymentTx(s)) { toast('Этот платёж уже учтён'); return; }
    const d=dueFor(s); const y=d.getFullYear(),m=d.getMonth(), key=periodKey();
    const list=txns(y,m); list.push({id:String(Date.now()),type:'expense',amount:s.amount,category:s.category,comment:s.title+' · платёж',date:dateKey(now()),wallet:s.wallet,paymentScheduleId:s.id,paymentPeriod:key});
    localStorage.setItem('txns_'+y+'_'+m,JSON.stringify(list)); window.TIINCloud?.scheduleSync?.(); toast('Расход добавлен в историю'); render();
  };
  window.unpayTIINPayment = function(id) {
    const s=schedules().find(x=>x.id===id), key=periodKey(); if(!s) return;
    let removed=false; for(let y=currentYear-1;y<=currentYear+1;y++) for(let m=0;m<12;m++){const k='txns_'+y+'_'+m;const list=read(k,[]);const next=list.filter(t=>!(t.paymentScheduleId===s.id&&t.paymentPeriod===key));if(next.length!==list.length){localStorage.setItem(k,JSON.stringify(next));removed=true;}}
    if(removed){window.TIINCloud?.scheduleSync?.();toast('Связанная операция отменена');render();}
  };
  window.removeTIINPayment = function(id) { if(!confirm('Убрать этот платёж? История операций останется.'))return; saveSchedules(schedules().filter(x=>x.id!==id));renderPayments(); };

  function renderPayments() {
    const host=document.getElementById('tab-payments'); if(!host) return;
    const list=currentSchedules().sort((a,b)=>dueFor(a)-dueFor(b));
    const paid=list.filter(s=>paymentTx(s)); const unpaid=list.filter(s=>!paymentTx(s));
    const due=unpaid.reduce((n,s)=>n+amount(s.amount),0), paidSum=paid.reduce((n,s)=>n+amount(s.amount),0), overdue=unpaid.filter(s=>isOverdue(s)).reduce((n,s)=>n+amount(s.amount),0), next=unpaid[0];
    host.innerHTML='<section class="tiin-section-head"><div><span class="tiin-kicker">ОБЯЗАТЕЛЬСТВА</span><h2>📅 Платежи <button class="tiin-help-btn" onclick="openTIINHelp(\'payments\')">i</button></h2><p>Регулярные расходы и будущие обязательства</p></div><button class="btn btn-gold" onclick="openTIINPaymentModal()">+ Платёж</button></section>'+
      '<section class="tiin-payment-metrics"><div><small>К оплате</small><b>'+fmtSafe(due)+'</b></div><div><small>Оплачено</small><b class="positive">'+fmtSafe(paidSum)+'</b></div><div><small>Просрочено</small><b class="'+(overdue?'negative':'')+'">'+fmtSafe(overdue)+'</b></div><div><small>Ближайший</small><b>'+ (next ? escape(next.title) : '—') +'</b></div></section>'+
      (list.length ? '<section class="tiin-pay-list">'+list.map(s=>{const paidTx=paymentTx(s), overdueFlag=isOverdue(s), tag=paidTx?'paid':overdueFlag?'overdue':'pending';return '<article class="tiin-pay-item"><div class="tiin-pay-date">'+pad(dueFor(s).getDate())+'<small>'+['вс','пн','вт','ср','чт','пт','сб'][dueFor(s).getDay()]+'</small></div><div class="tiin-pay-main"><b>'+catIcon(s.category)+' '+escape(s.title)+'</b><small>'+catName(s.category)+' · '+({monthly:'ежемесячно',weekly:'еженедельно',once:'разово'}[s.repeat])+'</small></div><div class="tiin-pay-amount"><b>'+fmtSafe(s.amount)+'</b><span class="'+tag+'">'+statusText(s)+'</span></div><div class="tiin-pay-actions">'+(paidTx?'<button class="btn btn-ghost btn-sm" onclick="unpayTIINPayment(\''+s.id+'\')">Отменить</button>':'<button class="btn btn-gold btn-sm" onclick="payTIINPayment(\''+s.id+'\')">Оплатить</button>')+'<button class="tiin-icon-btn" onclick="openTIINPaymentModal(\''+s.id+'\')">⋮</button></div></article>';}).join('')+'</section>' :
      '<section class="tiin-empty"><div>📅</div><h3>Пока нет платежей</h3><p>Добавь ипотеку, аренду, интернет или подписку. После оплаты TIIN сам создаст расход.</p><button class="btn btn-gold" onclick="openTIINPaymentModal()">Добавить платёж</button></section>');
  }
  window.renderPayments = renderPayments;

  function FAQ() {
    const rows=[
      ['С чего начать','Укажи стартовый баланс, добавь первую операцию и ближайший платёж. Затем создай цель или лимит.','transactions'],
      ['Почему общий и свободный баланс отличаются?','Общий баланс — все фактические деньги. Свободный — деньги, ещё не выделенные на жизнь, накопления и обязательства.','transactions'],
      ['Как работают лимиты?','Они предупреждают на 80% и показывают траты сверх лимита. Деньги не блокируются.','settings'],
      ['Как работают цели и автокопилка?','В цели лежат отдельно отложенные деньги. Процент автокопилки переводится из новых доходов.','goals'],
      ['Как работают платежи?','Отметь платёж оплаченным — появится реальный расход в истории, аналитике и балансе.','payments'],
      ['Как работают сделки, НДС и чистая прибыль?','До оплаты сделка — прогноз. После оплаты в баланс попадает фактическая операция, а НДС и расходы остаются в расчёте экономики.','transactions'],
      ['Как разделить личные и бизнес-деньги?','У каждой операции, сделки и платежа выбирается личный или бизнес-кошелёк.','transactions'],
      ['Как работает синхронизация и резервная копия?','Войди в аккаунт — TIIN синхронизирует данные. Резервная копия сохраняет их отдельно на устройстве.','settings'],
      ['Как учитывать валюты в поездках?','Добавь валюту в настройках. TIIN покажет пересчёт в основной валюте.','settings']
    ];
    return '<div class="tiin-faq">'+rows.map((x,i)=>'<details><summary>'+x[0]+'</summary><p>'+x[1]+'</p><button class="btn btn-ghost btn-sm" onclick="TIINGoTo(\''+x[2]+'\')">Открыть раздел</button></details>').join('')+'</div>';
  }
  window.TIINGoTo=function(tab){switchTab(tab); setTimeout(()=>document.getElementById('tab-'+tab)?.scrollIntoView({behavior:'smooth',block:'start'}),80);};
  function setMode(value){savePrefs({mode:value});applyMode();renderSettings();}
  window.setTIINMode=setMode;
  function settings() {
    const host=document.getElementById('tab-settings');if(!host)return;
    const p=prefs(), user=read('tiin_user',null), sync=localStorage.getItem('tiin_last_sync')||'—';
    host.innerHTML='<section class="tiin-section-head"><div><span class="tiin-kicker">ПРАВИЛА И ДАННЫЕ</span><h2>⚙️ Настройки</h2><p>Настрой TIIN под свой способ вести деньги</p></div></section>'+
      '<section class="tiin-settings-group"><h3>Контроль расходов</h3><button class="tiin-setting-row" onclick="openSpendingLimits()"><span>🎯 <b>Лимиты расходов</b><small>День, месяц, категории и предупреждения</small></span><i>›</i></button></section>'+
      '<section class="tiin-settings-group"><h3>Категории и шаблоны</h3><button class="tiin-setting-row" onclick="openTemplatesModal()"><span>🏷️ <b>Шаблоны частых операций</b><small>Быстрое добавление доходов и расходов</small></span><i>›</i></button><button class="tiin-setting-row" onclick="TIINCategoryInfo()"><span>✦ <b>Свои категории</b><small>Добавляй и скрывай ненужные категории</small></span><i>›</i></button></section>'+
      '<section class="tiin-settings-group"><h3>Валюты и внешний вид</h3><button class="tiin-setting-row" onclick="window.TIINCurrency?.open?.()"><span>⇄ <b>Валюты</b><small>Основная валюта и пересчёт в поездках</small></span><i>›</i></button><div class="tiin-setting-inline"><b>Режим использования</b><div class="tiin-segment"><button class="'+(p.mode==='simple'?'selected':'')+'" onclick="setTIINMode(\'simple\')">Простой</button><button class="'+(p.mode==='full'?'selected':'')+'" onclick="setTIINMode(\'full\')">Полный</button></div><small>В простом режиме не показываем сложные бизнес-инструменты на главной.</small></div><div class="tiin-setting-inline"><b>Фон по времени суток</b><div class="tiin-segment"><button class="'+(p.daypart==='auto'?'selected':'')+'" onclick="TIINDaypart(\'auto\')">Авто</button><button class="'+(p.daypart==='day'?'selected':'')+'" onclick="TIINDaypart(\'day\')">День</button><button class="'+(p.daypart==='night'?'selected':'')+'" onclick="TIINDaypart(\'night\')">Ночь</button></div></div></section>'+
      '<section class="tiin-settings-group"><h3>Уведомления</h3><p class="tiin-muted">Выбери только нужные напоминания.</p>'+['Платёж за день до срока','Платёж в день срока','80% лимита','Превышение лимита','Просроченная сделка','Цель отстаёт от срока'].map((n,i)=>'<label class="tiin-toggle"><span>'+n+'</span><input type="checkbox" '+(p.notifications[i]?'checked':'')+' onchange="TIINNotification('+i+',this.checked)"><i></i></label>').join('')+'</section>'+
      '<section class="tiin-settings-group"><h3>Данные и синхронизация</h3><div class="tiin-sync-state">☁️ Синхронизация: <b>'+ (user?'подключена':'локально') +'</b><small>Последняя: '+sync+'</small></div><div class="tiin-action-grid"><button class="btn btn-ghost" onclick="window.TIINCloud?.forceSync?.();toast(\'Синхронизация запущена\')">Синхронизировать</button><button class="btn btn-ghost" onclick="exportAllData()">Резервная копия</button><button class="btn btn-ghost" onclick="exportCSV()">CSV</button><button class="btn btn-ghost" onclick="exportPDF()">PDF</button></div></section>'+
      '<section class="tiin-settings-group"><h3>Аккаунт и безопасность</h3><button class="tiin-setting-row" onclick="window.TIINCloud?.open?.()"><span>👤 <b>'+(user?.email||'Войти и синхронизировать')+'</b><small>Google / email, устройства и выход</small></span><i>›</i></button></section>'+
      '<section class="tiin-settings-group"><h3>Как пользоваться TIIN</h3><p class="tiin-muted">Короткие ответы и переходы к нужной функции.</p>'+FAQ()+'</section>';
  }
  window.renderSettings=settings;
  window.TIINNotification=function(index,on){const p=prefs();p.notifications[index]=on;write(PREF,p);if(on&&'Notification'in window&&Notification.permission==='default')Notification.requestPermission();};
  window.TIINDaypart=function(v){savePrefs({daypart:v});applyMode();settings();};
  window.TIINCategoryInfo=function(){document.getElementById('modal').innerHTML='<div class="tiin-sheet"><div class="tiin-sheet-handle"></div><h2>Категории</h2><p>Стандартные категории сохраняют историю операций. Новые категории удобно добавлять при создании шаблона; скрытие не удаляет проведённые операции.</p><button class="btn btn-gold" onclick="closeModal();openTemplatesModal()">Открыть шаблоны</button></div>';document.getElementById('modalOverlay').classList.add('open');};

  function onboarding() {
    const state=read(TOUR,{}); if(state.dismissed||state.completed)return;
    const existing=txns().length>0, goal=read('goals',[]).length>0, payment=schedules().length>0||read('recurring',[]).length>0;
    const done=[existing,existing,payment,goal].filter(Boolean).length;
    if(done===4){write(TOUR,{completed:true});return;}
    const host=document.getElementById('tab-transactions');if(!host)return;
    const actions=[['Укажи текущий баланс','openModal(\'income\')',existing],['Добавь первый доход или расход','openModal(\'expense\')',existing],['Добавь ближайший обязательный платёж',"TIINGoTo('payments')",payment],['Создай цель или поставь лимит',"TIINGoTo('goals')",goal]];
    host.insertAdjacentHTML('afterbegin','<section class="tiin-onboarding"><div><span>НАСТРОЙ TIIN ЗА 2 МИНУТЫ</span><h3>'+done+' из 4 готово</h3></div><button class="tiin-icon-btn" onclick="TIINDismissTour()">×</button><div class="tiin-onboard-steps">'+actions.map((x,i)=>'<button class="'+(x[2]?'done':'')+'" onclick="'+x[1]+'">'+(x[2]?'✓':'0'+(i+1))+' <span>'+x[0]+'</span></button>').join('')+'</div></section>');
  }
  window.TIINDismissTour=()=>{write(TOUR,{dismissed:true});document.querySelector('.tiin-onboarding')?.remove();};
  function applyMode(){document.body.classList.toggle('tiin-simple-mode',prefs().mode==='simple');document.body.dataset.tiinDaypart=prefs().daypart;}
  const baseTxRender=window.renderTransactions;
  window.renderTransactions=function(){baseTxRender();onboarding();applyMode();};
  const baseAnalytics=window.renderAnalytics;
  window.renderAnalytics=function(){baseAnalytics();document.querySelectorAll('#tab-analytics .limits-card').forEach(x=>x.remove());};
  const baseTab=window.renderTab;
  window.renderTab=function(){if(typeof currentTab!=='undefined'&&currentTab==='settings'){settings();return;}baseTab();};
  const oldSwitch=window.switchTab;
  window.switchTab=function(tab){oldSwitch(tab);setTimeout(()=>{if(tab==='settings')settings();if(tab==='payments')renderPayments();document.getElementById('tab-'+tab)?.scrollIntoView({behavior:'smooth',block:'start'});},40);};

  const style=document.createElement('style');style.textContent=String.raw\`
  .tiin-section-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin:6px 0 16px}.tiin-section-head h2{margin:3px 0;font-size:27px}.tiin-section-head p,.tiin-muted{margin:5px 0 0;color:var(--text2);font-size:13px;line-height:1.45}.tiin-kicker{color:var(--gold1);font-size:11px;font-weight:800;letter-spacing:.13em}.tiin-help-btn{border:1px solid rgba(212,175,90,.6);color:var(--gold1);background:transparent;border-radius:50%;width:19px;height:19px;font-size:12px;vertical-align:middle}.tiin-payment-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-bottom:14px}.tiin-payment-metrics>div{padding:13px;border:1px solid var(--border);border-radius:15px;background:var(--card)}.tiin-payment-metrics small,.tiin-pay-main small{display:block;color:var(--text2);font-size:11px;margin-bottom:5px}.tiin-payment-metrics b{font-size:16px}.positive{color:#34d399}.negative{color:#f87171}.tiin-pay-list{display:grid;gap:10px}.tiin-pay-item{display:grid;grid-template-columns:42px minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:12px;border:1px solid var(--border);background:var(--card);border-radius:16px}.tiin-pay-date{background:rgba(212,175,90,.12);color:var(--gold1);font-size:18px;font-weight:800;padding:6px;border-radius:11px;text-align:center}.tiin-pay-date small{display:block;font-size:9px}.tiin-pay-main b{display:block;font-size:14px}.tiin-pay-amount{text-align:right}.tiin-pay-amount b{display:block;font-size:13px}.tiin-pay-amount span{font-size:10px}.paid{color:#34d399}.pending{color:#fbbf24}.overdue{color:#f87171}.tiin-pay-actions{display:flex;gap:5px;align-items:center}.tiin-icon-btn{border:0;background:transparent;color:var(--text2);font-size:20px;padding:5px}.tiin-empty{text-align:center;padding:34px 22px;border:1px dashed rgba(212,175,90,.4);border-radius:18px;color:var(--text2)}.tiin-empty>div{font-size:31px}.tiin-empty h3{color:var(--text);margin:8px 0}.tiin-empty p{font-size:13px;line-height:1.45;margin:0 auto 16px;max-width:280px}.tiin-sheet{padding:10px 2px 4px}.tiin-sheet-handle{width:42px;height:5px;border-radius:99px;background:var(--border);margin:0 auto 20px}.tiin-sheet h2{margin:0 0 10px;text-align:center}.tiin-sheet p{color:var(--text2);line-height:1.5}.tiin-sheet .btn{width:100%;margin-top:16px}.tiin-payment-form label{display:grid;gap:6px;margin:12px 0;color:var(--text2);font-size:11px;text-transform:uppercase;letter-spacing:.05em}.tiin-payment-form .form-input{width:100%;box-sizing:border-box}.tiin-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.tiin-check{display:block!important;text-transform:none!important;font-size:13px!important;letter-spacing:0!important}.tiin-settings-group{margin:12px 0;padding:16px;border:1px solid var(--border);border-radius:18px;background:var(--card)}.tiin-settings-group h3{margin:0 0 10px;font-size:16px;color:var(--gold1)}.tiin-setting-row{width:100%;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 0;border:0;border-top:1px solid rgba(255,255,255,.07);background:transparent;text-align:left;color:var(--text)}.tiin-setting-row:first-of-type{border-top:0}.tiin-setting-row b,.tiin-setting-row small{display:block}.tiin-setting-row small{font-size:11px;color:var(--text2);margin-top:3px}.tiin-setting-row i{font-size:24px;color:var(--gold1);font-style:normal}.tiin-setting-inline{padding:12px 0;border-top:1px solid rgba(255,255,255,.07);display:grid;gap:8px}.tiin-setting-inline small{color:var(--text2);font-size:11px}.tiin-segment{display:flex;gap:6px}.tiin-segment button{flex:1;border:1px solid var(--border);border-radius:10px;padding:8px;background:transparent;color:var(--text2);font-size:12px}.tiin-segment button.selected{border-color:var(--gold1);background:rgba(212,175,90,.12);color:var(--gold1)}.tiin-toggle{display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-top:1px solid rgba(255,255,255,.07);font-size:13px}.tiin-toggle input{display:none}.tiin-toggle i{width:37px;height:21px;border-radius:99px;background:var(--border);position:relative}.tiin-toggle i:after{content:'';position:absolute;width:15px;height:15px;background:var(--text2);border-radius:50%;top:3px;left:3px;transition:.2s}.tiin-toggle input:checked+i{background:var(--gold1)}.tiin-toggle input:checked+i:after{left:19px;background:#1d1d1d}.tiin-sync-state{padding:10px;background:rgba(52,211,153,.07);border-radius:12px;font-size:13px}.tiin-sync-state small{display:block;color:var(--text2);margin-top:4px}.tiin-action-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.tiin-faq details{padding:10px 0;border-top:1px solid rgba(255,255,255,.07)}.tiin-faq summary{font-size:13px;cursor:pointer}.tiin-faq p{font-size:12px;color:var(--text2);line-height:1.45}.tiin-onboarding{margin:0 0 15px;padding:14px;border:1px solid rgba(212,175,90,.45);border-radius:18px;background:linear-gradient(135deg,rgba(212,175,90,.15),var(--card));display:grid;grid-template-columns:1fr auto;gap:10px}.tiin-onboarding span{font-size:10px;color:var(--gold1);letter-spacing:.08em;font-weight:800}.tiin-onboarding h3{font-size:17px;margin:3px 0}.tiin-onboard-steps{grid-column:1/-1;display:grid;gap:6px}.tiin-onboard-steps button{border:0;background:transparent;color:var(--text);padding:5px;text-align:left;font-size:12px}.tiin-onboard-steps button.done{color:#6ee7b7}.tiin-simple-mode .deals-access,.tiin-simple-mode .deals-forecast,.tiin-simple-mode [data-advanced="true"]{display:none!important}@media(max-width:520px){.tiin-pay-item{grid-template-columns:38px minmax(0,1fr) auto}.tiin-pay-actions{grid-column:2/-1;justify-content:flex-end}.tiin-section-head h2{font-size:23px}.tiin-two{grid-template-columns:1fr}.tiin-payment-metrics{gap:7px}}\`;
  document.head.appendChild(style);
  migrateLegacyPayments(); installNavigation(); applyMode();
})();