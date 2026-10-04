/**
 * Точка входа галереи (mtai.gallery).
 *
 * Страница /gallery/ рендерит <div id="mtai-gallery-app" data-config="...">,
 * сюда приходят собранные main.js/main.css. Конфиг (sessid, права, действия
 * ajax) отдаёт PHP-компонент mtai:gallery.app.
 */
import { createApp } from 'vue';
import App from './vue/App.vue';
import './scss/main.css';

const mount = document.getElementById('mtai-gallery-app');

if (mount) {
  let config: Record<string, unknown> = {};
  try {
    config = JSON.parse(mount.dataset.config || '{}');
  } catch (e) {
    console.error('mtai.gallery: broken data-config', e);
  }

  createApp(App, { config }).mount(mount);
}
