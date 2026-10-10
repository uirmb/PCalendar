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
  await navigate(1); await page.locator('#calendar-view [data-action="open-date"]').click();
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

async function localLayers(enabled) {
  await settings(async () => {
    for (const key of ['usCultural', 'nycCivic', 'nycSchools', 'nycParking', 'commercial']) {
      const input = page.locator(`#settings-layer-${key}`);
      if (await input.isVisible()) await input.setChecked(enabled.includes(key));
    }
  });
}

try {
  browser = await chromium.launch({ headless: true, args: argsModule?.default?.args || ['--no-sandbox', '--disable-dev-shm-usage'], ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  browserVersion = browser.version();
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'Asia/Tokyo' });
  page = await context.newPage(); observe(page); page.setDefaultTimeout(15000);
  await page.clock.setFixedTime(new Date('2026-10-07T02:30:00Z'));
  await page.goto(baseURL, { waitUntil: 'networkidle' });

  await check('New York selects explicit jurisdiction, localized menus and a local previous-day date', async () => {
    await country('US');
    const saved = await savedSettings();
    assert.equal(saved.subdivisionCode, 'US-NY'); assert.equal(saved.municipalityCode, 'US-NYC');
    assert.equal(saved.calendarLayers.nycSchools, false); assert.equal(saved.calendarLayers.nycParking, false);
    assert.equal(await selected(), '2026,10,6');
    assert.match(await page.locator('#local-clock').innerText(), /10\/06\/2026 下午 10:30:00/);
    assert.equal(await page.locator('.nav-item[data-page="2"]').innerText(), '公历年历');
    assert.equal(await page.locator('.nav-item[data-page="8"]').innerText(), '季节与月相');
    assert.equal(await page.locator('.nav-item[data-page="11"]').count(), 0);
    await noChineseCalendar(page.locator('#calendar-view'));
  });

  await check('NYC election, remote school and ASP remain three scoped events with two day labels and overflow', async () => {
    await country('US'); await localLayers(['usCultural', 'nycCivic', 'nycSchools', 'nycParking']);
    await jump(2026, 11, 3);
    const detail = page.locator('.day-detail');
    assert.match(await detail.innerText(), /选举日/);
    assert.match(await detail.locator('[data-holiday-category="school"]').innerText(), /远程/);
    assert.match(await detail.locator('[data-holiday-category="parking"]').innerText(), /ASP|停车/);
    assert.equal(await detail.locator('.local-holiday-detail').count(), 3);
    assert.equal(await detail.locator('.event-source').count(), 3);
    const day = page.locator('.calendar-day.is-selected');
    assert.equal(await day.locator('.day-local-item').count(), 2);
    assert.equal(await day.locator('.day-more').innerText(), '+1');
    assert.equal(await day.locator('.calendar-status-marker').count(), 0);
    assert.match(await day.getAttribute('aria-label'), /远程/);
    const copied = await copiedDay();
    assert.match(copied, /远程/); assert.match(copied, /ASP|停车/); assert.doesNotMatch(copied, /调休上班|农历.*月.*日/);
    await jump(2026, 12, 8);
    assert.equal(await page.locator('.day-detail [data-holiday-category="parking"]').count(), 1);
    assert.equal(await page.locator('.day-detail [data-holiday-category="school"],.day-detail [data-holiday-category="federal"]').count(), 0);
  });

  await check('local calendar toggles persist through reload and can remove optional calendars without removing federal holidays', async () => {
    await localLayers(['usCultural', 'nycCivic']);
    await page.reload({ waitUntil: 'networkidle' }); await jump(2026, 11, 3);
    assert.equal(await page.locator('.day-detail [data-holiday-category="school"],.day-detail [data-holiday-category="parking"]').count(), 0);
    assert.equal(await page.locator('.day-detail [data-holiday-category="local"]').count(), 1);
    await localLayers([]); await jump(2026, 12, 24);
    assert.equal(await page.locator('.day-detail .local-holiday-detail').count(), 0);
    await jump(2026, 12, 25);
    assert.match(await page.locator('.day-detail').innerText(), /圣诞节/);
    await localLayers(['usCultural', 'nycCivic', 'nycSchools', 'nycParking']);
  });

  await check('Los Angeles with a New York timezone cannot inherit NYC school or parking events', async () => {
    await settings(async () => {
      await page.locator('#calendar-city').selectOption('iana:US:America/Los_Angeles');
      await page.locator('#timezone-id').selectOption('America/New_York');
      assert.equal(await page.locator('#settings-layer-nycSchools').isVisible(), false);
    });
    await jump(2026, 11, 3);
    assert.equal((await savedSettings()).municipalityCode, '');
    assert.equal(await page.locator('.day-detail .local-holiday-detail').count(), 0);
    await settings(async () => { await page.locator('#calendar-city').selectOption('iana:US:America/New_York'); });
    assert.equal((await savedSettings()).calendarLayers.nycSchools, true);
    assert.equal(await page.locator('.day-detail [data-holiday-category="school"]').count(), 1);
  });

  await check('Gregorian year calendar supports filtering, month navigation and switching directly to CN lunar year', async () => {
    await jump(2026, 11, 3); await navigate(2);
    assert.equal(await page.locator('#year-view').isVisible(), true);
    assert.equal(await page.locator('#feature-view').isVisible(), false);
    assert.equal(await page.locator('#year-view .year-filters [data-year-filter]').count(), 4);
    assert.equal(await page.locator('#year-view .year-month').count(), 12);
    assert.match(await page.locator('#year-view .year-day[data-calendar-date="2026,12,25"]').getAttribute('aria-label'), /圣诞节/);
    await page.locator('#year-view .year-filters [data-year-filter="national"]').click();
    assert.equal(await page.locator('#year-view .year-filters [data-year-filter="national"]').getAttribute('aria-pressed'), 'true');
    await page.locator('#year-view [data-calendar-date="2026,12,25"]').first().click();
    assert.equal(await page.locator('#calendar-view').isVisible(), true);
    assert.equal(await selected(), '2026,12,25');
    await navigate(2); await country('CN');
    assert.equal(await page.locator('#year-view').isVisible(), false);
    assert.equal(await page.locator('#feature-page-2').isVisible(), true);
    await country('US');
    assert.equal(await page.locator('#year-view').isVisible(), true);
    assert.equal(await page.locator('#feature-view').isVisible(), false);
  });

  await check('local eclipse default follows the selected city while edited location lists are preserved', async () => {
    await country('US'); await navigate(4);
    assert.match(await page.locator('#Cc_db').inputValue(), /纽约/);
    assert.doesNotMatch(await page.locator('#Cc_db').inputValue(), /北京|天津/);
    const custom = '自定点,40.7,-74,0';
    await page.locator('#Cc_db').fill(custom);
    await country('CN'); assert.equal(await page.locator('#Cc_db').inputValue(), custom);
    await action('useCurrentObserver');
    assert.match(await page.locator('#Cc_db').inputValue(), /天安门/);
    await country('US'); assert.match(await page.locator('#Cc_db').inputValue(), /纽约/);
  });

  await check('US season computation coexists with moon phases and retains each country mode', async () => {
    await country('US'); await navigate(8); await page.locator('#Cp8_y').fill('2026');
    await action('seasonCalc');
    const seasons = await page.locator('#Cp8_out').innerText();
    for (const name of ['春季开始', '夏季开始', '秋季开始', '冬季开始']) assert.match(seasons, new RegExp(name));
    assert.doesNotMatch(seasons, /寒露|霜降|七十二候/);
    await country('CN'); assert.equal(await page.locator('#feature-view [data-action="seasonCalc"]').isVisible(), false);
    await country('US'); assert.equal(await page.locator('#Cp8_out').innerText(), seasons);
    await country('GB'); assert.equal(await page.locator('#feature-view [data-action="seasonCalc"]').isVisible(), false);
    await country('US'); assert.equal(await page.locator('#Cp8_out').innerText(), seasons);
  });

  await check('daily clocks, copied dates and zodiac follow explicit preferences while elapsed durations stay unchanged', async () => {
    await jump(2026, 11, 3);
    const duration = await page.locator('.sun-moon-card .day-facts div').filter({ has: page.locator('dt', { hasText: '白天时间' }) }).innerText();
    assert.match(await page.locator('.sun-times').innerText(), /上午|下午/);
    await settings(async () => {
      await page.locator('#settings-clock-format').selectOption('24');
      await page.locator('#settings-date-format').selectOption('ymd');
      await page.locator('#settings-show-zodiac').uncheck();
    });
    assert.match(await page.locator('#local-clock').innerText(), /2026\.10\.06 22:30:00/);
    assert.doesNotMatch(await page.locator('.sun-times').innerText(), /上午|下午/);
    assert.doesNotMatch(await page.locator('.day-detail').innerText(), /十二星座|天秤座|天蝎座/);
    assert.equal(await page.locator('.sun-moon-card .day-facts div').filter({ has: page.locator('dt', { hasText: '白天时间' }) }).innerText(), duration);
    assert.match(await copiedDay(), /2026\.11\.03/);
    await page.locator('.day-astronomy-details > summary').click();
    assert.match(await page.locator('.day-astronomy-details').innerText(), /儒略日|J2000/);
    await settings(async () => { await page.locator('#settings-clock-format').selectOption('auto'); await page.locator('#settings-date-format').selectOption('auto'); await page.locator('#settings-show-zodiac').check(); });
  });

  await check('DST and season events appear on local dates and fixed offset mode removes clock-change reminders', async () => {
    await jump(2026, 11, 1);
    assert.equal(await page.locator('.selected-events [data-astronomy-type="dst"]').count(), 1);
    assert.match(await page.locator('.selected-events [data-astronomy-type="dst"]').innerText(), /01:00|1:00/);
    await fixedZone(-5);
    assert.equal(await page.locator('.selected-events [data-astronomy-type="dst"]').count(), 0);
    await settings(async () => { await advanced(); await page.locator('#timezone-mode').selectOption('region'); });
    await jump(2026, 3, 20);
    assert.equal(await page.locator('.selected-events [data-astronomy-type="season"]').count(), 1);
    assert.match(await page.locator('.selected-events [data-astronomy-type="season"]').innerText(), /春季开始/);
  });

  await check('uncovered NYC years are visibly identified rather than extrapolating school and parking dates', async () => {
    await jump(2028, 11, 7);
    assert.equal(await page.locator('.day-detail [data-holiday-category="school"],.day-detail [data-holiday-category="parking"]').count(), 0);
    assert.match(await page.locator('.month-local-events').innerText(), /未覆盖|未收录|部分/);
    await navigate(2); assert.match(await page.locator('#year-view').innerText(), /未覆盖|未收录|部分/);
  });

  await check('opening old custom US settings cannot silently assign NYC when only display preferences change', async () => {
    const originalPage = page;
    const originalStorage = await originalPage.evaluate(() => localStorage.getItem('sxwnl-modern.settings.v1'));
    const customContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN' });
    const old = { countryCode: 'US', cityId: '', locationMode: 'custom', city: '我的美国观测点', longitude: -80.2, latitude: 25.7, timezone: -5, timezoneMode: 'region', timezoneId: 'America/New_York', timezoneRegion: '美国', weekStart: 0, weekStartMode: 'auto', clockFormat: 'auto', theme: 'light' };
    await customContext.addInitScript((value) => {
      if (location.protocol === 'http:') localStorage.setItem('sxwnl-modern.settings.v1', JSON.stringify(value));
    }, old);
    page = await customContext.newPage(); observe(page);
    try {
      await page.goto(baseURL, { waitUntil: 'networkidle' });
      assert.equal((await savedSettings()).city, old.city, 'the migration fixture must be applied before opening settings');
      await settings(async () => {
        assert.equal(await page.locator('#calendar-city').inputValue(), '');
        assert.equal(await page.locator('#settings-layer-nycSchools').isVisible(), false);
        await page.locator('#settings-theme').selectOption('dark');
      });
      const saved = await savedSettings();
      assert.equal(saved.cityId, ''); assert.equal(saved.municipalityCode, '');
      assert.equal(saved.city, old.city); assert.equal(saved.longitude, old.longitude); assert.equal(saved.latitude, old.latitude);
      await jump(2026, 11, 3);
      assert.equal(await page.locator('.day-detail [data-holiday-category="local"]').count(), 0);
    } finally {
      // Some serverless single-process builds share origin storage across
      // contexts. Restore the fixture boundary and close contexts with browser.
      await originalPage.evaluate((saved) => {
        if (saved === null) localStorage.removeItem('sxwnl-modern.settings.v1');
        else localStorage.setItem('sxwnl-modern.settings.v1', saved);
      }, originalStorage);
      page = originalPage;
    }
  });

  await check('NYC month, year and settings remain usable at 390px with no document overflow', async () => {
    await page.setViewportSize({ width: 390, height: 844 });
    await jump(2026, 11, 3);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    await navigate(2); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2));
    await settings(async () => {
      assert.ok(await page.locator('#settings-layer-nycSchools').isVisible());
      await page.locator('#settings-layer-nycParking').uncheck();
      await page.locator('#settings-layer-nycParking').check();
      const bounds = await page.locator('#settings-dialog').boundingBox();
      assert.ok(bounds.x >= -1 && bounds.x + bounds.width <= 391);
    });
    await page.setViewportSize({ width: 1440, height: 1000 });
  });

  await check('NYC interactions have no uncaught exceptions or failed resources', async () => { assert.deepEqual(errors, []); assert.deepEqual(failedRequests, []); });
} finally {
  await browser?.close(); await new Promise((resolve) => server.close(resolve));
}
const report = { timestamp: new Date().toISOString(), version: JSON.parse(await readFile(resolve(project, 'package.json'), 'utf8')).version, browser: 'Chromium', browserVersion, build: 'dist', filter: process.env.SMOKE_FILTER || null, scope: '纽约日历分层、行政地区隔离、公历年历、季节与DST、专业地点、偏好持久化和手机布局', passed: results.filter((result) => result.passed).length, failed: results.filter((result) => !result.passed).length, results, pageErrors: errors, failedRequests };
await writeFile(resolve(process.env.SMOKE_REPORT || resolve(project, 'docs/browser-nyc-validation.json')), JSON.stringify(report, null, 2) + '\n');
console.log(`New York browser regression: ${report.passed} passed, ${report.failed} failed.`);
if (report.failed || results.length === 0) process.exitCode = 1;
