import { helpArticles } from './help-content';
import { mountFitting } from './features/fitting';
import { html } from './lib/dom';
import { icon } from './lib/icons';

export function createHelpView(container: HTMLElement): { destroy(): void } {
  container.innerHTML = `<div class="help-layout"><nav class="help-toc card" aria-label="说明章节"><h3>${icon('book')}原作说明</h3>${helpArticles.map((chapter) => `<button data-chapter="${chapter.id}" ${chapter.id === 1 ? 'aria-current="page"' : ''}><span>${String(chapter.id).padStart(2, '0')}</span>${html(chapter.title)}</button>`).join('')}<p>许剑伟 · 寿星天文历<br>保留原作公式、示意图与说明。</p></nav><article class="help-article card" id="help-article"></article></div>`;
  let disposeFitting: (() => void) | undefined;
  const show = (id: number): void => {
    const chapter = helpArticles.find((item) => item.id === id) ?? helpArticles[0];
    disposeFitting?.();
    const article = container.querySelector<HTMLElement>('#help-article')!;
    article.innerHTML = `<header><span class="eyebrow">寿星天文历 · 原版帮助 / 第 ${chapter.id} 章</span><h2>${html(chapter.title)}</h2></header><div class="help-prose">${chapter.body}</div>`;
    container.querySelectorAll<HTMLElement>('[data-chapter]').forEach((button) => {
      if (Number(button.dataset.chapter) === chapter.id) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    if (chapter.id === 6) {
      const labels: Record<string, string> = { Ck: '序列斜率 k', Cb: '序列截距 b', Cn: '序列长度 N', Ck0: '初始斜率 k', Cb0: '初始截距 b', Ca0: '误差宽度 a', Cjg: '拟合结果' };
      Object.entries(labels).forEach(([id, label]) => article.querySelector(`#${id}`)?.setAttribute('aria-label', label));
      disposeFitting = mountFitting(article);
    }
  };
  const onClick = (event: MouseEvent): void => {
    const target = (event.target as Element).closest<HTMLElement>('[data-chapter]');
    if (target) { show(Number(target.dataset.chapter)); container.scrollIntoView({ block: 'start' }); }
  };
  container.addEventListener('click', onClick);
  show(1);
  return { destroy() { disposeFitting?.(); container.removeEventListener('click', onClick); } };
}
