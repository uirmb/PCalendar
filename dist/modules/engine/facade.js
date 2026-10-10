import { J2000, JD, Lunar, SZJ } from './engine.js';
import { localToUTByOffset } from '../lib/time.js';
/** 保留原版历史历法：1582 年十月包含格里历改历跳日。 */
export function getMonthCalendar(year, month) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
        throw new RangeError('年份必须是整数，月份必须在 1—12 之间。');
    }
    const calendar = new Lunar();
    calendar.yueLiCalc(year, month);
    return {
        year, month,
        firstWeekday: calendar.w0,
        dayCount: calendar.dn,
        julianDay: calendar.d0 + J2000,
        heavenlyStemEarthlyBranch: calendar.Ly,
        zodiac: calendar.ShX,
        era: calendar.nianhao,
        days: calendar.lun.slice(0, calendar.dn).map((day) => ({ ...day })),
    };
}
/** 年内每个定气时刻使用原版高精度太阳黄经求根结果，北京时间 UTC+8。 */
export function getSolarTerms(year) {
    const terms = [];
    for (let month = 1; month <= 12; month++) {
        for (const day of getMonthCalendar(year, month).days) {
            if (day.jqmc && typeof day.jqjd === 'number') {
                const julianDay = day.jqjd + J2000;
                terms.push({ name: day.jqmc, julianDay, date: JD.DD(julianDay), time: day.jqsj });
            }
        }
    }
    return terms;
}
/**
 * julianDay 是所选本地日期中午的完整 JD。
 * 经度东正西负，纬度北正南负，时区以 UTC+8 → 8 表示。
 * 原版内部时区符号相反，转换集中放在这里。
 * 我仅在本地日内发生偏移变化时逐事件转换，恒定时区保持原版输出。
 */
export function getSunMoon(julianDay, longitudeDegrees, latitudeDegrees, utcOffsetHours = 8, timezoneAt) {
    const jd = Math.floor(julianDay) - J2000;
    const longitude = longitudeDegrees * Math.PI / 180;
    const latitude = latitudeDegrees * Math.PI / 180;
    const noonUT = timezoneAt ? localToUTByOffset(jd, timezoneAt) : jd - utcOffsetHours / 24;
    const noonOffset = timezoneAt ? timezoneAt(noonUT) : utcOffsetHours;
    let changesWithinDay = false;
    if (timezoneAt) {
        const begin = localToUTByOffset(jd - 0.5, timezoneAt);
        const end = localToUTByOffset(jd + 0.5, timezoneAt);
        changesWithinDay = timezoneAt(begin) !== noonOffset || timezoneAt(end - 1 / 86400) !== noonOffset;
    }
    SZJ.calcRTS(jd, 1, longitude, latitude, -noonOffset);
    const times = SZJ.rts[0];
    const sun = SZJ.St(jd - noonOffset / 24);
    const localTime = (value) => JD.timeStr(value + noonOffset / 24);
    const result = {
        sunrise: times.s, solarNoon: times.z, sunset: times.j,
        civilDawn: times.c, civilDusk: times.h,
        nauticalDawn: localTime(sun.c2), nauticalDusk: localTime(sun.h2),
        astronomicalDawn: localTime(sun.c3), astronomicalDusk: localTime(sun.h3),
        daylight: times.sj, lightDuration: times.ch,
        moonrise: times.Ms, moonTransit: times.Mz, moonset: times.Mj,
        message: sun.sm,
    };
    if (!timezoneAt || !changesWithinDay)
        return result;
    // 我保留 St/Mt 的原始 UT 求解结果，只按每次事件的真实偏移转换显示时刻。
    const eventTime = (ut) => JD.timeStr(ut + timezoneAt(ut) / 24);
    const moonEvents = { s: [], z: [], j: [] };
    for (let dayOffset = -1; dayOffset <= 1; dayOffset++) {
        const moon = SZJ.Mt(jd + dayOffset - noonOffset / 24);
        for (const key of ['s', 'z', 'j']) {
            const ut = moon[key];
            if (Math.floor(ut + timezoneAt(ut) / 24 + 0.5) !== jd)
                continue;
            const events = moonEvents[key];
            const duplicate = events.findIndex((value) => Math.abs(value - ut) < 1 / 1440);
            // 我沿用原版后一次迭代覆盖同一次月亮事件的结果，避免相邻日采样重复。
            if (duplicate >= 0)
                events[duplicate] = ut;
            else
                events.push(ut);
        }
    }
    // 我在回拨的 25 小时日保留可能出现的同类多次事件，沿用现有字符串字段列出。
    const moonTime = (key) => moonEvents[key].sort((a, b) => a - b).map(eventTime).join(' / ') || '--:--:--';
    return {
        ...result,
        sunrise: eventTime(sun.s), solarNoon: eventTime(sun.z), sunset: eventTime(sun.j),
        civilDawn: eventTime(sun.c), civilDusk: eventTime(sun.h),
        nauticalDawn: eventTime(sun.c2), nauticalDusk: eventTime(sun.h2),
        astronomicalDawn: eventTime(sun.c3), astronomicalDusk: eventTime(sun.h3),
        moonrise: moonTime('s'), moonTransit: moonTime('z'), moonset: moonTime('j'),
    };
}
