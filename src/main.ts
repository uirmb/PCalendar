import '@heroui-prebuilt.css';
import './styles.css';
import { createApp } from './app';

const root = document.getElementById('app');
if (!root) throw new Error('页面缺少应用挂载点。');
const dispose = createApp(root);
if (import.meta.hot) import.meta.hot.dispose(dispose);
