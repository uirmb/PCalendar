import { JD, J2000, XL, dt_T } from '../engine/engine.js';
import { getLegacyRegion } from './regions.js';
import { formatLocalTime, formatUTCOffset, offsetAtUT } from './time.js';
export const ASTRONOMY_EVENT_SOURCES = {
    seasons: 'https://aa.usno.navy.mil/data/Earth_Seasons',
    dst: 'https://www.nist.gov/pml/time-and-frequency-division/popular-links/daylight-saving-time-dst',
    timezone: 'https://www.iana.org/time-zones',
};
const seasonNames = ['春季开始', '夏季开始', '秋季开始', '冬季开始'];
const seasonCache = new Map();
const transitionCache = new Map();
const UNIX_J2000 = 10957.5;
function validateYear(year) {
    if (!Number.isInteger(year) || year < -4712 || year > 9999)
        throw new RangeError('年份必须在 -4712 至 9999 之间。');
}
function limitCache(cache) {
    if (cache.size > 48)
        cache.delete(cache.keys().next().value);
}
function localEvent(utcJ2000, offset, name, type, description, sourceUrl) {
    if (!Number.isFinite(offset))
        throw new RangeError('事件的时区偏移必须为有限数值。');
    const local = utcJ2000 + offset / 24;
    const dayNumber = Math.floor(local + 0.5), date = JD.DD(dayNumber + J2000);
    return { name, type, year: date.Y, month: date.M, day: date.D, dayNumber, time: formatLocalTime(local), offset, utcJ2000, description, sourceUrl };
}
/** 与原定气入口使用同一太阳视黄经反解，只取四个季度点；季节名称按北半球。 */
export function getSeasonEvents(year, offsetAt) {
    validateYear(year);
    let instants = seasonCache.get(year);
    if (!instants) {
        // 古代儒略历中的冬至可能落在次年一月，先覆盖邻近太阳年再按当地民用年归位。
        instants = [-1, 0, 1].flatMap((delta) => seasonNames.map((_name, quarter) => {
            const td = XL.S_aLon_t((year + delta - 2000 + 1 + quarter / 4) * Math.PI * 2) * 36525;
            return { quarter, ut: td - dt_T(td) };
        }));
        seasonCache.set(year, instants);
        limitCache(seasonCache);
    }
    return instants.map(({ ut, quarter }) => localEvent(ut, offsetAt(ut), seasonNames[quarter], 'season', `北半球天文季节转换，太阳视黄经到达 ${quarter * 90}°；南半球季节相反。此处是同一天文瞬间在所选地区的当地时间，沿用原天文计算。`, ASTRONOMY_EVENT_SOURCES.seasons)).filter((event) => event.year === year).sort((a, b) => a.utcJ2000 - b.utcJ2000);
}
function shiftDuration(seconds) {
    const value = Math.abs(seconds), hours = Math.floor(value / 3600), minutes = Math.floor(value % 3600 / 60), remainder = value % 60;
    return `${hours ? `${hours} 小时` : ''}${minutes ? `${hours ? ' ' : ''}${minutes} 分钟` : ''}${remainder ? `${hours || minutes ? ' ' : ''}${remainder} 秒` : ''}` || '0 秒';
}
/**
 * 按真实 IANA 偏移搜索并定位到秒，避免把美国现行日期规则倒套到历史年份。
 * type=dst 是界面的时钟调整分类；只有区域名称明确表明 DST/Summer 时才称“夏令时”。
 */
export function getTimezoneTransitions(year, settings) {
    validateYear(year);
    if (settings.timezoneMode === 'fixed')
        return [];
    const timezoneId = settings.timezoneId || getLegacyRegion(settings.timezoneRegion)?.timezoneId;
    if (!timezoneId)
        throw new RangeError('地区模式需要有效的 IANA 时区。');
    const key = `${timezoneId}:${year}`, cached = transitionCache.get(key);
    if (cached)
        return cached.map((event) => ({ ...event }));
    const zone = { ...settings, timezoneId };
    const toUT = (seconds) => seconds / 86400 - UNIX_J2000;
    const at = (seconds) => offsetAtUT(zone, toUT(seconds));
    const names = new Intl.DateTimeFormat('en-US', { timeZone: timezoneId, timeZoneName: 'long' });
    const isDaylight = (seconds) => /\b(?:Daylight|Summer)\b/i.test(names.formatToParts(seconds * 1000).find((part) => part.type === 'timeZoneName')?.value ?? '');
    // 两端额外覆盖两天，以实际变更后的当地日期归入年份，兼容跨日期变更线。
    const first = Math.round((JD.JD(year, 1, 1) - J2000 + UNIX_J2000 - 2) * 86400);
    const last = Math.round((JD.JD(year + 1, 1, 1) - J2000 + UNIX_J2000 + 2) * 86400);
    const result = [];
    let previous = first, previousOffset = at(first);
    for (let sample = Math.min(first + 21600, last); sample <= last; sample = Math.min(sample + 21600, last)) {
        const nextOffset = at(sample);
        if (nextOffset !== previousOffset) {
            let low = previous, high = sample;
            while (high - low > 1) {
                const middle = Math.floor((low + high) / 2);
                if (at(middle) === previousOffset)
                    low = middle;
                else
                    high = middle;
            }
            const before = at(high - 1), after = at(high), ut = toUT(high);
            const beforeDaylight = isDaylight(high - 1), afterDaylight = isDaylight(high);
            const name = !beforeDaylight && afterDaylight ? '夏令时开始' : beforeDaylight && !afterDaylight ? '夏令时结束' : '时区偏移调整';
            const delta = Math.round((after - before) * 3600);
            const oldClock = formatLocalTime(ut + before / 24, { includeDate: true });
            const newClock = formatLocalTime(ut + after / 24, { includeDate: true });
            const description = `时钟从 ${oldClock}（${formatUTCOffset(before)}）调整为 ${newClock}（${formatUTCOffset(after)}），${delta > 0 ? '拨快' : '拨慢'} ${shiftDuration(delta)}。${delta > 0 ? '跳过的当地时段不出现。' : '回拨时段会重复一次。'}按地区时区规则计算；未来日期按当前规则推算，规则可能调整。`;
            const event = localEvent(ut, after, name, 'dst', description, name === '时区偏移调整' ? ASTRONOMY_EVENT_SOURCES.timezone : ASTRONOMY_EVENT_SOURCES.dst);
            if (event.year === year)
                result.push(event);
        }
        previous = sample;
        previousOffset = nextOffset;
        if (sample === last)
            break;
    }
    transitionCache.set(key, result);
    limitCache(transitionCache);
    return result.map((event) => ({ ...event }));
}
