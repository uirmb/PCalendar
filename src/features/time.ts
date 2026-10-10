import { JD, J2000, dt_T } from '../engine/engine';
import { localToUTByOffset } from '../lib/time';
import type { FeatureContext } from './types';

/** 我只在显示和当地时输入边界换算时区，天文算法的 TD/JDE 保持原来的单位。 */
export class FeatureTime {
  constructor(private readonly context: FeatureContext) {}

  offsetAt(utJ2000: number): number {
    const offset = this.context.timezoneAt?.(utJ2000) ?? this.context.timezone;
    if (!Number.isFinite(offset)) throw new Error('所选时区没有有效的偏移量。');
    return offset;
  }

  localToUT(localJ2000: number): number {
    if (!this.context.timezoneAt) return localJ2000 - this.context.timezone / 24;
    return localToUTByOffset(localJ2000, (ut) => this.offsetAt(ut));
  }

  localToTD(localJ2000: number): number {
    // 我保留原控制器在输入历元取 ΔT 的计算口径。
    return this.localToUT(localJ2000) + dt_T(localJ2000);
  }

  utToLocal(utJ2000: number): number { return utJ2000 + this.offsetAt(utJ2000) / 24; }
  tdToUT(tdJ2000: number): number { return tdJ2000 - dt_T(tdJ2000); }
  tdToLocal(tdJ2000: number): number { return this.utToLocal(this.tdToUT(tdJ2000)); }
  formatUT(utJ2000: number): string { return JD.JD2str(this.utToLocal(utJ2000) + J2000); }
  formatTD(tdJ2000: number): string {
    const offset = this.offsetAt(this.tdToUT(tdJ2000));
    return JD.JD2str(tdJ2000 + J2000 + offset / 24 - dt_T(tdJ2000));
  }

  /** 引擎农历事件返回北京时间日数，我还原 UT 后只换显示，保留农历日界。 */
  beijingToLocal(beijingJ2000: number): number {
    return beijingJ2000 + (this.offsetAt(beijingJ2000 - 8 / 24) - 8) / 24;
  }

  zoneText(utJ2000: number): string {
    const offset = this.offsetAt(utJ2000), minutes = Math.round(Math.abs(offset) * 60);
    return `UTC${offset < 0 ? '−' : '+'}${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  }

  tdZoneText(tdJ2000: number): string { return this.zoneText(this.tdToUT(tdJ2000)); }
}
