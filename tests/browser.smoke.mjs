/**
 * 实际浏览器交互回归。先 npm run build，再 node tests/browser.smoke.mjs。
 * 可选变量：SMOKE_DIST、SMOKE_REPORT、SMOKE_FILTER、CHROMIUM_EXECUTABLE、PLAYWRIGHT_MODULE、CHROMIUM_ARGS_MODULE。
 * 本脚本在同一进程启动 dist 静态服务，避免依赖另外一个终端的网络命名空间。
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(process.env.SMOKE_DIST || resolve(project, 'dist'));
const nameFilter = process.env.SMOKE_FILTER ? new RegExp(process.env.SMOKE_FILTER) : null;
const moduleURL = (name) => name.startsWith('/') ? pathToFileURL(name).href : name;
const { chromium } = await import(moduleURL(process.env.PLAYWRIGHT_MODULE || 'playwright'));
const argsModule = process.env.CHROMIUM_ARGS_MODULE ? await import(moduleURL(process.env.CHROMIUM_ARGS_MODULE)) : null;
const browserArgs = argsModule?.default?.args || ['--no-sandbox', '--disable-dev-shm-usage'];
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.ico': 'image/x-icon', '.json': 'application/json' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || '/', 'http://localhost').pathname);
    let file = resolve(dist, '.' + pathname);
    if (file !== dist && !file.startsWith(dist + sep)) { response.writeHead(403).end(); return; }
    if ((await stat(file)).isDirectory()) file = resolve(file, 'index.html');
    response.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream' });
    response.end(await readFile(file));
  } catch { response.writeHead(404).end('Not found'); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const baseURL = `http://127.0.0.1:${server.address().port}`;
let browser;
let browserVersion = '';
const results = [];
const pageErrors = [];
const failedRequests = [];
let page;
async function check(name, run) {
  if (nameFilter && !nameFilter.test(name)) return;
  const start = performance.now();
  try { await run(); results.push({ name, passed: true, milliseconds: Math.round(performance.now() - start) }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, passed: false, milliseconds: Math.round(performance.now() - start), error: error.stack || String(error) }); console.error(`FAIL ${name}: ${error.message}`); }
}
function observe(target) {
  target.on('pageerror', (error) => pageErrors.push(error.message));
  target.on('requestfailed', (request) => failedRequests.push({ url: request.url(), failure: request.failure()?.errorText }));
  target.on('response', (response) => { if (response.status() >= 400) failedRequests.push({ url: response.url(), status: response.status() }); });
}
async function navigate(id) {
  const menu = page.locator('[data-action="toggle-menu"]');
  if (await menu.isVisible() && !await page.locator('#app-sidebar').evaluate((element) => element.classList.contains('is-open'))) await menu.click();
  await page.locator(`.nav-item[data-page="${id}"]`).click();
  await page.waitForFunction(() => !document.querySelector('#feature-view')?.hasAttribute('aria-busy'));
  assert.equal(await page.locator(`.nav-item[data-page="${id}"]`).getAttribute('aria-current'), 'page');
}
async function noFeatureError() {
  assert.equal(await page.locator('.feature-feedback--error:not([hidden])').count(), 0, await page.locator('.feature-feedback').textContent());
}
async function action(name, arg, arg2) {
  let selector = `#feature-view [data-action="${name}"]`;
  if (arg !== undefined) selector += `[data-arg="${arg}"]`;
  if (arg2 !== undefined) selector += `[data-arg2="${arg2}"]`;
  await page.locator(selector).filter({ visible: true }).first().click();
  await page.waitForFunction(() => !document.querySelector('#feature-view')?.hasAttribute('aria-busy'));
  await noFeatureError();
}
async function jump(year, month, day) {
  await navigate(1);
  await page.locator('[data-action="open-date"]').click();
  await page.locator('#jump-year').fill(String(year));
  await page.locator('#jump-month').selectOption(String(month));
  await page.locator('#jump-day').fill(String(day));
  await page.locator('#date-form button[type="submit"]').click();
  await page.locator('#date-dialog').waitFor({ state: 'hidden' });
}
async function canvasHasInk(selector) {
  return page.locator(selector).evaluate((canvas) => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let colored = 0;
    for (let index = 0; index < data.length; index += 16) {
      if (data[index + 3] > 0 && Math.max(data[index], data[index + 1], data[index + 2]) - Math.min(data[index], data[index + 1], data[index + 2]) > 20) colored++;
    }
    return colored > 25;
  });
}
async function useChinaProfile() {
  await page.locator('[data-action="open-settings"]').click();
  await page.locator('#calendar-continent').selectOption('亚洲'); await page.locator('#calendar-country').selectOption('CN');
  await page.locator('#settings-clock-format').selectOption('24');
  await page.locator('#settings-form button[type="submit"]').click();
}
async function advancedSettings() {
  if (!await page.locator('#settings-advanced').evaluate((node) => node.open)) await page.locator('#settings-advanced > summary').click();
}
try {
  browser = await chromium.launch({ headless: true, args: browserArgs, ...(process.env.CHROMIUM_EXECUTABLE ? { executablePath: process.env.CHROMIUM_EXECUTABLE } : {}) });
  browserVersion = browser.version();
  const desktop = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
  page = await desktop.newPage(); observe(page);
  page.setDefaultTimeout(12000);
  await page.goto(baseURL, { waitUntil: 'networkidle' }); await useChinaProfile();
  await check('desktop startup and all fifteen navigation entries', async () => {
    assert.equal(await page.locator('.nav-item').count(), 15);
    for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) { await navigate(id); await noFeatureError(); }
  });
  await check('1582 missing dates and keyboard day/month navigation', async () => {
    await jump(1582, 10, 4);
    assert.equal(await page.locator('.calendar-day:not(.is-outside):not(.is-empty)').count(), 21);
    await page.locator('.calendar-day.is-selected').focus(); await page.keyboard.press('ArrowRight');
    assert.equal(await page.locator('.calendar-day.is-selected').getAttribute('data-calendar-date'), '1582,10,15');
    await page.keyboard.press('ArrowLeft');
    assert.equal(await page.locator('.calendar-day.is-selected').getAttribute('data-calendar-date'), '1582,10,4');
    await page.keyboard.press('End');
    assert.equal(await page.locator('.calendar-day.is-selected').getAttribute('data-calendar-date'), '1582,10,31');
    await page.keyboard.press('PageDown');
    assert.match(await page.locator('.calendar-day.is-selected').getAttribute('data-calendar-date'), /^1582,11,/);
    await page.keyboard.press('Home');
    assert.equal(await page.locator('.calendar-day.is-selected').getAttribute('data-calendar-date'), '1582,11,1');
  });
  await check('2033 leap month, BCE year and invalid reform date', async () => {
    await jump(2033, 12, 22); assert.match(await page.locator('.day-sidebar').textContent(), /闰十一/);
    await jump('B1', 1, 1); assert.equal(await page.locator('.calendar-day.is-selected').getAttribute('data-calendar-date'), '0,1,1');
    await page.locator('[data-action="prev-month"]').click();
    assert.match(await page.locator('.calendar-title').textContent(), /前.*2/);
    await page.locator('[data-action="open-date"]').click();
    await page.locator('#jump-year').fill('1582'); await page.locator('#jump-month').selectOption('10'); await page.locator('#jump-day').fill('10');
    await page.locator('#date-form button[type="submit"]').click();
    assert.equal(await page.locator('#date-dialog').isVisible(), true);
    assert.ok((await page.locator('#date-error').textContent()).length > 0);
    await page.locator('#date-dialog [data-action="close-dialog"]').first().click();
    await jump(2026, 10, 6);
  });
  await check('lunar new-year zodiac boundary and constellation label', async () => {
    await jump(2026, 1, 1);
    assert.match(await page.locator('.lunar-overview .overview-sub').textContent(), /蛇年/);
    assert.equal((await page.locator('.day-sidebar').textContent()).includes('座座'), false);
    const constellation = page.locator('.day-facts div').filter({ has: page.locator('dt', { hasText: '星座' }) });
    assert.match(await constellation.locator('dd').textContent(), /座$/);
    await jump(2026, 10, 6);
  });
  await check('mouse day preview, Control retention and click selection', async () => {
    await jump(2026, 10, 6);
    const followingDay = page.locator('.calendar-day[data-calendar-date="2026,10,7"]');
    await followingDay.hover();
    const preview = page.locator('#day-hover-preview');
    assert.equal(await preview.isVisible(), true);
    assert.match(await preview.textContent(), /2026年10月7日/);
    assert.equal(await page.locator('.calendar-day.is-selected').getAttribute('data-calendar-date'), '2026,10,6');
    await page.keyboard.down('Control'); await page.mouse.move(1400, 20);
    assert.equal(await preview.isVisible(), true);
    assert.match(await preview.textContent(), /2026年10月7日/);
    await page.keyboard.up('Control');
    assert.equal(await preview.isVisible(), false);
    await followingDay.click();
    assert.equal(await page.locator('.calendar-day.is-selected').getAttribute('data-calendar-date'), '2026,10,7');
    assert.equal(await preview.isVisible(), false);
  });
  await check('annual reports, both display modes and multi-year generation', async () => {
    await navigate(2); await page.locator('#Cp2_y').fill('2033'); await page.locator('#Cp2_n').fill('2');
    await action('getNianLi', 0); assert.match(await page.locator('#Cal7').textContent(), /2033/);
    await page.locator('#Cp2_tg').uncheck(); await action('getNianLiN');
    assert.equal(await page.locator('#Cal7 .feature-year').count(), 2);
    assert.match(await page.locator('#Cal7').textContent(), /2034/);
  });
  await check('ten ephemerides and all forty-five astronomical event buttons', async () => {
    await navigate(5); await page.locator('#Cd_n').fill('1');
    for (let body = 1; body <= 10; body++) { await page.locator('#Cd_xt').selectOption(String(body)); await action('pCalc'); assert.ok((await page.locator('#Cd_tab').inputValue()).length > 100); }
    await navigate(6); await page.locator('#Ce_n').fill('1');
    const buttons = page.locator('[data-feature-page="6"] [data-action="tianXiang"]');
    assert.equal(await buttons.count(), 45);
    for (let index = 0; index < 45; index++) {
      await buttons.nth(index).click(); await page.waitForFunction(() => !document.querySelector('#feature-view').hasAttribute('aria-busy')); await noFeatureError();
      assert.ok((await page.locator('#Ce_tab').inputValue()).length > 30);
    }
  });
  await check('star library selection, editable catalog and three coordinate modes', async () => {
    await navigate(7); assert.equal(await page.locator('#Cf_xk option').count(), 90);
    await page.locator('#Cf_n').fill('1'); await page.locator('#Cf_xk').selectOption('1000');
    assert.ok((await page.locator('#Cf_db').inputValue()).length > 100);
    for (const mode of ['0', '1', '2']) { await page.locator('#Cf_lx').selectOption(mode); await action('aCalc'); assert.ok((await page.locator('#Cf_xl').inputValue()).length > 100); }
    await page.locator('#Cf_nsn').check(); await page.locator('#Cf_ut').uncheck(); await action('aCalc');
  });
  await check('four moon phases, arbitrary angle, solar terms and pentads', async () => {
    await navigate(8); await page.locator('#Cp8_y').fill('2033'); await page.locator('#Cp8_n').fill('3');
    for (const phase of [0, 90, 180, 270]) { await action('suoCalc', phase); assert.equal(await page.locator('#Cp8_out tbody tr').count(), 3); }
    await page.locator('#Cp8_angle').fill('37.5'); await action('suoCalc', -1); assert.match(await page.locator('#Cp8_out').textContent(), /37.5/);
    await action('qiCalc'); await action('houCalc'); assert.equal(await page.locator('#Cp8_out tbody tr').count(), 3);
  });
  await check('sun/moon daily rise/set and complete annual tables', async () => {
    await navigate(9); await action('shengjiang'); assert.equal(await page.locator('#Cp9_out tbody tr').count(), 7);
    await action('shengjiang2'); assert.equal(await page.locator('#Cp9_out tbody tr').count(), 368);
    await action('shengjiang3'); assert.equal(await page.locator('#Cp9_out tbody tr').count(), 368);
  });
  await check('sun/moon eclipses, phase stepping and realtime coordinate pause', async () => {
    await navigate(3); await page.locator('#Cb_y').fill('2009'); await page.locator('#Cb_m').fill('7'); await page.locator('#Cb_d').fill('22'); await page.locator('#Cb_t').fill('09:40:00');
    await action('tu_calc', 2); assert.ok(await canvasHasInk('#Can1'));
    await page.locator('#Cb_nasa').check(); await page.locator('#Cb_sjzb').check();
    for (const mode of [1, 3, 4, 5, 6, 7, 8, 9]) await action('tu_calc', mode);
    const old = await page.locator('#Cal_zb').innerHTML(); await page.locator('#Cal_pause').uncheck();
    await page.waitForFunction((previous) => document.querySelector('#Cal_zb').innerHTML !== previous, old);
    await page.locator('#Cal_pause').check(); await noFeatureError();
  });
  await check('multi-location solar eclipse table and NASA radius switch', async () => {
    await navigate(4); await page.locator('#Cc_y').fill('2009'); await page.locator('#Cc_m').fill('7'); await page.locator('#Cc_d').fill('22');
    await page.locator('#Cc_db').fill('*地名,纬度,经度,海拔(米)\n上海,31.23,121.46,5 # 北京,39.93,116.37,31');
    await action('dfRS', 0); assert.match(await page.locator('#Cc_tb').inputValue(), /上海\[全\]/);
    await page.locator('#Cc_nasa').check(); await action('dfRS', 0); await action('dfRS', 1); await action('dfRS', 2);
  });
  await check('eclipse search, boundary table, all nine projections and moving shadow', async () => {
    await navigate(10); await page.locator('#Cp10_an').fill('24'); await action('tuGL_search', 0);
    assert.ok(await page.locator('.feature-eclipse-result').count() > 0); await action('tuGL_search', 1);
    await page.locator('.feature-eclipse-result').first().click(); await page.waitForFunction(() => !document.querySelector('#feature-view').hasAttribute('aria-busy')); await noFeatureError();
    await page.locator('#Cp10_showJX').check(); await action('tu2_calc', 2);
    for (let projection = 0; projection <= 8; projection++) { await page.locator('#Cp10_tylx').selectOption(String(projection)); await action('tu3_xz', 4); }
    assert.ok(await canvasHasInk('#Can3'));
    await action('tu2_jxb'); assert.ok((await page.locator('#Cp10_tz').textContent()).length > 100);
    await action('tu3_yingzi', 0); const before = Number(await page.locator('#Cp10_jd2').inputValue()); await action('tu3_yingzi', 2);
    assert.ok(Number(await page.locator('#Cp10_jd2').inputValue()) > before);
    await page.locator('#Cp10_showJX').uncheck(); await page.locator('#Cp10_bn').fill('2'); await action('tu2_calc', 5); assert.equal(await page.locator('#Can2').isVisible(), true);
  });
  await check('four pillars and true solar time', async () => {
    await navigate(11); await page.locator('#Cml_y').fill('2026'); await page.locator('#Cml_his').fill('23:30:00'); await action('ML_calc');
    assert.equal(await page.locator('.feature-bazi strong').count(), 4); assert.match(await page.locator('#Cal6').textContent(), /真太阳时/);
    await action('ML_settime');
  });
  await check('Julian tools, nine pi algorithms, diagnostics and validation messages', async () => {
    await navigate(12); await page.locator('#GJ1_jd').fill('-1'); await action('GJ1_calc1'); assert.match(await page.locator('#GJ1_out').textContent(), /不能为负/);
    await page.locator('#GJ1_jd').fill('2451545'); await action('GJ1_calc1');
    for (let mode = 0; mode <= 3; mode++) await action('GJ1_calc2', mode);
    for (let mode = 0; mode <= 5; mode++) { await action('GJ2_pi1', mode); assert.equal(await page.locator('#GJ2_out tbody tr').count(), 30); }
    await action('GJ2_pi2'); await page.locator('#GJ2_N').fill('50'); await action('GJ2_pi'); await action('GJ2_machin'); assert.match(await page.locator('#GJ2_out').textContent(), /1415926535/);
    for (const diagnostic of ['term-precision', 'moon-precision', 'term-speed', 'moon-speed']) {
      const button = page.locator(`[data-diagnostic="${diagnostic}"]`); await button.click(); await page.waitForFunction(() => !document.querySelector('[data-diagnostic="term-precision"]').disabled); assert.ok((await page.locator('.diagnostic-output').textContent()).length > 20);
    }
    await page.locator('.diagnostic-coordinates summary').click(); await page.locator('[data-diagnostic="coordinates"]').click(); await page.waitForFunction(() => !document.querySelector('[data-diagnostic="coordinates"]').disabled);
    assert.match(await page.locator('.diagnostic-output').textContent(), /月球黄经/);
    await action('GJ2_cls'); assert.equal((await page.locator('#GJ2_out').textContent()).trim(), '');
    await navigate(5); await page.locator('#Cd_n').fill('0');
    await page.locator('[data-action="pCalc"]').click(); await page.waitForFunction(() => !document.querySelector('#feature-view').hasAttribute('aria-busy'));
    assert.equal(await page.locator('.feature-feedback--error').isVisible(), true);
    await page.locator('#Cd_n').fill('1'); await action('pCalc');
  });
  await check('all original help chapters and chapter-six interactive fitting', async () => {
    await navigate(14); assert.equal(await page.locator('[data-chapter]').count(), 9);
    for (let chapter = 1; chapter <= 9; chapter++) {
      await page.locator(`[data-chapter="${chapter}"]`).click(); assert.ok((await page.locator('#help-article').textContent()).length > 250);
      const images = await page.locator('#help-article img').evaluateAll((items) => items.map((image) => image.src));
      for (const source of images) assert.ok((await page.request.get(source)).ok(), `missing help image: ${source}`);
    }
    await page.locator('[data-chapter="6"]').click(); await page.locator('[data-action="fit"]').click(); assert.match(await page.locator('#Cjg').inputValue(), /^k=29\.530/);
    await page.locator('#Cn').fill('0'); await page.locator('[data-action="fit"]').click(); assert.match(await page.locator('#Cjg').inputValue(), /1 至 100000/);
  });
  await check('standalone eclipse boundary map, zoom, coordinates and input validation', async () => {
    await navigate(15); assert.match(await page.locator('.eclipse-map__event').textContent(), /全|T/); assert.ok(await canvasHasInk('.eclipse-map__canvas'));
    const zoom = await page.locator('.eclipse-map__zoom').textContent(); await page.locator('[data-map-action="zoom-in"]').click(); await page.waitForFunction((before) => document.querySelector('.eclipse-map__zoom').textContent !== before, zoom); assert.notEqual(await page.locator('.eclipse-map__zoom').textContent(), zoom);
    await page.locator('.eclipse-map__canvas').click({ position: { x: 160, y: 120 } }); await page.waitForFunction(() => !document.querySelector('.eclipse-map__selected').textContent.includes('点击地图')); assert.match(await page.locator('.eclipse-map__selected').textContent(), /所选地点.*°[EW].*°[NS]/);
    await page.locator('.eclipse-map__canvas').focus(); await page.keyboard.press('ArrowRight'); await page.keyboard.press('Home'); await page.waitForFunction((expected) => document.querySelector('.eclipse-map__zoom').textContent === expected, zoom); assert.equal(await page.locator('.eclipse-map__zoom').textContent(), zoom);
    await page.locator('.eclipse-map__form [name="year"]').fill('2026'); await page.locator('.eclipse-map__form [name="month"]').fill('10'); await page.locator('.eclipse-map__form [name="day"]').fill('6');
    await page.locator('.eclipse-map__form button[type="submit"]').click(); await page.waitForFunction(() => !document.querySelector('.eclipse-map__form button[type="submit"]').disabled); assert.match(await page.locator('.eclipse-map__event').textContent(), /无日食|没有日食/);
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const before = await page.locator('.eclipse-map__canvas').evaluate((canvas) => canvas.toDataURL());
    await page.locator('.eclipse-map__form [name="year"]').fill('invalid'); await page.locator('.eclipse-map__form button[type="submit"]').click();
    assert.equal(await page.locator('.eclipse-map__error').isVisible(), true); assert.equal(await page.locator('.eclipse-map__canvas').evaluate((canvas) => canvas.toDataURL()), before);
  });
  await check('settings persistence, dark theme, week start and unified region selection', async () => {
    await page.locator('[data-action="open-settings"]').first().click();
    await advancedSettings(); await page.locator('#location-mode').selectOption('custom'); await page.locator('#timezone-mode').selectOption('fixed');
    await page.locator('#location-name').fill('回归观测点'); await page.locator('#location-longitude').fill('-46.63'); await page.locator('#location-latitude').fill('-23.55'); await page.locator('#location-timezone').fill('-3');
    await page.locator('#settings-theme').selectOption('dark'); await page.locator('#settings-week-start').selectOption('1'); await page.locator('#settings-form button[type="submit"]').click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark'); assert.equal(await page.locator('#location-label').textContent(), '回归观测点');
    await page.reload({ waitUntil: 'networkidle' }); assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark'); assert.equal(await page.locator('#location-label').textContent(), '回归观测点');
    await page.locator('[data-action="open-settings"]').first().click(); assert.equal(await page.locator('#location-timezone').inputValue(), '-3'); assert.equal(await page.locator('#settings-week-start').inputValue(), '1'); await page.locator('#settings-dialog [data-action="close-dialog"]').first().click();
    await page.locator('[data-action="open-settings"]').first().click(); await page.locator('#calendar-continent').selectOption('欧洲'); await page.locator('#calendar-country').selectOption('GB'); await page.locator('#settings-form button[type="submit"]').click();
    await page.locator('[data-action="open-settings"]').first().click(); assert.equal(await page.locator('#calendar-country').inputValue(), 'GB'); assert.equal(await page.locator('#timezone-mode').inputValue(), 'region'); await page.locator('#settings-dialog [data-action="close-dialog"]').first().click();
  });
  await check('same-coordinate city selection preserves Xiangcheng district', async () => {
    await page.locator('[data-action="open-settings"]').first().click();
    await page.locator('#calendar-continent').selectOption('亚洲'); await page.locator('#calendar-country').selectOption('CN');
    await page.locator('#location-province').selectOption({ label: '福建省' });
    await page.locator('#location-city').selectOption({ label: '芗城区' });
    assert.equal(await page.locator('#location-name').inputValue(), '芗城区');
    assert.equal(await page.locator('#location-city option:checked').textContent(), '芗城区');
    await page.locator('#settings-form button[type="submit"]').click();
    assert.equal(await page.locator('#location-label').textContent(), '芗城区');
    await page.reload({ waitUntil: 'networkidle' });
    await page.locator('[data-action="open-settings"]').first().click();
    assert.equal(await page.locator('#location-name').inputValue(), '芗城区');
    assert.equal(await page.locator('#location-city option:checked').textContent(), '芗城区');
    await page.locator('#settings-dialog [data-action="close-dialog"]').first().click();
  });
  await check('mobile navigation and no page-level horizontal overflow', async () => {
    const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'zh-CN', timezoneId: 'Asia/Shanghai' });
    page = await mobile.newPage(); observe(page); await page.goto(baseURL, { waitUntil: 'networkidle' }); await useChinaProfile();
    for (const id of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]) {
      await navigate(id); await noFeatureError();
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      assert.ok(overflow <= 2, `page ${id} horizontal overflow ${overflow}px`);
    }
    await navigate(1); await jump(2033, 12, 22); assert.match(await page.locator('.day-sidebar').textContent(), /闰十一/);
    // 最后统一关闭浏览器；部分 serverless 单进程 Chromium 不支持单独关闭第二个 context。
  });
  await check('no uncaught browser exceptions or failed asset requests', async () => { assert.deepEqual(pageErrors, []); assert.deepEqual(failedRequests, []); });
} finally {
  await browser?.close(); await new Promise((resolve) => server.close(resolve));
}
const report = { timestamp: new Date().toISOString(), browser: 'Chromium', browserVersion, build: 'dist', filter: process.env.SMOKE_FILTER || null, passed: results.filter((result) => result.passed).length, failed: results.filter((result) => !result.passed).length, results, pageErrors, failedRequests };
const reportPath = resolve(process.env.SMOKE_REPORT || resolve(project, 'docs/browser-smoke-current.json'));
await mkdir(dirname(reportPath), { recursive: true }); await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n');
console.log(`Browser smoke: ${report.passed} passed, ${report.failed} failed. Report: ${reportPath}`);
if (report.failed || results.length === 0) process.exitCode = 1;
