import { JD, J2000 } from '../engine/engine.js';
import { getLegacyRegion } from './regions.js';
const UNIX_EPOCH_JD = 2440587.5;
const SECONDS_PER_DAY = 86400;
const offsetFormatters = new Map();
const twoDigits = (value) => String(value).padStart(2, '0');
function finite(value, label) {
    if (!Number.isFinite(value))
        throw new RangeError(`${label}必须是有限数值。`);
    return value;
}
function offsetFormatter(timezoneId) {
    let formatter = offsetFormatters.get(timezoneId);
    if (!formatter) {
        formatter = new Intl.DateTimeFormat('en-US', { timeZone: timezoneId, timeZoneName: 'longOffset', hour: '2-digit', hourCycle: 'h23' });
        offsetFormatters.set(timezoneId, formatter);
    }
    return formatter;
}
export function isTimezoneSupported(timezoneId) {
    if (!timezoneId)
        return false;
    try {
        offsetFormatter(timezoneId);
        return true;
    }
    catch {
        return false;
    }
}
/** 我用浏览器离线 IANA 数据求目标瞬间的偏移，包括历史秒偏移和现代夏令时。 */
export function offsetAtUT(settings, utJ2000) {
    finite(utJ2000, '儒略日');
    if (settings.timezoneMode === 'fixed')
        return finite(settings.timezone, '时区偏移');
    const timezoneId = settings.timezoneId || getLegacyRegion(settings.timezoneRegion)?.timezoneId;
    if (!timezoneId)
        throw new RangeError('地区模式需要有效的 IANA 时区。');
    // 我先折叠纪元差并四舍五入至 Intl 支持的毫秒，避免切换边界上的浮点截断。
    const timestamp = Math.round((utJ2000 - (UNIX_EPOCH_JD - J2000)) * SECONDS_PER_DAY * 1000);
    const name = offsetFormatter(timezoneId).formatToParts(timestamp).find((part) => part.type === 'timeZoneName')?.value;
    if (name === 'GMT' || name === 'UTC')
        return 0;
    const match = name?.match(/^(?:GMT|UTC)([+-])(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?$/);
    if (!match)
        throw new RangeError('浏览器无法解析该 IANA 时区的 UTC 偏移。');
    const seconds = Number(match[2]) * 3600 + Number(match[3] || 0) * 60 + Number(match[4] || 0);
    return (match[1] === '-' ? -1 : 1) * seconds / 3600;
}
/**
 * 我把地方 J2000 日转换为 UT，并供只持有偏移回调的专业工具共享。
 * 我在回拨的重复时段选择较早的 UT；在前拨的缺失时段向后顺延跳时长度。
 * 我比较切换前后的真实偏移，兼容半小时夏令时及跨日期变更线的整日跳时。
 */
export function localToUTByOffset(localJ2000, offsetAt) {
    finite(localJ2000, '地方儒略日');
    const offsets = new Set();
    const sampleOffset = (ut) => {
        const offset = finite(offsetAt(ut), '时区偏移');
        offsets.add(offset);
        return offset;
    };
    let estimate = localJ2000 - sampleOffset(localJ2000) / 24;
    for (let iteration = 0; iteration < 8; iteration++) {
        const next = localJ2000 - sampleOffset(estimate) / 24;
        if (Math.abs(next - estimate) < 1e-9)
            break;
        estimate = next;
    }
    sampleOffset(estimate - 2);
    sampleOffset(estimate + 2);
    const candidates = [...offsets].map((offset) => {
        const ut = localJ2000 - offset / 24;
        return { ut, local: ut + finite(offsetAt(ut), '时区偏移') / 24 };
    });
    const exact = candidates.filter((candidate) => Math.abs(candidate.local - localJ2000) < 1e-8);
    if (exact.length)
        return Math.min(...exact.map((candidate) => candidate.ut));
    const later = candidates.filter((candidate) => candidate.local > localJ2000).sort((a, b) => a.local - b.local || a.ut - b.ut);
    if (later.length)
        return later[0].ut;
    throw new RangeError('无法按该时区规则解析地方时。');
}
export function localToUT(settings, localJ2000) {
    return localToUTByOffset(localJ2000, (ut) => offsetAtUT(settings, ut));
}
/** 我用时间戳表达同一瞬间，再由原 JD 转为所选地点的混合历法日期。 */
export function dateTimeAt(settings, timestampMs = Date.now()) {
    finite(timestampMs, '时间戳');
    const ut = timestampMs / (SECONDS_PER_DAY * 1000) + (UNIX_EPOCH_JD - J2000);
    const offset = offsetAtUT(settings, ut);
    const localSeconds = Math.floor(timestampMs / 1000 + offset * 3600);
    // 我在整秒内部取样，避免完整 JD 的浮点误差让整秒显示成前一秒。
    const date = JD.DD(UNIX_EPOCH_JD + (localSeconds + 0.25) / SECONDS_PER_DAY);
    return { year: date.Y, month: date.M, day: date.D, hour: date.h, minute: date.m, second: Math.floor(date.s), offset };
}
export function dateAtOffset(offset, timestampMs = Date.now()) {
    const { year, month, day } = dateTimeAt({ timezone: offset, timezoneMode: 'fixed', timezoneRegion: '' }, timestampMs);
    return { year, month, day };
}
export function formatUTCOffset(offset) {
    finite(offset, '时区偏移');
    const seconds = Math.round(Math.abs(offset) * 3600);
    const hour = Math.floor(seconds / 3600);
    const minute = Math.floor(seconds % 3600 / 60);
    const second = seconds % 60;
    return `UTC${offset < 0 ? '−' : '+'}${twoDigits(hour)}:${twoDigits(minute)}${second ? `:${twoDigits(second)}` : ''}`;
}
/** 我将地方 J2000 日四舍五入到秒，跨日进位仍由原 JD 处理。 */
export function formatLocalTime(localJ2000, options = {}) {
    finite(localJ2000, '地方儒略日');
    const seconds = Math.floor((localJ2000 + 0.5) * SECONDS_PER_DAY + 0.5);
    const date = JD.DD(J2000 - 0.5 + (seconds + 0.25) / SECONDS_PER_DAY);
    const time = `${twoDigits(date.h)}:${twoDigits(date.m)}${options.includeSeconds === false ? '' : `:${twoDigits(Math.floor(date.s))}`}`;
    if (!options.includeDate)
        return time;
    const year = date.Y <= 0 ? `公元前${1 - date.Y}` : String(date.Y);
    return `${year}年${date.M}月${date.D}日 ${time}`;
}
