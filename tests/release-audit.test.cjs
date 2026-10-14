const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('daypart artwork uses one verified source and preserves manual selection', () => {
  const css = read('styles/tiin-polish.css');
  const app = read('src/tiin-v2.js');
  const sw = read('service-worker.js');

  assert.equal(css.includes('tiin-balance-day.png'), false, 'legacy PNG day artwork must not be used');
  assert.match(css, /tiin-hero-morning\.jpg/);
  assert.match(css, /tiin-hero-day\.jpg/);
  assert.match(css, /tiin-hero-evening\.jpg/);
  assert.match(app, /preference === 'auto' \? automatic : preference/);
  for (const asset of ['tiin-hero-morning.jpg', 'tiin-hero-day.jpg', 'tiin-hero-evening.jpg']) {
    assert.match(sw, new RegExp(asset.replace('.', '\\.')));
    assert.ok(fs.existsSync(path.join(root, 'assets', asset)), `${asset} must be shipped`);
  }
});

test('payment status is resolved from the paid period, not the open calendar month', () => {
  const app = read('src/tiin-settings.js');
  assert.match(app, /txns\(year, month - 1\)/);
  assert.match(app, /const paidAt=now\(\), y=paidAt\.getFullYear\(\),m=paidAt\.getMonth\(\), key=periodKey\(paidAt\)/);
  assert.match(app, /paymentScheduleId:s\.id,paymentPeriod:key/);
});

test('reports provide card drill-down and selected-period PDF export', () => {
  const report = read('src/tiin-reports.js');
  const app = read('index.html');
  const sw = read('service-worker.js');

  assert.match(report, /openTIINStatement\('month-income'\)/);
  assert.match(report, /openTIINStatement\('month-expense'\)/);
  assert.match(report, /openTIINStatement\('lifetime-balance'\)/);
  assert.match(report, /value=\"1\"/);
  assert.match(report, /value=\"2\"/);
  assert.match(report, /value=\"3\"/);
  assert.match(report, /value=\"all\"/);
  assert.match(report, /value=\"custom\"/);
  assert.match(report, /Where \/ purpose/);
  assert.match(app, /src\/tiin-reports\.js\?v=1/);
  assert.match(sw, /src\/tiin-reports\.js/);
});
