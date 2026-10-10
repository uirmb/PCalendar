import { JD, J2000 } from './engine/engine.js';
import { createFeatureWorkspace } from './features/index.js';
import { createHelpView } from './help-view.js';
import { createEclipseMap } from './eclipse-map.js';
import { mountDayPreview } from './hover-preview.js';
import { renderCalendar, monthData, selectedDay, shiftMonth, dateSummary, formatOffset } from './calendar-view.js';
import { renderYearCalendar } from './year-view.js';
import { icon } from './lib/icons.js';
import { html, element, notify, parseYear, pad } from './lib/dom.js';
import { initialState, saveSettings } from './lib/state.js';
import { dateTimeAt, offsetAtUT, formatUTCOffset } from './lib/time.js';
import { getCountries, getCities, getCity, getDefaultCity, resolveWeekStart } from './lib/regions.js';
import { formatClock, formatDate } from './lib/format.js';
import { DEFAULT_CALENDAR_LAYERS, getLocalCalendarCoverage } from './lib/local-calendars.js';
const appVersion = '1.4.0';
import { tr, LOCALE_NAMES, SUPPORTED_LOCALES, localeCountryName } from './lib/i18n.js';
import './settings-local.css';
import './year-view.css';
const calendarLayers = [
    { key: 'usCultural', label: '常见文化日期', description: '情人节、母亲节、万圣节、平安夜与跨年夜等。' },
    { key: 'nycCivic', label: '纽约重要日期', description: '选举日等当地日期；具体休假由相应机构决定。', nyc: true },
    { key: 'nycSchools', label: '纽约公校日历', description: '区分停课、远程上课和提前放学；日期详情标注适用学段。', nyc: true },
    { key: 'nycParking', label: '纽约停车提醒', description: '街道清扫换边停车（ASP）计划暂停；其他停车限制仍需遵守。', nyc: true },
    { key: 'commercial', label: '商业纪念日', description: '黑色星期五与网络星期一；不代表放假。' },
];
const pages = [
    { id: 1, label: '月历', icon: 'calendar', description: '观天知时，循历而行。', group: '历法' },
    { id: 2, label: '年历', icon: 'year', description: '查看一年的农历月序、交节时刻与干支。', group: '历法' },
    { id: 8, label: '节气与月相', icon: 'leaf', description: '精确计算定气、定候与日月相位。', group: '历法' },
    { id: 11, label: '干支与八字', icon: 'compass', description: '由日期、时刻与经度推算干支及真太阳时。', group: '历法' },
    { id: 3, label: '日月食', icon: 'eclipse', description: '观察日月位置、食象时刻与食带演变。', group: '天文' },
    { id: 4, label: '地方日食', icon: 'pin', description: '为多个观测地点计算日食时刻与食分。', group: '天文' },
    { id: 10, label: '日食概略', icon: 'globe', description: '检索日食、查看贝塞尔特征与全球食带投影。', group: '天文' },
    { id: 5, label: '行星星历', icon: 'orbit', description: '太阳系天体的坐标、距离与观测星历。', group: '天文' },
    { id: 6, label: '天象推算', icon: 'sparkle', description: '推算合、冲、大距、留与日月近远点等天象。', group: '天文' },
    { id: 7, label: '恒星星历', icon: 'stars', description: '恒星库、视位置、站坐标与平位置计算。', group: '天文' },
    { id: 9, label: '日月升降', icon: 'rise', description: '查阅升起、中天、落下、晨昏及年度时差。', group: '天文' },
    { id: 15, label: '日食界线地图', icon: 'globe', description: '在离线地图上缩放、移动和查阅日食界线。', group: '工具与资料' },
    { id: 12, label: '计算工具', icon: 'calculator', description: '儒略日换算、日期差、圆周率与算法校验。', group: '工具与资料' },
    { id: 13, label: '天文常数', icon: 'book', description: '查阅原版采用的常数、质量系统与年月长度。', group: '工具与资料' },
    { id: 14, label: '算法与说明', icon: 'help', description: '阅读寿星天文历的原作说明与算法推导。', group: '工具与资料' },
];
export function createApp(root) {
    const state = initialState();
    const countries = getCountries();
    const locations = getCities('CN');
    const provinces = [...new Set(locations.map((location) => location.province))];
    const continents = [...new Set(countries.map((country) => country.continent))];
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    let oldFocus = null;
    let helpView;
    let eclipseMap;
    let yearFilter = 'all';
    root.innerHTML = `<div class="app-shell">
    <div class="sidebar-backdrop" data-action="close-menu" hidden></div>
    <aside class="sidebar" id="app-sidebar" aria-label="主导航">
      <a class="brand" href="#" data-page="1" aria-label="寿星天文历首页"><span class="brand-symbol">${icon('orbit')}</span><span><strong>寿星天文历</strong><small>SHOUXING CALENDAR</small></span></a>
      <div class="sidebar-scroll">${['历法', '天文', '工具与资料'].map((group) => `<div class="nav-group"><span class="nav-group-label">${group}</span><nav aria-label="${group}">${pages.filter((page) => page.group === group).map((page) => `<button class="nav-item" data-page="${page.id}" title="${page.label}"${page.id === 1 ? ' aria-current="page"' : ''}>${icon(page.icon)}<span>${page.label}</span>${page.id === 1 ? '<i class="nav-active-dot"></i>' : ''}</button>`).join('')}</nav></div>`).join('')}</div>

      <div class="sidebar-credit"><span class="status-dot"></span>经典历法，历久弥新<span>V5.09</span></div>
    </aside>

    <div class="main-shell">
      <header class="app-header"><div class="header-left"><button class="button button--ghost button--icon-only mobile-menu" data-action="toggle-menu" aria-controls="app-sidebar" aria-expanded="false" aria-label="打开导航">${icon('menu')}</button><span class="breadcrumb">工作台</span>${icon('chevronRight')}<strong id="breadcrumb-current">月历</strong></div><div class="header-actions"><button class="place-time-button" data-action="open-settings" aria-haspopup="dialog" aria-controls="settings-dialog" aria-label="地区与日历"><span class="place-time-icon">${icon('pin')}</span><span class="place-time-copy"><span class="place-time-title"><strong id="location-label"></strong><span id="location-country-label"></span><span id="location-timezone-label"></span></span><time id="local-clock"></time></span>${icon('chevronDown')}</button><select class="header-locale input" id="quick-locale" aria-label="界面语言">${SUPPORTED_LOCALES.map((locale) => `<option value="${locale}">${html(LOCALE_NAMES[locale])}</option>`).join('')}</select><button class="button button--ghost button--icon-only" data-action="toggle-theme" aria-label="切换深浅主题" title="切换深浅主题"><span id="theme-icon">${icon('moon')}</span></button></div></header>
      <main id="main-content" tabindex="-1"><section class="page-heading"><div><span class="eyebrow" id="page-eyebrow">日月有序 · 四时有节</span><h1 id="page-title">每一天，都有迹可循。<span class="heading-star">✧</span></h1><p id="page-description">观天知时，循历而行。</p></div><div class="page-heading-right"><span class="chip chip--secondary">${icon('sparkle')}寿星天文历</span><span class="heading-date" id="heading-date"></span></div></section>
        <div id="calendar-view"></div><div id="year-view" hidden></div><div id="feature-view" class="feature-workspace" hidden></div><div id="help-view" hidden></div><div id="eclipse-map-view" hidden></div>
      </main>
      <footer class="statusbar"><span>历法与天文算法：许剑伟 · 寿星天文历</span><span id="status-location"></span><span class="statusbar-right"><span class="status-dot"></span>国际日历 ${html(appVersion)} · 本地计算</span></footer>
    </div>
  </div><div id="toast-host" class="toast-host" aria-live="polite"></div>

  <dialog id="date-dialog" class="app-dialog"><form id="date-form"><header class="dialog-heading"><div><span class="eyebrow">穿越时间</span><h2>跳转到日期</h2></div><button type="button" class="button button--ghost button--icon-only" data-action="close-dialog" aria-label="关闭">${icon('close')}</button></header><div class="dialog-body"><label class="field-label">年份<input class="input" id="jump-year" name="year" type="text" inputmode="text" required autocomplete="off"></label><div class="field-row"><label class="field-label">月份<select class="input" id="jump-month">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i + 1} 月</option>`).join('')}</select></label><label class="field-label">日期<input class="input" id="jump-day" type="number" min="1" max="31" step="1" required></label></div><p class="field-hint">支持公元前纪年：B212、*212 和 -211 均表示公元前 212 年。年份范围为天文纪年 -4712 至 9999。</p><div class="quick-year-buttons"><button type="button" class="button button--secondary button--sm" data-jump-year="1582">1582 · 改历</button><button type="button" class="button button--secondary button--sm" data-jump-year="2000">2000 · 千禧</button><button type="button" class="button button--secondary button--sm" data-jump-year="2033">2033 · 闰月</button></div><p class="form-error" id="date-error" role="alert"></p></div><footer class="dialog-footer"><button type="button" class="button button--secondary" data-action="close-dialog">取消</button><button class="button button--primary" type="submit">前往日期 ${icon('chevronRight')}</button></footer></form></dialog>

  <dialog id="settings-dialog" class="app-dialog place-time-dialog" aria-labelledby="settings-title"><form id="settings-form">
    <header class="dialog-heading"><div><span class="eyebrow">地区 · 时间 · 当地生活</span><h2 id="settings-title">地区与日历</h2></div><button type="button" class="button button--ghost button--icon-only" data-action="close-dialog" aria-label="关闭">${icon('close')}</button></header>
    <div class="dialog-body">
      <div class="settings-time-preview"><span>${icon('clock')} 所选时区当前时间</span><time id="settings-clock-preview"></time><small id="settings-zone-preview"></small></div>
      <section class="settings-section" aria-labelledby="settings-region-heading"><h3 id="settings-region-heading">日历地区</h3>
        <div class="field-row"><label class="field-label">大洲<select class="input" id="calendar-continent">${continents.map((continent) => `<option>${html(continent)}</option>`).join('')}</select></label><label class="field-label">国家 / 地区<select class="input" id="calendar-country"></select></label></div>
        <div class="field-row" id="china-city-fields"><label class="field-label">省份 / 地区<select class="input" id="location-province">${provinces.map((province) => `<option>${html(province)}</option>`).join('')}</select></label><label class="field-label">城市 / 观测点<select class="input" id="location-city"></select></label></div>
        <label class="field-label" id="international-city-field">城市 / 时区参考地点<select class="input" id="calendar-city"></select></label>
        <p class="field-hint" id="region-city-note">选择城市会同步观测坐标和时区。</p>
        <div class="settings-coverage" id="calendar-coverage" role="status"></div>
      </section>
      <section class="settings-section local-calendar-settings" id="settings-calendar-layers" aria-labelledby="settings-layers-heading" hidden><h3 id="settings-layers-heading">显示哪些日历</h3>
        <p class="field-hint">美国联邦节日、四季与月相自动显示。以下选择会保存，切换地区后仍可恢复。</p>
        <div class="calendar-layer-options">${calendarLayers.map((layer) => `<label class="calendar-layer-option"${layer.nyc ? ' data-nyc-layer' : ''}><input type="checkbox" id="settings-layer-${layer.key}"${DEFAULT_CALENDAR_LAYERS[layer.key] ? ' checked' : ''}><span><strong>${layer.label}</strong><small>${layer.description}</small></span></label>`).join('')}</div>
        <div id="calendar-layer-coverage" class="calendar-layer-coverage" aria-live="polite"></div>
      </section>
      <section class="settings-section" aria-labelledby="settings-time-heading"><h3 id="settings-time-heading">当地时间</h3>
        <label class="field-label">时区<select class="input" id="timezone-id"></select></label>
        <p class="field-hint" id="timezone-rule-note"></p>
        <details class="settings-advanced" id="settings-advanced"><summary>观测与时区高级设置 ${icon('chevronDown')}</summary><div class="settings-advanced-body">
          <div class="field-row"><label class="field-label">观测位置<select class="input" id="location-mode"><option value="city">跟随所选城市</option><option value="custom">自定义观测点</option></select></label><label class="field-label">时区方式<select class="input" id="timezone-mode"><option value="region">地区时区</option><option value="fixed">固定 UTC 偏移</option></select></label></div>
          <div class="settings-location-details"><label class="field-label">观测点名称<input class="input" id="location-name" maxlength="40" required></label><label class="field-label">经度（东经为正）<input class="input" id="location-longitude" type="number" min="-180" max="180" step="any" required></label><label class="field-label">纬度（北纬为正）<input class="input" id="location-latitude" type="number" min="-89.999999" max="89.999999" step="any" required></label></div>
          <label class="field-label" id="fixed-offset-field">固定 UTC 偏移（小时）<input class="input" id="location-timezone" type="number" min="-12" max="14" step="any" required></label>
          <p class="field-hint" id="location-custom-note"></p>
        </div></details>
      </section>
      <section class="settings-section" aria-labelledby="settings-display-heading"><h3 id="settings-display-heading">显示偏好</h3><div class="settings-preferences"><label class="field-label"><span id="settings-locale-label">界面语言</span><select class="input" id="settings-locale">${SUPPORTED_LOCALES.map((locale) => `<option value="${locale}">${html(LOCALE_NAMES[locale])}</option>`).join('')}</select></label><label class="field-label">主题<select class="input" id="settings-theme"><option value="light">浅色</option><option value="dark">深色</option><option value="system">跟随系统</option></select></label><label class="field-label">每周起始<select class="input" id="settings-week-start"><option value="auto">跟随地区</option>${['日', '一', '二', '三', '四', '五', '六'].map((day, index) => `<option value="${index}">星期${day}</option>`).join('')}</select></label><label class="field-label">时钟格式<select class="input" id="settings-clock-format"><option value="auto">跟随地区</option><option value="24">24 小时</option><option value="12">12 小时</option></select></label><label class="field-label">日期格式<select class="input" id="settings-date-format"><option value="auto">跟随地区</option><option value="ymd">年.月.日</option><option value="mdy">月/日/年</option><option value="dmy">日/月/年</option></select></label></div><label class="calendar-layer-option zodiac-preference" id="settings-zodiac-option"><input type="checkbox" id="settings-show-zodiac" checked><span><strong>显示十二星座</strong><small>在当地日期概览与详情中显示星座标签。</small></span></label><p class="field-hint">界面语言与日历地区相互独立；切换语言不会改变国家、城市或计算时区。</p></section>
      <div class="settings-link-note">${icon('calendar')}<p id="settings-link-description">保存后同步地区日历、时钟和观测信息；手动查看的日期会保留。</p></div>
      <p class="form-error" id="settings-error" role="alert"></p>
    </div><footer class="dialog-footer"><button type="button" class="button button--secondary" data-action="close-dialog">取消</button><button class="button button--primary" type="submit">保存并联动 ${icon('check')}</button></footer>
  </form></dialog>`;
    const timezoneAt = (ut) => offsetAtUT(state.settings, ut);
    const timezoneKey = (settings) => JSON.stringify([settings.timezoneMode, settings.timezoneMode === 'region' ? settings.timezoneId : settings.timezone]);
    let clockDateKey = '';
    function context() { return { year: state.year, month: state.month, day: state.selectedDay, longitude: state.settings.longitude, latitude: state.settings.latitude, locationName: state.settings.city, timezone: state.settings.timezone, timezoneAt, timezoneKey: timezoneKey(state.settings), calendarRegion: state.settings.countryCode, onNavigate: navigate }; }
    const workspace = createFeatureWorkspace(element('#feature-view'), context());
    function setTheme() {
        const dark = state.settings.theme === 'dark' || (state.settings.theme === 'system' && systemTheme.matches);
        document.documentElement.dataset.theme = dark ? 'dark' : 'light';
        document.documentElement.classList.toggle('dark', dark);
        element('#theme-icon').innerHTML = icon(dark ? 'sun' : 'moon');
        element('meta[name="theme-color"]').content = dark ? '#11131b' : '#f7f8fc';
        eclipseMap?.redraw();
    }
    function updateCalendar(update = {}, renderYear = true) {
        state.settings.weekStart = resolveWeekStart(state.settings);
        element('#calendar-view').innerHTML = renderCalendar(state);
        if (renderYear && state.page === 2 && state.settings.countryCode !== 'CN')
            element('#year-view').innerHTML = renderYearCalendar(state, yearFilter);
        element('#location-label').textContent = state.settings.city;
        element('#location-country-label').textContent = countries.find((country) => country.code === state.settings.countryCode)?.name ?? state.settings.countryCode;
        const zone = state.settings.timezoneMode === 'region' ? timezoneLabel(state.settings.timezoneId) : formatOffset(state.settings.timezone);
        element('#status-location').textContent = `${state.settings.longitude.toFixed(2)}° ${state.settings.latitude.toFixed(2)}° · ${zone}`;
        element('#heading-date').textContent = `${state.year <= 0 ? `公元前 ${1 - state.year}` : state.year} 年 ${state.month} 月`;
        if (Object.keys(update).length)
            workspace.updateContext(update);
    }
    function setDate(year, month, day, followToday = false) {
        if (year < -4712 || year > 9999)
            throw new Error('已到达支持的年份边界（-4712 至 9999）。');
        const calendar = monthData(year, month);
        const chosen = calendar.days.find((value) => value.d === day) ?? calendar.days.find((value) => value.d > day) ?? calendar.days.at(-1);
        state.year = year;
        state.month = month;
        state.selectedDay = chosen.d;
        state.followToday = followToday;
        updateCalendar({ year, month, day: chosen.d });
    }
    function moveMonth(delta) { const next = shiftMonth(state.year, state.month, delta); setDate(next.year, next.month, state.selectedDay); }
    function setMenu(open) {
        element('#app-sidebar').classList.toggle('is-open', open);
        element('.sidebar-backdrop').hidden = !open;
        element('[data-action="toggle-menu"]').setAttribute('aria-expanded', String(open));
        if (open) {
            oldFocus = document.activeElement;
            element('.nav-item[aria-current="page"]').focus();
        }
        else if (oldFocus) {
            oldFocus.focus();
            oldFocus = null;
        }
    }
    function availablePages() {
        const china = state.settings.countryCode === 'CN';
        return pages.filter((page) => china || page.id !== 11).map((page) => {
            if (page.id === 2 && !china)
                return { ...page, label: tr(state.settings.locale, '公历年历'), description: '查看十二个月、全年节日和当地天文事件。' };
            if (page.id === 8 && !china)
                return { ...page, label: tr(state.settings.locale, '季节与月相'), icon: 'leaf', description: '查看四季开始、月相及所选地点的当地时刻。' };
            return { ...page, label: tr(state.settings.locale, page.label), group: page.group };
        });
    }
    function renderNavigation() {
        element('.sidebar-scroll').innerHTML = ['历法', '天文', '工具与资料'].map((group) => {
            const label = tr(state.settings.locale, group === '历法' && state.settings.countryCode !== 'CN' ? '历法' : group);
            return `<div class="nav-group"><span class="nav-group-label">${label}</span><nav aria-label="${label}">${availablePages().filter((page) => page.group === group).map((page) => `<button class="nav-item" data-page="${page.id}" title="${page.label}"${page.id === state.page ? ' aria-current="page"' : ''}>${icon(page.icon)}<span>${page.label}</span>${page.id === 1 ? '<i class="nav-active-dot"></i>' : ''}</button>`).join('')}</nav></div>`;
        }).join('');
    }
    function updatePageHeading(definition) {
        const country = countries.find((item) => item.code === state.settings.countryCode);
        const countryDisplay = country ? localeCountryName(state.settings.locale, country.code, country.name) : state.settings.countryCode;
        const china = state.settings.countryCode === 'CN';
        element('#breadcrumb-current').textContent = definition.label;
        element('#page-eyebrow').textContent = definition.id === 1 ? china ? '日月有序 · 四时有节' : `${countryDisplay} · 当地日历` : `${definition.group} / 寿星天文历`;
        element('#page-title').innerHTML = definition.id === 1 ? '每一天，都有迹可循。<span class="heading-star">✧</span>' : html(definition.label);
        element('#page-description').textContent = definition.id === 1 && !china ? country?.holidayCoverage === 'us' ? state.settings.municipalityCode === 'US-NYC' ? '纽约当地日期、节日与生活安排，随四季与月相一起查看。' : '当地日期、美国节日与天象，一起查看。' : country?.holidayCoverage === 'global' ? '查看当地公共假日、季节、月相与天文信息。' : '查看当地日期与天象；未覆盖的公共假日不会推断。' : definition.description;
        document.title = `${definition.label} · ${countryDisplay} · 寿星天文历`;
    }
    function navigate(page) {
        const definition = availablePages().find((item) => item.id === page);
        if (!definition)
            return;
        state.page = page;
        const yearView = page === 2 && state.settings.countryCode !== 'CN';
        element('#calendar-view').hidden = page !== 1;
        element('#year-view').hidden = !yearView;
        element('#feature-view').hidden = page === 1 || page === 14 || page === 15 || yearView;
        element('#help-view').hidden = page !== 14;
        element('#eclipse-map-view').hidden = page !== 15;
        root.querySelectorAll('.nav-item').forEach((button) => {
            if (Number(button.dataset.page) === page)
                button.setAttribute('aria-current', 'page');
            else
                button.removeAttribute('aria-current');
        });
        updatePageHeading(definition);
        if (yearView) {
            element('#year-view').innerHTML = renderYearCalendar(state, yearFilter);
            workspace.setPage(0);
        }
        else if (page === 14) {
            if (!helpView)
                helpView = createHelpView(element('#help-view'));
            workspace.setPage(0);
        }
        else if (page === 15) {
            if (!eclipseMap)
                eclipseMap = createEclipseMap(element('#eclipse-map-view'));
            workspace.setPage(0);
            eclipseMap.redraw();
        }
        else
            workspace.setPage(page === 1 ? 0 : page);
        setMenu(false);
    }
    function fillCities(preferred) {
        const province = element('#location-province').value;
        const list = locations.filter((location) => location.province === province);
        const select = element('#location-city');
        select.innerHTML = list.map((location) => `<option value="${html(location.id)}">${html(location.name)}</option>`).join('');
        const chosen = list.find((location) => location.id === preferred || location.name === preferred);
        if (chosen)
            select.value = chosen.id;
    }
    function selectedCity() {
        return getCity(element('#calendar-country').value === 'CN'
            ? element('#location-city').value
            : element('#calendar-city').value);
    }
    function timezoneLabel(id) {
        try {
            return new Intl.DateTimeFormat('zh-CN', { timeZone: id, timeZoneName: 'longGeneric' }).formatToParts(new Date()).find((part) => part.type === 'timeZoneName')?.value ?? id;
        }
        catch {
            return id;
        }
    }
    function fillTimezones(preferred) {
        const countryCode = element('#calendar-country').value;
        const choice = selectedCity();
        const zones = new Map();
        if (choice)
            zones.set(choice.timezoneId, choice.name);
        for (const city of getCities(countryCode))
            if (!zones.has(city.timezoneId))
                zones.set(city.timezoneId, city.name);
        const current = preferred || choice?.timezoneId || 'Etc/UTC';
        if (!zones.has(current))
            zones.set(current, '自定义时区');
        element('#timezone-id').innerHTML = [...zones].map(([id, name]) => `<option value="${html(id)}">${html(timezoneLabel(id))} · ${html(name)}</option>`).join('');
        element('#timezone-id').value = current;
    }
    function fillCountries(preferred) {
        const continent = element('#calendar-continent').value;
        const list = countries.filter((country) => country.continent === continent);
        const select = element('#calendar-country');
        select.innerHTML = list.map((country) => `<option value="${country.code}">${html(localeCountryName(state.settings.locale, country.code, country.name))}</option>`).join('');
        const chosen = list.find((country) => country.code === preferred) ?? list.find((country) => country.code === 'CN' || country.code === 'US') ?? list[0];
        if (chosen)
            select.value = chosen.code;
    }
    function selectedCalendarLayers() {
        const result = { ...DEFAULT_CALENDAR_LAYERS };
        for (const { key } of calendarLayers)
            result[key] = element(`#settings-layer-${key}`).checked;
        return result;
    }
    function updateCoverage() {
        const country = countries.find((item) => item.code === element('#calendar-country').value);
        const city = selectedCity();
        const newYork = country?.code === 'US' && city?.municipalityCode === 'US-NYC';
        const coverage = country?.holidayCoverage === 'china'
            ? ['中国地区日历', '显示农历、节气、干支与中国节日；休班安排按已接入的年份提供。']
            : country?.holidayCoverage === 'us'
                ? [newYork ? '美国 · 纽约州 · 纽约市' : '美国地区日历', newYork ? '美国节日、纽约重要日期与当地天文信息；学校和停车日历可单独开启。' : '显示美国全国节日与当地天文信息；本轮纽约以外的地方日历尚未收录。']
                : [country?.code === 'ZZ' ? '请选择日历地区' : '通用公历与天文', '该地区的节日资料暂未配置。本轮提供当地日期、月相与观测信息。'];
        element('#calendar-coverage').innerHTML = `${icon('calendar')}<div><strong>${coverage[0]}</strong><p>${coverage[1]}</p></div>`;
        element('#settings-calendar-layers').hidden = country?.code !== 'US';
        element('#settings-zodiac-option').hidden = country?.code === 'CN';
        root.querySelectorAll('[data-nyc-layer]').forEach((node) => { node.hidden = !newYork; });
        const localCoverage = getLocalCalendarCoverage({ countryCode: country?.code ?? 'ZZ', subdivisionCode: city?.subdivisionCode ?? '', municipalityCode: city?.municipalityCode ?? '', calendarLayers: selectedCalendarLayers() }, state.year);
        element('#calendar-layer-coverage').innerHTML = localCoverage.map((layer) => `<p${!layer.available || layer.partial ? ' class="is-incomplete"' : ''}><strong>${html(layer.label)}</strong><span>${html(layer.summary)}</span></p>`).join('');
        element('#settings-link-description').textContent = `保存后同步${country?.name ?? '所选地区'}日历、时钟和观测信息；手动查看的日期及专业计算输入会保留。`;
    }
    function fillCountryCities(preferred, apply = true) {
        const countryCode = element('#calendar-country').value;
        const list = getCities(countryCode);
        // 我只在用户主动换国家时采用默认城市，打开旧自定义观测点的设置不会补造城市身份。
        const unspecified = !apply && preferred === '';
        const choice = unspecified ? undefined : list.find((city) => city.id === preferred) ?? getDefaultCity(countryCode);
        const china = countryCode === 'CN';
        element('#china-city-fields').hidden = !china;
        element('#international-city-field').hidden = china;
        if (china) {
            element('#location-province').value = choice?.province ?? provinces[0];
            fillCities(choice?.id);
            if (unspecified) {
                element('#location-city').insertAdjacentHTML('afterbegin', '<option value="">未指定城市（自定义观测点）</option>');
                element('#location-city').value = '';
            }
        }
        else {
            const select = element('#calendar-city');
            select.innerHTML = list.length ? list.map((city) => `<option value="${html(city.id)}">${html(city.name)}${city.province ? ` · ${html(city.province)}` : ''}</option>`).join('') : '<option value="">请先选择国家 / 地区</option>';
            if (unspecified && list.length)
                select.insertAdjacentHTML('afterbegin', '<option value="">未指定城市（自定义观测点）</option>');
            select.disabled = !list.length;
            if (choice)
                select.value = choice.id;
            else if (unspecified)
                select.value = '';
        }
        fillTimezones(choice?.timezoneId);
        if (apply) {
            if (choice)
                applyCity(choice);
            else {
                element('#location-mode').value = 'custom';
                element('#settings-advanced').open = true;
                updateLocationControls();
                updateTimeControls();
            }
        }
        updateCoverage();
    }
    function applyCity(location) {
        element('#location-name').value = location.name;
        element('#location-longitude').value = String(location.longitude);
        element('#location-latitude').value = String(location.latitude);
        element('#location-mode').value = 'city';
        element('#timezone-mode').value = 'region';
        fillTimezones(location.timezoneId);
        updateLocationControls();
        updateTimeControls();
    }
    function chooseCity() {
        const city = selectedCity();
        if (city)
            applyCity(city);
        updateCoverage();
    }
    function updateLocationControls() {
        const custom = element('#location-mode').value === 'custom';
        for (const id of ['#location-name', '#location-longitude', '#location-latitude'])
            element(id).readOnly = !custom;
        const city = selectedCity();
        const country = countries.find((item) => item.code === element('#calendar-country').value);
        element('#region-city-note').textContent = custom
            ? `日历使用${country?.name ?? '所选地区'}内容，天文观测使用下方自定义坐标。`
            : city ? `${city.name} · ${timezoneLabel(city.timezoneId)}。城市选择会同步观测坐标和时区。` : '选择国家和城市后，将自动填入观测坐标与时区。';
        element('#location-custom-note').textContent = custom
            ? `日出、日落和相关地方计算采用这里的坐标，日历节日仍由${country?.name ?? '所选地区'}决定。`
            : '观测坐标跟随上方城市。需要使用其他观测点时，选择“自定义观测点”。';
    }
    function openDialog(id) { element(id).showModal(); }
    function openSettings() {
        const saved = state.settings;
        const country = countries.find((item) => item.code === saved.countryCode) ?? countries.find((item) => item.code === 'CN');
        element('#calendar-continent').value = country.continent;
        fillCountries(country.code);
        element('#settings-locale').value = saved.locale;
        element('#quick-locale').value = saved.locale;
        element('#settings-theme').value = saved.theme;
        element('#settings-week-start').value = saved.weekStartMode === 'auto' ? 'auto' : String(saved.weekStart);
        element('#settings-clock-format').value = saved.clockFormat;
        element('#settings-date-format').value = saved.dateFormat;
        element('#settings-show-zodiac').checked = saved.showZodiac;
        for (const { key } of calendarLayers)
            element(`#settings-layer-${key}`).checked = saved.calendarLayers[key];
        fillCountryCities(saved.cityId, false);
        element('#location-name').value = saved.city;
        element('#location-longitude').value = String(saved.longitude);
        element('#location-latitude').value = String(saved.latitude);
        element('#location-mode').value = saved.locationMode;
        element('#timezone-mode').value = saved.timezoneMode;
        element('#location-timezone').value = String(saved.timezone);
        fillTimezones(saved.timezoneId);
        element('#settings-advanced').open = saved.locationMode === 'custom' || saved.timezoneMode === 'fixed';
        element('#settings-error').textContent = '';
        updateLocationControls();
        updateTimeControls();
        updateCoverage();
        openDialog('#settings-dialog');
    }
    function draftTimeSettings() {
        const selected = selectedCity();
        const countryCode = element('#calendar-country').value;
        const timezoneId = element('#timezone-id').value;
        const week = element('#settings-week-start').value;
        const timezoneCity = getCities(countryCode).find((city) => city.timezoneId === timezoneId);
        const draft = {
            ...state.settings,
            countryCode,
            subdivisionCode: selected?.subdivisionCode ?? '',
            municipalityCode: selected?.municipalityCode ?? '',
            cityId: selected?.id ?? '',
            city: element('#location-name').value.trim() || '自定义观测点',
            province: selected?.province ?? (countryCode === state.settings.countryCode ? state.settings.province : ''),
            longitude: Number(element('#location-longitude').value),
            latitude: Number(element('#location-latitude').value),
            locationMode: element('#location-mode').value === 'custom' ? 'custom' : 'city',
            timezoneId,
            timezoneRegion: timezoneCity?.name ?? timezoneLabel(timezoneId),
            timezoneMode: element('#timezone-mode').value === 'fixed' ? 'fixed' : 'region',
            timezone: Number(element('#location-timezone').value),
            locale: element('#settings-locale').value,
            theme: element('#settings-theme').value,
            weekStartMode: week === 'auto' ? 'auto' : 'custom',
            weekStart: week === 'auto' ? state.settings.weekStart : Number(week),
            clockFormat: element('#settings-clock-format').value,
            dateFormat: element('#settings-date-format').value,
            showZodiac: element('#settings-show-zodiac').checked,
            calendarLayers: selectedCalendarLayers(),
        };
        draft.weekStart = resolveWeekStart(draft);
        if (draft.timezoneMode === 'region')
            draft.timezone = dateTimeAt(draft).offset;
        return draft;
    }
    function clockText(value, settings = state.settings) {
        return `${formatDate(settings, value.year, value.month, value.day)} ${formatClock(settings, `${pad(value.hour)}:${pad(value.minute)}:${pad(value.second)}`)}`;
    }
    function updateSettingsPreview() {
        const input = element('#location-timezone');
        if (element('#timezone-mode').value === 'fixed' && (!input.value || !Number.isFinite(Number(input.value)) || Number(input.value) < -12 || Number(input.value) > 14)) {
            element('#settings-clock-preview').textContent = '—';
            element('#settings-zone-preview').textContent = '请输入 −12 至 +14 小时的 UTC 偏移';
            return;
        }
        try {
            const draft = draftTimeSettings();
            const current = dateTimeAt(draft);
            if (draft.timezoneMode === 'region')
                input.value = String(current.offset);
            const country = countries.find((item) => item.code === draft.countryCode);
            element('#settings-clock-preview').textContent = clockText(current, draft);
            element('#settings-zone-preview').textContent = `${country?.name ?? draft.countryCode} · ${draft.city} · ${formatUTCOffset(current.offset)}`;
        }
        catch {
            element('#settings-clock-preview').textContent = '—';
            element('#settings-zone-preview').textContent = '请选择浏览器支持的地区时区';
        }
    }
    function updateTimeControls() {
        const regionMode = element('#timezone-mode').value === 'region';
        element('#timezone-id').disabled = !regionMode;
        element('#location-timezone').disabled = regionMode;
        element('#fixed-offset-field').hidden = regionMode;
        element('#timezone-rule-note').textContent = regionMode
            ? '按所选时区和目标日期自动处理夏令时；日历内容由国家 / 地区决定。'
            : '当前使用固定 UTC 偏移，不自动切换夏令时。日历地区和观测地点保持独立。';
        updateSettingsPreview();
    }
    function updateClock() {
        const current = dateTimeAt(state.settings);
        const dateKey = `${current.year}-${current.month}-${current.day}`;
        const time = element('#local-clock');
        time.textContent = clockText(current);
        time.dateTime = new Date().toISOString();
        element('#location-timezone-label').textContent = formatUTCOffset(current.offset);
        const country = countries.find((item) => item.code === state.settings.countryCode);
        element('.place-time-button').title = `${country?.name ?? state.settings.countryCode} · ${state.settings.city} · ${state.settings.timezoneMode === 'region' ? timezoneLabel(state.settings.timezoneId) : '固定时区'} · ${formatUTCOffset(current.offset)}，打开地区与日历`;
        if (element('#settings-dialog').open)
            updateSettingsPreview();
        if (clockDateKey && dateKey !== clockDateKey) {
            // 我只让“今天”模式跟随跨日，避免时钟刷新改掉正在查看的历史日期。
            if (state.followToday)
                setDate(current.year, current.month, current.day, true);
            else
                updateCalendar();
        }
        clockDateKey = dateKey;
    }
    async function handleClick(event) {
        const target = event.target;
        const yearFilterButton = target.closest('[data-year-filter]');
        if (yearFilterButton) {
            const value = yearFilterButton.dataset.yearFilter;
            if (value === 'all' || value === 'national' || value === 'local' || value === 'astronomy') {
                const group = yearFilterButton.closest('.year-summary') ? '.year-summary' : '.year-filters';
                yearFilter = value;
                element('#year-view').innerHTML = renderYearCalendar(state, yearFilter);
                element(`#year-view ${group} [data-year-filter="${value}"]`).focus();
            }
            return;
        }
        const navigation = target.closest('[data-page]');
        if (navigation) {
            event.preventDefault();
            navigate(Number(navigation.dataset.page));
            return;
        }
        const dateButton = target.closest('[data-calendar-date]');
        if (dateButton) {
            const [year, month, day] = dateButton.dataset.calendarDate.split(',').map(Number);
            const openCalendar = dateButton.hasAttribute('data-open-calendar');
            setDate(year, month, day);
            if (openCalendar)
                navigate(1);
            return;
        }
        const quick = target.closest('[data-jump-year]');
        if (quick) {
            element('#jump-year').value = quick.dataset.jumpYear;
            if (quick.dataset.jumpYear === '1582')
                element('#jump-month').value = '10';
            return;
        }
        const action = target.closest('[data-action]')?.dataset.action;
        switch (action) {
            case 'prev-month':
                moveMonth(-1);
                break;
            case 'next-month':
                moveMonth(1);
                break;
            case 'prev-year':
                moveMonth(-12);
                break;
            case 'next-year':
                moveMonth(12);
                break;
            case 'today': {
                const today = dateTimeAt(state.settings);
                setDate(today.year, today.month, today.day, true);
                break;
            }
            case 'open-date': {
                element('#jump-year').value = state.year <= 0 ? `B${1 - state.year}` : String(state.year);
                element('#jump-month').value = String(state.month);
                element('#jump-day').value = String(state.selectedDay);
                element('#date-error').textContent = '';
                openDialog('#date-dialog');
                break;
            }
            case 'close-dialog':
                target.closest('dialog')?.close();
                break;
            case 'open-settings':
                openSettings();
                break;
            case 'toggle-theme':
                state.settings.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
                setTheme();
                saveSettings(state.settings);
                break;
            case 'toggle-menu':
                setMenu(!element('#app-sidebar').classList.contains('is-open'));
                break;
            case 'close-menu':
                setMenu(false);
                break;
            case 'copy-day': {
                const text = dateSummary(state);
                try {
                    await navigator.clipboard.writeText(text);
                }
                catch {
                    const textarea = document.createElement('textarea');
                    textarea.value = text;
                    textarea.style.position = 'fixed';
                    textarea.style.opacity = '0';
                    document.body.append(textarea);
                    textarea.select();
                    const copied = document.execCommand('copy');
                    textarea.remove();
                    if (!copied)
                        throw new Error('浏览器未允许复制，请在安全连接下重试。');
                }
                notify('已复制日期详情');
                break;
            }
        }
    }
    const onClick = (event) => { void handleClick(event).catch((error) => notify(error instanceof Error ? error.message : '操作失败，请检查输入。', 'error')); };
    root.addEventListener('click', onClick);
    const onChange = (event) => {
        const target = event.target;
        if (target.id === 'location-province') {
            fillCities();
            chooseCity();
        }
        if (target.id === 'location-city')
            chooseCity();
        if (target.id === 'calendar-continent') {
            fillCountries();
            fillCountryCities();
        }
        if (target.id === 'quick-locale') {
            state.settings.locale = target.value;
            saveSettings(state.settings);
            location.reload();
            return;
        }
        if (target.id === 'calendar-country')
            fillCountryCities();
        if (target.id === 'calendar-city')
            chooseCity();
        if (target.id === 'location-mode') {
            if (target.value === 'city')
                chooseCity();
            else
                updateLocationControls();
        }
        if (target.id === 'timezone-mode' || target.id === 'timezone-id')
            updateTimeControls();
        if (['location-timezone', 'settings-week-start', 'settings-clock-format', 'settings-date-format', 'location-mode'].includes(target.id))
            updateSettingsPreview();
        if (target.id.startsWith('settings-layer-'))
            updateCoverage();
    };
    root.addEventListener('change', onChange);
    const onInput = (event) => { if (['location-timezone', 'location-name'].includes(event.target.id))
        updateSettingsPreview(); };
    root.addEventListener('input', onInput);
    const onSubmit = (event) => {
        const form = event.target;
        if (!['date-form', 'settings-form'].includes(form.id))
            return;
        event.preventDefault();
        try {
            if (form.id === 'date-form') {
                const year = parseYear(element('#jump-year').value);
                const month = Number(element('#jump-month').value);
                const day = Number(element('#jump-day').value);
                if (!monthData(year, month).days.some((item) => item.d === day))
                    throw new Error(year === 1582 && month === 10 && day >= 5 && day <= 14 ? '1582 年 10 月 5—14 日在原版改历规则中不存在，请选择 4 日或 15 日之后。' : '该月没有这个日期，请修改日期。');
                setDate(year, month, day);
                element('#date-dialog').close();
            }
            if (form.id === 'settings-form') {
                const draft = draftTimeSettings();
                const { longitude, latitude, timezone } = draft;
                if (!Number.isFinite(longitude) || !Number.isFinite(latitude) || !Number.isFinite(timezone) || Math.abs(longitude) > 180 || Math.abs(latitude) >= 90 || timezone < -12 || timezone > 14)
                    throw new Error('请检查经度、纬度和时区范围。');
                if (!countries.some((country) => country.code === draft.countryCode))
                    throw new Error('请选择有效的国家 / 地区。');
                if (draft.locationMode === 'city' && selectedCity()?.countryCode !== draft.countryCode)
                    throw new Error('请选择该地区的城市，或使用自定义观测点。');
                const previous = state.settings;
                state.settings = draft;
                const update = {};
                if (longitude !== previous.longitude)
                    update.longitude = longitude;
                if (latitude !== previous.latitude)
                    update.latitude = latitude;
                if (draft.city !== previous.city)
                    update.locationName = draft.city;
                const regionChanged = previous.countryCode !== draft.countryCode;
                const localeChanged = previous.locale !== draft.locale;
                if (regionChanged)
                    update.calendarRegion = draft.countryCode;
                if (timezoneKey(previous) !== timezoneKey(state.settings)) {
                    update.timezone = timezone;
                    update.timezoneAt = timezoneAt;
                    update.timezoneKey = timezoneKey(state.settings);
                    const today = dateTimeAt(state.settings);
                    if (state.followToday && (today.year !== state.year || today.month !== state.month || today.day !== state.selectedDay)) {
                        state.year = today.year;
                        state.month = today.month;
                        state.selectedDay = today.day;
                        update.year = today.year;
                        update.month = today.month;
                        update.day = today.day;
                    }
                    clockDateKey = `${today.year}-${today.month}-${today.day}`;
                }
                saveSettings(state.settings);
                setTheme();
                if (localeChanged) {
                    location.reload();
                    return;
                }
                if (regionChanged)
                    renderNavigation();
                updateCalendar(update, false);
                updateClock();
                navigate(availablePages().some((item) => item.id === state.page) ? state.page : 1);
                element('#settings-dialog').close();
                notify(regionChanged ? `已切换为${countries.find((country) => country.code === draft.countryCode)?.name ?? ''}日历` : '已更新地区、时间与观测设置');
            }
        }
        catch (error) {
            const message = error instanceof Error ? error.message : '请检查输入。';
            if (form.id === 'date-form')
                element('#date-error').textContent = message;
            else if (form.id === 'settings-form')
                element('#settings-error').textContent = message;
            else
                notify(message, 'error');
        }
    };
    root.addEventListener('submit', onSubmit);
    const onKeydown = (event) => {
        if (event.key === 'Escape' && element('#app-sidebar').classList.contains('is-open'))
            setMenu(false);
        const target = event.target;
        if (!target.closest('[data-calendar-date]') || state.page !== 1)
            return;
        const offsets = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
        try {
            if (event.key in offsets) {
                event.preventDefault();
                const date = JD.DD(selectedDay(state).d0 + J2000 + offsets[event.key]);
                setDate(date.Y, date.M, date.D);
            }
            else if (event.key === 'PageUp' || event.key === 'PageDown') {
                event.preventDefault();
                moveMonth((event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1));
            }
            else if (event.key === 'Home' || event.key === 'End') {
                event.preventDefault();
                const days = monthData(state.year, state.month).days;
                setDate(state.year, state.month, event.key === 'Home' ? days[0].d : days.at(-1).d);
            }
            else
                return;
            element('.calendar-day.is-selected').focus();
        }
        catch (error) {
            notify(error instanceof Error ? error.message : '日期超出范围。', 'error');
        }
    };
    root.addEventListener('keydown', onKeydown);
    systemTheme.addEventListener('change', setTheme);
    element('#quick-locale').value = state.settings.locale;
    element('#settings-title').textContent = tr(state.settings.locale, '地区与日历');
    element('#settings-locale-label').textContent = tr(state.settings.locale, '界面语言');
    element('.breadcrumb').textContent = tr(state.settings.locale, '工作台');
    renderNavigation();
    setTheme();
    updateCalendar();
    updateClock();
    navigate(1);
    const removeDayPreview = mountDayPreview(root, () => state);
    const clockTimer = window.setInterval(updateClock, 1000);
    return () => { window.clearInterval(clockTimer); removeDayPreview(); systemTheme.removeEventListener('change', setTheme); root.removeEventListener('click', onClick); root.removeEventListener('change', onChange); root.removeEventListener('input', onInput); root.removeEventListener('submit', onSubmit); root.removeEventListener('keydown', onKeydown); workspace.destroy(); helpView?.destroy(); eclipseMap?.destroy(); };
}
