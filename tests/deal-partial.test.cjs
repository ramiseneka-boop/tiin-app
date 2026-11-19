const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const data = new Map();
const fields = new Map();
const localStorage = {
  getItem: key => data.get(key) ?? null,
  setItem: (key, value) => data.set(key, String(value))
};
const document = {
  getElementById: key => fields.get(key) ?? null,
  querySelector: selector => selector === '#dealWallet .chip.selected' ? { dataset: { id: 'personal' } } : null
};
const context = {
  document, localStorage, Date, Math, JSON, Number, String, Array, Set, Map,
  currentWallet: 'all', currentTab: 'deals', currentLang: 'ru',
  fmt: amount => `${Math.round(amount)} ₸`,
  localDateString: () => '2026-11-19',
  getTxns: (year, month) => JSON.parse(data.get(`txns_${year}_${month}`) ?? '[]'),
  saveTxns: (year, month, rows) => data.set(`txns_${year}_${month}`, JSON.stringify(rows)),
  toast: () => {}, closeModal: () => {}, confirm: () => true,
  renderTab: () => {}, renderTransactions: () => {}, renderTemplates: () => {}, render: () => {},
  window: null
};
context.window = context;
vm.runInNewContext(fs.readFileSync('src/tiin-deals.js', 'utf8'), context);
function setForm(amount, receivedNow) {
  Object.entries({dealTitle:'Займ близкому человеку',dealClient:'',dealKind:'loan',dealAmount:amount,
    dealReceivedNow:receivedNow,dealDate:'',dealStatus:'waiting',dealTaxRate:0,dealVatRate:16,
    dealCommissionRate:0,dealCost:0,dealLabour:0,dealOther:0,dealComment:''})
    .forEach(([key,value]) => fields.set(key, {value:String(value)}));
}
function deal() { return JSON.parse(data.get('tiin_deals_v1'))[0]; }
function transactions() { return context.getTxns(2026,10); }

// A previously corrected remaining amount (25k) can be restored to the
// original 75k total while recording the factual 50k repayment once.
setForm(25000,0); context.saveDeal(null);
const id=deal().id;
assert.equal(transactions().length,0);
setForm(75000,50000); context.saveDeal(id);
assert.equal(deal().amount,75000);
assert.equal(deal().payments[0].amount,50000);
assert.equal(transactions().length,1);
assert.equal(transactions()[0].amount,50000);
assert.equal(transactions()[0].category,'other_inc');
assert.equal(deal().amount-deal().payments.reduce((sum,p)=>sum+p.amount,0),25000);

// Editing metadata or the original total must not create another receipt.
setForm(75000,0); context.saveDeal(id);
assert.equal(transactions().length,1);
assert.equal(transactions()[0].amount,50000);

// Another repayment only affects its own factual transaction and remainder.
fields.set('dealPaymentAmount',{value:'10000'});
fields.set('dealPaymentDate',{value:'2026-11-19'});
context.confirmDealPayment(id);
assert.equal(transactions().length,2);
assert.equal(transactions()[1].amount,10000);
assert.equal(deal().amount-deal().payments.reduce((sum,p)=>sum+p.amount,0),15000);

// Prevent changing the total below the sum already received.
setForm(50000,0); context.saveDeal(id);
assert.equal(deal().amount,75000);
assert.equal(transactions().length,2);
console.log('Partial personal-loan repayment accounting passed');
