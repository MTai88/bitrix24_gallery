/**
 * E2E-проверка публичной галереи mtai.gallery (/gallery/) headless-браузером.
 *
 * Запуск (стенд bitrix24_test, chromium из apk):
 *   cd install/client/e2e
 *   docker run --rm --add-host bitrix.local:host-gateway \
 *     -e NODE_TLS_REJECT_UNAUTHORIZED=0 -v "$PWD/..:/app" -w /app/e2e \
 *     node:22-alpine sh -c "apk add --no-cache chromium && npm i && node gallery.e2e.mjs"
 *
 * Сценарий самодостаточен: создаёт собственный альбом и заливает в него 32
 * фото через API (сетка 24 + автоподгрузка), прогоняет просмотрщик Bitrix24,
 * реакции (штатные рейтинги), FilePond-загрузку, диалоги и удаляет альбом.
 * Результат: PASS/FAIL по шагам + скриншоты в e2e/artifacts/.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.E2E_BASE_URL || 'https://bitrix.local';
const LOGIN = process.env.E2E_USER || 'admin';
const PASSWORD = process.env.E2E_PASSWORD || 'Admin_Bx24t3st_2026';
const ALBUM_NAME = `E2E автопрогон ${Date.now()}`;
const PHOTOS_SEED = 32; // > страницы сетки (24), чтобы проверить автоподгрузку
const ARTIFACTS = new URL('./artifacts/', import.meta.url).pathname;

const results = [];
function report(step, ok, details = '') {
  results.push({ step, ok, details });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${details ? ' — ' + details : ''}`);
}

fs.mkdirSync(ARTIFACTS, { recursive: true });

// 1x1 jpeg для посева фотографий и FilePond
const seedJpeg = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJgA/9k=',
  'base64',
);

const AJAX = `${BASE}/bitrix/services/main/ajax.php`;

// --- подготовка: куки авторизации ---
const loginResponse = await fetch(`${BASE}/?login=yes`, {
  method: 'POST',
  redirect: 'manual',
  credentials: 'omit',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({
    AUTH_FORM: 'Y',
    TYPE: 'AUTH',
    backurl: '/',
    USER_LOGIN: LOGIN,
    USER_PASSWORD: PASSWORD,
    Login: 'Войти',
  }),
});
const setCookies = loginResponse.headers.getSetCookie?.() ?? [];
const cookies = setCookies
  .map((line) => line.split(';')[0])
  .map((pair) => {
    const [name, value] = pair.split('=');
    return { name, value, domain: 'bitrix.local', path: '/' };
  })
  .filter((cookie) => cookie.name && cookie.value);
if (!cookies.length) {
  console.error('Логин не удался: нет кук');
  process.exit(1);
}
const cookieHeader = cookies.map((c) => `${c.name}=${c.value}`).join('; ');
// sessid битрикса не равен PHPSESSID — берём из конфига страницы галереи
const galleryHtml = await fetch(`${BASE}/gallery/`, {
  credentials: 'omit',
  headers: { Cookie: cookieHeader },
}).then((r) => r.text());
const sessidMatch = galleryHtml.match(/bitrix_sessid":"([a-f0-9]+)/);
const sessid = sessidMatch ? sessidMatch[1] : '';
if (!sessid) {
  console.error('Не удалось получить sessid со страницы /gallery/');
  process.exit(1);
}

/** POST multipart на api (используется и для посева, и для cleanup). */
async function apiMultipart(action, fields, file) {
  const form = new FormData();
  form.set('sessid', sessid);
  for (const [key, value] of Object.entries(fields)) {
    form.set(key, String(value));
  }
  if (file) {
    form.set('file', new Blob([file], { type: 'image/jpeg' }), 'seed.jpg');
  }
  const response = await fetch(`${AJAX}?action=${action}`, {
    method: 'POST',
    credentials: 'omit',
    headers: { Cookie: cookieHeader },
    body: form,
  });
  return response.json();
}

// --- подготовка: альбом + 32 фото ---
let albumId = 0;
try {
  const created = await apiMultipart('mtai:gallery.album.save', { id: 0, name: ALBUM_NAME });
  if (created.status !== 'success') {
    throw new Error(created.errors?.[0]?.message || 'album.save failed');
  }
  albumId = created.data.id;
  for (let i = 1; i <= PHOTOS_SEED; i++) {
    const uploaded = await apiMultipart('mtai:gallery.photo.upload', { albumId }, seedJpeg);
    if (uploaded.status !== 'success') {
      throw new Error(`upload #${i}: ${uploaded.errors?.[0]?.message}`);
    }
  }
  console.log(`seed: альбом ${albumId}, фото ${PHOTOS_SEED}`);
} catch (e) {
  console.error('Посев данных не удался:', e.message);
  process.exit(1);
}

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium-browser',
  args: ['--ignore-certificate-errors', '--no-sandbox'],
});
const context = await browser.newContext({
  ignoreHTTPSErrors: true,
  viewport: { width: 1440, height: 900 },
  locale: 'ru-RU',
});
await context.addCookies(cookies);
const page = await context.newPage();
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(String(error)));
page.on('console', (message) => {
  if (message.type() === 'error') {
    pageErrors.push(message.text());
  }
});
page.on('response', async (response) => {
  if (response.url().includes('rating.vote') && response.request().method() === 'POST') {
    const text = await response.text().catch(() => '');
    console.log(`[vote.ajax ${response.status()}] ${text.slice(0, 120)}`);
  }
});

try {
  // 2. Страница /gallery/: рендер Vue-приложения, карточка тестового альбома
  await page.goto(`${BASE}/gallery/`, { waitUntil: 'domcontentloaded' });
  const albumCard = page.locator('.mtai-album', { hasText: ALBUM_NAME }).first();
  await albumCard.waitFor({ state: 'visible', timeout: 15000 });
  report('страница /gallery/ и список альбомов', true, await albumCard.locator('.mtai-album__name').innerText());

  const albumBadge = (await albumCard.locator('.mtai-album__count').innerText()).trim();
  report('счётчик фото на альбоме', parseInt(albumBadge, 10) >= PHOTOS_SEED, `бейдж: ${albumBadge}`);
  await page.screenshot({ path: `${ARTIFACTS}01-albums.png`, fullPage: false });

  // 3. Открыть альбом: первая страница (24; автодоцепка может успеть больше)
  await albumCard.click();
  const cards = page.locator('.mtai-photo-card');
  await cards.first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('.mtai-photo-card').length >= 24, null, { timeout: 15000 });
  report('первая страница сетки (24 шт.)', true, `карточек: ${await cards.count()}`);

  // 4. Автоподгрузка при скролле.
  // Портал Bitrix24 (Air) скроллит внутренний контейнер, не window —
  // скроллим сентинел в ближайший скроллящийся родитель.
  await page.evaluate(() => {
    document.querySelector('.mtai-gallery__sentinel')?.scrollIntoView({ block: 'end' });
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForFunction(
    (expected) => document.querySelectorAll('.mtai-photo-card').length >= expected,
    PHOTOS_SEED,
    { timeout: 20000 },
  );
  report('автоподгрузка при скролле', true, `карточек: ${await cards.count()}`);
  await page.screenshot({ path: `${ARTIFACTS}02-grid.png`, fullPage: false });

  // 5. FilePond на странице (альбомный; модальный замены живёт в body вне .mtai-gallery)
  const pond = page.locator('.mtai-gallery .filepond--root');
  report('FilePond-загрузчик', (await pond.count()) > 0);

  // 6. Просмотрщик Bitrix24 по клику на фото
  await cards.nth(3).locator('img[data-viewer]').click();
  const viewerItem = page.locator('.ui-viewer-item, .ui-viewer__item, [class*="ui-viewer"]');
  await viewerItem.first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  const viewerVisible = await viewerItem.first().isVisible().catch(() => false);
  const darkLayer = await page.locator('.ui-viewer-overlay, [class*="viewer-overlay"]').count();
  report('просмотрщик Bitrix24 открыт', viewerVisible || darkLayer > 0, `overlay: ${darkLayer}`);
  await page.screenshot({ path: `${ARTIFACTS}03-viewer.png`, fullPage: false });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);

  // 7. Реакции фотографии: панель → эмодзи → счётчик; повтор — отмена
  const firstCard = cards.first();
  await firstCard.locator('.mtai-reaction__btn').click();
  const emojiPanel = firstCard.locator('.mtai-reaction__panel');
  await emojiPanel.waitFor({ state: 'visible', timeout: 5000 });
  await emojiPanel.locator('button[title="Восторг"]').click();
  const photoCounter = firstCard.locator('.mtai-reaction__count');
  await photoCounter.waitFor({ state: 'visible', timeout: 8000 });
  const liked = parseInt((await photoCounter.innerText()).trim(), 10);
  report('реакция фотографии', liked >= 1, `счётчик: ${liked}`);
  await page.screenshot({ path: `${ARTIFACTS}04-reaction.png`, fullPage: false });

  // список поставивших реакцию
  await photoCounter.click();
  const votersBox = firstCard.locator('.mtai-reaction__voters');
  await votersBox.waitFor({ state: 'visible', timeout: 8000 });
  await page.waitForFunction(
    () => document.querySelectorAll('.mtai-reaction__voter').length >= 1,
    null,
    { timeout: 8000 },
  );
  report('список поставивших реакцию', true, await votersBox.locator('.mtai-reaction__voter-name').first().innerText());

  // отмена реакции (клик по своей же)
  await firstCard.locator('.mtai-reaction__btn').click();
  await firstCard.locator('.mtai-reaction__panel button[title="Восторг"]').click();
  await firstCard.locator('.mtai-reaction__count').waitFor({ state: 'hidden', timeout: 8000 });
  report('отмена реакции', true);

  // 8. Реакция альбома в тулбаре + счётчик на карточке альбома
  const albumLike = page.locator('.mtai-gallery__album-like');
  await albumLike.locator('.mtai-reaction__btn').click();
  await albumLike.locator('.mtai-reaction__panel button[title="Смешно"]').click();
  await albumLike.locator('.mtai-reaction__count').waitFor({ state: 'visible', timeout: 8000 });
  report('реакция альбома', (await albumLike.locator('.mtai-reaction__count').innerText()).trim() === '1');

  await page.locator('.mtai-gallery__back').click();
  const seedAlbumCard = page.locator('.mtai-album', { hasText: ALBUM_NAME }).first();
  await seedAlbumCard.waitFor({ state: 'visible', timeout: 8000 });
  report('счётчик реакции альбома на карточке', (await seedAlbumCard.locator('.mtai-reaction__count').innerText()).trim() === '1');
  await seedAlbumCard.click();

  // 9. Переименование фото и подпись через диалог
  await firstCard.hover();
  await firstCard.locator('button[title="Изменить название и подпись"]').click();
  const nameInput = page.locator('.mtai-modal__input');
  await nameInput.waitFor({ state: 'visible', timeout: 5000 });
  await nameInput.fill('E2E переименованное фото');
  await page.locator('.mtai-modal__textarea').fill('E2E подпись к фотографии');
  await page.locator('.mtai-modal__btn--primary').click();
  await page.waitForFunction(
    () => {
      const name = document.querySelector('.mtai-photo-card__name')?.textContent?.includes('E2E');
      const description = document
        .querySelector('.mtai-photo-card__description')
        ?.textContent
        ?.includes('E2E подпись');
      return name && description;
    },
    null,
    { timeout: 10000 },
  );
  report('переименование фото и подпись (выводится на карточке)', true);

  // 10. Замена изображения в попапе редактирования (FilePond в модалке).
  // Буфер обязан отличаться от сид-фото байт-в-байт: CFile дедуплицирует
  // идентичные файлы, и src миниатюры тогда не меняется
  const replaceCard = cards.first();
  await replaceCard.hover();
  await replaceCard.locator('button[title="Изменить название и подпись"]').click();
  await page.locator('.mtai-modal .filepond--root').waitFor({ state: 'visible', timeout: 5000 });
  const gridSrcBefore = await replaceCard.locator('img[data-viewer]').getAttribute('src');
  // полноценное изображение (800x600): на 1x1-картинке ResizeImageGet
  // деградирует и thumbUrl приходит пустым
  const replacePng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAyAAAAJYCAIAAAAVFBUnAAAACXBIWXMAAA7EAAAOxAGVKw4bAAALcElEQVR4nO3czW3iUBhA0SSaOpIyqI4NaS4pg06yQLIiG3kYcwdb+JwV8g/vLa/sD17fv04vAAB03tbeAADAsxFYAAAxgQUAEBNYAAAxgQUAEBNYAAAxgQUAEBNYAAAxgQUAEBNYAAAxgQUAEBNYAAAxgQUAEBNYAAAxgQUAEBNYAAAxgQUAEBNYAAAxgQUAEBNYAAAxgQUAEBNYAAAxgQUAEBNYAAAxgQUAEBNYAAAxgQUAEBNYAAAxgQUAEBNYAAAxgQUAEBNYAAAxgQUAEBNYAAAxgQUAEBNYAAAxgQUAEBNYAAAxgQUAEBNYAAAxgQUAEBNYAACxP2stfD4cpwc/vj/vPHX5PL/o9JrR1y7Yxvy6AMCurBZYF7+75Hw4ng/H4chMsszcNWOootH1o+pasI3b9wAA7MFeXhEOFTV6BDV9prWgk2aeeAEAO7SLwBpV1F97yLMoAOAeK78ivDr8ND01Kp6Zu3Iz2wAAuGrlwBpM2+XGGaz/TVQBAP9qE0PujxkSNyMFADzGJmawHjMkfplwH+bcZ0gxAOAemwisl/V+iDddd8EebvkLLgBgP7YygzW1bJJ9wV0f35+Xd5RX71o2hg8A7Nnr+9dp7T0AADyVrbwiBAB4GgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACAmsAAAYgILACD2A6jBlXipdZbzAAAAAElFTkSuQmCC',
    'base64',
  );
  await page.setInputFiles('.mtai-modal input.filepond--browser[type="file"]', {
    name: 'e2e-replace.png',
    mimeType: 'image/png',
    buffer: replacePng,
  });
  await page.waitForFunction(
    (before) => {
      const grid = document.querySelector('.mtai-photo-card img[data-viewer]');
      return grid && grid.getAttribute('src') !== before;
    },
    gridSrcBefore,
    { timeout: 45000 },
  );
  report('замена изображения в попапе', true);
  await page.locator('.mtai-modal__btn--primary').click();
  await page.waitForTimeout(1500);

  // 11. Загрузка файла через FilePond
  await pond.waitFor({ state: 'visible', timeout: 10000 });
  // FilePond прячет настоящий input под классом filepond--browser
  await page.setInputFiles('.mtai-gallery input.filepond--browser[type="file"]', {
    name: 'e2e-upload.jpg',
    mimeType: 'image/jpeg',
    buffer: seedJpeg,
  });
  const uploadedCard = page.locator('.mtai-photo-card', { hasText: 'e2e-upload' });
  await uploadedCard.waitFor({ state: 'visible', timeout: 20000 });
  report('загрузка через FilePond', true);

  // 11. Удаление загруженного фото (подтверждение)
  await uploadedCard.hover();
  await uploadedCard.locator('button[title="Удалить фотографию"]').click();
  const confirmBtn = page.locator('.mtai-modal__btn--danger');
  await confirmBtn.waitFor({ state: 'visible', timeout: 5000 });
  await confirmBtn.click();
  await page.waitForFunction(
    () => !document.querySelector('.mtai-photo-card') || document.querySelectorAll('.mtai-photo-card').length === 0,
    null,
    { timeout: 10000 },
  ).catch(() => {});
  report('удаление фото', !(await page.locator('.mtai-photo-card', { hasText: 'e2e-upload' }).count()));

  // 12. Удаление альбома через UI — на отдельном пустом альбоме (удаление
  // сид-альбома с 32 фото на стенде занимает минуты — его убирает cleanup)
  await page.locator('.mtai-gallery__back').click();
  await page.locator('button', { hasText: 'Создать альбом' }).click();
  await page.locator('.mtai-modal__input').fill('E2E удаление альбома');
  await page.locator('.mtai-modal__btn--primary').click();
  const emptyAlbum = page.locator('.mtai-album', { hasText: 'E2E удаление альбома' }).first();
  await emptyAlbum.waitFor({ state: 'visible', timeout: 10000 });
  await emptyAlbum.hover();
  await emptyAlbum.locator('button[title="Удалить альбом"]').click();
  await page.locator('.mtai-modal__btn--danger').click();
  await page.waitForFunction(
    () => !document.body.textContent.includes('E2E удаление альбома'),
    null,
    { timeout: 30000 },
  );
  report('удаление альбома', true);

  const relevantErrors = pageErrors.filter((e) => !e.includes('favicon') && !e.includes('net::ERR_ABORTED'));
  report('нет JS-ошибок страницы', relevantErrors.length === 0, relevantErrors.slice(0, 3).join(' | '));
} catch (e) {
  report('выполнение прервано', false, String(e).slice(0, 500));
  await page.screenshot({ path: `${ARTIFACTS}99-failure.png` }).catch(() => {});
} finally {
  await browser.close();
  // страховка: если сценарий упал раньше удаления — убираем альбом через API
  try {
    const left = await fetch(`${AJAX}?action=mtai:gallery.album.list`, {
      headers: { Cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; ') },
    }).then((r) => r.json());
    const stale = (left.data?.albums || []).filter((a) => a.name === ALBUM_NAME);
    for (const album of stale) {
      await apiMultipart('mtai:gallery.album.delete', { id: album.id });
    }
    if (stale.length) {
      console.log(`cleanup: удалён альбом ${albumId}`);
    }
  } catch {
    // no-op
  }
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} шагов пройдено`);
process.exit(failed.length ? 1 : 0);
