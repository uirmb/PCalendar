import { dateSummary } from './calendar-view';
import { html } from './lib/dom';
import type { AppState } from './lib/state';

/** 我保留桌面悬停与 Ctrl 暂留，并让点击后的日期详情独立保存。 */
export function mountDayPreview(container: HTMLElement, getState: () => AppState): () => void {
  const preview = document.createElement('div');
  preview.id = 'day-hover-preview';
  preview.className = 'day-hover-preview';
  preview.setAttribute('role', 'tooltip');
  preview.hidden = true;
  container.append(preview);
  let current: HTMLElement | null = null;
  let clickedDate = '';

  function hide(): void {
    preview.hidden = true;
    current?.removeAttribute('aria-describedby');
    current = null;
  }
  function place(event: PointerEvent): void {
    const bounds = preview.getBoundingClientRect();
    preview.style.left = `${Math.max(10, Math.min(event.clientX + 16, window.innerWidth - bounds.width - 12))}px`;
    preview.style.top = `${Math.max(10, Math.min(event.clientY + 18, window.innerHeight - bounds.height - 12))}px`;
  }
  function over(event: PointerEvent): void {
    if (event.pointerType !== 'mouse' || event.ctrlKey) return;
    const button = (event.target as Element).closest<HTMLElement>('.calendar-day[data-calendar-date]');
    if (!button || button === current) return;
    if (button.dataset.calendarDate === clickedDate) return;
    clickedDate = '';
    hide(); current = button;
    const [year, month, day] = button.dataset.calendarDate!.split(',').map(Number);
    const lines = dateSummary({ ...getState(), year, month, selectedDay: day }, { compact: true }).split('\n');
    preview.innerHTML = `<strong>${html(lines[0].replace('寿星天文历 · ', ''))}</strong><p>${lines.slice(1).map(html).join('<br>')}</p><small>按住 Ctrl 暂留预览 · 点击固定详情</small>`;
    preview.hidden = false;
    button.setAttribute('aria-describedby', preview.id);
    place(event);
  }
  function out(event: PointerEvent): void {
    if (event.ctrlKey || !current) return;
    if (event.relatedTarget instanceof Node && current.contains(event.relatedTarget)) return;
    hide();
  }
  function move(event: PointerEvent): void {
    const button = (event.target as Element).closest<HTMLElement>('.calendar-day[data-calendar-date]');
    if (button?.dataset.calendarDate !== clickedDate) clickedDate = '';
    if (!preview.hidden && !event.ctrlKey) place(event);
  }
  function click(event: MouseEvent): void {
    clickedDate = (event.target as Element).closest<HTMLElement>('.calendar-day[data-calendar-date]')?.dataset.calendarDate ?? '';
    hide();
  }
  function key(event: KeyboardEvent): void { if (event.key === 'Control' || event.key === 'Escape') hide(); }
  container.addEventListener('pointerover', over);
  container.addEventListener('pointerout', out);
  container.addEventListener('pointermove', move);
  container.addEventListener('click', click);
  window.addEventListener('keyup', key);
  window.addEventListener('scroll', hide, true);
  return () => {
    container.removeEventListener('pointerover', over); container.removeEventListener('pointerout', out);
    container.removeEventListener('pointermove', move); container.removeEventListener('click', click);
    window.removeEventListener('keyup', key); window.removeEventListener('scroll', hide, true); preview.remove();
  };
}
