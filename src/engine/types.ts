/**
 * 寿星万年历的公开计算类型。
 * 角度未特别注明时使用弧度；d0、yxjd、jqjd 均从 J2000 起算。
 * 保留许剑伟原版字段名称，使专业计算和现代界面共享相同数值。
 */
export interface JulianDateParts {
  Y: number; M: number; D: number; h: number; m: number; s: number;
}

export interface LunarDay {
  d0: number; di: number; y: number; m: number; d: number; dn: number;
  week0: number; week: number; weeki: number; weekN: number;
  Ldi: number; Ldc: string;
  cur_dz: number; cur_xz: number; cur_lq: number; cur_mz: number; cur_xs: number;
  Lmc: string; Ldn: number; Lleap: string; Lmc2: string; Ljq: string;
  Lyear: number; Lyear0: number; Lyear2: string; Lyear3: string; Lyear4: number;
  Lmonth: number; Lmonth2: string; Lday2: string; Ltime2?: string; XiZ: string;
  Hyear: number; Hmonth: number; Hday: number;
  yxmc: string; yxjd: number | ''; yxsj: string;
  jqmc: string; jqjd: number | ''; jqsj: string;
  A: string; B: string; C: string; Fjia: number;
}

export interface MonthCalendar {
  year: number; month: number; firstWeekday: number; dayCount: number;
  julianDay: number;
  heavenlyStemEarthlyBranch: string; zodiac: string; era: string;
  days: LunarDay[];
}

export interface SolarTerm {
  name: string;
  /** 北京时间下的完整儒略日（包含 J2000 基数）。 */
  julianDay: number;
  date: JulianDateParts;
  time: string;
}

export interface SunMoonTimes {
  sunrise: string; solarNoon: string; sunset: string;
  civilDawn: string; civilDusk: string;
  nauticalDawn: string; nauticalDusk: string;
  astronomicalDawn: string; astronomicalDusk: string;
  daylight: string; lightDuration: string;
  moonrise: string; moonTransit: string; moonset: string;
  message: string;
}

export interface GeographicLocation {
  province: string; name: string; code: string;
  longitude: number; latitude: number;
}

export interface LegacyTimezone {
  continent: string; country: string; utcOffsetHours: number;
  daylightSavingRule: string; cities: string;
}
