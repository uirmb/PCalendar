/** 我直接打开单文件构建并关闭网络，验证离线国际日历的完整交互。先 npm run build。 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const artifact = resolve(process.env.OFFLINE_HTML || resolve(project, 'dist/sxwnl-modern.html'));
const moduleURL = (name) => name.startsWith('/') ? pathToFileURL(name).href : name;
const { chromium } = await import(moduleURL(process.env.PLAYWRIGHT_MODULE || 'playwright'));
const argsModule = process.env.CHROMIUM_ARGS_MODULE ? await import(moduleURL(process.env.CHROMIUM_ARGS_MODULE)) : null;
const results = [], pageErrors = [], requests = [], failedRequests = [], networkAttempts = [];
let browser, page, browserVersion;

async function check(name, run) {
  const start = performance.now();
  try {
    await run(); results.push({ name, passed: true, milliseconds: Math.round(performance.now() - start) });
    console.log(`PASS ${name}`);
  } catch (error) {
    results.push({ name, passed: false, milliseconds: Math.round(performance.now() - start), error: error.message });
    console.error(`FAIL ${name}: ${error.message}`);
  }
}

async function settle() {
  await page.waitForFunction(() => !document.querySelector('#feature-view')?.hasAttribute('aria-busy'));
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  assert.equal(await page.locator('.feature-feedback--error:not([hidden])').count(), 0);
}

async function navigate(id) {
  await page.locator(`.nav-item[data-page="${id}"]`).click(); await settle();
}

async function settings(run) {
  await page.locator('[data-action="open-settings"]').click(); await run();
  await page.locator('#settings-form button[type="submit"]').click();
  await page.locator('#settings-dialog').waitFor({ state: 'hidden' }); await settle();
}

async function country(code) {
  await settings(async () => {
    await page.locator('#calendar-continent').selectOption(code === 'CN' ? '亚洲' : '北美洲');
    await page.locator('#calendar-country').selectOption(code);
  });
}

async function jump(year, month, day) {
  await navigate(1); await page.locator('#calendar-view [data-action="open-date"]').click();
  await page.locator('#jump-year').fill(String(year)); await page.locator('#jump-month').selectOption(String(month));
  await page.locator('#jump-day').fill(String(day)); await page.locator('#date-form button[type="submit"]').click();
  await page.locator('#date-dialog').waitFor({ state: 'hidden' }); await settle();
}

const selected = () => page.locator('.calendar-day.is-selected').getAttribute('data-calendar-date');
const savedSettings = () => page.evaluate(() => JSON.parse(localStorage.getItem('sxwnl-modern.settings.v1')));

try {
  browser = await chromium.launch({ headless: true, args: argsModule?.default?.args || ['--no-sandbox', '--disable-dev-shm-usage'], ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  browserVersion = browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'Asia/Tokyo', offline: true, serviceWorkers: 'block' });
  context.on('request', (request) => {
    requests.push({ url: request.url(), resourceType: request.resourceType() });
    if (/^https?:\/\//i.test(request.url())) networkAttempts.push(request.url());
  });
  await context.route(/^https?:\/\//i, (route) => route.abort('internetdisconnected'));
  page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('requestfailed', (request) => failedRequests.push({ url: request.url(), reason: request.failure()?.errorText }));
  page.on('websocket', (socket) => networkAttempts.push(socket.url()));
  await page.clock.setFixedTime(new Date('2026-10-07T02:30:00Z'));
  await page.goto(pathToFileURL(artifact).href, { waitUntil: 'load' }); await settle();

  await check('standalone file opens offline with the original Chinese calendar default', async () => {
    assert.equal(new URL(page.url()).protocol, 'file:');
    assert.equal(await page.evaluate(() => navigator.onLine), false);
    assert.match(await page.locator('#calendar-view').innerText(), /农历/);
    assert.equal(await selected(), '2026,10,7');
    assert.equal(await page.locator('.nav-item[data-page="11"]').count(), 1);
  });

  await check('offline CN to New York applies local civil date, jurisdiction and localized menus', async () => {
    await country('US');
    const saved = await savedSettings();
    assert.equal(saved.countryCode, 'US'); assert.equal(saved.municipalityCode, 'US-NYC');
    assert.equal(saved.timezoneId, 'America/New_York');
    assert.equal(await selected(), '2026,10,6');
    assert.match(await page.locator('#local-clock').innerText(), /10\/06\/2026 下午 10:30:00/);
    assert.equal(await page.locator('.nav-item[data-page="2"]').innerText(), '公历年历');
    assert.equal(await page.locator('.nav-item[data-page="8"]').innerText(), '季节与月相');
    assert.equal(await page.locator('.nav-item[data-page="11"]').count(), 0);
    assert.doesNotMatch(await page.locator('#calendar-view').innerText(), /农历|干支|生肖|二十四节气/);
  });

  await check('offline November 3 keeps election, remote school and ASP as three separately scoped events', async () => {
    await settings(async () => {
      for (const key of ['usCultural', 'nycCivic', 'nycSchools', 'nycParking']) await page.locator(`#settings-layer-${key}`).check();
    });
    await jump(2026, 11, 3);
    const detail = page.locator('.day-detail'), cell = page.locator('.calendar-day.is-selected');
    assert.equal(await detail.locator('.local-holiday-detail').count(), 3);
    assert.match(await detail.locator('[data-holiday-category="local"]').innerText(), /选举日/);
    assert.match(await detail.locator('[data-holiday-category="school"]').innerText(), /远程/);
    assert.match(await detail.locator('[data-holiday-category="parking"]').innerText(), /ASP|停车/);
    assert.equal(await detail.locator('.event-source').count(), 3);
    assert.equal(await cell.locator('.day-local-item').count(), 2);
    assert.equal(await cell.locator('.day-more').innerText(), '+1');
    assert.equal(await cell.locator('.calendar-status-marker').count(), 0);
  });

  await check('offline reload persists local layers and December 25 stays an all-day Christmas event', async () => {
    await page.reload({ waitUntil: 'load' }); await settle();
    const saved = await savedSettings();
    assert.equal(saved.calendarLayers.nycSchools, true); assert.equal(saved.calendarLayers.nycParking, true);
    await jump(2026, 12, 25);
    assert.equal(await selected(), '2026,12,25');
    assert.match(await page.locator('.day-detail [data-holiday-category="federal"]').innerText(), /圣诞节/);
    assert.match(await page.locator('.month-local-events').innerText(), /圣诞节/);
    assert.match(await page.locator('.calendar-day.is-selected').getAttribute('aria-label'), /12\/25\/2026.*圣诞节/);
  });

  await check('offline Gregorian year filters and date links remain interactive', async () => {
    await navigate(2);
    assert.equal(await page.locator('#year-view').isVisible(), true);
    assert.equal(await page.locator('#year-view .year-month').count(), 12);
    assert.equal(await page.locator('#year-view .year-day').count(), 365);
    await page.locator('#year-view .year-filters [data-year-filter="local"]').click();
    assert.equal(await page.locator('#year-view .year-filters [data-year-filter="local"]').getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('#year-view [data-year-event-kind="national"],#year-view [data-year-event-kind="astronomy"]').count(), 0);
    assert.ok(await page.locator('#year-view [data-year-event-kind="local"]').count() > 0);
    await page.locator('#year-view .year-filters [data-year-filter="national"]').click();
    const christmas = page.locator('#year-view .year-day[data-calendar-date="2026,12,25"]');
    assert.match(await christmas.getAttribute('aria-label'), /圣诞节/); await christmas.click();
    assert.equal(await page.locator('#calendar-view').isVisible(), true);
    assert.equal(await selected(), '2026,12,25');
  });

  await check('offline US seasons coexist with moon phases and restore their last action', async () => {
    await navigate(8); await page.locator('#Cp8_y').fill('2026');
    const seasonal = page.locator('#feature-view [data-action="seasonCalc"]');
    await seasonal.click(); await settle();
    const output = await page.locator('#Cp8_out').innerText();
    for (const name of ['春季开始', '夏季开始', '秋季开始', '冬季开始']) assert.match(output, new RegExp(name));
    assert.doesNotMatch(output, /立春|七十二候|寒露|霜降/);
    assert.equal(await page.locator('#feature-view [data-action="qiCalc"]').isVisible(), false);
    await country('CN'); assert.equal(await seasonal.isVisible(), false);
    await country('US'); assert.equal(await page.locator('#Cp8_out').innerText(), output);
  });

  await check('offline switch back to China restores lunar year, traditional calculation and lunar month details', async () => {
    await navigate(2); await country('CN');
    assert.equal(await page.locator('#year-view').isVisible(), false);
    assert.equal(await page.locator('#feature-page-2').isVisible(), true);
    assert.equal(await page.locator('.nav-item[data-page="11"]').count(), 1);
    await navigate(8);
    assert.equal(await page.locator('#feature-view [data-action="qiCalc"]').isVisible(), true);
    assert.equal(await page.locator('#feature-view [data-action="seasonCalc"]').isVisible(), false);
    await navigate(1);
    assert.match(await page.locator('#calendar-view').innerText(), /农历/);
    assert.match(await page.locator('.month-astronomy-events').innerText(), /本月节气与月相/);
  });

  await check('all standalone interactions make zero HTTP or WebSocket requests and have no page errors', async () => {
    assert.deepEqual(networkAttempts, []);
    assert.deepEqual(pageErrors, []);
    assert.deepEqual(failedRequests, []);
    assert.ok(requests.length >= 1);
    assert.ok(requests.every((request) => request.url === pathToFileURL(artifact).href || /^(?:data|blob):/.test(request.url)), 'no adjacent files are needed by the standalone artifact');
  });
} catch (error) {
  results.push({ name: 'offline browser startup or navigation', passed: false, error: error.stack || error.message });
  console.error(error);
} finally {
  await browser?.close();
}

const bytes = await readFile(artifact);
const report = {
  timestamp: new Date().toISOString(), version: JSON.parse(await readFile(resolve(project, 'package.json'), 'utf8')).version,
  browser: 'Chromium', browserVersion, build: 'dist/sxwnl-modern.html', transport: 'file://', networkOffline: true,
  artifactBytes: bytes.length, artifactSha256: createHash('sha256').update(bytes).digest('hex'),
  scope: '单文件离线 CN→纽约、学校与停车三类事项、圣诞节、公历年历、四季与月相、切回中国及零网络依赖',
  passed: results.filter((result) => result.passed).length, failed: results.filter((result) => !result.passed).length,
  results, pageErrors, httpOrWebSocketRequests: networkAttempts, failedRequests, requests,
};
await writeFile(resolve(process.env.OFFLINE_REPORT || resolve(project, 'docs/offline-nyc-validation.json')), JSON.stringify(report, null, 2) + '\n');
console.log(`Offline browser regression: ${report.passed} passed, ${report.failed} failed.`);
if (report.failed || results.length === 0) process.exitCode = 1;
