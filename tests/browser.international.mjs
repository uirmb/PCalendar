/** 我在当前构建复测国家日历、现代 IANA 和显示联动；先 npm run build。 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, writeFile } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(process.env.SMOKE_DIST || resolve(project, 'dist'));
const moduleURL = (name) => name.startsWith('/') ? pathToFileURL(name).href : name;
const { chromium } = await import(moduleURL(process.env.PLAYWRIGHT_MODULE || 'playwright'));
const argsModule = process.env.CHROMIUM_ARGS_MODULE ? await import(moduleURL(process.env.CHROMIUM_ARGS_MODULE)) : null;
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css', '.svg': 'image/svg+xml', '.gif': 'image/gif', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    let file = resolve(dist, '.' + decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname));
    if (file !== dist && !file.startsWith(dist + sep)) { response.writeHead(403).end(); return; }
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' }); response.end(await readFile(file));
  } catch { response.writeHead(404).end('Not found'); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;
const results = [], errors = [], failedRequests = [];
let browser, page, browserVersion;
const filter = process.env.SMOKE_FILTER ? new RegExp(process.env.SMOKE_FILTER) : null;
async function check(name, run) {
  if (filter && !filter.test(name)) return;
  const start = performance.now();
  try { await run(); results.push({ name, passed: true, milliseconds: Math.round(performance.now() - start) }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, milliseconds: Math.round(performance.now() - start), error: error.message }); console.error(`FAIL ${name}: ${error.message}`); }
}
function observe(target) {
  target.on('pageerror', (error) => errors.push(error.message));
  target.on('requestfailed', (request) => failedRequests.push(request.failure()?.errorText));
  target.on('response', (response) => { if (response.status() >= 400) failedRequests.push(`${response.status()} ${new URL(response.url()).pathname}`); });
}
async function settle() {
  await page.waitForFunction(() => !document.querySelector('#feature-view')?.hasAttribute('aria-busy'));
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('.feature-feedback--error:not([hidden])').count(), 0);
}
async function navigate(id) {
  const toggle = page.locator('[data-action="toggle-menu"]');
  if (await toggle.isVisible() && !await page.locator('#app-sidebar').evaluate((node) => node.classList.contains('is-open'))) await toggle.click();
  await page.locator(`.nav-item[data-page="${id}"]`).click(); await settle();
}
async function settings(run) {
  await page.locator('[data-action="open-settings"]').click(); await run();
  await page.locator('#settings-form button[type="submit"]').click();
  await page.locator('#settings-dialog').waitFor({ state: 'hidden' }); await settle();
}
async function advanced() {
  if (!await page.locator('#settings-advanced').evaluate((node) => node.open)) await page.locator('#settings-advanced > summary').click();
}
async function country(code) {
  const continents = { CN: '亚洲', US: '北美洲', GB: '欧洲' };
  await settings(async () => { await page.locator('#calendar-continent').selectOption(continents[code]); await page.locator('#calendar-country').selectOption(code); });
}
async function fixedZone(offset) {
  await settings(async () => { await advanced(); await page.locator('#timezone-mode').selectOption('fixed'); await page.locator('#location-timezone').fill(String(offset)); });
}
async function jump(year, month, day) {
  await navigate(1); await page.locator('[data-action="open-date"]').click();
  await page.locator('#jump-year').fill(String(year)); await page.locator('#jump-month').selectOption(String(month)); await page.locator('#jump-day').fill(String(day));
  await page.locator('#date-form button[type="submit"]').click(); await page.locator('#date-dialog').waitFor({ state: 'hidden' });
}
const displayedClock = async () => (await page.locator('#local-clock').textContent()).slice(-8);
const selected = () => page.locator('.calendar-day.is-selected').getAttribute('data-calendar-date');
const outputDates = (text) => [...text.matchAll(/\b(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/g)].map((match) => `${match[1]}T${match[2]}Z`);
async function action(name, arg) {
  const query = `#feature-view [data-action="${name}"]${arg === undefined ? '' : `[data-arg="${arg}"]`}`;
  await page.locator(query).filter({ visible: true }).first().click(); await settle();
}

const noChineseCalendar = async (locator) => assert.doesNotMatch(await locator.innerText(), /农历|干支|生肖|黄帝纪年|回历|春节纪年|立春纪年|二十四节气|本月节气|下一节气|腊月|正月|闰十一月/);
const savedSettings = () => page.evaluate(() => JSON.parse(localStorage.getItem('sxwnl-modern.settings.v1')));
async function copiedDay() {
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('[data-action="copy-day"]').click();
  return page.evaluate(() => navigator.clipboard.readText());
}

try {
  browser = await chromium.launch({ headless: true, args: argsModule?.default?.args || ['--no-sandbox', '--disable-dev-shm-usage'], ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  browserVersion = browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'Asia/Tokyo' });
  page = await context.newPage(); observe(page); page.setDefaultTimeout(12000);
  await page.clock.setFixedTime(new Date('2026-07-04T02:30:00Z'));
  await page.goto(baseURL, { waitUntil: 'networkidle' });

  await check('CN initial profile and selected US New York link the clock, coordinates, calendar date and regional display preferences', async () => {
    assert.equal(await page.locator('[data-action="open-settings"]').count(), 1);
    assert.match(await page.locator('#local-clock').textContent(), /2026\.07\.04 10:30:00/);
    assert.match(await page.locator('#calendar-view').innerText(), /农历/);
    await country('US');
    assert.match(await page.locator('#local-clock').textContent(), /07\/03\/2026 下午 10:30:00/);
    assert.equal(await page.locator('#location-timezone-label').textContent(), 'UTC−04:00');
    assert.equal(await selected(), '2026,7,3');
    assert.equal(await page.locator('.weekday-headings [role="columnheader"]').first().innerText(), '星期日');
    assert.match(await page.locator('.day-detail').innerText(), /独立日.*补休/s);
    await noChineseCalendar(page.locator('#calendar-view'));
    assert.equal(await page.locator('.nav-item[data-page="11"]').count(), 0);
    assert.equal(await page.locator('.nav-item[data-page="2"]').innerText(), '公历年历');
    await page.locator('[data-action="open-settings"]').click();
    assert.equal(await page.locator('#calendar-country').inputValue(), 'US');
    assert.equal(await page.locator('#timezone-id').inputValue(), 'America/New_York');
    assert.match(await page.locator('#calendar-city option:checked').textContent(), /纽约/);
    assert.equal(Number(await page.locator('#location-longitude').inputValue()), -(74 + 23 / 3600));
    assert.equal(Number(await page.locator('#location-latitude').inputValue()), 40 + 42 / 60 + 51 / 3600);
    await page.locator('#settings-dialog [data-action="close-dialog"]').first().click();
  });
  await check('US actual and observed holidays, Thanksgiving, Christmas and cultural Halloween are classified visibly', async () => {
    await country('US');
    for (const [year, month, day, pattern] of [[2026, 7, 4, /独立日/], [2026, 11, 26, /感恩节/], [2026, 12, 25, /圣诞节/], [2027, 12, 31, /元旦.*补休/s]]) {
      await jump(year, month, day);
      assert.match(await page.locator('.day-detail').innerText(), pattern);
    }
    await jump(2026, 12, 31); assert.doesNotMatch(await page.locator('.day-detail').innerText(), /元旦.*补休/s);
    await jump(2026, 10, 31);
    const detail = await page.locator('.day-detail').innerText();
    assert.match(detail, /万圣节/); assert.match(detail, /文化纪念日/); assert.doesNotMatch(detail, /联邦假日|联邦补休/);
  });
  await check('US hover, accessible day labels and copied date have no Chinese calendar residual', async () => {
    await country('US'); await jump(2026, 12, 25);
    assert.match(await page.locator('.sun-moon-card .card-caption').innerText(), /北美东部时间/);
    assert.doesNotMatch(await page.locator('.sun-moon-card .card-caption').innerText(), /America\/New_York/);
    const day = page.locator('.calendar-day[data-calendar-date="2026,12,25"]');
    await page.mouse.move(0, 0); await day.hover();
    await page.locator('#day-hover-preview').waitFor({ state: 'visible' });
    await noChineseCalendar(page.locator('#day-hover-preview'));
    assert.match(await page.locator('#day-hover-preview').innerText(), /圣诞节/);
    assert.doesNotMatch(await day.getAttribute('aria-label'), /农历|干支|黄帝|回历/);
    const copied = await copiedDay();
    assert.match(copied, /圣诞节/); assert.doesNotMatch(copied, /农历|干支|黄帝|回历|立春纪年/);
  });
  await check('switching CN restores lunar detail and official 2026 rest-work labels; switching US clears them', async () => {
    await country('CN');
    assert.equal(await page.locator('.weekday-headings [role="columnheader"]').first().innerText(), '星期一');
    assert.match(await page.locator('#local-clock').textContent(), /2026\.07\.04 10:30:00/);
    assert.equal(await page.locator('#location-timezone-label').textContent(), 'UTC+08:00');
    assert.equal(await selected(), '2026,12,25', 'manual date survives region changes');
    await jump(2026, 2, 17); assert.match(await page.locator('.day-detail').innerText(), /春节/);
    assert.match(await page.locator('#calendar-view').innerText(), /农历/);
    assert.match(await copiedDay(), /农历/);
    await jump(2026, 2, 14); assert.match(await page.locator('.day-detail').innerText(), /调休上班/);
    await jump(2026, 10, 8); assert.doesNotMatch(await page.locator('.day-detail').innerText(), /国庆(?:节)?假日|官方放假/);
    await country('US'); await noChineseCalendar(page.locator('#calendar-view'));
    assert.equal(await selected(), '2026,10,8');
    await country('CN'); assert.match(await page.locator('#calendar-view').innerText(), /农历/);
    assert.equal(await page.locator('.nav-item[data-page="2"]').count(), 1);
  });
  await check('a country without holiday data states coverage explicitly and retains local astronomical data', async () => {
    await country('GB'); await jump(2026, 12, 25);
    await noChineseCalendar(page.locator('#calendar-view'));
    assert.match(await page.locator('#calendar-view').innerText(), /节日.*未覆盖|节日.*未配置|节日.*待.*补充/);
    assert.match(await page.locator('.sun-moon-card').innerText(), /日出|日落/);
    assert.ok(await page.locator('.event-item').count() >= 4);
    assert.doesNotMatch(await page.locator('.day-detail').innerText(), /联邦假日|官方放假/);
  });
  await check('modern New York DST changes on March 8 and November 1 and persisted settings remain coherent', async () => {
    await country('US'); await navigate(1); await page.locator('[data-action="today"]').click();
    for (const [instant, clock, offset] of [
      ['2026-03-08T06:59:59Z', '上午 01:59:59', 'UTC−05:00'], ['2026-03-08T07:00:00Z', '上午 03:00:00', 'UTC−04:00'],
      ['2026-11-01T05:59:59Z', '上午 01:59:59', 'UTC−04:00'], ['2026-11-01T06:00:00Z', '上午 01:00:00', 'UTC−05:00'],
    ]) {
      await page.clock.setFixedTime(new Date(instant));
      await page.waitForFunction(({ clock, offset }) => document.querySelector('#local-clock').textContent.endsWith(clock) && document.querySelector('#location-timezone-label').textContent === offset, { clock, offset });
    }
    await page.reload({ waitUntil: 'networkidle' });
    const saved = await savedSettings();
    assert.equal(saved.countryCode, 'US'); assert.equal(saved.timezoneId, 'America/New_York'); assert.equal(saved.locationMode, 'city');
    assert.match(await page.locator('#local-clock').innerText(), /上午 01:00:00/);
  });
  await check('CN page-eight action is restored after international lunar-only mode and manual year is retained', async () => {
    await country('CN'); await navigate(8);
    await page.locator('#Cp8_y').fill('2033'); await page.locator('#Cp8_n').fill('3'); await action('houCalc');
    const original = await page.locator('#Cp8_out').innerText(); assert.ok(original.length > 50);
    await country('US');
    assert.equal(await page.locator('#Cp8_y').inputValue(), '2033');
    assert.equal(await page.locator('#feature-view [data-action="qiCalc"]').isVisible(), false);
    assert.equal(await page.locator('#feature-view [data-action="houCalc"]').isVisible(), false);
    assert.match(await page.locator('#feature-view').innerText(), /新月|月相/);
    assert.doesNotMatch(await page.locator('#feature-view').innerText(), /二十四节气|七十二候|定气|定候/);
    await action('suoCalc', 180); const international = await page.locator('#Cp8_out').innerText();
    assert.notEqual(international, original);
    await country('CN'); assert.equal(await page.locator('#Cp8_out').innerText(), original);
    assert.equal(await page.locator('#Cp8_y').inputValue(), '2033');
  });
  await check('theme and explicit display preferences do not recompute professional results', async () => {
    await country('CN'); await navigate(8); await page.locator('#Cp8_n').fill('3'); await action('qiCalc');
    const before = await page.locator('#Cp8_out').innerHTML();
    await page.evaluate(() => { window.__mutations = 0; window.__observer = new MutationObserver((records) => { window.__mutations += records.length; }); window.__observer.observe(document.querySelector('#Cp8_out'), { subtree: true, childList: true, characterData: true }); });
    await settings(async () => {
      await page.locator('#settings-theme').selectOption('dark'); await page.locator('#settings-week-start').selectOption('3'); await page.locator('#settings-clock-format').selectOption('24');
    });
    assert.equal(await page.locator('#Cp8_out').innerHTML(), before);
    assert.equal(await page.evaluate(() => { window.__observer.disconnect(); return window.__mutations; }), 0);
    await country('US');
    const saved = await savedSettings(); assert.equal(saved.weekStart, 3); assert.equal(saved.weekStartMode, 'custom'); assert.equal(saved.clockFormat, '24');
    assert.doesNotMatch(await page.locator('#local-clock').innerText(), /上午|下午/);
  });
  await check('manual historical date and professional input remain selected after switching countries', async () => {
    await country('US'); await jump(1582, 10, 4); await country('CN');
    assert.equal(await selected(), '1582,10,4');
    assert.equal(await page.locator('.calendar-day:not(.is-outside)').count(), 21);
    await navigate(5); await page.locator('#Cd_y').fill('2009'); await page.locator('#Cd_m').fill('7'); await page.locator('#Cd_d').fill('22');
    await page.locator('#Cd_n').fill('1'); await action('pCalc'); await country('US');
    assert.equal(await page.locator('#Cd_y').inputValue(), '2009'); assert.equal(await page.locator('#Cd_m').inputValue(), '7'); assert.equal(await page.locator('#Cd_d').inputValue(), '22');
    assert.ok((await page.locator('#Cd_tab').inputValue()).length > 200);
  });
  await check('legacy region and unknown custom-location migration produce coherent visible country and coordinates', async () => {
    const previous = page;
    for (const [old, code, city, zone] of [
      [{ city: '天安门', province: '北京市', longitude: 116.38333333333334, latitude: 39.9, timezoneMode: 'region', timezoneRegion: '美国东部', timezone: -5 }, 'US', '纽约', 'America/New_York'],
      [{ city: '山顶台站', province: '', longitude: 86.925, latitude: 27.9881, timezoneMode: 'fixed', timezoneRegion: '美国东部', timezone: -5 }, 'ZZ', '山顶台站', null],
    ]) {
      const migratedContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'UTC' });
      await migratedContext.addInitScript((saved) => localStorage.setItem('sxwnl-modern.settings.v1', JSON.stringify(saved)), old);
      page = await migratedContext.newPage(); observe(page); await page.clock.setFixedTime(new Date('2026-07-04T02:30:00Z'));
      await page.goto(baseURL, { waitUntil: 'networkidle' });
      await noChineseCalendar(page.locator('#calendar-view'));
      assert.equal(await page.locator('#location-label').innerText(), city);
      await page.locator('[data-action="open-settings"]').click();
      assert.equal(await page.locator('#calendar-country').inputValue(), code);
      if (zone) {
        assert.equal(await page.locator('#timezone-id').inputValue(), zone);
        assert.equal(Number(await page.locator('#location-longitude').inputValue()), -(74 + 23 / 3600));
      } else {
        assert.equal(await page.locator('#location-mode').inputValue(), 'custom');
        assert.equal(Number(await page.locator('#location-longitude').inputValue()), 86.925);
        assert.equal(Number(await page.locator('#location-latitude').inputValue()), 27.9881);
        assert.equal(await page.locator('#timezone-mode').inputValue(), 'fixed');
        assert.equal(await page.locator('#location-timezone').inputValue(), '-5');
      }
      await page.locator('#settings-dialog [data-action="close-dialog"]').first().click();
    }
    page = previous;
  });
  await check('mobile international settings and calendar fit the viewport and country changes remain usable', async () => {
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'zh-CN', timezoneId: 'UTC' });
    page = await mobile.newPage(); observe(page); await page.clock.setFixedTime(new Date('2026-07-04T02:30:00Z')); await page.goto(baseURL, { waitUntil: 'networkidle' });
    assert.equal(await page.locator('[data-action="open-settings"]').count(), 1);
    await country('CN'); assert.equal(await selected(), '2026,7,4');
    await country('US'); assert.equal(await selected(), '2026,7,3');
    await noChineseCalendar(page.locator('#calendar-view'));
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 2));
    await page.locator('[data-action="open-settings"]').click();
    const bounds = await page.locator('#settings-dialog').boundingBox(); assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= 391);
    await page.locator('#settings-dialog [data-action="close-dialog"]').first().click();
  });
  await check('no uncaught exceptions or failed resources in international interactions', async () => { assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []); });
} finally {
  await browser?.close(); await new Promise((resolve) => server.close(resolve));
}
const report = { timestamp: new Date().toISOString(), version: JSON.parse(await readFile(resolve(project, 'package.json'), 'utf8')).version, browser: 'Chromium', browserVersion, build: 'dist', filter: process.env.SMOKE_FILTER || null, scope: '国际地区、CN/US节日、现代IANA、显示隔离、专业动作恢复、桌面和手机', passed: results.filter((result) => result.passed).length, failed: results.filter((result) => !result.passed).length, results, pageErrors: errors, failedRequests };
await writeFile(resolve(process.env.SMOKE_REPORT || resolve(project, 'docs/browser-international-current.json')), JSON.stringify(report, null, 2) + '\n');
console.log(`International browser regression: ${report.passed} passed, ${report.failed} failed.`);
if (report.failed || results.length === 0) process.exitCode = 1;
