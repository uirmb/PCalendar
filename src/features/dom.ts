export type FeatureField = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export function escapeHTML(value: unknown): string {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
}

export class FeatureDOM {
  constructor(readonly container: HTMLElement) {}

  element<T extends HTMLElement = HTMLElement>(id: string): T {
    const element = this.container.querySelector<T>(`[id="${id}"]`);
    if (!element) throw new Error(`找不到功能控件：${id}`);
    return element;
  }

  field(id: string): FeatureField { return this.element<FeatureField>(id); }
  value(id: string): string { return this.field(id).value; }
  set(id: string, value: string | number): void { this.field(id).value = String(value); }
  checked(id: string): boolean { return this.element<HTMLInputElement>(id).checked; }
  check(id: string, checked: boolean): void { this.element<HTMLInputElement>(id).checked = checked; }
  number(id: string, min = -Infinity, max = Infinity): number {
    const value = Number(this.value(id));
    if (!Number.isFinite(value) || value < min || value > max) {
      this.field(id).focus();
      const label = this.field(id).getAttribute('aria-label') || id;
      throw new Error(`${label}请输入${Number.isFinite(min) && Number.isFinite(max) ? ` ${min} 至 ${max} 范围内的` : ''}有效数字。`);
    }
    return value;
  }
  count(id: string, max = Number.MAX_SAFE_INTEGER): number {
    const value = this.number(id, 1, max);
    if (!Number.isInteger(value)) throw new Error('计算个数必须为整数。');
    return value;
  }
  text(id: string, value: unknown): void { this.element(id).textContent = String(value); }
  html(id: string, html: string): void { this.element(id).innerHTML = html; }
}

/** 我保留原来的 B1、b1、*1 公元前年份输入方式。 */
export function year2Ayear(value: string | number): number {
  const source = String(value).trim().replace(/[^0-9Bb*\-]/g, '');
  const beforeCommonEra = /^[Bb*]/.test(source);
  const number = Number(beforeCommonEra ? source.slice(1) : source);
  if (!source || !Number.isInteger(number) || (beforeCommonEra && number <= 0)) {
    throw new Error('请输入有效年份，公元前纪年使用 B1、B2 等（没有公元前 0 年）。');
  }
  return beforeCommonEra ? 1 - number : number;
}

export function Ayear2year(value: number): string { return value <= 0 ? `B${1 - value}` : String(value); }

export function timeStr2hour(value: string): number {
  const cleaned = String(value).replace(/[^0-9:.]/g, '');
  const parts = cleaned.split(':');
  const h = Number(parts.length === 1 ? parts[0]!.slice(0, 2) : parts[0]);
  const m = Number(parts.length === 1 ? parts[0]!.slice(2, 4) : parts[1] || 0);
  const s = Number(parts.length === 1 ? parts[0]!.slice(4, 6) : parts[2] || 0);
  if (!cleaned || !Number.isFinite(h + m + s)) throw new Error('时间请使用时:分:秒或 HHMMSS 格式。');
  return h + m / 60 + s / 3600;
}
