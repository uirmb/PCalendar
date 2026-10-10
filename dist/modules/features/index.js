import { FeatureDOM, year2Ayear } from './dom.js';
import { createFeatureMarkup, currentObserverLocations, defaultLocalEclipseLocations } from './templates.js';
import { Calculations } from './calculations.js';
import { EclipseCalculations } from './eclipses.js';
import { CalendarTools } from './tools.js';
import { mountDiagnostics } from './diagnostics.js';
import './feature.css';
export { FEATURE_TITLES } from './templates.js';
const DATE_BINDINGS = [
    { page: 2, prefix: 'Cp2', parts: ['year'] },
    { page: 3, prefix: 'Cb', parts: ['year', 'month', 'day'] },
    { page: 4, prefix: 'Cc', parts: ['year', 'month', 'day'] },
    { page: 5, prefix: 'Cd', parts: ['year', 'month', 'day'] },
    { page: 6, prefix: 'Ce', parts: ['year', 'month', 'day'] },
    { page: 7, prefix: 'Cf', parts: ['year', 'month', 'day'] },
    { page: 8, prefix: 'Cp8', parts: ['year'] },
    { page: 9, prefix: 'Cp9', parts: ['year', 'month', 'day'] },
    { page: 10, prefix: 'Cp10', parts: ['year', 'month'] },
    { page: 11, prefix: 'Cml', parts: ['year', 'month', 'day'] },
    { page: 12, prefix: 'GJ1', parts: ['year', 'month', 'day'] },
];
const DEFAULT_ACTIONS = {
    2: { name: 'getNianLi', arg: 0, arg2: 0 }, 3: { name: 'tu_calc', arg: 2, arg2: 0 },
    4: { name: 'dfRS', arg: 0, arg2: 0 }, 5: { name: 'pCalc', arg: 0, arg2: 0 },
    6: { name: 'tianXiang', arg: 1, arg2: 0 }, 7: { name: 'aCalc', arg: 0, arg2: 0 },
    8: { name: 'qiCalc', arg: 0, arg2: 0 }, 9: { name: 'shengjiang', arg: 0, arg2: 0 },
    10: { name: 'tu2_calc', arg: 2, arg2: 0 }, 11: { name: 'ML_calc', arg: 0, arg2: 0 },
    12: { name: 'GJ1_calc1', arg: 0, arg2: 0 },
};
/** 我保存可重复的当前计算，不把“前进一步”等状态变更操作作为重算动作。 */
function repeatableAction(name, arg, arg2) {
    if (name === 'getNianLi')
        return { name, arg: 0, arg2: 0 };
    if (name === 'tu_calc' || name === 'zxsCopy' || name === 'tu2_xx')
        return { name: 'tu_calc', arg: 2, arg2: 0 };
    if (name === 'dfRS' || name === 'useCurrentObserver')
        return { name: 'dfRS', arg: 0, arg2: 0 };
    if (name === 'ML_settime')
        return { name: 'ML_calc', arg: 0, arg2: 0 };
    if (name === 'tu2_calc')
        return { name, arg: arg === 5 ? 5 : 2, arg2: 0 };
    if (name === 'tu3_xz')
        return { name, arg: 4, arg2: 0 };
    if (name === 'tu3_yingzi')
        return { name, arg: 0, arg2: 0 };
    return { name, arg, arg2 };
}
export function createFeatureWorkspace(container, initialContext) {
    const context = { ...initialContext };
    container.classList.add('feature-workspace');
    container.innerHTML = createFeatureMarkup(context);
    const dom = new FeatureDOM(container), basic = new Calculations(dom, context), tools = new CalendarTools(dom);
    let page = 0, busy = false, disposed = false;
    const initialized = new Set(), dirty = new Set();
    const lastActions = new Map();
    const phaseActions = new Map();
    const isChineseCalendar = () => (context.calendarRegion ?? 'CN') === 'CN';
    const phaseMode = (region = context.calendarRegion) => (region ?? 'CN') === 'CN' ? 'CN' : region === 'US' ? 'US' : 'international';
    let automaticLocationList = defaultLocalEclipseLocations(context);
    let currentObserverMode = false;
    const pageAllowed = (targetPage) => isChineseCalendar() || (targetPage !== 2 && targetPage !== 11);
    const defaultAction = (targetPage) => targetPage === 8 && !isChineseCalendar()
        ? { name: 'suoCalc', arg: 0, arg2: 0 } : DEFAULT_ACTIONS[targetPage];
    const navigate = (next) => { workspace.setPage(next); context.onNavigate?.(next); };
    const eclipses = new EclipseCalculations(dom, context, basic, navigate);
    const feedback = container.querySelector('.feature-feedback');
    const removeDiagnostics = mountDiagnostics(dom.element('feature-diagnostics'));
    basic.initializeStarLibrary();
    const refreshCalendarRegion = () => {
        const chinese = isChineseCalendar(), american = context.calendarRegion === 'US', section = dom.element('feature-page-8');
        section.querySelector('h2').textContent = chinese ? '气朔' : american ? '季节与月相' : '月相推算';
        section.querySelector('.feature-page-heading p').textContent = chinese
            ? '高精度计算定朔、定望、上下弦、二十四节气与七十二候。'
            : american ? '推算北半球四季转换、新月、满月、上下弦及任意月日相位的当地时刻。'
                : '推算新月、满月、上弦月、下弦月及任意月日黄经差时刻。';
        for (const control of section.querySelectorAll('[data-chinese-calendar]'))
            control.hidden = !chinese;
        for (const control of section.querySelectorAll('[data-us-calendar]'))
            control.hidden = !american;
        for (const [angle, cn, international] of [[0, '定朔', '新月'], [180, '定望', '满月'], [90, '上弦', '上弦月'], [270, '下弦', '下弦月']]) {
            section.querySelector(`[data-action="suoCalc"][data-arg="${angle}"]`).textContent = chinese ? cn : international;
        }
        const count = dom.element('Cp8_n'), label = chinese ? '个数 / 节气数' : '个数';
        count.setAttribute('aria-label', label);
        count.parentElement.querySelector('span').textContent = label;
        if (!chinese)
            for (const id of [2, 11])
                dom.element(`feature-page-${id}`).hidden = true;
    };
    const actions = {
        getNianLi: (offset) => basic.getNianLi(offset), getNianLiN: () => basic.getNianLiN(),
        pCalc: () => basic.pCalc(), tianXiang: (event, planet) => basic.tianXiang(event, planet), aCalc: () => basic.aCalc(),
        suoCalc: (angle) => basic.suoCalc(angle), qiCalc: () => basic.qiCalc(), houCalc: () => basic.houCalc(), seasonCalc: () => basic.seasonCalc(),
        shengjiang: () => basic.shengjiang(), shengjiang2: () => basic.shengjiang2(), shengjiang3: () => basic.shengjiang3(),
        ML_calc: () => basic.ML_calc(), ML_settime: () => basic.ML_settime(),
        tu_calc: (mode) => eclipses.tu_calc(mode), dfRS: (mode) => eclipses.dfRS(mode),
        useCurrentObserver: () => {
            currentObserverMode = true;
            automaticLocationList = currentObserverLocations(context);
            dom.set('Cc_db', automaticLocationList);
            eclipses.dfRS(0);
        },
        zxsCopy: (_a, _b, element) => eclipses.zxsCopy(Number(element.dataset.longitude), Number(element.dataset.latitude)),
        tuGL_search: (precise) => eclipses.tuGL_search(precise),
        tu2_calc: (mode, _b, element) => eclipses.tu2_calc(mode, element.dataset.jd === undefined ? undefined : Number(element.dataset.jd)),
        tu2_xx: (_a, _b, element) => eclipses.tu2_xx(Number(element.dataset.jd)),
        tu2_jxb: () => eclipses.tu2_jxb(), tu3_xz: (mode) => eclipses.tu3_xz(mode), tu3_yingzi: (mode) => eclipses.tu3_yingzi(mode),
        GJ1_calc1: () => tools.GJ1_calc1(), GJ1_calc2: (mode) => tools.GJ1_calc2(mode),
        GJ2_pi1: (mode) => tools.GJ2_pi1(mode), GJ2_pi2: () => tools.GJ2_pi2(), GJ2_pi: () => tools.GJ2_pi(),
        GJ2_machin: () => tools.GJ2_machin(), GJ2_cls: () => tools.GJ2_cls(),
    };
    const reportError = (error) => {
        feedback.textContent = error instanceof Error ? error.message : String(error);
        feedback.classList.add('feature-feedback--error');
        feedback.hidden = false;
    };
    const perform = (action, targetPage, control = container) => {
        if (!pageAllowed(targetPage))
            return;
        if (targetPage === 8 && action.name !== 'suoCalc'
            && !(isChineseCalendar() && ['qiCalc', 'houCalc'].includes(action.name))
            && !(context.calendarRegion === 'US' && action.name === 'seasonCalc'))
            return;
        actions[action.name](action.arg, action.arg2, control);
        const resultPage = action.name === 'tu2_xx' ? 3 : targetPage;
        const saved = repeatableAction(action.name, action.arg, action.arg2);
        lastActions.set(resultPage, saved);
        if (resultPage === 8)
            phaseActions.set(phaseMode(), saved);
        initialized.add(resultPage);
        dirty.delete(resultPage);
    };
    const renderPage = (targetPage) => {
        if (!pageAllowed(targetPage))
            return;
        const action = lastActions.get(targetPage) ?? defaultAction(targetPage);
        if (!action) {
            initialized.add(targetPage);
            dirty.delete(targetPage);
            return;
        }
        try {
            perform(action, targetPage);
            if (targetPage === page) {
                feedback.hidden = true;
                feedback.classList.remove('feature-feedback--error');
            }
        }
        catch (error) {
            reportError(error);
        }
    };
    const run = (calculate, control) => {
        if (busy || disposed)
            return;
        busy = true;
        feedback.hidden = true;
        feedback.classList.remove('feature-feedback--error');
        container.setAttribute('aria-busy', 'true');
        const button = control instanceof HTMLButtonElement ? control : null;
        const label = button?.textContent || '';
        if (button) {
            button.disabled = true;
            button.textContent = '计算中…';
        }
        requestAnimationFrame(() => requestAnimationFrame(() => {
            if (disposed)
                return;
            try {
                calculate();
            }
            catch (error) {
                reportError(error);
            }
            finally {
                busy = false;
                container.removeAttribute('aria-busy');
                if (button) {
                    button.disabled = false;
                    button.textContent = label;
                }
                if (button?.closest('[data-feature-page="8"]'))
                    refreshCalendarRegion();
                if (dirty.has(page))
                    renderPage(page);
            }
        }));
    };
    const click = (event) => {
        const target = event.target instanceof Element ? event.target.closest('[data-action]') : null;
        if (!target || !container.contains(target))
            return;
        const name = target.dataset.action || '';
        if (!actions[name])
            return;
        event.preventDefault();
        const targetPage = Number(target.closest('[data-feature-page]')?.dataset.featurePage || page);
        const action = { name, arg: Number(target.dataset.arg || 0), arg2: Number(target.dataset.arg2 || 0) };
        run(() => perform(action, targetPage, target), target);
    };
    const change = (event) => {
        if (!(event.target instanceof HTMLSelectElement))
            return;
        try {
            if (event.target.dataset.change === 'showHXK')
                basic.showHXK(Number(event.target.value));
            if (event.target.dataset.change === 'eclipseCycle')
                dom.set('Cp10_step', event.target.value);
        }
        catch (error) {
            reportError(error);
        }
    };
    const keydown = (event) => {
        if (event.key !== 'Enter' || !(event.target instanceof HTMLInputElement))
            return;
        if (!DEFAULT_ACTIONS[page])
            return;
        event.preventDefault();
        const targetPage = page;
        run(() => renderPage(targetPage));
    };
    container.addEventListener('click', click);
    container.addEventListener('change', change);
    container.addEventListener('keydown', keydown);
    const clock = window.setInterval(() => {
        if (page !== 3 || busy || disposed)
            return;
        try {
            eclipses.zb_calc();
        }
        catch (error) {
            dom.check('Cal_pause', true);
            reportError(error);
        }
    }, 1000);
    const coordinateDependency = (targetPage, coordinate, action) => {
        if (targetPage === 3 || targetPage === 5)
            return true;
        if (targetPage === 7)
            return dom.value('Cf_lx') === '1';
        if (targetPage === 9)
            return action.name !== 'shengjiang3';
        return targetPage === 11 && coordinate === 'longitude';
    };
    const timezoneDependency = (targetPage) => {
        if (targetPage === 3)
            return dom.checked('Cb_ut');
        return [2, 4, 5, 6, 7, 8, 9, 11].includes(targetPage);
    };
    const dateDependency = (action, parts) => {
        if (action.name.startsWith('GJ2_') || action.name === 'GJ1_calc1')
            return false;
        if (action.name === 'tuGL_search')
            return parts.has('year') || parts.has('month');
        if (action.name.startsWith('tu2_') || action.name.startsWith('tu3_'))
            return false;
        if (['getNianLi', 'getNianLiN', 'suoCalc', 'qiCalc', 'houCalc', 'seasonCalc', 'shengjiang2', 'shengjiang3'].includes(action.name))
            return parts.has('year');
        return parts.size > 0;
    };
    const workspace = {
        setPage(next) {
            if (next !== page) {
                dom.check('Cal_pause', true);
                feedback.hidden = true;
            }
            page = next;
            for (const section of container.querySelectorAll('[data-feature-page]')) {
                const hidden = Number(section.dataset.featurePage) !== next || !pageAllowed(next);
                if (section.hidden !== hidden)
                    section.hidden = hidden;
            }
            if (!initialized.has(next) || dirty.has(next))
                renderPage(next);
        },
        updateContext(update) {
            const oldPhaseMode = phaseMode();
            const calendarRegionChanged = update.calendarRegion !== undefined
                && phaseMode(update.calendarRegion) !== oldPhaseMode;
            const locationIdentityChanged = (update.locationName !== undefined && update.locationName !== context.locationName)
                || (update.calendarRegion !== undefined && update.calendarRegion !== context.calendarRegion);
            const usesAutomaticLocationList = dom.value('Cc_db') === automaticLocationList;
            const longitudeChanged = update.longitude !== undefined && update.longitude !== context.longitude;
            const latitudeChanged = update.latitude !== undefined && update.latitude !== context.latitude;
            const timezoneChanged = (update.timezone !== undefined && update.timezone !== context.timezone)
                || (update.timezoneKey !== undefined && update.timezoneKey !== context.timezoneKey)
                || (update.timezoneKey === undefined && 'timezoneAt' in update && update.timezoneAt !== context.timezoneAt);
            const changedDates = new Set(['year', 'month', 'day'].filter((key) => update[key] !== undefined && update[key] !== context[key]));
            const updatedDates = new Map();
            if (changedDates.size) {
                for (const binding of DATE_BINDINGS) {
                    let followsGlobalDate = false;
                    try {
                        followsGlobalDate = binding.parts.every((part) => {
                            const input = dom.value(`${binding.prefix}_${part[0]}`);
                            return (part === 'year' ? year2Ayear(input) : Number(input)) === context[part];
                        });
                    }
                    catch { /* 我保留用户正在编辑或已脱离全局的日期。 */ }
                    if (!followsGlobalDate)
                        continue;
                    const parts = new Set();
                    for (const part of binding.parts) {
                        if (!changedDates.has(part))
                            continue;
                        dom.set(`${binding.prefix}_${part[0]}`, update[part]);
                        parts.add(part);
                    }
                    if (parts.size)
                        updatedDates.set(binding.page, parts);
                }
            }
            Object.assign(context, update);
            let locationsUpdated = false;
            if (usesAutomaticLocationList && (locationIdentityChanged || longitudeChanged || latitudeChanged)) {
                const next = currentObserverMode ? currentObserverLocations(context) : defaultLocalEclipseLocations(context);
                locationsUpdated = next !== automaticLocationList;
                automaticLocationList = next;
                if (locationsUpdated) {
                    dom.set('Cc_db', next);
                    dirty.add(4);
                }
            }
            if (calendarRegionChanged) {
                const previous = lastActions.get(8);
                if (previous)
                    phaseActions.set(oldPhaseMode, previous);
                const next = phaseActions.get(phaseMode());
                if (next)
                    lastActions.set(8, next);
                else
                    lastActions.delete(8);
                // 隐藏页也立刻清空旧中国历法输出，下一次打开才按对应模式重算。
                dom.element('Cp8_out').replaceChildren();
                refreshCalendarRegion();
                dirty.add(8);
            }
            if (longitudeChanged)
                for (const prefix of ['Cb', 'Cd', 'Cf', 'Cp9', 'Cp11'])
                    dom.set(`${prefix}_J`, context.longitude);
            if (latitudeChanged)
                for (const prefix of ['Cb', 'Cd', 'Cf', 'Cp9'])
                    dom.set(`${prefix}_W`, context.latitude);
            if (!longitudeChanged && !latitudeChanged && !timezoneChanged && !updatedDates.size && !calendarRegionChanged && !locationsUpdated)
                return;
            for (const [number, defaultAction] of Object.entries(DEFAULT_ACTIONS)) {
                const targetPage = Number(number), action = lastActions.get(targetPage) ?? defaultAction;
                const parts = updatedDates.get(targetPage);
                const affected = (longitudeChanged && coordinateDependency(targetPage, 'longitude', action))
                    || (latitudeChanged && coordinateDependency(targetPage, 'latitude', action))
                    || (timezoneChanged && timezoneDependency(targetPage))
                    || (parts !== undefined && dateDependency(action, parts));
                if (affected)
                    dirty.add(targetPage);
            }
            if (!busy && dirty.has(page))
                renderPage(page);
        },
        destroy() {
            disposed = true;
            window.clearInterval(clock);
            removeDiagnostics();
            container.removeEventListener('click', click);
            container.removeEventListener('change', change);
            container.removeEventListener('keydown', keydown);
            container.replaceChildren();
        },
    };
    return workspace;
}
