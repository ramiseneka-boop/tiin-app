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
  const tr = (ru, kz, en) => window.tiinText ? window.tiinText(ru, kz, en) : ru;
  const translateTree = root => {
    if (!root || currentLang === 'ru') return;
    const words = {
      'Контроль расходов':['Шығындарды бақылау','Spending controls'],'Лимиты расходов':['Шығыс лимиттері','Spending limits'],'День, месяц, категории и предупреждения':['Күн, ай, санаттар және ескертулер','Day, month, categories and alerts'],
      'Категории и шаблоны':['Санаттар мен үлгілер','Categories and templates'],'Шаблоны частых операций':['Жиі операциялар үлгілері','Frequent operation templates'],'Быстрое добавление доходов и расходов':['Кірістер мен шығыстарды жылдам қосу','Quickly add income and expenses'],'Свои категории':['Өз санаттарыңыз','Your categories'],'Добавляй и скрывай ненужные категории':['Қажетсіз санаттарды қосыңыз не жасырыңыз','Add and hide unneeded categories'],
      'Валюты и внешний вид':['Валюталар және сыртқы көрініс','Currencies and appearance'],'Валюты':['Валюталар','Currencies'],'Основная валюта и пересчёт в поездках':['Негізгі валюта және сапарлардағы қайта есептеу','Base currency and travel conversion'],'Режим использования':['Пайдалану режимі','Usage mode'],'Простой':['Қарапайым','Simple'],'Полный':['Толық','Full'],'В простом режиме не показываем сложные бизнес-инструменты на главной.':['Қарапайым режимде басты бетте күрделі бизнес-құралдар көрсетілмейді.','Simple mode hides advanced business tools on the home screen.'],'Фон по времени суток':['Тәулік уақытына қарай фон','Background by time of day'],'Авто':['Авто','Auto'],'Утро':['Таң','Morning'],'День':['Күн','Day'],'Вечер':['Кеш','Evening'],'Ночь':['Түн','Night'],
      'Уведомления':['Хабарландырулар','Notifications'],'Выбери только нужные напоминания.':['Тек қажетті еске салғыштарды таңдаңыз.','Choose only the reminders you need.'],'Платёж за день до срока':['Төлем мерзімінен бір күн бұрын','Payment one day before due date'],'Платёж в день срока':['Төлем мерзімі күні','Payment on due date'],'80% лимита':['Лимиттің 80%-ы','80% of limit'],'Превышение лимита':['Лимиттен асып кету','Limit exceeded'],'Просроченная сделка':['Мерзімі өткен мәміле','Overdue deal'],'Цель отстаёт от срока':['Мақсат мерзімнен қалып қойды','Goal is behind schedule'],
      'Данные и синхронизация':['Деректер және синхрондау','Data and sync'],'Синхронизация:':['Синхрондау:','Sync:'],'Последняя:':['Соңғы:','Last:'],'Синхронизировать':['Синхрондау','Sync now'],'Резервная копия':['Резервтік көшірме','Backup'],'Аккаунт и безопасность':['Аккаунт және қауіпсіздік','Account and security'],'Войти и синхронизировать':['Кіру және синхрондау','Sign in and sync'],'Google / email, устройства и выход':['Google / email, құрылғылар және шығу','Google / email, devices and sign out'],'Как пользоваться TIIN':['TIIN қалай пайдалану керек','How to use TIIN'],'Короткие ответы и переходы к нужной функции.':['Қысқа жауаптар және қажет функцияға өту.','Short answers and links to the right feature.']
    };
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(node => { const key=node.nodeValue.trim(); if (words[key]) node.nodeValue=node.nodeValue.replace(key, words[key][currentLang === 'kz' ? 0 : 1]); });
  };
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
  function paymentTx(schedule, key = periodKey()) {
    // A payment must be looked up in the month in which it was actually paid,
    // not in the month currently opened in the calendar. This prevents a second
    // tap from creating a duplicate expense after switching months.
    const [year, month] = String(key).split('-').map(Number);
    const source = Number.isInteger(year) && Number.isInteger(month) ? txns(year, month - 1) : txns();
    return source.find(t => t.type === 'expense' && txKey(t) === schedule.id + ':' + key);
  }

  // Older builds marked a recurring item as paid by creating an automatic row.
  // For the *current* period only, preserve that already-visible paid state by
  // converting it to one normal, linked expense. Future rows stay forecasts;
  // they are never promoted and therefore cannot affect a future balance.
  function reconcileCurrentLegacyPaidPayments() {
    const key = periodKey(), [year, month] = key.split('-').map(Number);
    if (!Number.isInteger(year) || !Number.isInteger(month)) return false;
    const byLegacyId = new Map(schedules().filter(s => s.autoRecurringId).map(s => [s.autoRecurringId, s]));
    if (!byLegacyId.size) return false;
    const storageKey = 'txns_' + year + '_' + (month - 1);
    const rows = read(storageKey, []), today = dateKey(now()); let changed = false;
    rows.forEach(row => {
      const schedule = byLegacyId.get(row.auto_recurring_id);
      if (!schedule || row.type !== 'expense' || row.paymentScheduleId || !row.date || row.date.slice(0, 7) !== key || row.date > today) return;
      row.paymentScheduleId = schedule.id;
      row.paymentPeriod = key;
      delete row.auto_recurring_id;
      changed = true;
    });
    if (changed) { localStorage.setItem(storageKey, JSON.stringify(rows)); window.TIINCloud?.scheduleSync?.(); }
    return changed;
  }
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
  function statusText(schedule) { const tx = paymentTx(schedule); if (tx) return tr('Оплачен','Төленді','Paid'); return isOverdue(schedule) ? tr('Просрочен','Мерзімі өтті','Overdue') : tr('К оплате','Төлеуге','Due'); }
  function currentSchedules() { return schedules().filter(s => !s.archived && isInScope(s)); }

  function installNavigation() {
    const tabs = document.querySelectorAll('.tabs .tab');
    tabs.forEach(tab => {
      if (tab.dataset.tab === 'payment_tracker') {
        tab.dataset.tab = 'settings';
        tab.setAttribute('onclick', "switchTab('settings')");
        tab.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.2 2.2-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V20.4h-3.1v-.09A1.7 1.7 0 0 0 10.5 18.75a1.7 1.7 0 0 0-1.88.34l-.06.06-2.2-2.2.06-.06A1.7 1.7 0 0 0 6.76 15a1.7 1.7 0 0 0-1.56-1.03H5.1v-3.1h.1A1.7 1.7 0 0 0 6.76 9.84a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.2-2.2.06.06a1.7 1.7 0 0 0 1.88.34 1.7 1.7 0 0 0 1.03-1.56V4.45h3.1v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.2 2.2-.06.06a1.7 1.7 0 0 0-.34 1.88 1.7 1.7 0 0 0 1.56 1.03h.1v3.1h-.1A1.7 1.7 0 0 0 19.4 15Z"/></svg><span class="command-nav-label">'+tr('Настройки','Баптаулар','Settings')+'</span>';
      }
      const label = tab.querySelector('.command-nav-label');
      if (label && tab.dataset.tab === 'settings') label.textContent = tr('Настройки','Баптаулар','Settings');
    });
    const old = document.getElementById('tab-payment_tracker');
    if (old) old.id = 'tab-settings';
  }

  function help(topic) {
    const map = {
      balance:[tr('Свободный баланс','Бос баланс','Free balance'),tr('Это деньги, которые ещё не выделены на жизнь, цели и обязательства. Именно ими можно распоряжаться без нарушения плана.','Бұл өмірге, мақсаттарға және міндеттемелерге әлі бөлінбеген ақша. Оны жоспарды бұзбай пайдалануға болады.','Money not yet allocated to living costs, goals or obligations. You can use it without breaking your plan.')],
      plan:[tr('Ежемесячный финансовый план','Айлық қаржы жоспары','Monthly financial plan'),tr('Помогает разложить текущие деньги: на жизнь, накопления и свободный резерв. Расходы на жизнь уменьшают только выделенную часть.','Қазіргі ақшаны өмірге, жинаққа және бос қорға бөлуге көмектеседі. Өмір шығындары тек бөлінген бөлікті азайтады.','Helps allocate current money between living costs, savings and free reserve. Living expenses reduce only the allocated share.')],
      limits:[tr('Лимиты','Лимиттер','Limits'),tr('Лимит — это ориентир, а не блокировка. TIIN предупредит на 80% и пометит расходы сверх заданной суммы.','Лимит — тыйым емес, бағдар. TIIN 80%-да ескертеді және белгіленген сомадан асқан шығындарды көрсетеді.','A limit is guidance, not a block. TIIN warns at 80% and marks spending above the chosen amount.')],
      goals:[tr('Цели и автокопилка','Мақсаттар және автожинақ','Goals and autosave'),tr('Отложенные деньги лежат в цели отдельно. Автокопилка переводит заданный процент из новых доходов в выбранную цель.','Жиналған ақша мақсатта бөлек сақталады. Автожинақ жаңа кірістің белгіленген пайызын таңдалған мақсатқа аударады.','Set-aside money is kept separately in a goal. Autosave transfers a chosen percentage of new income to that goal.')],
      deals:[tr('Сделки','Мәмілелер','Deals'),tr('До оплаты сделка — прогноз. После «Получить оплату» создаётся реальный доход, а чистая прибыль показывает экономику сделки.','Төленгенге дейін мәміле — болжам. «Төлемді алу» нақты кіріс жасайды, ал таза пайда мәміле экономикасын көрсетеді.','Before payment, a deal is a forecast. “Receive payment” creates real income, while net profit shows the deal economics.')],
      payments:[tr('Платежи','Төлемдер','Payments'),tr('После «Оплатить» создаётся реальный расход, уменьшается баланс и операция попадает в историю и аналитику.','«Төлеу» басылғаннан кейін нақты шығын жасалады, баланс азаяды және операция тарих пен аналитикаға түседі.','After “Pay”, a real expense is created, the balance decreases, and the transaction appears in history and analytics.')]
    };
    const x = map[topic] || map.balance;
    document.getElementById('modal').innerHTML = '<div class="tiin-sheet"><div class="tiin-sheet-handle"></div><h2>💡 '+x[0]+'</h2><p>'+x[1]+'</p><button class="btn btn-gold" onclick="closeModal()">'+tr('Понятно','Түсінікті','Got it')+'</button></div>';
    document.getElementById('modalOverlay').classList.add('open');
  }
  window.openTIINTemplates = function () {
    const all=read('templates', []);
    const cats=(window.EXPENSE_CATS||[]).map(x=>'<option value="'+x.id+'">'+x.icon+' '+x.name+'</option>').join('');
    document.getElementById('modal').innerHTML='<div class="tiin-sheet tiin-payment-form"><div class="tiin-sheet-handle"></div><h2>'+tr('Шаблоны операций','Операциялар үлгілері','Transaction templates')+'</h2><p>'+tr('Сохрани часто повторяющуюся операцию — она появится на главной в один тап.','Жиі қайталанатын операцияны сақтаңыз — ол басты бетте бір рет басумен ашылады.','Save a frequent transaction and it will appear on Home in one tap.')+'</p><label>'+tr('Название','Атауы','Name')+'<input id="tiin_tpl_name" class="form-input" placeholder="'+tr('Например, такси','Мысалы, такси','For example, taxi')+'"></label><div class="tiin-two"><label>'+tr('Сумма','Сома','Amount')+'<input id="tiin_tpl_amount" class="form-input" inputmode="numeric" type="number" placeholder="0"></label><label>'+tr('Тип','Түрі','Type')+'<select id="tiin_tpl_type" class="form-input"><option value="expense">'+tr('Расход','Шығыс','Expense')+'</option><option value="income">'+tr('Доход','Кіріс','Income')+'</option></select></label></div><label>'+tr('Категория','Санат','Category')+'<select id="tiin_tpl_category" class="form-input">'+cats+'</select></label><button class="btn btn-gold" onclick="saveTIINTemplate()">'+tr('Сохранить шаблон','Үлгіні сақтау','Save template')+'</button><div class="tiin-template-list">'+(all.length?all.map((x,n)=>'<div><span>'+escape(x.name)+' · '+fmtSafe(x.amount)+'</span><button class="tiin-icon-btn" aria-label="'+tr('Удалить','Жою','Delete')+'" onclick="deleteTIINTemplate('+n+')">×</button></div>').join(''):'<small>'+tr('Шаблонов пока нет','Үлгілер әлі жоқ','No templates yet')+'</small>')+'</div></div>';
    document.getElementById('modalOverlay').classList.add('open');
  };
  window.saveTIINTemplate=function(){
    const name=document.getElementById('tiin_tpl_name').value.trim(), value=amount(document.getElementById('tiin_tpl_amount').value);
    if(!name||!value){toast(tr('Укажи название и сумму','Атауы мен сомасын көрсетіңіз','Enter a name and amount'));return;}
    const all=read('templates',[]);all.push({name,amount:value,type:document.getElementById('tiin_tpl_type').value,category:document.getElementById('tiin_tpl_category').value});write('templates',all);toast(tr('Шаблон сохранён','Үлгі сақталды','Template saved'));window.openTIINTemplates();
  };
  window.deleteTIINTemplate=function(index){const all=read('templates',[]);all.splice(index,1);write('templates',all);window.openTIINTemplates();};
  window.openTIINHelp = help;

  function showPaymentModal(id) {
    const existing = schedules().find(s => s.id === id);
    const s = existing || {title:'',amount:'',category:'other',wallet:'personal',repeat:'monthly',day:15,priority:'medium',reminder:false,date:dateKey(now())};
    const cats = (window.EXPENSE_CATS || []).map(c => '<option value="'+c.id+'" '+(s.category===c.id?'selected':'')+'>'+c.icon+' '+c.name+'</option>').join('');
    document.getElementById('modal').innerHTML = '<div class="tiin-sheet tiin-payment-form"><div class="tiin-sheet-handle"></div><h2>'+ (existing ? tr('Изменить платёж','Төлемді өзгерту','Edit payment') : tr('Новый платёж','Жаңа төлем','New payment')) +'</h2>'+
      '<label>'+tr('Название','Атауы','Name')+'<input id="tp_title" class="form-input" value="'+escape(s.title)+'" placeholder="'+tr('Например, интернет','Мысалы, интернет','For example, internet')+'"></label>'+
      '<label>'+tr('Сумма','Сома','Amount')+'<input id="tp_amount" class="form-input" type="number" inputmode="numeric" value="'+amount(s.amount)+'" placeholder="0"></label>'+
      '<div class="tiin-two"><label>'+tr('Категория','Санат','Category')+'<select id="tp_category" class="form-input">'+cats+'</select></label><label>'+tr('Кошелёк','Әмиян','Wallet')+'<select id="tp_wallet" class="form-input"><option value="personal" '+(s.wallet==='personal'?'selected':'')+'>'+tr('Личный','Жеке','Personal')+'</option><option value="business" '+(s.wallet==='business'?'selected':'')+'>'+tr('Бизнес','Бизнес','Business')+'</option></select></label></div>'+
      '<div class="tiin-two"><label>'+tr('Повторяемость','Қайталануы','Repeat')+'<select id="tp_repeat" class="form-input" onchange="TIINPaymentRepeatChanged()"><option value="monthly" '+(s.repeat==='monthly'?'selected':'')+'>'+tr('Ежемесячно','Ай сайын','Monthly')+'</option><option value="weekly" '+(s.repeat==='weekly'?'selected':'')+'>'+tr('Еженедельно','Апта сайын','Weekly')+'</option><option value="once" '+(s.repeat==='once'?'selected':'')+'>'+tr('Разово','Бір рет','One-time')+'</option></select></label><label>'+tr('Приоритет','Басымдық','Priority')+'<select id="tp_priority" class="form-input"><option value="high" '+(s.priority==='high'?'selected':'')+'>'+tr('Высокий','Жоғары','High')+'</option><option value="medium" '+(s.priority==='medium'?'selected':'')+'>'+tr('Средний','Орташа','Medium')+'</option><option value="low" '+(s.priority==='low'?'selected':'')+'>'+tr('Низкий','Төмен','Low')+'</option></select></label></div>'+
      '<div id="tp_date_row"></div><label class="tiin-check"><input type="checkbox" id="tp_reminder" '+(s.reminder?'checked':'')+'> '+tr('Напоминать за день и в день оплаты','Төлемнен бір күн бұрын және төлем күні еске салу','Remind one day before and on the payment date')+'</label>'+
      '<button class="btn btn-gold" onclick="saveTIINPayment(\''+(id||'')+'\')">'+tr('Сохранить','Сақтау','Save')+'</button></div>';
    document.getElementById('modalOverlay').classList.add('open'); window.TIINPaymentRepeatChanged(s);
  }
  window.TIINPaymentRepeatChanged = function(seed) {
    const repeat = document.getElementById('tp_repeat')?.value || seed?.repeat || 'monthly';
    const row = document.getElementById('tp_date_row'); if (!row) return;
    if (repeat === 'once') row.innerHTML='<label>'+tr('Дата оплаты','Төлем күні','Payment date')+'<input id="tp_date" class="form-input" type="date" value="'+(seed?.date || dateKey(now()))+'"></label>';
    else if (repeat === 'weekly') row.innerHTML='<label>'+tr('День недели','Апта күні','Day of week')+'<select id="tp_weekday" class="form-input"><option value="1">'+tr('Понедельник','Дүйсенбі','Monday')+'</option><option value="2">'+tr('Вторник','Сейсенбі','Tuesday')+'</option><option value="3">'+tr('Среда','Сәрсенбі','Wednesday')+'</option><option value="4">'+tr('Четверг','Бейсенбі','Thursday')+'</option><option value="5">'+tr('Пятница','Жұма','Friday')+'</option><option value="6">'+tr('Суббота','Сенбі','Saturday')+'</option><option value="0">'+tr('Воскресенье','Жексенбі','Sunday')+'</option></select></label>';
    else row.innerHTML='<label>'+tr('День месяца','Ай күні','Day of month')+'<input id="tp_day" class="form-input" type="number" min="1" max="31" value="'+(seed?.day||15)+'"></label>';
    if (repeat === 'weekly' && seed) document.getElementById('tp_weekday').value = String(seed.weekday || 1);
  };
  window.openTIINPaymentModal = showPaymentModal;
  window.saveTIINPayment = function(id) {
    const title = document.getElementById('tp_title').value.trim(), value = amount(document.getElementById('tp_amount').value);
    if (!title || !value) { toast(tr('Укажи название и сумму','Атауы мен сомасын көрсетіңіз','Enter a name and amount')); return; }
    const repeat = document.getElementById('tp_repeat').value;
    const record = {id:id||('payment-'+Date.now()),title,amount:value,category:document.getElementById('tp_category').value,wallet:document.getElementById('tp_wallet').value,repeat,priority:document.getElementById('tp_priority').value,reminder:document.getElementById('tp_reminder').checked,day:amount(document.getElementById('tp_day')?.value),weekday:amount(document.getElementById('tp_weekday')?.value),date:document.getElementById('tp_date')?.value || dateKey(now()),createdAt:Date.now()};
    const all=schedules(); const index=all.findIndex(x=>x.id===record.id); if(index>=0) all[index]=Object.assign(all[index],record); else all.push(record);
    saveSchedules(all); closeModal(); toast(tr('Платёж сохранён','Төлем сақталды','Payment saved')); renderPayments();
  };
  window.payTIINPayment = function(id) {
    const s=schedules().find(x=>x.id===id); if(!s || paymentTx(s)) { toast(tr('Этот платёж уже учтён','Бұл төлем әлдеқашан есепке алынды','This payment has already been recorded')); return; }
    const paidAt=now(), y=paidAt.getFullYear(),m=paidAt.getMonth(), key=periodKey(paidAt);
    const list=txns(y,m); list.push({id:String(Date.now()),type:'expense',amount:s.amount,category:s.category,comment:s.title+' · платёж',date:dateKey(paidAt),wallet:s.wallet,paymentScheduleId:s.id,paymentPeriod:key});
    localStorage.setItem('txns_'+y+'_'+m,JSON.stringify(list)); window.TIINCloud?.scheduleSync?.(); toast(tr('Расход добавлен в историю','Шығыс тарихқа қосылды','Expense added to history')); render();
  };
  window.unpayTIINPayment = function(id) {
    const s=schedules().find(x=>x.id===id), key=periodKey(); if(!s) return;
    const [year,month]=key.split('-').map(Number); let removed=false;
    if(Number.isInteger(year)&&Number.isInteger(month)){const k='txns_'+year+'_'+(month-1),list=read(k,[]),next=list.filter(t=>!(t.paymentScheduleId===s.id&&t.paymentPeriod===key));if(next.length!==list.length){localStorage.setItem(k,JSON.stringify(next));removed=true;}}
    if(removed){window.TIINCloud?.scheduleSync?.();toast(tr('Связанная операция отменена','Байланысты операция болдырылмады','Linked transaction cancelled'));render();}
  };
  window.removeTIINPayment = function(id) { if(!confirm(tr('Убрать этот платёж? История операций останется.','Бұл төлемді алып тастау керек пе? Операциялар тарихы сақталады.','Remove this payment? Transaction history will remain.')))return; saveSchedules(schedules().filter(x=>x.id!==id));renderPayments(); };

  function renderPayments() {
    const host=document.getElementById('tab-payments'); if(!host) return;
    const list=currentSchedules().sort((a,b)=>dueFor(a)-dueFor(b));
    const paid=list.filter(s=>paymentTx(s)); const unpaid=list.filter(s=>!paymentTx(s));
    const due=unpaid.reduce((n,s)=>n+amount(s.amount),0), paidSum=paid.reduce((n,s)=>n+amount(s.amount),0), overdue=unpaid.filter(s=>isOverdue(s)).reduce((n,s)=>n+amount(s.amount),0), next=unpaid[0];
    const weekdays = currentLang === 'kz' ? ['жс','дс','сс','ср','бс','жм','сб'] : currentLang === 'en' ? ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'] : ['вс','пн','вт','ср','чт','пт','сб'];
    const repeatText = {monthly:tr('ежемесячно','ай сайын','monthly'),weekly:tr('еженедельно','апта сайын','weekly'),once:tr('разово','бір рет','one-time')};
    host.innerHTML='<section class="tiin-pay-overview"><div class="tiin-section-head"><div><span class="tiin-kicker">'+tr('ОБЯЗАТЕЛЬСТВА','МІНДЕТТЕМЕЛЕР','OBLIGATIONS')+'</span><h2>📅 '+tr('Платежи','Төлемдер','Payments')+' <button class="tiin-help-btn" onclick="openTIINHelp(\'payments\')">i</button></h2><p>'+tr('Регулярные расходы и будущие обязательства','Тұрақты шығыстар мен болашақ міндеттемелер','Recurring expenses and upcoming obligations')+'</p></div><button class="btn btn-gold" onclick="openTIINPaymentModal()">+ '+tr('Платёж','Төлем','Payment')+'</button></div>'+
      '<div class="tiin-payment-metrics"><div><small>'+tr('К оплате','Төлеуге','Due')+'</small><b>'+fmtSafe(due)+'</b></div><div><small>'+tr('Оплачено','Төленді','Paid')+'</small><b class="positive">'+fmtSafe(paidSum)+'</b></div><div><small>'+tr('Просрочено','Мерзімі өтті','Overdue')+'</small><b class="'+(overdue?'negative':'')+'">'+fmtSafe(overdue)+'</b></div><div><small>'+tr('Ближайший','Жақындағы','Next')+'</small><b>'+ (next ? escape(next.title) : '—') +'</b></div></section>'+
      (list.length ? '<section class="tiin-pay-list">'+list.map(s=>{const paidTx=paymentTx(s), overdueFlag=isOverdue(s), tag=paidTx?'paid':overdueFlag?'overdue':'pending';return '<article class="tiin-pay-item"><div class="tiin-pay-date">'+pad(dueFor(s).getDate())+'<small>'+weekdays[dueFor(s).getDay()]+'</small></div><div class="tiin-pay-main"><b>'+catIcon(s.category)+' '+escape(s.title)+'</b><small>'+catName(s.category)+' · '+repeatText[s.repeat]+'</small></div><div class="tiin-pay-amount"><b>'+fmtSafe(s.amount)+'</b><span class="'+tag+'">'+statusText(s)+'</span></div><div class="tiin-pay-actions">'+(paidTx?'<button class="btn btn-ghost btn-sm" onclick="unpayTIINPayment(\''+s.id+'\')">'+tr('Отменить','Болдырмау','Undo')+'</button>':'<button class="btn btn-gold btn-sm" onclick="payTIINPayment(\''+s.id+'\')">'+tr('Оплатить','Төлеу','Pay')+'</button>')+'<button class="tiin-icon-btn" aria-label="'+tr('Изменить платёж','Төлемді өзгерту','Edit payment')+'" onclick="openTIINPaymentModal(\''+s.id+'\')">⋮</button></div></article>';}).join('')+'</section>' :
      '<section class="tiin-empty"><div>📅</div><h3>'+tr('Пока нет платежей','Төлемдер әлі жоқ','No payments yet')+'</h3><p>'+tr('Добавь ипотеку, аренду, интернет или подписку. После оплаты TIIN сам создаст расход.','Ипотека, жалдау, интернет не жазылым қосыңыз. Төлегеннен кейін TIIN шығысты өзі жасайды.','Add a mortgage, rent, internet or subscription. Once paid, TIIN creates the expense automatically.')+'</p><button class="btn btn-gold" onclick="openTIINPaymentModal()">'+tr('Добавить платёж','Төлем қосу','Add payment')+'</button></section>');
  }
  window.renderPayments = renderPayments;

  function FAQ() {
    const rows=[
      [tr('С чего начать','Қайдан бастау керек','Where to start'),tr('Укажи стартовый баланс, добавь первую операцию и ближайший платёж. Затем создай цель или лимит.','Бастапқы балансты көрсетіңіз, бірінші операцияны және жақын төлемді қосыңыз. Кейін мақсат не лимит жасаңыз.','Enter your starting balance, add your first transaction and upcoming payment. Then create a goal or limit.'),'transactions'],
      [tr('Почему общий и свободный баланс отличаются?','Неге жалпы және бос баланс әртүрлі?','Why are total and free balance different?'),tr('Общий баланс — все фактические деньги. Свободный — деньги, ещё не выделенные на жизнь, накопления и обязательства.','Жалпы баланс — барлық нақты ақша. Бос баланс — өмірге, жинаққа және міндеттемелерге әлі бөлінбеген ақша.','Total balance is all real money. Free balance is money not yet allocated to living costs, savings or obligations.'),'transactions'],
      [tr('Как работают лимиты?','Лимиттер қалай жұмыс істейді?','How do limits work?'),tr('Они предупреждают на 80% и показывают траты сверх лимита. Деньги не блокируются.','Олар 80%-да ескертеді және лимиттен асқан шығындарды көрсетеді. Ақша бұғатталмайды.','They warn at 80% and show spending above the limit. Your money is never blocked.'),'settings'],
      [tr('Как работают цели и автокопилка?','Мақсаттар мен автожинақ қалай жұмыс істейді?','How do goals and autosave work?'),tr('В цели лежат отдельно отложенные деньги. Процент автокопилки переводится из новых доходов.','Мақсатта бөлек жиналған ақша сақталады. Автожинақ пайызы жаңа кірістен аударылады.','A goal holds set-aside money separately. The autosave percentage is transferred from new income.'),'goals'],
      [tr('Как работают платежи?','Төлемдер қалай жұмыс істейді?','How do payments work?'),tr('Отметь платёж оплаченным — появится реальный расход в истории, аналитике и балансе.','Төлемді төленген деп белгілеңіз — тарихта, аналитикада және баланста нақты шығын пайда болады.','Mark a payment as paid to create a real expense in history, analytics and balance.'),'payments'],
      [tr('Как работают сделки, НДС и чистая прибыль?','Мәмілелер, ҚҚС және таза пайда қалай жұмыс істейді?','How do deals, VAT and net profit work?'),tr('До оплаты сделка — прогноз. После оплаты в баланс попадает фактическая операция, а НДС и расходы остаются в расчёте экономики.','Төлемге дейін мәміле — болжам. Төлемнен кейін балансқа нақты операция түседі, ал ҚҚС мен шығындар экономика есебінде қалады.','Before payment, a deal is a forecast. After payment, the actual transaction enters the balance while VAT and costs remain in the economics calculation.'),'transactions'],
      [tr('Как разделить личные и бизнес-деньги?','Жеке және бизнес ақшаны қалай бөлуге болады?','How do I separate personal and business money?'),tr('У каждой операции, сделки и платежа выбирается личный или бизнес-кошелёк.','Әр операция, мәміле және төлем үшін жеке не бизнес әмияны таңдалады.','Choose a personal or business wallet for every transaction, deal and payment.'),'transactions'],
      [tr('Как работает синхронизация и резервная копия?','Синхрондау мен резервтік көшірме қалай жұмыс істейді?','How do sync and backup work?'),tr('Войди в аккаунт — TIIN синхронизирует данные. Резервная копия сохраняет их отдельно на устройстве.','Аккаунтқа кіріңіз — TIIN деректерді синхрондайды. Резервтік көшірме оларды құрылғыда бөлек сақтайды.','Sign in and TIIN syncs your data. A backup stores it separately on your device.'),'settings'],
      [tr('Как учитывать валюты в поездках?','Сапарларда валютаны қалай есепке алу керек?','How do I track currencies while travelling?'),tr('Добавь валюту в настройках. TIIN покажет пересчёт в основной валюте.','Баптауларда валютаны қосыңыз. TIIN негізгі валютаға қайта есептеуді көрсетеді.','Add a currency in Settings. TIIN will show its conversion to your base currency.'),'settings']
    ];
    return '<div class="tiin-faq">'+rows.map(x=>'<details><summary>'+x[0]+'</summary><p>'+x[1]+'</p><button class="btn btn-ghost btn-sm" onclick="TIINGoTo(\''+x[2]+'\')">'+tr('Открыть раздел','Бөлімді ашу','Open section')+'</button></details>').join('')+'</div>';
  }
  window.TIINGoTo=function(tab){switchTab(tab); setTimeout(()=>document.getElementById('tab-'+tab)?.scrollIntoView({behavior:'smooth',block:'start'}),80);};
  function setMode(value){savePrefs({mode:value});applyMode();renderSettings();}
  window.setTIINMode=setMode;
  function settings() {
    const host=document.getElementById('tab-settings');if(!host)return;
    const p=prefs(), user=read('tiin_user',null), sync=localStorage.getItem('tiin_last_sync')||'—';
    host.innerHTML='<section class="tiin-section-head"><div><span class="tiin-kicker">'+tr('ПРАВИЛА И ДАННЫЕ','ЕРЕЖЕЛЕР МЕН ДЕРЕКТЕР','RULES AND DATA')+'</span><h2>⚙️ '+tr('Настройки','Баптаулар','Settings')+'</h2><p>'+tr('Настрой TIIN под свой способ вести деньги','TIIN-ді ақша жүргізу тәсіліңізге бейімдеңіз','Set up TIIN for the way you manage money')+'</p></div></section>'+
      '<section class="tiin-settings-group"><h3>'+tr('Контроль расходов','Шығындарды бақылау','Spending controls')+'</h3><button class="tiin-setting-row" onclick="openSpendingLimits()"><span>🎯 <b>'+tr('Лимиты расходов','Шығыс лимиттері','Spending limits')+'</b><small>'+tr('День, месяц, категории и предупреждения','Күн, ай, санаттар және ескертулер','Day, month, categories and alerts')+'</small></span><i>›</i></button></section>'+
      '<section class="tiin-settings-group"><h3>'+tr('Категории и шаблоны','Санаттар мен үлгілер','Categories and templates')+'</h3><button class="tiin-setting-row" onclick="openTIINTemplates()"><span>🏷️ <b>'+tr('Шаблоны частых операций','Жиі операциялар үлгілері','Frequent operation templates')+'</b><small>'+tr('Быстрое добавление доходов и расходов','Кірістер мен шығыстарды жылдам қосу','Quickly add income and expenses')+'</small></span><i>›</i></button><button class="tiin-setting-row" onclick="openTIINCategories()"><span>✦ <b>'+tr('Свои категории','Өз санаттарыңыз','Your categories')+'</b><small>'+tr('Создавай категории с эмодзи для доходов и расходов','Кіріс пен шығысқа эмодзимен санаттар жасаңыз','Create emoji categories for income and expenses')+'</small></span><i>›</i></button></section>'+
      '<section class="tiin-settings-group"><h3>'+tr('Валюты и внешний вид','Валюталар және сыртқы көрініс','Currencies and appearance')+'</h3><button class="tiin-setting-row" onclick="window.TIINCurrency?.open?.()"><span>⇄ <b>'+tr('Валюты','Валюталар','Currencies')+'</b><small>'+tr('Основная валюта и пересчёт в поездках','Негізгі валюта және сапарлардағы қайта есептеу','Base currency and travel conversion')+'</small></span><i>›</i></button><div class="tiin-setting-inline"><b>'+tr('Режим использования','Пайдалану режимі','Usage mode')+'</b><div class="tiin-segment"><button class="'+(p.mode==='simple'?'selected':'')+'" onclick="setTIINMode(\'simple\')">'+tr('Простой','Қарапайым','Simple')+'</button><button class="'+(p.mode==='full'?'selected':'')+'" onclick="setTIINMode(\'full\')">'+tr('Полный','Толық','Full')+'</button></div><small>'+tr('В простом режиме не показываем сложные бизнес-инструменты на главной.','Қарапайым режимде басты бетте күрделі бизнес-құралдар көрсетілмейді.','Simple mode hides advanced business tools on the home screen.')+'</small></div><div class="tiin-setting-inline"><b>'+tr('Фон по времени суток','Тәулік уақытына қарай фон','Background by time of day')+'</b><div class="tiin-segment"><button class="'+(p.daypart==='auto'?'selected':'')+'" onclick="TIINDaypart(\'auto\')">'+tr('Авто','Авто','Auto')+'</button><button class="'+(p.daypart==='morning'?'selected':'')+'" onclick="TIINDaypart(\'morning\')">'+tr('Утро','Таң','Morning')+'</button><button class="'+(p.daypart==='day'?'selected':'')+'" onclick="TIINDaypart(\'day\')">'+tr('День','Күн','Day')+'</button><button class="'+(p.daypart==='evening'?'selected':'')+'" onclick="TIINDaypart(\'evening\')">'+tr('Вечер','Кеш','Evening')+'</button><button class="'+(p.daypart==='night'?'selected':'')+'" onclick="TIINDaypart(\'night\')">'+tr('Ночь','Түн','Night')+'</button></div></div></section>'+
      '<section class="tiin-settings-group"><h3>'+tr('Уведомления','Хабарландырулар','Notifications')+'</h3><p class="tiin-muted">'+tr('Выбери только нужные напоминания.','Тек қажетті еске салғыштарды таңдаңыз.','Choose only the reminders you need.')+'</p>'+[["Платёж за день до срока","Төлем мерзімінен бір күн бұрын","Payment one day before due date"],["Платёж в день срока","Төлем мерзімі күні","Payment on due date"],["80% лимита","Лимиттің 80%-ы","80% of limit"],["Превышение лимита","Лимиттен асып кету","Limit exceeded"],["Просроченная сделка","Мерзімі өткен мәміле","Overdue deal"],["Цель отстаёт от срока","Мақсат мерзімнен қалып қойды","Goal is behind schedule"]].map((n,i)=>'<label class="tiin-toggle"><span>'+tr(n[0],n[1],n[2])+'</span><input type="checkbox" '+(p.notifications[i]?'checked':'')+' onchange="TIINNotification('+i+',this.checked)"><i></i></label>').join('')+'</section>'+
      '<section class="tiin-settings-group"><h3>'+tr('Данные и синхронизация','Деректер және синхрондау','Data and sync')+'</h3><div class="tiin-sync-state">☁️ '+tr('Синхронизация:','Синхрондау:','Sync:')+' <b>'+ (user?tr('подключена','қосылған','connected'):tr('локально','жергілікті','local only')) +'</b><small>'+tr('Последняя:','Соңғы:','Last:')+' '+sync+'</small></div><div class="tiin-action-grid"><button class="btn btn-ghost" onclick="window.TIINCloud?.forceSync?.();toast(\''+tr('Синхронизация запущена','Синхрондау басталды','Sync started')+'\')">'+tr('Синхронизировать','Синхрондау','Sync now')+'</button><button class="btn btn-ghost" onclick="exportAllData()">'+tr('Резервная копия','Резервтік көшірме','Backup')+'</button><button class="btn btn-ghost" onclick="exportCSV()">CSV</button><button class="btn btn-ghost" onclick="exportPDF()">PDF</button></div></section>'+
      '<section class="tiin-settings-group"><h3>'+tr('Аккаунт и безопасность','Аккаунт және қауіпсіздік','Account and security')+'</h3><button class="tiin-setting-row" onclick="window.TIINCloud?.open?.()"><span>👤 <b>'+(user?.email||tr('Войти и синхронизировать','Кіру және синхрондау','Sign in and sync'))+'</b><small>'+tr('Google / email, устройства и выход','Google / email, құрылғылар және шығу','Google / email, devices and sign out')+'</small></span><i>›</i></button></section>'+
      '<section class="tiin-settings-group"><h3>'+tr('Как пользоваться TIIN','TIIN қалай пайдалану керек','How to use TIIN')+'</h3><p class="tiin-muted">'+tr('Короткие ответы и переходы к нужной функции.','Қысқа жауаптар және қажет функцияға өту.','Short answers and links to the right feature.')+'</p>'+FAQ()+'</section>';
    translateTree(host);
  }
  window.renderSettings=settings;
  window.addEventListener('tiin-language-change',()=>{ renderPayments(); settings(); });
  window.TIINNotification=function(index,on){const p=prefs();p.notifications[index]=on;write(PREF,p);if(on&&'Notification'in window&&Notification.permission==='default')Notification.requestPermission();};
  window.TIINDaypart=function(v){savePrefs({daypart:v});applyMode();settings();};
  window.TIINCategoryInfo=function(){window.openTIINCategories?.();};

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
  function applyMode(){
    const p=prefs(); document.body.classList.toggle('tiin-simple-mode',p.mode==='simple');
    const h=new Date().getHours();
    const automatic=h>=5&&h<11?'morning':h>=11&&h<17?'day':h>=17&&h<21?'evening':'night';
    const choice=p.daypart==='auto'?automatic:p.daypart;
    document.body.dataset.tiinDaypart=choice;
    document.querySelectorAll('.balance-hero').forEach(hero=>{ const changed=hero.dataset.daypart!==choice; hero.dataset.daypart=choice; hero.setAttribute('data-daypart',choice); if(changed){hero.classList.remove('tiin-daypart-transition');void hero.offsetWidth;hero.classList.add('tiin-daypart-transition');setTimeout(()=>hero.classList.remove('tiin-daypart-transition'),650);} });
  }
  setInterval(()=>{if(prefs().daypart==='auto')applyMode();},60000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)applyMode();});
  const baseTxRender=window.renderTransactions;
  window.renderTransactions=function(){baseTxRender();onboarding();applyMode();};
  const baseAnalytics=window.renderAnalytics;
  window.renderAnalytics=function(){baseAnalytics();document.querySelectorAll('#tab-analytics .limits-card').forEach(x=>x.remove());};
  const baseTab=window.renderTab;
  window.renderTab=function(){if(typeof currentTab!=='undefined'&&currentTab==='settings'){settings();return;}baseTab();};
  const oldSwitch=window.switchTab;
  window.switchTab=function(tab){oldSwitch(tab);setTimeout(()=>{if(tab==='settings')settings();if(tab==='payments')renderPayments();document.getElementById('tab-'+tab)?.scrollIntoView({behavior:'smooth',block:'start'});},40);};

  const style=document.createElement('style');style.textContent=String.raw`
  .tiin-section-head{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:6px 0 14px;padding:0 2px}.tiin-section-head>div{min-width:0}.tiin-section-head h2{margin:2px 0;font-size:23px}.tiin-section-head p,.tiin-muted{margin:3px 0 0;color:var(--text2);font-size:12px;line-height:1.4}.tiin-kicker{color:var(--gold1);font-size:11px;font-weight:800;letter-spacing:.13em}.tiin-help-btn{border:1px solid rgba(212,175,90,.6);color:var(--gold1);background:transparent;border-radius:50%;width:19px;height:19px;font-size:12px;vertical-align:middle}.tiin-payment-metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-bottom:12px}.tiin-payment-metrics>div{min-height:62px}.tiin-payment-metrics>div{padding:13px;border:1px solid var(--border);border-radius:15px;background:var(--card)}.tiin-payment-metrics small,.tiin-pay-main small{display:block;color:var(--text2);font-size:11px;margin-bottom:5px}.tiin-payment-metrics b{font-size:16px}.positive{color:#34d399}.negative{color:#f87171}.tiin-pay-overview{margin:6px 0 14px;padding:16px;border:1px solid #2a3854;border-radius:22px;background:#17213a;box-shadow:0 10px 24px rgba(0,0,0,.12)}.tiin-pay-overview .tiin-section-head{margin:0 0 14px}.tiin-payment-metrics{margin:0!important}.tiin-pay-list{display:grid;gap:10px}.tiin-pay-item{display:grid;grid-template-columns:42px minmax(0,1fr) auto auto;gap:10px;align-items:center;padding:14px;border:1px solid #2a3854;background:#17213a;border-radius:18px;box-shadow:0 8px 18px rgba(0,0,0,.1)}.tiin-pay-date{background:rgba(212,175,90,.12);color:var(--gold1);font-size:18px;font-weight:800;padding:6px;border-radius:11px;text-align:center}.tiin-pay-date small{display:block;font-size:9px}.tiin-pay-main b{display:block;font-size:14px}.tiin-pay-amount{text-align:right}.tiin-pay-amount b{display:block;font-size:13px}.tiin-pay-amount span{font-size:10px}.paid{color:#34d399}.pending{color:#fbbf24}.overdue{color:#f87171}.tiin-pay-actions{display:flex;gap:5px;align-items:center}.tiin-icon-btn{border:0;background:transparent;color:var(--text2);font-size:20px;padding:5px}.tiin-empty{text-align:center;padding:34px 22px;border:1px dashed rgba(212,175,90,.4);border-radius:18px;color:var(--text2)}.tiin-empty>div{font-size:31px}.tiin-empty h3{color:var(--text);margin:8px 0}.tiin-empty p{font-size:13px;line-height:1.45;margin:0 auto 16px;max-width:280px}.tiin-sheet{padding:10px 2px 4px}.tiin-sheet-handle{width:42px;height:5px;border-radius:99px;background:var(--border);margin:0 auto 20px}.tiin-sheet h2{margin:0 0 10px;text-align:center}.tiin-sheet p{color:var(--text2);line-height:1.5}.tiin-sheet .btn{width:100%;margin-top:16px}.tiin-payment-form label{display:grid;gap:6px;margin:12px 0;color:var(--text2);font-size:11px;text-transform:uppercase;letter-spacing:.05em}.tiin-payment-form .form-input{width:100%;box-sizing:border-box}.tiin-two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.tiin-check{display:block!important;text-transform:none!important;font-size:13px!important;letter-spacing:0!important}.tiin-template-list{margin-top:14px;border-top:1px solid var(--border)}.tiin-template-list>div{display:flex;justify-content:space-between;align-items:center;padding:8px 0;font-size:13px}.tiin-template-list small{display:block;padding-top:12px;color:var(--text2)}.tiin-settings-group{margin:12px 0;padding:16px;border:1px solid #2a3854;border-radius:22px;background:#17213a;box-shadow:0 10px 24px rgba(0,0,0,.12)}.tiin-settings-group:first-of-type{margin-top:0}.tiin-settings-group h3{padding-bottom:9px;border-bottom:1px solid rgba(148,163,184,.16)}.tiin-settings-group h3{margin:0 0 10px;font-size:16px;color:var(--gold1)}.tiin-setting-row{width:100%;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:14px 0;border:0;border-top:1px solid rgba(148,163,184,.15);background:transparent;text-align:left;color:var(--text)}.tiin-setting-row:first-of-type{border-top:0}.tiin-setting-row b,.tiin-setting-row small{display:block}.tiin-setting-row small{font-size:11px;color:var(--text2);margin-top:3px}.tiin-setting-row i{font-size:24px;color:var(--gold1);font-style:normal}.tiin-setting-inline{padding:12px 0;border-top:1px solid rgba(255,255,255,.07);display:grid;gap:8px}.tiin-setting-inline small{color:var(--text2);font-size:11px}.tiin-segment{display:flex;gap:6px}.tiin-segment button{flex:1;border:1px solid var(--border);border-radius:10px;padding:8px;background:transparent;color:var(--text2);font-size:12px}.tiin-segment button.selected{border-color:var(--gold1);background:rgba(212,175,90,.12);color:var(--gold1)}.tiin-toggle{display:flex;justify-content:space-between;align-items:center;padding:11px 0;border-top:1px solid rgba(255,255,255,.07);font-size:13px}.tiin-toggle input{display:none}.tiin-toggle i{width:37px;height:21px;border-radius:99px;background:var(--border);position:relative}.tiin-toggle i:after{content:'';position:absolute;width:15px;height:15px;background:var(--text2);border-radius:50%;top:3px;left:3px;transition:.2s}.tiin-toggle input:checked+i{background:var(--gold1)}.tiin-toggle input:checked+i:after{left:19px;background:#1d1d1d}.tiin-sync-state{padding:10px;background:rgba(52,211,153,.07);border-radius:12px;font-size:13px}.tiin-sync-state small{display:block;color:var(--text2);margin-top:4px}.tiin-action-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.tiin-faq details{padding:10px 0;border-top:1px solid rgba(255,255,255,.07)}.tiin-faq summary{font-size:13px;cursor:pointer}.tiin-faq p{font-size:12px;color:var(--text2);line-height:1.45}.tiin-onboarding{margin:0 0 15px;padding:14px;border:1px solid rgba(212,175,90,.45);border-radius:18px;background:linear-gradient(135deg,rgba(212,175,90,.15),var(--card));display:grid;grid-template-columns:1fr auto;gap:10px}.tiin-onboarding span{font-size:10px;color:var(--gold1);letter-spacing:.08em;font-weight:800}.tiin-onboarding h3{font-size:17px;margin:3px 0}.tiin-onboard-steps{grid-column:1/-1;display:grid;gap:6px}.tiin-onboard-steps button{border:0;background:transparent;color:var(--text);padding:5px;text-align:left;font-size:12px}.tiin-onboard-steps button.done{color:#6ee7b7}.tiin-simple-mode .deals-access,.tiin-simple-mode .deals-forecast,.tiin-simple-mode .finance-plan-card,.tiin-simple-mode [data-advanced="true"]{display:none!important}@media(max-width:520px){.tiin-pay-item{grid-template-columns:38px minmax(0,1fr) auto}.tiin-pay-actions{grid-column:2/-1;justify-content:flex-end}.tiin-section-head h2{font-size:23px}.tiin-two{grid-template-columns:1fr}.tiin-payment-metrics{gap:7px}}`;
  document.head.appendChild(style);
  migrateLegacyPayments(); const legacyPaymentsReconciled = reconcileCurrentLegacyPaidPayments(); if (legacyPaymentsReconciled && typeof window.render === 'function') window.render(); installNavigation(); setTimeout(installNavigation, 250); applyMode(); window.setInterval(applyMode, 60000);
})();
