export function html(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char]!));
}

export function element<T extends Element = HTMLElement>(selector: string, root: ParentNode = document): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`找不到界面元素：${selector}`);
  return found;
}

export function textFromHtml(value: string): string {
  const template = document.createElement('template');
  template.innerHTML = value;
  return template.content.textContent?.trim() ?? '';
}

export function notify(message: string, kind: 'success' | 'error' = 'success'): void {
  const host = element('#toast-host');
  const toast = document.createElement('div');
  toast.className = `toast toast--${kind}`;
  toast.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  toast.textContent = message;
  host.append(toast);
  window.setTimeout(() => toast.remove(), 4500);
}

export function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

export function parseYear(value: string): number {
  const input = value.trim();
  if (!/^(?:[Bb*][1-9]\d*|-?\d+)$/.test(input)) {
    throw new Error('请输入整数年份；公元前可输入 B1（公元前 1 年）。');
  }
  const year = /^[Bb*]/.test(input) ? 1 - Number(input.slice(1)) : Number(input);
  if (year < -4712 || year > 9999) throw new Error('本版沿用原历法的范围：天文纪年 -4712 至 9999。');
  return year;
}

export function displayYear(year: number): string {
  return year <= 0 ? `公元前 ${1 - year}` : String(year);
}
