/* TIIN Deals — forecast revenue separately from cash actually received. */
(function () {
  'use strict';
  const KEY = 'tiin_deals_v1';
  let view = 'active';

  const ru = {
    title:'Сделки', add:'Новая сделка', forecast:'Воронка дохода', forecastRevenue:'Ожидаемая выручка', forecastProfit:'Ожидаемая прибыль', due:'К оплате', received:'Оплачено', active:'Активные', all:'Все', paid:'Оплачено', cancelled:'Отменена', lead:'Лид', awaiting:'Ожидание ответа', work:'В работе', invoice:'Счёт отправлен', waiting:'Ждёт оплаты', client:'Клиент / компания', date:'Плановая дата оплаты', amount:'Сумма договора', economics:'Экономика сделки', tax:'Налог', vat:'НДС (в сумме)', commission:'Комиссия / агентские', cost:'Себестоимость', labour:'Работа / подрядчики', other:'Прочие расходы', net:'Чистая прибыль', margin:'Маржинальность', pay:'Отметить оплату', payment:'Получить оплату', paidTotal:'Получено', remaining:'Осталось получить', partial:'Частичная оплата', save:'Сохранить', edit:'Изменить', delete:'Удалить', cancel:'Отмена', comment:'Комментарий', wallet:'Кошелёк', personal:'Личный', business:'Бизнес', status:'Статус', confirmDelete:'Удалить сделку?', noDeals:'Пока нет сделок', noDealsHint:'Создайте сделку — она попадёт в прогноз, а баланс изменится только после оплаты.', linkedIncome:'Оплата добавлена в доход', revert:'Отменить оплату', removeIncome:'Удалить связанную операцию', keepIncome:'Оставить доход', paymentDate:'Дата поступления', paymentAmount:'Сумма поступления', overpay:'Сумма больше остатка', invalid:'Заполните название и сумму'
  };
  const kz = {title:'Мәмілелер',add:'Жаңа мәміле',forecast:'Кіріс воронкасы',forecastRevenue:'Күтілетін түсім',forecastProfit:'Күтілетін пайда',due:'Төлеуге',received:'Төленді',active:'Белсенді',all:'Барлығы',paid:'Төленді',cancelled:'Бас тартылды',lead:'Лид',awaiting:'Жауап күтілуде',work:'Жұмыста',invoice:'Шот жіберілді',waiting:'Төлем күтілуде',client:'Клиент / компания',date:'Жоспарлы төлем күні',amount:'Келісімшарт сомасы',economics:'Мәміле экономикасы',tax:'Салық',vat:'ҚҚС (сома ішінде)',commission:'Комиссия / агенттік',cost:'Өзіндік құн',labour:'Жұмыс / мердігерлер',other:'Басқа шығындар',net:'Таза пайда',margin:'Маржа',pay:'Төлемді белгілеу',payment:'Төлемді алу',paidTotal:'Алынды',remaining:'Алуға қалды',partial:'Ішінара төлем',save:'Сақтау',edit:'Өзгерту',delete:'Жою',cancel:'Бас тарту',comment:'Түсініктеме',wallet:'Әмиян',personal:'Жеке',business:'Бизнес',status:'Мәртебе',confirmDelete:'Мәмілені жою керек пе?',noDeals:'Мәмілелер әлі жоқ',noDealsHint:'Мәміле жасаңыз — ол болжамға кіреді, ал баланс тек төлемнен кейін өзгереді.',linkedIncome:'Төлем кіріске қосылды',revert:'Төлемді болдырмау',removeIncome:'Байланысты операцияны жою',keepIncome:'Кірісті қалдыру',paymentDate:'Түсу күні',paymentAmount:'Түскен сома',overpay:'Сома қалдықтан көп',invalid:'Атауын және сомасын толтырыңыз',dealName:'Мәміле атауы',example:'Мысалы, жарнама науқаны',optional:'Міндетті емес',addedNet:'Жалпы балансқа таза қосылды: ',cancelLinked:'Алдымен байланысты төлемдерді болдырмаңыз'};
  const en = {title:'Deals',add:'New deal',forecast:'Revenue pipeline',forecastRevenue:'Expected revenue',forecastProfit:'Expected profit',due:'Due',received:'Paid',active:'Active',all:'All',paid:'Paid',cancelled:'Cancelled',lead:'Lead',awaiting:'Awaiting reply',work:'In progress',invoice:'Invoice sent',waiting:'Awaiting payment',client:'Client / company',date:'Planned payment date',amount:'Contract amount',economics:'Deal economics',tax:'Tax',vat:'VAT (included)',commission:'Commission / agency fee',cost:'Cost of goods',labour:'Work / contractors',other:'Other expenses',net:'Net profit',margin:'Margin',pay:'Mark as paid',payment:'Receive payment',paidTotal:'Received',remaining:'Remaining',partial:'Partial payment',save:'Save',edit:'Edit',delete:'Delete',cancel:'Cancel',comment:'Comment',wallet:'Wallet',personal:'Personal',business:'Business',status:'Status',confirmDelete:'Delete this deal?',noDeals:'No deals yet',noDealsHint:'Create a deal to include it in your forecast; your balance changes only after payment.',linkedIncome:'Payment added as income',revert:'Undo payment',removeIncome:'Remove linked transaction',keepIncome:'Keep income',paymentDate:'Payment date',paymentAmount:'Payment amount',overpay:'Amount exceeds the remaining balance',invalid:'Enter a name and amount',dealName:'Deal name',example:'For example, an advertising campaign',optional:'Optional',addedNet:'Net amount added to total balance: ',cancelLinked:'Undo linked payments first'};
  Object.assign(ru,{dealName:'Название сделки',example:'Например, займ близкому человеку',optional:'Необязательно',dealType:'Тип записи',businessDeal:'Коммерческая сделка',personalLoan:'Возврат личного займа',loanPayment:'Возврат займа',loanAdded:'В баланс поступило: ',loanTotal:'Вся сумма займа',receivedNow:'Получено сейчас',receivedNowHint:'Если уже вернули часть, впишите её здесь: запись попадёт в баланс, остальное останется долгом.',loanPartialHint:'Можно ввести только полученную часть. Например, 50 000 ₸ из 75 000 ₸; остаток станет 25 000 ₸.',partialHint:'Можно отметить частичную оплату.',loanAmountHint:'Укажите исходную сумму займа. Полученные деньги внесите ниже; дальнейшие возвраты — через «Возврат займа». Остаток посчитается автоматически.',dealAmountHint:'Исходная сумма договора. Частичные оплаты вносите отдельно.',belowPaid:'Общая сумма не может быть меньше уже полученной. При ошибке сначала отмените оплату.'});
  Object.assign(kz,{dealType:'Жазба түрі',businessDeal:'Коммерциялық мәміле',personalLoan:'Жеке қарызды қайтару',loanPayment:'Қарызды қайтару',loanAdded:'Балансқа түсті: ',loanTotal:'Қарыздың жалпы сомасы',receivedNow:'Қазір алынғаны',receivedNowHint:'Қайтарылған бөлігін енгізіңіз: балансқа түседі, қалғаны қарыз болып қалады.',loanPartialHint:'Қайтарылған бөлігін ғана енгізіңіз, қалдық автоматты түрде есептеледі.',partialHint:'Ішінара төлемді енгізуге болады.',loanAmountHint:'Қарыздың бастапқы сомасын көрсетіңіз. Алынған ақшаны төменде енгізіңіз; кейінгі қайтарымдарды бөлек тіркеңіз.',dealAmountHint:'Шарттың бастапқы сомасы. Ішінара төлемдерді бөлек енгізіңіз.',belowPaid:'Жалпы сома алынған сомадан аз бола алмайды. Алдымен төлемді болдырмаңыз.'});
  Object.assign(en,{dealType:'Record type',businessDeal:'Business deal',personalLoan:'Personal loan repayment',loanPayment:'Loan repayment',loanAdded:'Added to balance: ',loanTotal:'Original loan total',receivedNow:'Received now',receivedNowHint:'Enter a repayment already received: it will enter the balance and leave the rest outstanding.',loanPartialHint:'Enter only the amount received, for example 50,000 of 75,000; the remaining 25,000 is calculated automatically.',partialHint:'You can record a partial payment.',loanAmountHint:'Enter the original loan total. Enter money already received below; record later repayments separately. The remainder is calculated automatically.',dealAmountHint:'Original contract amount. Record partial payments separately.',belowPaid:'The total cannot be less than the amount already received. Undo the payment first if needed.'});
  Object.assign(ru,{notInBalance:'не входит в баланс',noScheduledDeals:'В этом месяце нет неоплаченных коммерческих сделок с плановой датой оплаты.'});
  Object.assign(kz,{notInBalance:'нақты қалдыққа кірмейді',noScheduledDeals:'Бұл айда жоспарланған төлем күні бар төленбеген коммерциялық мәмілелер жоқ.'});
  Object.assign(en,{notInBalance:'not in balance',noScheduledDeals:'No unpaid commercial deals have a planned payment date this month.'});
  function tx(key) { return (window.currentLang === 'kz' ? kz : window.currentLang === 'en' ? en : ru)[key] || ru[key] || key; }
  function esc(v) { return String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
  function read() { try { const d=JSON.parse(localStorage.getItem(KEY)||'[]'); return Array.isArray(d)?d:[]; } catch (_) { return []; } }
  function write(rows) { localStorage.setItem(KEY, JSON.stringify(rows)); }
  function deal(id) { return read().find(x => x.id === id); }
  function id() { return 'deal-' + Date.now() + '-' + Math.random().toString(36).slice(2,7); }
  function n(v) { return Math.max(0, Number(v) || 0); }
  function fixedCost(d) { return n(d.cost) + n(d.labour) + n(d.other); }
  // Contract amount includes VAT. All percentage deductions use the amount left after VAT.
  function revenueWithoutVat(d) { return Math.max(0, n(d.amount) - vat(d)); }
  function deductions(d) { if(d.kind==='loan')return []; return [
    { label:tx('tax'), amount:tax(d), category:'taxes' },
    { label:tx('vat'), amount:vat(d), category:'taxes' },
    { label:tx('commission'), amount:commission(d), category:'other_exp' },
    { label:tx('cost'), amount:n(d.cost), category:'other_exp' },
    { label:tx('labour'), amount:n(d.labour), category:'other_exp' },
    { label:tx('other'), amount:n(d.other), category:'other_exp' }
  ].filter(row => row.amount > 0); }
  function vat(d) { const rate=n(d.vatRate); return rate ? n(d.amount) * rate / (100 + rate) : 0; }
  function tax(d) { return revenueWithoutVat(d) * n(d.taxRate) / 100; }
  function commission(d) { return revenueWithoutVat(d) * n(d.commissionRate) / 100; }
  function net(d) { return d.kind==='loan' ? n(d.amount) : revenueWithoutVat(d) - tax(d) - commission(d) - fixedCost(d); }
  function paid(d) { return (d.payments || []).reduce((s,p) => s + n(p.amount), 0); }
  function remaining(d) { return Math.max(0, n(d.amount) - paid(d)); }
  function status(d) { return paid(d) >= n(d.amount) && n(d.amount) > 0 ? 'paid' : d.status === 'paid' ? 'waiting' : d.status || 'lead'; }
  function statusLabel(s) { return ({lead:tx('lead'),awaiting:tx('awaiting'),work:tx('work'),invoice:tx('invoice'),waiting:tx('waiting'),paid:tx('paid'),cancelled:tx('cancelled')})[s] || tx('lead'); }
  function dateLabel(v) { if (!v) return ''; try { return new Date(v+'T00:00:00').toLocaleDateString(window.tiinLocale ? window.tiinLocale() : 'ru-RU',{day:'numeric',month:'short'}); } catch (_) { return v; } }
  function scoped(rows) { return currentWallet === 'all' ? rows : rows.filter(d => (d.wallet || 'personal') === currentWallet); }
  function metrics(rows) {
    const valid = rows.filter(d => status(d) !== 'cancelled');
    const open = valid.filter(d => status(d) !== 'paid');
    const due = open.filter(d => ['invoice','waiting'].includes(status(d)));
    const got = valid.reduce((s,d) => s + paid(d), 0);
    return { open, revenue:open.reduce((s,d)=>s+remaining(d),0), profit:open.filter(d=>d.kind!=='loan').reduce((s,d)=>s+Math.max(0, net(d) * (remaining(d)/Math.max(1,n(d.amount)))),0), due:due.reduce((s,d)=>s+remaining(d),0), got };
  }
  // Only the net amount still to be credited can become factual income.
  // A loan repayment returns principal and is not earned income.
  function expectedDeals(year, month, wallet) {
    return read().filter(d => {
      if (d.kind === 'loan' || status(d) === 'cancelled' || status(d) === 'paid') return false;
      if (wallet !== 'all' && (d.wallet || 'personal') !== wallet) return false;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d.plannedDate || '')) return false;
      const date = new Date(d.plannedDate + 'T00:00:00');
      return date.getFullYear() === year && date.getMonth() === month;
    });
  }
  function expectedNet(d) {
    return Math.max(0, net(d) * remaining(d) / Math.max(1, n(d.amount)));
  }
  window.TIINExpectedDealIncome = function(year, month, wallet) {
    return expectedDeals(year, month, wallet).reduce((total, d) => total + expectedNet(d), 0);
  };
  window.openTIINExpectedDeals = function() {
    const rows = expectedDeals(currentYear, currentMonth, currentWallet);
    const month = t('months_arr')[currentMonth] + ' ' + currentYear;
    document.getElementById('modal').innerHTML = '<div class="tiin-sheet"><div class="tiin-sheet-handle"></div><h2>'+tx('forecastProfit')+'</h2><p class="planning-modal-description">'+esc(month)+' · '+tx('notInBalance')+'</p>'+
      (rows.length ? '<div class="deal-payments">'+rows.map(d => '<div class="tiin-expected-row"><span><b>'+esc(d.title)+'</b><small>'+esc(dateLabel(d.plannedDate))+' · '+tx('remaining')+': '+fmt(remaining(d))+'</small></span><strong>'+fmt(expectedNet(d))+'</strong></div>').join('')+'</div>' : '<p class="planning-modal-description">'+tx('noScheduledDeals')+'</p>')+
      '<button class="btn btn-gold" style="width:100%;margin-top:16px" onclick="closeModal();openDeals()">'+tx('title')+' →</button></div>';
    document.getElementById('modalOverlay').classList.add('open');
  };
  function ensure() {
    const templates = document.getElementById('templatesScroll');
    if (templates && !document.getElementById('dealsAccess')) {
      const b=document.createElement('button'); b.type='button'; b.id='dealsAccess'; b.className='template-chip planning-access deals-access'; b.innerHTML='🤝 <span>'+tx('title')+'</span>'; b.onclick=window.openDeals; templates.appendChild(b);
    }
    const container=document.querySelector('.container');
    if (container && !document.getElementById('tab-deals')) { const panel=document.createElement('div'); panel.id='tab-deals'; panel.className='tab-content'; container.appendChild(panel); }
  }
  function hero() {
    const data=metrics(scoped(read()));
    return '<section class="deals-forecast card"><div class="deals-forecast-head"><div><div class="planning-eyebrow">'+tx('forecast')+'</div><h3>💼 '+tx('title')+'</h3></div><button class="planning-add small" onclick="openDeals()">'+tx('all')+'</button></div><div class="deals-metrics"><div><small>'+tx('forecastRevenue')+'</small><b>'+fmt(data.revenue)+'</b></div><div><small>'+tx('forecastProfit')+'</small><b class="income">'+fmt(data.profit)+'</b></div><div><small>'+tx('due')+'</small><b class="gold">'+fmt(data.due)+'</b></div></div></section>';
  }
  function render() {
    ensure(); const host=document.getElementById('tab-deals'); if (!host) return;
    const all=scoped(read()); const m=metrics(all);
    const rows=all.filter(d => view==='all' || (view==='active' ? !['paid','cancelled'].includes(status(d)) : status(d)===view));
    host.innerHTML='<section class="planning-screen deals-screen"><div class="planning-header"><div><div class="planning-eyebrow">'+tx('forecast')+'</div><h2>🤝 '+tx('title')+'</h2></div><button class="planning-add" onclick="openDealModal()">＋ '+tx('add').replace('Новая ','')+'</button></div>'+summary(m)+'<div class="planning-filters">'+[['active',tx('active')],['waiting',tx('waiting')],['invoice',tx('invoice')],['paid',tx('paid')],['all',tx('all')]].map(x=>'<button class="'+(view===x[0]?'active':'')+'" onclick="setDealView(\''+x[0]+'\')">'+x[1]+'</button>').join('')+'</div>'+(rows.length?'<div class="deals-list">'+rows.map(card).join('')+'</div>':'<div class="planning-empty"><div class="planning-empty-icon">🤝</div><h3>'+tx('noDeals')+'</h3><p>'+tx('noDealsHint')+'</p><button class="btn btn-gold" onclick="openDealModal()">＋ '+tx('add')+'</button></div>')+'</section>';
  }
  function summary(m) { return '<div class="deals-summary"><div><small>'+tx('forecastRevenue')+'</small><b>'+fmt(m.revenue)+'</b></div><div><small>'+tx('forecastProfit')+'</small><b class="income">'+fmt(m.profit)+'</b></div><div><small>'+tx('due')+'</small><b class="gold">'+fmt(m.due)+'</b></div><div><small>'+tx('received')+'</small><b class="income">'+fmt(m.got)+'</b></div></div>'; }
  function card(d) { const st=status(d), full=n(d.amount), got=paid(d), pct=full?Math.min(100,Math.round(got/full*100)):0; return '<article class="deal-card"><div class="deal-card-top"><div><span class="deal-status '+st+'">'+esc(statusLabel(st))+'</span><h3 onclick="openDealModal(\''+d.id+'\')">'+esc(d.title)+'</h3><p>'+esc(d.client||'')+(d.plannedDate?' · '+dateLabel(d.plannedDate):'')+'</p></div><button class="planning-menu" onclick="openDealActions(\''+d.id+'\')">⋮</button></div><div class="deal-progress"><span style="width:'+pct+'%"></span></div><div class="deal-money"><div><small>'+tx('amount')+'</small><b>'+fmt(full)+'</b></div><div><small>'+tx('paidTotal')+'</small><b class="income">'+fmt(got)+'</b></div><div><small>'+(d.kind==='loan'?tx('remaining'):tx('net'))+'</small><b class="gold">'+fmt(d.kind==='loan'?remaining(d):net(d))+'</b></div></div><div class="deal-card-foot"><span>'+tx('remaining')+': <b>'+fmt(remaining(d))+'</b></span>'+(st!=='cancelled'?(st!=='paid'?'<button class="planning-add small" onclick="openDealPaymentModal(\''+d.id+'\')">＋ '+(d.kind==='loan'?tx('loanPayment'):tx('payment'))+'</button>':'<button class="planning-add small" onclick="openDealPayments(\''+d.id+'\')">'+tx('paidTotal')+'</button>'):'')+'</div></article>'; }
  function field(label,id,value,opts) { return '<div class="form-group"><label>'+label+'</label><input '+(opts||'')+' class="form-input" id="'+id+'" value="'+esc(value ?? '')+'"></div>'; }
  window.openDealModal=function(dealId) { const d=dealId?deal(dealId):null; const x=d||{title:'',client:'',amount:'',plannedDate:'',status:'lead',wallet:currentWallet==='business'?'business':'personal',taxRate:0,vatRate:16,commissionRate:0,cost:0,labour:0,other:0,comment:''}; document.getElementById('modal').innerHTML='<h3>'+ (d?tx('edit'):tx('add')) +'</h3>'+field(tx('dealName'),'dealTitle',x.title,'placeholder="'+tx('example')+'"')+field(tx('client'),'dealClient',x.client)+'<div class="form-group"><label>'+tx('dealType')+'</label><select class="form-input" id="dealKind" onchange="dealPreview()"><option value="business" '+(x.kind!=='loan'?'selected':'')+'>'+tx('businessDeal')+'</option><option value="loan" '+(x.kind==='loan'?'selected':'')+'>'+tx('personalLoan')+'</option></select></div>'+field(tx('amount'),'dealAmount',x.amount,'type="number" min="0" inputmode="decimal" oninput="dealPreview()"')+'<p class="planning-modal-description" id="dealAmountHint"></p><div id="dealLoanReceipt">'+field(tx('receivedNow'),'dealReceivedNow','','type="number" min="0" inputmode="decimal" oninput="dealPreview()"')+'<p class="planning-modal-description">'+tx('receivedNowHint')+'</p></div><div class="planning-dual deal-date-status">'+field(tx('date'),'dealDate',x.plannedDate,'type="date"')+'<div class="form-group"><label>'+tx('status')+'</label><select class="form-input" id="dealStatus">'+['lead','awaiting','work','invoice','waiting','cancelled'].map(s=>'<option value="'+s+'" '+(x.status===s?'selected':'')+'>'+statusLabel(s)+'</option>').join('')+'</select></div></div><div class="form-group"><label>'+tx('wallet')+'</label><div class="chips" id="dealWallet">'+chip('personal','👤 '+tx('personal'),x.wallet!=='business')+chip('business','💼 '+tx('business'),x.wallet==='business')+'</div></div><div class="deal-economics"><div class="deal-economics-title">'+tx('economics')+'</div><div class="planning-dual">'+field(tx('tax')+' (%)','dealTaxRate',x.taxRate,'type="number" min="0" step="0.1" inputmode="decimal" oninput="dealPreview()"')+field(tx('vat')+' (%)','dealVatRate',x.vatRate ?? 16,'type="number" min="0" step="0.1" inputmode="decimal" oninput="dealPreview()"')+field(tx('commission')+' (%)','dealCommissionRate',x.commissionRate,'type="number" min="0" step="0.1" inputmode="decimal" oninput="dealPreview()"')+field(tx('cost'),'dealCost',x.cost,'type="number" min="0" inputmode="decimal" oninput="dealPreview()"')+field(tx('labour'),'dealLabour',x.labour,'type="number" min="0" inputmode="decimal" oninput="dealPreview()"')+field(tx('other'),'dealOther',x.other,'type="number" min="0" inputmode="decimal" oninput="dealPreview()"')+'</div></div><div class="deal-live-profit" id="dealPreview"></div>'+field(tx('comment'),'dealComment',x.comment,'placeholder="'+tx('optional')+'"')+'<button class="btn btn-gold" style="width:100%;margin-top:8px" onclick="saveDeal('+(d?'\''+d.id+'\'':'null')+')">'+tx('save')+'</button>'; document.getElementById('modalOverlay').classList.add('open'); document.getElementById('dealAmount').dataset.received=paid(x); dealPreview(); };
  function chip(i,l,s){ return '<button type="button" class="chip '+(s?'selected':'')+'" data-id="'+i+'" onclick="selectChip(this)">'+l+'</button>'; }
  window.dealPreview=function(){ const x={kind:document.getElementById('dealKind')?.value,amount:n(document.getElementById('dealAmount')?.value),taxRate:n(document.getElementById('dealTaxRate')?.value),vatRate:n(document.getElementById('dealVatRate')?.value),commissionRate:n(document.getElementById('dealCommissionRate')?.value),cost:n(document.getElementById('dealCost')?.value),labour:n(document.getElementById('dealLabour')?.value),other:n(document.getElementById('dealOther')?.value)}; const e=document.getElementById('dealPreview'); const economics=document.querySelector('.deal-economics'); const amountLabel=document.getElementById('dealAmount')?.parentElement?.querySelector('label');if(amountLabel)amountLabel.textContent=x.kind==='loan'?tx('loanTotal'):tx('amount'); const loanReceipt=document.getElementById('dealLoanReceipt');if(loanReceipt)loanReceipt.style.display=x.kind==='loan'?'':'none'; if(economics)economics.style.display=x.kind==='loan'?'none':''; const hint=document.getElementById('dealAmountHint');if(hint)hint.textContent=x.kind==='loan'?tx('loanAmountHint'):tx('dealAmountHint'); if(e)e.innerHTML=x.kind==='loan'?tx('remaining')+': <b>'+fmt(Math.max(0,x.amount-n(document.getElementById('dealReceivedNow')?.value)-n(document.getElementById('dealAmount')?.dataset.received)))+'</b>':tx('net')+': <b>'+fmt(net(x))+'</b><span> · '+tx('margin')+' '+(x.amount?Math.round(net(x)/x.amount*100):0)+'%</span>'; };
  window.saveDeal=function(dealId){ const title=document.getElementById('dealTitle').value.trim(), amount=n(document.getElementById('dealAmount').value); if(!title||!amount){toast(tx('invalid'));return;} const rows=read(); let d=dealId?rows.find(x=>x.id===dealId):null; if(d&&amount+0.01<paid(d)){toast(tx('belowPaid'));return;} const receivedNow=document.getElementById('dealKind').value==='loan'?n(document.getElementById('dealReceivedNow').value):0;if(receivedNow>amount-(d?paid(d):0)+.01){toast(tx('overpay'));return;} const attrs={kind:document.getElementById('dealKind').value,title,client:document.getElementById('dealClient').value.trim(),amount,plannedDate:document.getElementById('dealDate').value||null,status:document.getElementById('dealStatus').value,wallet:document.querySelector('#dealWallet .chip.selected')?.dataset.id||'personal',taxRate:n(document.getElementById('dealTaxRate').value),vatRate:n(document.getElementById('dealVatRate').value),commissionRate:n(document.getElementById('dealCommissionRate').value),cost:n(document.getElementById('dealCost').value),labour:n(document.getElementById('dealLabour').value),other:n(document.getElementById('dealOther').value),comment:document.getElementById('dealComment').value.trim(),updatedAt:new Date().toISOString()}; if(d)Object.assign(d,attrs);else{d={id:id(),payments:[],createdAt:attrs.updatedAt,...attrs};rows.unshift(d);} write(rows);if(receivedNow)recordDealPayment(d,receivedNow,localDateString());closeModal();window.render(); };
  window.openDealPaymentModal=function(dealId){ const d=deal(dealId); if(!d)return; document.getElementById('modal').innerHTML='<h3>'+(d.kind==='loan'?tx('loanPayment'):tx('payment'))+'</h3><p class="planning-modal-description">'+esc(d.title)+' · '+tx('remaining')+': '+fmt(remaining(d))+'</p>'+field(tx('paymentAmount'),'dealPaymentAmount',remaining(d),'type="number" min="0" inputmode="decimal"')+field(tx('paymentDate'),'dealPaymentDate',localDateString(),'type="date"')+'<p class="planning-modal-description">'+(d.kind==='loan'?tx('loanPartialHint'):tx('partialHint'))+'</p><button class="btn btn-gold" style="width:100%" onclick="confirmDealPayment(\''+d.id+'\')">'+tx('pay')+'</button>';document.getElementById('modalOverlay').classList.add('open');};
  function recordDealPayment(d,amount,date){
    const dt=new Date(date+'T00:00:00'), y=dt.getFullYear(),m=dt.getMonth();
    const paymentId=id(), incomeId='deal-net-income-'+paymentId;
    const ratio=amount/Math.max(1,n(d.amount));
    const netReceived=Math.max(0,amount-deductions(d).reduce((s,row)=>s+row.amount*ratio,0));
    const rows=read(), target=rows.find(x=>x.id===d.id);
    if(!target || amount<=0 || amount>remaining(target)+.01)return false;
    const ts=getTxns(y,m);
    ts.push({id:incomeId,type:'income',amount:netReceived,category:d.kind==='loan'?'other_inc':'business',comment:(d.kind==='loan'?tx('loanPayment'):tx('title'))+': '+d.title+(d.kind==='loan'?'':' · '+tx('net')),date,wallet:d.wallet||'personal',tags:['deal'],dealId:d.id,dealNetIncome:true});
    target.payments=target.payments||[];
    target.payments.push({id:paymentId,amount,date,transactionId:incomeId,expenseTransactionIds:[],netTransaction:true});
    if(remaining(target)<.01)target.status='paid';
    target.updatedAt=new Date().toISOString();
    saveTxns(y,m,ts);write(rows);
    return netReceived;
  }
  window.confirmDealPayment=function(dealId){
    const d=deal(dealId), amount=n(document.getElementById('dealPaymentAmount').value), date=document.getElementById('dealPaymentDate').value;
    if(!d||!amount||!date)return;
    if(amount>remaining(d)+.01){toast(tx('overpay'));return;}
    const credited=recordDealPayment(d,amount,date);
    if(credited===false)return;
    closeModal();toast((d.kind==='loan'?tx('loanAdded'):tx('addedNet'))+fmt(credited));window.render();
  };

  // Older versions wrote a gross deal income and several synthetic expenses.
  // Canonicalise only transaction IDs explicitly stored by a deal payment:
  // manual income/expense rows must never be guessed at or altered.
  function reconcileLegacyDealPayments() {
    const deals=read(), months=new Map(); let changed=false;
    const getMonth=(year,month)=>{const key=year+'-'+month;if(!months.has(key))months.set(key,{year,month,rows:getTxns(year,month),changed:false});return months.get(key);};
    deals.forEach(d=>(d.payments||[]).forEach(p=>{
      if(!p.date || !p.transactionId)return;
      const dt=new Date(p.date+'T00:00:00'), bucket=getMonth(dt.getFullYear(),dt.getMonth());
      const income=bucket.rows.find(row=>String(row.id)===String(p.transactionId)); if(!income)return;
      const ratio=n(p.amount)/Math.max(1,n(d.amount));
      const netReceived=Math.max(0,n(p.amount)-deductions(d).reduce((sum,row)=>sum+row.amount*ratio,0));
      const correctComment=(d.kind==='loan'?tx('loanPayment'):tx('title'))+': '+d.title+(d.kind==='loan'?'':' · '+tx('net'));
      // A deal can be edited after its payment was received. Recalculate the
      // linked factual income from the current deal economics on every render,
      // rather than leaving a stale gross/old-net amount in monthly totals.
      if(income.type!=='income' || Math.abs(n(income.amount)-netReceived)>.01 || income.category!==(d.kind==='loan'?'other_inc':'business') || income.dealNetIncome!==true || income.dealId!==d.id || income.comment!==correctComment){
        income.type='income'; income.amount=netReceived; income.category=d.kind==='loan'?'other_inc':'business'; income.comment=correctComment; income.dealNetIncome=true; income.dealId=d.id; bucket.changed=true; changed=true;
      }
      const legacyIds=new Set((p.expenseTransactionIds||[]).map(String));
      if(legacyIds.size) { bucket.rows=bucket.rows.filter(row=>!legacyIds.has(String(row.id))); bucket.changed=true; changed=true; }
      // Some pre-net-profit records retained synthetic deductions by dealId
      // without retaining their IDs in the payment. Keep them for audit, but
      // exclude them from totals so deal tax/VAT/cost is never double-counted.
      bucket.rows.forEach(row=>{
        if(row.type==='expense' && String(row.dealId||'')===String(d.id) && row.dealAccountingOnly!==true){
          row.dealAccountingOnly=true; bucket.changed=true; changed=true;
        }
      });
      if(legacyIds.size || !p.netTransaction) { p.expenseTransactionIds=[]; p.netTransaction=true; changed=true; }
    }));
    months.forEach(bucket=>{if(bucket.changed)saveTxns(bucket.year,bucket.month,bucket.rows);});
    if(changed){write(deals);window.TIINCloud?.scheduleSync?.();}
    return changed;
  }
  window.openDealPayments=function(dealId){const d=deal(dealId);if(!d)return;const rows=(d.payments||[]).map(p=>'<div class="deal-payment-row"><span>'+dateLabel(p.date)+'</span><b>'+fmt(p.amount)+'</b><button class="btn btn-danger btn-sm" onclick="revertDealPayment(\''+d.id+'\',\''+p.id+'\')">'+tx('revert')+'</button></div>').join('');document.getElementById('modal').innerHTML='<h3>'+tx('paidTotal')+'</h3><p class="planning-modal-description">'+esc(d.title)+'</p><div class="deal-payments">'+rows+'</div><button class="tx-action-cancel" onclick="closeModal()">'+tx('cancel')+'</button>';document.getElementById('modalOverlay').classList.add('open');};
  window.revertDealPayment=function(dealId,paymentId){const rows=read(),d=rows.find(x=>x.id===dealId),p=d?.payments?.find(x=>x.id===paymentId);if(!d||!p)return;if(!confirm(tx('removeIncome')+'?'))return;const dt=new Date(p.date+'T00:00:00'), linked=[p.transactionId,...(p.expenseTransactionIds||[])];saveTxns(dt.getFullYear(),dt.getMonth(),getTxns(dt.getFullYear(),dt.getMonth()).filter(x=>!linked.map(String).includes(String(x.id))));d.payments=d.payments.filter(x=>x.id!==paymentId);if(d.status==='paid')d.status='waiting';d.updatedAt=new Date().toISOString();write(rows);closeModal();render();};
  window.setDealView=function(v){view=v;render();};
  window.openDeals=function(){ensure();switchTab('deals');};
  window.openDealActions=function(dealId){const d=deal(dealId);if(!d)return;document.getElementById('modal').innerHTML='<div class="tx-action-sheet"><div class="tx-action-title">'+esc(d.title)+'</div><button class="btn btn-gold" onclick="openDealModal(\''+d.id+'\')">'+tx('edit')+'</button><button class="btn btn-danger" style="width:100%;margin-top:10px" onclick="deleteDeal(\''+d.id+'\')">'+tx('delete')+'</button><button class="tx-action-cancel" onclick="closeModal()">'+tx('cancel')+'</button></div>';document.getElementById('modalOverlay').classList.add('open');};
  window.deleteDeal=function(dealId){const d=deal(dealId);if(!d||!confirm(tx('confirmDelete')))return;if((d.payments||[]).length){toast(tx('cancelLinked'));return;}write(read().filter(x=>x.id!==dealId));closeModal();render();};
  const oldRenderTab=window.renderTab; window.renderTab=function(){if(currentTab==='deals')render();else oldRenderTab();};
  const oldTransactions=window.renderTransactions; window.renderTransactions=function(){oldTransactions();if(currentTab==='transactions'){const host=document.getElementById('tab-transactions');if(host&&!host.querySelector('.deals-forecast'))host.insertAdjacentHTML('afterbegin',hero());}};
  const oldTemplates=window.renderTemplates; window.renderTemplates=function(){oldTemplates();ensure();};
  // Sync can hydrate local storage after this script has loaded. Wrapping
  // render makes the correction run again once those records arrive, and it
  // remains a no-op when every linked payment is already correct.
  const baseRenderForDealReconciliation=window.render;
  window.render=function renderWithDealReconciliation(){
    reconcileLegacyDealPayments();
    return baseRenderForDealReconciliation.apply(this,arguments);
  };
  const legacyDealsReconciled=reconcileLegacyDealPayments();
  ensure();
  if(typeof window.render==='function')window.render();
}());
