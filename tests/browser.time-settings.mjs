/** 统一地点/时间联动回归；先 npm run build。环境变量与 browser.smoke.mjs 相同。 */
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
  await page.locator('[data-action="open-settings"]').click();
  if (!await page.locator('#settings-advanced').evaluate((node) => node.open)) await page.locator('#settings-advanced > summary').click();
  await run();
  await page.locator('#settings-form button[type="submit"]').click();
  await page.locator('#settings-dialog').waitFor({ state: 'hidden' }); await settle();
}
async function chinaProfile() {
  await settings(async () => { await page.locator('#calendar-continent').selectOption('亚洲'); await page.locator('#calendar-country').selectOption('CN'); await page.locator('#settings-clock-format').selectOption('24'); });
}
async function fixedZone(offset) {
  await chinaProfile();
  await settings(async () => { await page.locator('#timezone-mode').selectOption('fixed'); await page.locator('#location-timezone').fill(String(offset)); });
}
async function regionalZone(continent, country) {
  await settings(async () => {
    await page.locator('#calendar-continent').selectOption(continent); await page.locator('#calendar-country').selectOption(({ 中国: 'CN', 美国东部: 'US', 英国: 'GB', 澳大利亚东部: 'AU' })[country]);
  });
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

try {
  browser = await chromium.launch({ headless: true, args: argsModule?.default?.args || ['--no-sandbox', '--disable-dev-shm-usage'], ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  browserVersion = browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'America/Los_Angeles' });
  page = await context.newPage(); observe(page); page.setDefaultTimeout(12000);
  await page.clock.setFixedTime(new Date('2026-01-01T10:30:00Z'));
  await page.goto(baseURL, { waitUntil: 'networkidle' }); await chinaProfile();

  await check('one unified entry and Beijing clock independent of the host timezone', async () => {
    assert.equal(await page.locator('[data-action="open-settings"]').count(), 1);
    assert.equal(await page.locator('[data-action="open-clock"],#clock-dialog,.world-clock-widget').count(), 0);
    assert.equal(await displayedClock(), '18:30:00');
    assert.equal(await page.locator('#location-timezone-label').textContent(), 'UTC+08:00');
    assert.equal(await selected(), '2026,1,1');
    await page.locator('[data-action="open-settings"]').click();
    assert.equal(await page.locator('#settings-form #calendar-country').inputValue(), 'CN');
    assert.equal(await page.locator('#timezone-id').inputValue(), 'Asia/Shanghai');
    assert.match(await page.locator('#settings-clock-preview').textContent(), /18:30:00/);
    await page.locator('#settings-dialog [data-action="close-dialog"]').first().click();
  });
  await check('fixed UTC offsets synchronize live clock and followed date across both year boundaries', async () => {
    await navigate(1); await page.locator('[data-action="today"]').click();
    await fixedZone(14);
    assert.equal(await displayedClock(), '00:30:00'); assert.equal(await selected(), '2026,1,2');
    assert.equal(await page.locator('[data-action="today"]').getAttribute('aria-pressed'), 'true');
    await fixedZone(-12);
    assert.equal(await displayedClock(), '22:30:00'); assert.equal(await selected(), '2025,12,31');
    assert.equal(await page.locator('#location-timezone-label').textContent(), 'UTC−12:00');
  });
  await check('manual historical selection survives settings changes and clock midnight', async () => {
    await jump(1582, 10, 4); await fixedZone(5.75);
    assert.equal(await selected(), '1582,10,4'); assert.equal(await page.locator('[data-action="today"]').getAttribute('aria-pressed'), 'false');
    assert.equal(await displayedClock(), '16:15:00');
    await page.clock.setFixedTime(new Date('2026-01-02T20:00:00Z'));
    await page.waitForFunction(() => document.querySelector('#local-clock').textContent.endsWith('01:45:00'));
    assert.equal(await selected(), '1582,10,4');
    await page.locator('.calendar-day.is-selected').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await selected(), '1582,10,15');
  });
  await check('today resumes automatic following and midnight advances the calendar', async () => {
    await page.clock.setFixedTime(new Date('2026-01-01T09:59:59Z')); await fixedZone(14);
    await page.locator('[data-action="today"]').click(); assert.equal(await selected(), '2026,1,1');
    await page.clock.setFixedTime(new Date('2026-01-01T10:00:00Z'));
    await page.waitForFunction(() => document.querySelector('.calendar-day.is-selected')?.getAttribute('data-calendar-date') === '2026,1,2');
    assert.equal(await displayedClock(), '00:00:00');
  });
  await check('region mode applies modern IANA DST at the actual instant and persists the unified settings', async () => {
    await page.clock.setFixedTime(new Date('2026-01-01T10:30:00Z')); await regionalZone('北美洲', '美国东部');
    assert.equal(await displayedClock(), '05:30:00'); assert.equal(await page.locator('#location-timezone-label').textContent(), 'UTC−05:00');
    await page.clock.setFixedTime(new Date('2026-03-08T07:00:00Z'));
    await page.waitForFunction(() => document.querySelector('#location-timezone-label').textContent === 'UTC−04:00');
    assert.equal(await displayedClock(), '03:00:00');
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.locator('#location-timezone-label').textContent(), 'UTC−04:00');
    await page.locator('[data-action="open-settings"]').click();
    assert.equal(await page.locator('#calendar-country').inputValue(), 'US'); assert.equal(await page.locator('#timezone-mode').inputValue(), 'region');
    await page.locator('#calendar-continent').selectOption('大洋洲'); await page.locator('#calendar-country').selectOption('AU');
    assert.equal(await page.locator('#location-timezone').inputValue(), '11');
    await page.locator('#settings-dialog [data-action="close-dialog"]').first().click();
    assert.equal(await page.locator('#location-timezone-label').textContent(), 'UTC−04:00');
  });
  await check('manual professional dates and the last lunar-phase action survive timezone changes', async () => {
    await fixedZone(8); await navigate(5);
    for (const [id, value] of [['Cd_y', '2009'], ['Cd_m', '7'], ['Cd_d', '22'], ['Cd_t', '18:17:15'], ['Cd_n', '2']]) await page.locator(`#${id}`).fill(value);
    await page.locator('#Cd_ut').uncheck(); await page.locator('#Cd_xt').selectOption('10'); await action('pCalc');
    await navigate(8); await page.locator('#Cp8_y').fill('2033'); await page.locator('#Cp8_n').fill('3'); await page.locator('#Cp8_angle').fill('37.5'); await action('suoCalc', -1);
    const before = outputDates(await page.locator('#Cp8_out').textContent()); assert.equal(before.length, 3);
    await fixedZone(-3); const after = outputDates(await page.locator('#Cp8_out').textContent());
    assert.equal(after.length, 3); assert.match(await page.locator('#Cp8_out').textContent(), /37\.5/); assert.equal(await page.locator('#Cp8_y').inputValue(), '2033');
    for (let i = 0; i < before.length; i++) assert.equal(Date.parse(after[i]) - Date.parse(before[i]), -11 * 3600000);
    await navigate(5);
    assert.equal(await page.locator('#Cd_y').inputValue(), '2009'); assert.equal(await page.locator('#Cd_m').inputValue(), '7'); assert.equal(await page.locator('#Cd_d').inputValue(), '22');
    assert.equal(await page.locator('#Cd_t').inputValue(), '18:17:15'); assert.equal(await page.locator('#Cd_ut').isChecked(), false); assert.equal(await page.locator('#Cd_xt').inputValue(), '11');
    assert.match(await page.locator('#Cd_tab').inputValue(), /UTC−03:00/);
  });
  await check('theme and week-start preferences leave computed professional result DOM untouched', async () => {
    await navigate(8); await action('suoCalc', -1);
    const before = await page.locator('#Cp8_out').innerHTML();
    await page.evaluate(() => {
      window.__qaMutations = 0; window.__qaObserver = new MutationObserver((records) => { window.__qaMutations += records.length; });
      window.__qaObserver.observe(document.querySelector('#Cp8_out'), { childList: true, subtree: true, characterData: true });
    });
    await page.locator('[data-action="toggle-theme"]').click(); await settle();
    await settings(async () => { await page.locator('#settings-theme').selectOption('dark'); await page.locator('#settings-week-start').selectOption('1'); });
    assert.equal(await page.locator('#Cp8_out').innerHTML(), before);
    assert.equal(await page.evaluate(() => window.__qaMutations), 0);
    await page.evaluate(() => window.__qaObserver.disconnect());
  });
  await check('changing observation coordinates refreshes astronomy while preserving manual input', async () => {
    await navigate(5); const before = await page.locator('#Cd_tab').inputValue();
    await settings(async () => { await page.locator('#location-mode').selectOption('custom'); await page.locator('#location-name').fill('联动观测点'); await page.locator('#location-longitude').fill('-74.01'); await page.locator('#location-latitude').fill('40.71'); });
    assert.notEqual(await page.locator('#Cd_tab').inputValue(), before); assert.equal(await page.locator('#Cd_y').inputValue(), '2009');
    assert.equal(Number(await page.locator('#Cd_J').inputValue()), -74.01); assert.equal(Number(await page.locator('#Cd_W').inputValue()), 40.71);
    assert.equal(await page.locator('#location-label').textContent(), '联动观测点');
  });
  await check('calendar phase markers and list dates move together across a month boundary', async () => {
    await fixedZone(-12); await jump(2026, 11, 30);
    const event = page.locator('.event-item[data-calendar-date="2026,11,30"]');
    assert.match(await event.textContent(), /下弦/); assert.match(await event.textContent(), /18:08:37/);
    assert.match(await page.locator('.calendar-day[data-calendar-date="2026,11,30"] .moon-marker').textContent(), /下弦/);
    await fixedZone(8); await jump(2026, 12, 1);
    assert.match(await page.locator('.event-item[data-calendar-date="2026,12,1"]').textContent(), /下弦/);
  });
  await check('ancient calendar terms remain in the day grid, details and copied summary', async () => {
    await fixedZone(8); await jump(600, 1, 4);
    assert.match(await page.locator('.calendar-day.is-selected').getAttribute('aria-label'), /历法节气 小寒/);
    assert.match(await page.locator('.day-sidebar').textContent(), /历法节气\s*小寒/);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.locator('[data-action="copy-day"]').click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(copied, /历法节气 小寒/);
  });
  await check('DST-day rise and set captions describe regional time without one misleading daily offset', async () => {
    await settings(async () => {
      await page.locator('#calendar-continent').selectOption('欧洲'); await page.locator('#calendar-country').selectOption('GB');
      await page.locator('#location-mode').selectOption('custom'); await page.locator('#location-longitude').fill('0'); await page.locator('#location-latitude').fill('51.5');
    });
    await jump(2021, 10, 31);
    assert.match(await page.locator('.sun-moon-card .card-caption').textContent(), /英国时间/);
    assert.match(await page.locator('.sun-moon-card').textContent(), /01:33:03/);
    await page.context().grantPermissions(['clipboard-read', 'clipboard-write']); await page.locator('[data-action="copy-day"]').click();
    const copied = await page.evaluate(() => navigator.clipboard.readText());
    assert.match(copied, /英国时间 日出/); assert.match(copied, /月出 01:33:03/);
  });
  await check('mobile unified panel remains reachable and exposes one consistent time source', async () => {
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'zh-CN', timezoneId: 'UTC' });
    page = await mobile.newPage(); observe(page); await page.clock.setFixedTime(new Date('2026-01-01T10:30:00Z')); await page.goto(baseURL, { waitUntil: 'networkidle' }); await chinaProfile();
    assert.equal(await page.locator('[data-action="open-settings"]').count(), 1); await fixedZone(-3.5);
    assert.equal(await displayedClock(), '07:00:00'); assert.equal(await page.locator('#location-timezone-label').textContent(), 'UTC−03:30');
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth <= 2));
    await page.locator('[data-action="open-settings"]').click();
    const bounds = await page.locator('#settings-dialog').boundingBox(); assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= 391);
    await page.locator('#settings-dialog [data-action="close-dialog"]').first().click();
  });
  await check('no uncaught exceptions or failed resources in unified-time interactions', async () => { assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []); });
} finally {
  await browser?.close(); await new Promise((resolve) => server.close(resolve));
}
const report = { timestamp: new Date().toISOString(), browser: 'Chromium', browserVersion, build: 'dist', filter: process.env.SMOKE_FILTER || null, scope: '统一地点与时间、日期跟随、专业页刷新、UTC8与跨月显示、桌面和手机', passed: results.filter((result) => result.passed).length, failed: results.filter((result) => !result.passed).length, results, pageErrors: errors, failedRequests };
await writeFile(resolve(process.env.SMOKE_REPORT || resolve(project, 'docs/browser-time-settings-current.json')), JSON.stringify(report, null, 2) + '\n');
console.log(`Unified-time browser regression: ${report.passed} passed, ${report.failed} failed.`);
if (report.failed || results.length === 0) process.exitCode = 1;
