import { helpArticles } from './help-content.js';
import { mountFitting } from './features/fitting.js';
import { html } from './lib/dom.js';
import { icon } from './lib/icons.js';
export function createHelpView(container) {
    container.innerHTML = `<div class="help-layout"><nav class="help-toc card" aria-label="说明章节"><h3>${icon('book')}原作说明</h3>${helpArticles.map((chapter) => `<button data-chapter="${chapter.id}" ${chapter.id === 1 ? 'aria-current="page"' : ''}><span>${String(chapter.id).padStart(2, '0')}</span>${html(chapter.title)}</button>`).join('')}<p>许剑伟 · 寿星天文历<br>保留原作公式、示意图与说明。</p></nav><article class="help-article card" id="help-article"></article></div>`;
    let disposeFitting;
    const show = (id) => {
        const chapter = helpArticles.find((item) => item.id === id) ?? helpArticles[0];
        disposeFitting?.();
        const article = container.querySelector('#help-article');
        article.innerHTML = `<header><span class="eyebrow">寿星天文历 · 原版帮助 / 第 ${chapter.id} 章</span><h2>${html(chapter.title)}</h2></header><div class="help-prose">${chapter.body}</div>`;
        container.querySelectorAll('[data-chapter]').forEach((button) => {
            if (Number(button.dataset.chapter) === chapter.id)
                button.setAttribute('aria-current', 'page');
            else
                button.removeAttribute('aria-current');
        });
        if (chapter.id === 6) {
            const labels = { Ck: '序列斜率 k', Cb: '序列截距 b', Cn: '序列长度 N', Ck0: '初始斜率 k', Cb0: '初始截距 b', Ca0: '误差宽度 a', Cjg: '拟合结果' };
            Object.entries(labels).forEach(([id, label]) => article.querySelector(`#${id}`)?.setAttribute('aria-label', label));
            disposeFitting = mountFitting(article);
        }
    };
    const onClick = (event) => {
        const target = event.target.closest('[data-chapter]');
        if (target) {
            show(Number(target.dataset.chapter));
            container.scrollIntoView({ block: 'start' });
        }
    };
    container.addEventListener('click', onClick);
    show(1);
    return { destroy() { disposeFitting?.(); container.removeEventListener('click', onClick); } };
}
