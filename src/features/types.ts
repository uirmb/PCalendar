export interface FeatureContext {
  year: number;
  month: number;
  day: number;
  longitude: number;
  latitude: number;
  /** 我统一采用东为正的 UTC 时区小时数，例如中国为 +8。 */
  timezone: number;
  /** 我按实际 UT 时刻解析所选地区的历史时区和夏令时；未提供时使用固定 timezone。 */
  timezoneAt?: (utJ2000: number) => number;
  /** 我用地区规则标识判断时区设置是否真的改变，避免渲染时的新回调触发重算。 */
  timezoneKey?: string;
  /** 观察地点的国家代码。兼容旧调用时缺省为 CN；非 CN 只呈现通用天文能力。 */
  calendarRegion?: string;
  /** 顶部当前观测点的名称，用于地方日食默认地点；不覆盖已编辑的批量列表。 */
  locationName?: string;
  onNavigate?: (page: number) => void;
}

export interface FeatureWorkspace {
  setPage(page: number): void;
  updateContext(context: Partial<FeatureContext>): void;
  destroy(): void;
}

export interface EclipseFeature {
  jd: number;
  lx: string;
  D: number;
  d: number;
  xc: number;
  yc: number;
  k: number;
  ds: number;
  I: number[];
  zxJ: number;
  zxW: number;
  Sdp: number[];
  sf: number;
  tt: number;
  dw: number;
  gk1: number[];
  gk2: number[];
  gk3: number[];
  gk4: number[];
  gk5: number[];
}

export interface EclipseBoundaries {
  zxJ: number;
  zxW: number;
  p1: number[];
  p2: number[];
  p3: number[];
  p4: number[];
  q1: number[];
  q2: number[];
  q3: number[];
  q4: number[];
  L0: number[];
  L1: number[];
  L2: number[];
  L3: number[];
  L4: number[];
  L5: number[];
  L6: number[];
}

export interface EclipseShadow {
  p1: number[];
  p2: number[];
  p3: number[];
}
