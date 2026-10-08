/* TIIN Finance Coach — plan, reminders, auto-savings and human analytics. */
(function () {
  'use strict';
  const PLAN_KEY = 'financial_plan';
  const today = () => localDateString();
  const num = v => Math.max(0, Number(v) || 0);
  const language = () => document.getElementById('langKz')?.classList.contains('active') ? 'kz' : 'ru';
  const words = () => language() === 'kz' ? {
    plan:'Қаржы жоспары', settings:'Жоспарды баптау', expected:'Күтілетін кіріс', mandatory:'Міндетті төлемдер', auto:'Автожинақ мақсаттарда', spent:'Жұмсалды', available:'Шығынға қалды', daily:'Күніне қауіпсіз сома', days:'күн қалды', reminders:'Назар аудару керек', notify:'Хабарламаларды қосу', notificationsOn:'Хабарламалар қосулы', save:'Сақтау', insight:'Ақша қайда кетіп жатыр', noData:'Қорытынды үшін шығындар қосыңыз', top:'Ең көп шығын', saving:'Осы санатты 20% қысқартсаңыз, сақтайсыз', compared:'Өткен аймен салыстырғанда', more:'көбірек', less:'азырақ', autoSave:'Автожинақ', percent:'Әр кірістен пайыз', allocated:'мақсатқа аударылды', due:'жақында төленеді', limit:'күндік лимиттің 80%-ы жұмсалды', life:'Өмірге арналған бюджет', savings:'Мақсаттардағы жинақ', reserve:'Бос резерв', allocationHelp:'Жалпы баланстан өмірге арналған соманы бөліңіз. Жинақты «Мақсаттарда» басқарыңыз.', balance:'Жалпы баланс', freeBalance:'Бос баланс', remaining:'Қалды', allocationTooHigh:'Бөлу жалпы баланстан асады', openGoals:'Мақсаттарды ашу', savingsHint:'Жинақ пен автожинақ әр мақсатта бапталады'
  } : {
    plan:'Финансовый план', settings:'Настроить план', expected:'Ожидаемый доход', mandatory:'Обязательные платежи', auto:'Автокопилка в целях', spent:'Потрачено', available:'Осталось на расходы', daily:'Безопасно тратить в день', days:'дн. осталось', reminders:'Требует внимания', notify:'Включить уведомления', notificationsOn:'Уведомления включены', save:'Сохранить', insight:'Куда уходят деньги', noData:'Добавь расходы — TIIN подготовит выводы', top:'Больше всего уходит на', saving:'Если сократить эту категорию на 20%, сохранишь', compared:'К прошлому месяцу', more:'больше', less:'меньше', autoSave:'Автокопилка', percent:'Процент с каждого дохода', allocated:'отправлено в цель', due:'скоро платёж', limit:'потрачено 80% дневного лимита', life:'Выделено на жизнь', savings:'Накопления в целях', reserve:'Свободный резерв', allocationHelp:'Выдели из общего баланса сумму на жизнь. Накопления и автокопилка настраиваются в целях.', balance:'Общий баланс', freeBalance:'Свободный баланс', remaining:'Осталось', allocationTooHigh:'Сумма конвертов больше общего баланса', openGoals:'Открыть цели', savingsHint:'Сумму и автокопилку настраивай внутри каждой цели'
  };
  function monthKey(year, month) { return `${year}-${String(month + 1).padStart(2, '0')}`; }
  function selectedMonth() {
    const title = document.getElementById('monthTitle')?.textContent || '';
    const match = title.match(/(\d{4})/);
    const names = ['январ','феврал','март','апрел','ма','июн','июл','август','сентябр','октябр','ноябр','декабр'];
    const lowered = title.toLowerCase();
    const index = names.findIndex(name => lowered.includes(name));
    const now = new Date();
    return { year:match ? Number(match[1]) : now.getFullYear(), month:index >= 0 ? index : now.getMonth() };
  }
  function planBook() {
    try {
      const stored = JSON.parse(localStorage.getItem(PLAN_KEY) || '{}') || {};
      if (stored.months) return stored;
      const current = selectedMonth();
      return { months: { [monthKey(current.year, current.month)]: { expectedIncome:num(stored.expectedIncome), lifeAllocated:num(stored.lifeAllocated) } } };
    } catch (_) { return { months:{} }; }
  }
  function plan() { const current=selectedMonth(), book=planBook(); return book.months[monthKey(current.year,current.month)] || {}; }
  function savePlan(value, year, month) {
    const current=selectedMonth(), targetYear=year ?? current.year, targetMonth=month ?? current.month, book=planBook(), key=monthKey(targetYear,targetMonth);
    book.months[key] = { ...(book.months[key] || {}), ...value, expectedIncome:num(value.expectedIncome ?? book.months[key]?.expectedIncome), lifeAllocated:num(value.lifeAllocated ?? book.months[key]?.lifeAllocated) };
    localStorage.setItem(PLAN_KEY, JSON.stringify(book));
  }
  function savingsTotal() { return getGoals().reduce((total, goal) => total + num(goal.saved), 0); }
  function migrateLegacySavings() {
    const p=plan(), legacy=num(p.savingsAllocated); if(!legacy) return;
    const goals=getGoals(); goals.push({ name:language()==='ru'?'Накопления':'Жинақ', target:Math.max(legacy*2,1000000), saved:legacy, deadline:null, autoPercent:0, autoTxIds:[] });
    saveGoals(goals); savePlan({ expectedIncome:p.expectedIncome, lifeAllocated:p.lifeAllocated });
  }
  function overallBalance() { const value=document.getElementById('totalBalance'); return num(value?.dataset.financeGrossBalance || (document.querySelector('.balance-hero .value.balance')?.textContent || value?.textContent || '0').replace(/[^0-9.,-]/g, '').replace(/,/g, '')); }
  function txns(year, month) { return filterTxnsByWallet(getTxns(year, month)); }
  function sum(list) { return list.reduce((total, item) => total + num(item.amount), 0); }
  function monthExpenses(year, month) { return sum(txns(year, month).filter(item => item.type === 'expense')); }
  function recurringExpenses(year, month) {
    return sum(getRecurring().filter(item => {
      if (item.type !== 'expense') return false;
      if (!item.startMonth) return true;
      const [y, m] = item.startMonth.split('-').map(Number);
      return year > y || (year === y && month >= m - 1);
    }));
  }
  function totalAutoRate() { return Math.min(100, getGoals().reduce((total, goal) => total + Math.max(0, Math.min(100, Number(goal.autoPercent) || 0)), 0)); }
  function metrics() {
    const { year, month } = selectedMonth(), p = plan(), now = new Date();
    const isCurrent = now.getFullYear() === year && now.getMonth() === month;
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysLeft = isCurrent ? Math.max(1, daysInMonth - now.getDate() + 1) : daysInMonth;
    const actualIncome = sum(txns(year, month).filter(item => item.type === 'income'));
    const expected = num(p.expectedIncome) || actualIncome;
    const mandatory = recurringExpenses(year, month), auto = expected * totalAutoRate() / 100;
    const spent = monthExpenses(year, month), lifeAllocated=num(p.lifeAllocated), savingsAllocated=savingsTotal();
    const budget = lifeAllocated || Math.max(0, expected - mandatory - auto);
    const lifeRemaining=Math.max(0,lifeAllocated-spent);
    const available = Math.max(0, budget - spent - (lifeAllocated ? mandatory : 0));
    const balance=overallBalance(), reserve=Math.max(0,balance-lifeRemaining-savingsAllocated);
    return { expected, mandatory, auto, spent, budget, lifeAllocated, lifeRemaining, savingsAllocated, balance, reserve, available, daily:available / daysLeft, daysLeft };
  }
  function setModal(html) { document.getElementById('modal').innerHTML = html; document.getElementById('modalOverlay').classList.add('open'); }
  function monthTitle(year, month) { return new Intl.DateTimeFormat(language()==='ru'?'ru-RU':'kk-KZ',{month:'long',year:'numeric'}).format(new Date(year,month,1)); }
  function nextMonth(year, month) { return month === 11 ? {year:year+1,month:0} : {year,month:month+1}; }
  window.openFinancialPlan = function () {
    const p = plan(), c = words();
    const balance=overallBalance(), saved=savingsTotal();
    setModal(`<h3>🧭 ${c.plan}</h3><p style="font-size:13px;color:var(--text2);line-height:1.5">${c.allocationHelp}</p><div class="finance-modal-balance">${c.balance}: <b>${fmt(balance)}</b><br><span>${c.savings}: <b>${fmt(saved)}</b></span></div><div class="form-group"><label>${c.life}</label><input type="number" class="form-input big" id="financeLifeAllocated" value="${p.lifeAllocated || ''}" placeholder="0" inputmode="numeric"></div><button class="finance-goals-button" onclick="closeModal();switchTab('goals')">🎯 ${c.openGoals}</button><p class="finance-goals-hint">${c.savingsHint}</p><div class="form-group"><label>${c.expected} (${language()==='ru'?'для будущих месяцев':'келесі айларға'})</label><input type="number" class="form-input" id="financeExpectedIncome" value="${p.expectedIncome || ''}" placeholder="0" inputmode="numeric"></div><button class="btn btn-gold" onclick="saveFinancialPlan()" style="width:100%;margin-top:8px">${c.save}</button>`);
  };
  window.saveFinancialPlan = function () { const next={expectedIncome:document.getElementById('financeExpectedIncome').value,lifeAllocated:document.getElementById('financeLifeAllocated').value}; if(num(next.lifeAllocated)+savingsTotal()>overallBalance()){toast('⚠️ '+words().allocationTooHigh);return;} savePlan(next); closeModal(); toast(words().save + ' ✓'); render(); };
  function closeMonthSummary() {
    const {year,month}=selectedMonth(), p=plan(), m=metrics(), variance=Math.round(m.lifeAllocated-m.spent), next=nextMonth(year,month);
    return {year,month,p,m,variance,next};
  }
  window.openMonthClose = function () {
    const {year,month,p,m,variance,next}=closeMonthSummary();
    if(p.closed){toast(language()==='ru'?'Этот месяц уже закрыт':'Бұл ай жабылған');return;}
    const positive=variance>=0;
    const title=monthTitle(year,month);
    const summary=positive ? `Сэкономлено <b>${fmt(variance)}</b>. Эта сумма уже остаётся в общем балансе.` : `Перерасход <b>${fmt(Math.abs(variance))}</b>. Он уже учтён в реальном общем балансе — повторно ничего не списываем.`;
    const actions=positive && variance ? `<div class="month-close-actions"><button class="btn btn-ghost" onclick="closeMonth('free')">Оставить свободными</button><button class="btn btn-ghost" onclick="closeMonth('next')">В бюджет ${monthTitle(next.year,next.month)}</button>${getGoals().length?`<button class="btn btn-gold" onclick="openMonthCloseGoalPicker()">Перевести в цель</button>`:''}</div>` : `<button class="btn btn-gold" onclick="closeMonth('free')" style="width:100%">Закрыть месяц</button>`;
    setModal(`<h3>✓ Закрыть ${title}</h3><div class="month-close-summary"><span>Выделено на жизнь</span><b>${fmt(m.lifeAllocated)}</b><span>Потрачено</span><b>${fmt(m.spent)}</b><hr><p>${summary}</p></div><p class="month-close-note">Новый месяц начнётся с нового плана. Общий баланс и накопления не обнуляются.</p>${actions}`);
  };
  window.openMonthCloseGoalPicker=function(){
    const {variance}=closeMonthSummary();
    setModal(`<h3>🎯 Куда перевести ${fmt(variance)}?</h3><p class="month-close-note">Сумма станет частью накоплений выбранной цели.</p><div class="month-goal-picker">${getGoals().map((goal,index)=>`<button onclick="closeMonth('goal',${index})"><span>${goal.name}</span><b>${fmt(goal.saved)} / ${fmt(goal.target)}</b></button>`).join('')}</div>`);
  };
  window.closeMonth=function(destination,goalIndex){
    const {year,month,p,variance,next}=closeMonthSummary(); if(p.closed)return;
    if(destination==='goal' && variance>0 && getGoals()[goalIndex]) { const goals=getGoals(); goals[goalIndex].saved=Math.min(num(goals[goalIndex].target),num(goals[goalIndex].saved)+variance); saveGoals(goals); }
    if(destination==='next' && variance>0) { const nextPlan=planBook().months[monthKey(next.year,next.month)] || {}; savePlan({ ...nextPlan, lifeAllocated:num(nextPlan.lifeAllocated)+variance },next.year,next.month); }
    savePlan({ ...p, closed:true, closedAt:new Date().toISOString(), closingVariance:variance, closingDestination:destination });
    closeModal(); toast(language()==='ru'?'Месяц закрыт ✓':'Ай жабылды ✓'); render();
  };
  window.enableFinanceNotifications = async function () {
    if (!('Notification' in window)) { toast(language()==='ru'?'На этом устройстве уведомления недоступны':'Бұл құрылғыда хабарламалар қолжетімсіз'); return; }
    const result = await Notification.requestPermission();
    toast(result === 'granted' ? words().notificationsOn + ' ✓' : (language()==='ru'?'Разрешение не выдано':'Рұқсат берілмеді'));
    render();
  };
  function reminderItems() {
    const { year, month } = selectedMonth(), c = words(), items = [], now = new Date();
    const all = getTxns(year, month).filter(item => item.type === 'expense');
    const raw = (() => { try { return JSON.parse(localStorage.getItem('budgets') || '{}'); } catch (_) { return {}; } })();
    const dailyLimit = num(raw?.global?.daily);
    const daySpent = sum(all.filter(item => item.date === today()));
    if (dailyLimit && daySpent >= dailyLimit * .8) items.push({ key:'daily-limit', text:`${c.limit}: ${fmt(daySpent)} / ${fmt(dailyLimit)}`, urgent:daySpent >= dailyLimit });
    getRecurring().filter(item => item.type === 'expense').forEach(item => {
      const due = new Date(year, month, Math.min(item.day, new Date(year, month + 1, 0).getDate()));
      const diff = Math.ceil((due - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
      if (diff >= 0 && diff <= 3) items.push({ key:'payment-'+item.id, text:`${item.name} — ${fmt(item.amount)}, ${c.due}`, urgent:diff === 0 });
    });
    return items.slice(0, 3);
  }
  function notifyOnce() {
    const items = reminderItems(); if (!items.length) return;
    const stamp = today(), seen = JSON.parse(localStorage.getItem('tiin_finance_notice_seen') || '{}');
    items.forEach(item => {
      if (seen[item.key] === stamp) return;
      seen[item.key] = stamp;
      if ('Notification' in window && Notification.permission === 'granted') new Notification('TIIN', { body:item.text });
    });
    localStorage.setItem('tiin_finance_notice_seen', JSON.stringify(seen));
  }
  function planCard() {
    const c = words(), m = metrics(), reminders = reminderItems(), p=plan(), current=selectedMonth(), now=new Date();
    const notify = ('Notification' in window && Notification.permission === 'granted');
    const expectedText = m.expected ? fmt(m.expected) : (language()==='ru'?'Укажи доход':'Кірісті көрсетіңіз');
    const canClose=current.year<now.getFullYear() || (current.year===now.getFullYear() && current.month<=now.getMonth());
    const closeControl=p.closed ? `<span class="month-closed">✓ ${language()==='ru'?'Месяц закрыт':'Ай жабылды'}</span>` : canClose ? `<button class="finance-close" onclick="openMonthClose()">${language()==='ru'?'Закрыть месяц':'Айды жабу'}</button>` : '';
    return `<section class="card finance-plan-card"><div class="finance-head"><div><h3 class="gold">🧭 ${c.plan}</h3><p>${c.balance}: <b>${fmt(m.balance)}</b></p></div><div class="finance-actions"><button class="btn btn-ghost btn-sm" onclick="openFinancialPlan()">${c.settings}</button>${closeControl}</div></div><div class="finance-envelopes"><div><span>🏠 ${c.life}</span><b>${fmt(m.lifeAllocated)}</b><small>${c.remaining}: ${fmt(m.lifeRemaining)}</small></div><div><span>🎯 ${c.savings}</span><b>${fmt(m.savingsAllocated)}</b></div><div><span>◌ ${c.reserve}</span><b>${fmt(m.reserve)}</b></div></div><div class="finance-plan-grid"><div><span>${c.mandatory}</span><b>${fmt(m.mandatory)}</b></div><div><span>${c.spent}</span><b>${fmt(m.spent)}</b></div><div class="finance-safe"><span>${c.daily}</span><b>${fmt(m.daily)}</b><small>${fmt(m.available)} · ${m.daysLeft} ${c.days}</small></div><div><span>${c.auto}</span><b>${fmt(m.auto)}</b></div></div>${reminders.length ? `<div class="finance-reminders"><div><b>🔔 ${c.reminders}</b>${reminders.map(item=>`<p class="${item.urgent?'urgent':''}">${item.text}</p>`).join('')}</div>${!notify?`<button class="finance-notify" onclick="enableFinanceNotifications()">${c.notify}</button>`:''}</div>` : ''}</section>`;
  }
  function insertHome() { const el = document.getElementById('tab-transactions'); if (!el) return; el.querySelector('.finance-plan-card')?.remove(); el.insertAdjacentHTML('afterbegin', planCard()); }
  function analyticsCard() {
    const { year, month } = selectedMonth(), c = words(), list = txns(year, month).filter(item => item.type === 'expense');
    if (!list.length) return `<section class="card finance-insight-card"><h3 class="gold">✨ ${c.insight}</h3><p>${c.noData}</p></section>`;
    const grouped = {}; list.forEach(item => grouped[item.category] = (grouped[item.category] || 0) + num(item.amount));
    const [category, amount] = Object.entries(grouped).sort((a,b)=>b[1]-a[1])[0];
    const cat = EXPENSE_CATS.find(item => item.id === category) || { icon:'•', name:category };
    const previous = monthExpenses(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1), total = sum(list);
    const diff = previous ? Math.round((total - previous) / previous * 100) : null;
    return `<section class="card finance-insight-card"><h3 class="gold">✨ ${c.insight}</h3><p>${c.top}: <b>${cat.icon} ${cat.name}</b> — <strong>${fmt(amount)}</strong>.</p><p>${c.saving} <strong>${fmt(amount * .2)}</strong>.</p>${diff !== null ? `<p>${c.compared}: <strong class="${diff > 0 ? 'finance-negative' : 'finance-positive'}">${Math.abs(diff)}% ${diff > 0 ? c.more : c.less}</strong>.</p>` : ''}</section>`;
  }
  function insertAnalytics() { const el = document.getElementById('tab-analytics'); if (!el) return; el.querySelector('.finance-insight-card')?.remove(); el.insertAdjacentHTML('afterbegin', analyticsCard()); }
  window.openGoalAutomation = function (index) {
    const goal = getGoals()[index], c = words(); if (!goal) return;
    setModal(`<h3>🎯 ${goal.name}</h3><div class="form-group"><label>${c.percent}</label><input type="number" class="form-input big" id="goalAutoPercent" min="0" max="100" value="${num(goal.autoPercent) || ''}" placeholder="0" inputmode="numeric"></div><p style="font-size:12px;color:var(--text2);line-height:1.45">${language()==='ru'?'После каждого нового дохода TIIN автоматически добавит эту долю в цель.':'Әр жаңа кірістен кейін TIIN осы үлесті мақсатқа автоматты түрде қосады.'}</p><button class="btn btn-gold" onclick="saveGoalAutomation(${index})" style="width:100%;margin-top:8px">${c.save}</button>`);
  };
  window.saveGoalAutomation = function (index) { const goals=getGoals(), rate=Math.min(100,num(document.getElementById('goalAutoPercent').value)); if(!goals[index])return; goals[index].autoPercent=rate; saveGoals(goals); closeModal(); toast(words().autoSave + ' ✓'); render(); };
  function decorateGoals() { const el=document.getElementById('tab-goals'), goals=getGoals(); if(!el) return; el.querySelectorAll('.goal-card').forEach((card,index)=>{ const goal=goals[index]; if(!goal || card.querySelector('.goal-auto-row')) return; const rate=num(goal.autoPercent); card.insertAdjacentHTML('beforeend', `<div class="goal-auto-row"><span>⚡ ${words().autoSave}: <b>${rate ? rate+'%' : '—'}</b></span><button onclick="openGoalAutomation(${index})">${rate ? words().settings : words().autoSave}</button></div>`); }); }
  function goalPlan(goal) {
    const left=Math.max(0,num(goal.target)-num(goal.saved));
    if (!goal.deadline) return { left, days:0, daily:0, date:'' };
    const end=new Date(goal.deadline+'T23:59:59'), now=new Date(); now.setHours(0,0,0,0);
    const days=Math.max(0,Math.ceil((end-now)/86400000));
    return { left, days, daily:days ? left/days : left, date:new Intl.DateTimeFormat(language()==='ru'?'ru-RU':'kk-KZ',{day:'numeric',month:'long',year:'numeric'}).format(end) };
  }
  function enhanceGoalCards() {
    const el=document.getElementById('tab-goals'), goals=getGoals(), c=words(); if(!el) return;
    el.querySelectorAll('.goal-card').forEach((card,index)=>{
      const goal=goals[index]; if(!goal) return;
      const plan=goalPlan(goal), old=card.querySelector('.goal-amounts');
      if(old) old.innerHTML=`<span>Цель: <b>${fmt(goal.target)}</b></span><span>Отложено: <b>${fmt(goal.saved)}</b></span>`;
      card.querySelector('.goal-eta')?.remove();
      card.querySelector('.goal-plan-details')?.remove();
      const progress=card.querySelector('.goal-bar-track');
      if(progress) progress.insertAdjacentHTML('afterend', `<div class="goal-plan-details"><div><span>Осталось накопить</span><b>${fmt(plan.left)}</b></div>${plan.date ? `<div><span>Срок</span><b>до ${plan.date}</b></div><div class="goal-daily"><span>Чтобы успеть</span><b>${fmt(plan.daily)} / день</b><small>${plan.days} дн.</small></div>` : `<div class="goal-daily missing"><span>Срок не задан</span><b>Настрой план</b></div>`}</div>`);
      const row=card.querySelector('.goal-auto-row'); if(row) row.querySelector('button').textContent='Настроить план';
    });
  }
  window.openGoalModal=function(){
    const c=words();
    setModal(`<h3>🎯 Новая цель накоплений</h3><p class="goal-form-note">На что копим, сколько нужно и к какой дате?</p><div class="form-group"><label>Название цели</label><input type="text" class="form-input" id="goalName" placeholder="Например, Вьетнам или подушка безопасности"></div><div class="form-group"><label>Нужно накопить</label><input type="number" class="form-input big" id="goalTarget" placeholder="0" inputmode="numeric"></div><div class="form-group"><label>Дата завершения</label><input type="date" class="form-input" id="goalDeadline"></div><div class="form-group"><label>${c.percent}</label><input type="number" class="form-input" id="goalAutoPercent" min="0" max="100" placeholder="0" inputmode="numeric"></div><button class="btn btn-gold" onclick="saveGoal()" style="width:100%;margin-top:8px">Создать цель</button>`);
  };
  window.saveGoal=function(){
    const name=document.getElementById('goalName').value.trim(), target=num(document.getElementById('goalTarget').value), deadline=document.getElementById('goalDeadline').value, rate=Math.min(100,num(document.getElementById('goalAutoPercent').value));
    if(!name){toast(language()==='ru'?'Напиши, на что копим':'Не үшін жинайтыныңызды жазыңыз');return;} if(!target){toast(language()==='ru'?'Укажи сумму цели':'Мақсат сомасын көрсетіңіз');return;}
    const goals=getGoals(); goals.push({name,target,saved:0,deadline:deadline||null,autoPercent:rate,autoTxIds:[]}); saveGoals(goals); closeModal(); toast(language()==='ru'?'Цель создана ✓':'Мақсат құрылды ✓'); render();
  };
  window.openGoalAutomation=function(index){
    const goal=getGoals()[index]; if(!goal) return; const p=goalPlan(goal), c=words();
    setModal(`<h3>🎯 План цели</h3><div class="form-group"><label>На что копим</label><input type="text" class="form-input" id="editGoalName" value="${goal.name}"></div><div class="form-group"><label>Итоговая сумма</label><input type="number" class="form-input big" id="editGoalTarget" value="${num(goal.target)}" inputmode="numeric"></div><div class="form-group"><label>Дата завершения</label><input type="date" class="form-input" id="editGoalDeadline" value="${goal.deadline||''}"></div><div class="form-group"><label>${c.percent}</label><input type="number" class="form-input" id="editGoalAutoPercent" min="0" max="100" value="${num(goal.autoPercent)||''}" placeholder="0" inputmode="numeric"></div><div class="goal-plan-preview">Уже отложено: <b>${fmt(goal.saved)}</b><br>Осталось: <b>${fmt(p.left)}</b>${p.days?`<br>Нужно откладывать: <b>${fmt(p.daily)} в день</b>`:''}</div><button class="btn btn-gold" onclick="saveGoalAutomation(${index})" style="width:100%;margin-top:8px">${c.save}</button>`);
  };
  window.saveGoalAutomation=function(index){
    const goals=getGoals(), goal=goals[index]; if(!goal)return;
    const name=document.getElementById('editGoalName').value.trim(), target=num(document.getElementById('editGoalTarget').value), deadline=document.getElementById('editGoalDeadline').value, rate=Math.min(100,num(document.getElementById('editGoalAutoPercent').value));
    if(!name||!target){toast(language()==='ru'?'Заполни название и сумму':'Атауы мен сомасын толтырыңыз');return;}
    Object.assign(goal,{name,target,deadline:deadline||null,autoPercent:rate}); saveGoals(goals); closeModal(); toast(words().save+' ✓'); render();
  };
  function allocateIncome(transaction) {
    if (!transaction || transaction.type !== 'income') return;
    const goals=getGoals(); let allocated=0, changed=false;
    goals.forEach(goal => { const rate=Math.max(0,Math.min(100,num(goal.autoPercent))); if(!rate) return; goal.autoTxIds=Array.isArray(goal.autoTxIds)?goal.autoTxIds:[]; if(goal.autoTxIds.includes(String(transaction.id))) return; const amount=Math.round(num(transaction.amount)*rate)/100; if(!amount) return; goal.saved=Math.min(num(goal.target),num(goal.saved)+amount); goal.autoTxIds.push(String(transaction.id)); if(goal.autoTxIds.length>500) goal.autoTxIds=goal.autoTxIds.slice(-500); allocated+=amount; changed=true; });
    if(changed){saveGoals(goals); toast(`⚡ ${fmt(allocated)} ${words().allocated}`); render();}
  }
  const nativeConfirmDeposit=window.confirmDeposit;
  window.confirmDeposit=function(index){nativeConfirmDeposit(index);render();};
  const nativeConfirmWithdraw=window.confirmWithdraw;
  window.confirmWithdraw=function(index){nativeConfirmWithdraw(index);render();};
  const nativeDeleteGoal=window.deleteGoal;
  window.deleteGoal=function(index){nativeDeleteGoal(index);render();};
  const nativeRenderTransactions=window.renderTransactions;
  window.renderTransactions=function(){nativeRenderTransactions();insertHome();};
  const nativeRenderAnalytics=window.renderAnalytics;
  window.renderAnalytics=function(){nativeRenderAnalytics();insertAnalytics();};
  const nativeRenderGoals=window.renderGoals;
  window.renderGoals=function(){nativeRenderGoals();decorateGoals();enhanceGoalCards();};
  const nativeSaveTx=window.saveTx;
  window.saveTx=function(type){ const before=new Set(); for(let i=0;i<localStorage.length;i+=1){const key=localStorage.key(i); if(key?.startsWith('txns_')) JSON.parse(localStorage.getItem(key)||'[]').forEach(item=>before.add(String(item.id)));} nativeSaveTx(type); if(type!=='income')return; for(let i=0;i<localStorage.length;i+=1){const key=localStorage.key(i);if(!key?.startsWith('txns_'))continue;const added=JSON.parse(localStorage.getItem(key)||'[]').find(item=>!before.has(String(item.id))&&item.type==='income');if(added){allocateIncome(added);return;}} };
  function applyBalanceEnvelopes() {
    const balance=document.getElementById('totalBalance'); if(!balance) return;
    balance.dataset.financeGrossBalance=String(num(balance.textContent.replace(/[^0-9.,-]/g,'').replace(/,/g,'')));
    const m=metrics(), configured=m.lifeAllocated || m.savingsAllocated;
    if(!configured) return;
    balance.textContent=fmt(m.reserve);
    document.querySelector('.balance-hero-label')?.replaceChildren(words().freeBalance);
    const kpi=document.querySelector('#balanceKpi .value'); if(kpi) kpi.textContent=fmt(m.reserve);
  }
  const nativeRender=window.render;
  window.render=function(){nativeRender(); applyBalanceEnvelopes(); if(document.getElementById('tab-transactions')) insertHome(); if(document.getElementById('tab-analytics')) insertAnalytics(); if(document.getElementById('tab-goals')) {decorateGoals();enhanceGoalCards();}};
  const style=document.createElement('style');
  style.textContent='.finance-plan-card{border-color:rgba(212,175,90,.34)!important}.finance-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.finance-head h3,.finance-insight-card h3{margin:0 0 4px;font-size:16px}.finance-head p,.finance-insight-card p{margin:3px 0;color:var(--text2);font-size:12px;line-height:1.45}.finance-envelopes{display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:12px}.finance-envelopes>div{padding:9px 7px;border-radius:11px;background:rgba(212,175,90,.08);border:1px solid rgba(212,175,90,.16)}.finance-envelopes span{display:block;color:var(--text2);font-size:9px;line-height:1.15}.finance-envelopes b{display:block;margin-top:4px;font-size:12px;color:var(--gold2);font-variant-numeric:tabular-nums}.finance-envelopes small{display:block;margin-top:3px;color:var(--text2);font-size:9px;white-space:nowrap}.finance-plan-grid{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:13px}.finance-plan-grid>div{padding:10px;border-radius:12px;background:rgba(255,255,255,.04)}.finance-plan-grid span{display:block;color:var(--text2);font-size:10px;line-height:1.25}.finance-plan-grid b{display:block;margin-top:4px;font-size:15px;font-variant-numeric:tabular-nums}.finance-safe{border:1px solid rgba(212,175,90,.33);background:rgba(212,175,90,.09)!important}.finance-safe b{color:var(--gold2)}.finance-safe small{display:block;margin-top:3px;color:var(--text2);font-size:10px}.finance-modal-balance{margin:10px 0 12px;padding:10px 12px;border:1px solid rgba(212,175,90,.28);border-radius:12px;background:rgba(212,175,90,.09);font-size:13px}.finance-modal-balance span{display:block;margin-top:5px;color:var(--text2);font-size:12px}.finance-modal-balance b{color:var(--gold2)}.finance-goals-button{width:100%;margin:2px 0 3px;padding:11px;border:1px solid rgba(212,175,90,.4);border-radius:12px;background:rgba(212,175,90,.1);color:var(--gold2);font:700 13px Inter,sans-serif}.finance-goals-hint{margin:0 0 14px;color:var(--text2);font-size:11px;line-height:1.4}.finance-reminders{display:flex;justify-content:space-between;gap:10px;margin-top:12px;padding-top:11px;border-top:1px solid rgba(255,255,255,.08);font-size:11px}.finance-reminders b{font-size:12px}.finance-reminders p{margin:4px 0;color:var(--text2)}.finance-reminders p.urgent{color:#f87171}.finance-notify,.goal-auto-row button{border:1px solid rgba(212,175,90,.38);border-radius:9px;background:transparent;color:var(--gold2);padding:7px 8px;font:600 11px Inter,sans-serif;cursor:pointer;align-self:flex-start}.finance-insight-card{margin-bottom:12px}.finance-insight-card strong{color:var(--gold2)}.finance-positive{color:var(--green)!important}.finance-negative{color:var(--red)!important}.goal-plan-details{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin:10px 0}.goal-plan-details>div{padding:8px;border-radius:10px;background:rgba(255,255,255,.04)}.goal-plan-details span{display:block;color:var(--text2);font-size:10px}.goal-plan-details b{display:block;margin-top:3px;color:var(--text);font-size:12px}.goal-plan-details .goal-daily{grid-column:1/-1;border:1px solid rgba(212,175,90,.25);background:rgba(212,175,90,.09)}.goal-plan-details .goal-daily b{color:var(--gold2);font-size:14px}.goal-plan-details small{color:var(--text2);font-size:10px}.goal-plan-details .missing{border-style:dashed}.goal-auto-row{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-top:10px;padding-top:9px;border-top:1px solid rgba(255,255,255,.07);font-size:11px;color:var(--text2)}.goal-auto-row b{color:var(--gold2)}.goal-form-note{margin:-4px 0 16px;color:var(--text2);font-size:12px;line-height:1.45}.goal-plan-preview{margin:12px 0;padding:10px;border-radius:10px;background:rgba(212,175,90,.09);font-size:12px;line-height:1.65}.goal-plan-preview b{color:var(--gold2)}html.light .finance-plan-grid>div,html.light .goal-plan-details>div{background:#FFF8E9}html.light .finance-envelopes>div,html.light .finance-modal-balance,html.light .goal-plan-preview{background:#F6E7C8}html.light .finance-safe{background:#F6E7C8!important}html.light .finance-reminders,html.light .goal-auto-row{border-color:rgba(91,70,30,.14)}@media(max-width:420px){.finance-head{align-items:center}.finance-head .btn{min-height:34px!important;font-size:11px!important;padding:7px 9px!important}.finance-plan-grid{gap:6px}.finance-plan-grid>div{padding:8px}.finance-plan-grid b{font-size:13px}.finance-envelopes>div{padding:8px 5px}.finance-envelopes b{font-size:11px}.finance-reminders{flex-direction:column}.finance-notify{align-self:stretch}}';
  document.head.appendChild(style);
  setTimeout(() => { migrateLegacySavings(); render(); notifyOnce(); }, 120);
})();
