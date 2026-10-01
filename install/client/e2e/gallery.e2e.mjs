/**
 * E2E-проверка публичной галереи mtai.gallery (/gallery/) headless-браузером.
 *
 * Запуск (стенд bitrix24_test, chromium из apk):
 *   cd install/client/e2e
 *   docker run --rm --add-host bitrix.local:host-gateway \
 *     -v "$PWD/..:/app" -w /app/e2e node:22-alpine \
 *     sh -c "apk add --no-cache chromium >/dev/null && npm ci && npm run e2e"
 *
 * Скрипт: логин по кукам (API), альбомы, сетка с автоподгрузкой (32 фото > 24
 * на страницу), просмотрщик Bitrix24 по клику на фото, переименование фото,
 * создание альбома, загрузка файла через FilePond, удаление.
 * Результат: PASS/FAIL по шагам + скриншоты в e2e/artifacts/.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const BASE = process.env.E2E_BASE_URL || 'https://bitrix.local';
const LOGIN = process.env.E2E_USER || 'admin';
const PASSWORD = process.env.E2E_PASSWORD || 'Admin_Bx24t3st_2026';
const ARTIFACTS = new URL('./artifacts/', import.meta.url).pathname;

const results = [];
function report(step, ok, details = '') {
  results.push({ step, ok, details });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${step}${details ? ' — ' + details : ''}`);
}

fs.mkdirSync(ARTIFACTS, { recursive: true });

// 1. Куки авторизации через обычный POST логина
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
console.log(`login cookies: ${cookies.map((c) => c.name).join(', ')}`);

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

try {
  // 2. Страница /gallery/: рендер Vue-приложения
  await page.goto(`${BASE}/gallery/`, { waitUntil: 'domcontentloaded' });
  const albumCard = page.locator('.mtai-album', { hasText: 'Отпуск' });
  await albumCard.waitFor({ state: 'visible', timeout: 15000 });
  report('страница /gallery/ и список альбомов', true, await albumCard.first().innerText());
  await page.screenshot({ path: `${ARTIFACTS}01-albums.png`, fullPage: false });

  const albumBadge = await albumCard.first().locator('.mtai-album__count').innerText();
  report('счётчик фото на альбоме', parseInt(albumBadge, 10) >= 32, `бейдж: ${albumBadge}`);

  // 3. Открыть альбом: первая страница (24; автодоцепка может успеть больше)
  await albumCard.first().click();
  const cards = page.locator('.mtai-photo-card');
  await cards.first().waitFor({ state: 'visible', timeout: 15000 });
  await page.waitForFunction(() => document.querySelectorAll('.mtai-photo-card').length >= 24, null, { timeout: 15000 });
  report('первая страница сетки (24 шт.)', true, `карточек: ${await cards.count()}`);

  // 4. Автоподгрузка при скролле: остальное подгрузится.
  // Портал Bitrix24 (Air) скроллит внутренний контейнер, не window —
  // скроллим сентинел в ближайший скроллящийся родитель.
  await page.evaluate(() => {
    document.querySelector('.mtai-gallery__sentinel')?.scrollIntoView({ block: 'end' });
    window.scrollTo(0, document.body.scrollHeight);
  });
  await page.waitForFunction(
    () => document.querySelectorAll('.mtai-photo-card').length >= 32,
    null,
    { timeout: 20000 },
  );
  report('автоподгрузка при скролле', true, `карточек: ${await cards.count()}`);
  await page.screenshot({ path: `${ARTIFACTS}02-grid.png`, fullPage: false });

  // 5. FilePond на странице
  const pond = page.locator('.filepond--root');
  report('FilePond-загрузчик', await pond.count() > 0);

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

  // 7. Переименование фото через диалог
  const firstCard = cards.first();
  await firstCard.hover();
  await firstCard.locator('button[title="Изменить название и подпись"]').click();
  const nameInput = page.locator('.mtai-modal__input');
  await nameInput.waitFor({ state: 'visible', timeout: 5000 });
  await nameInput.fill('E2E переименованное фото');
  await page.locator('.mtai-modal__btn--primary').click();
  await page.waitForFunction(
    () => document.querySelector('.mtai-photo-card__name')?.textContent?.includes('E2E'),
    null,
    { timeout: 10000 },
  );
  report('переименование фото', true);

  // 8. Создание альбома
  await page.locator('.mtai-gallery__back').click();
  await page.locator('button', { hasText: 'Создать альбом' }).click();
  await page.locator('.mtai-modal__input').fill('E2E тестовый альбом');
  await page.locator('.mtai-modal__btn--primary').click();
  const newAlbum = page.locator('.mtai-album', { hasText: 'E2E тестовый альбом' }).first();
  await newAlbum.waitFor({ state: 'visible', timeout: 10000 });
  report('создание альбома', true);

  // 9. Загрузка файла через FilePond в новый альбом
  await newAlbum.click();
  await pond.waitFor({ state: 'visible', timeout: 10000 });
  const jpeg = Buffer.from(
    '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwcJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AJgA/9k=',
    'base64',
  );
  // FilePond прячет настоящий input под классом filepond--browser
  await page.setInputFiles('input.filepond--browser[type="file"]', {
    name: 'e2e-upload.jpg',
    mimeType: 'image/jpeg',
    buffer: jpeg,
  });
  const uploadedCard = page.locator('.mtai-photo-card', { hasText: 'e2e-upload' });
  await uploadedCard.waitFor({ state: 'visible', timeout: 20000 });
  report('загрузка через FilePond', true);

  // 10. Удаление загруженного фото (подтверждение)
  await uploadedCard.hover();
  await uploadedCard.locator('button[title="Удалить фотографию"]').click();
  const confirmBtn = page.locator('.mtai-modal__btn--danger');
  await confirmBtn.waitFor({ state: 'visible', timeout: 5000 });
  await confirmBtn.click();
  await page.waitForFunction(
    () => !document.querySelector('.mtai-photo-card') || document.querySelectorAll('.mtai-photo-card').length === 0,
    null,
    { timeout: 10000 },
  );
  report('удаление фото', true);

  // 11. Удаление E2E-альбома
  await page.locator('.mtai-gallery__back').click();
  const e2eAlbum = page.locator('.mtai-album', { hasText: 'E2E тестовый альбом' }).first();
  await e2eAlbum.hover();
  await e2eAlbum.locator('button[title="Удалить альбом"]').click();
  await page.locator('.mtai-modal__btn--danger').click();
  await page.waitForFunction(
    () => !document.body.textContent.includes('E2E тестовый альбом'),
    null,
    { timeout: 10000 },
  );
  report('удаление альбома', true);

  const relevantErrors = pageErrors.filter((e) => !e.includes('favicon') && !e.includes('net::ERR_ABORTED'));
  report('нет JS-ошибок страницы', relevantErrors.length === 0, relevantErrors.slice(0, 3).join(' | '));
} catch (e) {
  report('выполнение прервано', false, String(e).slice(0, 500));
  await page.screenshot({ path: `${ARTIFACTS}99-failure.png` }).catch(() => {});
} finally {
  await browser.close();
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} шагов пройдено`);
process.exit(failed.length ? 1 : 0);
