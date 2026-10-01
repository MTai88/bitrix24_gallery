# mtai.gallery — фотогалерея для Bitrix24

Модуль фотогалереи на инфоблоке **с расширенным управлением правами**
(`RIGHTS_MODE=E`): разделы инфоблока — альбомы, элементы — фотографии
(файл в `DETAIL_PICTURE`, подпись в `PREVIEW_TEXT`).

Публичная страница **`/gallery/`** — Vue 3 + Vite приложение (сборка на базе
[MTai88/vite](https://github.com/MTai88/vite)):

- сетка альбомов (обложка = свежая фотография, счётчик);
- сетка фотографий с **автоподрузкой при скролле** (курсорная пагинация);
- **загрузка через FilePond** (мультизагрузка, превью, EXIF-ориентация) —
  элемент создаётся сразу при выборе файла;
- просмотр штатным **просмотрщиком Bitrix24** (`BX.UI.Viewer`, как у полей
  «файл» универсальных списков) — клик по фото, карусель по всем фото сетки;
- редактирование из публички: право определяются правами на инфоблок
  (загрузка, переименование/удаление фото, создание/переименование/удаление
  альбомов) — сервер проверяет каждую операцию через
  `CIBlockRights::UserHasRightTo()`, интерфейс получает гранулярные флаги.

По умолчанию: администраторы (группа 1) — полный доступ (`X`), все
пользователи (группа 2) — чтение (`R`). Дальше права настраиваются в админке
(инфоблок «Галерея», вкладка «Доступ») — публичка и API учитывают их
автоматически, включая права по разделам.

## Установка

Стенд bitrix24_test:

```bash
docker exec bitrix24_test-php-1 php /var/www/html/local/tools/gallery_install.php install
```

или из админки: `Настройки → Модули → Галерея (mtai.gallery) → Установить`.

Установщик создаёт тип инфоблоков `mtai_gallery`, инфоблок «Галерея» с
расширенными правами, публикует страницу `/gallery/`, копирует компонент
`mtai:gallery.app` в `local/components/mtai/` и собранный клиент в
`/bitrix/js/mtai.gallery/dist/`.

## Сборка клиента

Клиент — Vite-проект в `install/client/` (сборка `dist/` закоммичена,
для установки Node не нужен). Пересборка:

```bash
cd install/client
npm ci
npm run build        # dist/ + manifest.json
# затем переустановить модуль (скопирует свежий dist)
```

Сборка в docker (без локального Node):

```bash
docker run --rm -v "$PWD:/app" -w /app node:22-alpine sh -c "npm ci && npm run build"
```

## E2E-проверка

Headless-chromium тест (альбомы, автоподгрузка, просмотрщик, FilePond
загрузка/удаление, диалоги) — `install/client/e2e/gallery.e2e.mjs`:

```bash
cd install/client/e2e
docker run --rm --add-host bitrix.local:host-gateway \
  -e NODE_TLS_REJECT_UNAUTHORIZED=0 -v "$PWD/..:/app" -w /app/e2e \
  node:22-alpine sh -c "apk add --no-cache chromium && npm i && node gallery.e2e.mjs"
```

## Архитектура

```
/gallery/  (install/public/gallery/index.php, шаблон портала)
  └─ mtai:gallery.app  (install/components/mtai/gallery.app)
       ├─ Extension::load('ui.viewer')            — просмотрщик Bitrix24
       ├─ конфиг в data-config (sessid, права, действия ajax)
       └─ /bitrix/js/mtai.gallery/dist/manifest.json → CSS + <script type=module>

Vue (install/client/src/)
  ├─ index.ts — монтирует App в #mtai-gallery-app
  ├─ js/api.ts — клиент ajax-контроллеров
  ├─ js/viewer.ts — BX.UI.Viewer.bind() на корень
  └─ vue/ — App, PhotoGrid, Uploader (FilePond), InfiniteSentinel, диалоги

AJAX: /bitrix/services/main/ajax.php?action=mtai:gallery.*
  ├─ album.list / album.save / album.delete
  └─ photo.list / photo.upload (FilePond process) / photo.revert
     / photo.update / photo.delete
```

### Грабли, учтённые в реализации

- **Ключ конфига контроллеров — `prefilters`**, не `filters`: старый вариант
  ядро молча игнорирует и применяет дефолтные фильтры (Csrf обязателен даже
  для GET).
- **`CIBlock::GetPermission()` не работает в расширенном режиме** (читает
  только `b_iblock_group`) — права через `CIBlockRights::UserHasRightTo()`.
- **Одинарные кавычки data-атрибутов переписываются шаблонизатором/компрессором
  Bitrix в двойные** — конфиг передаётся в двойных кавычках + `htmlspecialcharsbx`.
- **ESM-бандл подключается только `<script type=module>`** (не `addJs`),
  vendor-чанк — через `<link rel=modulepreload>`.
- CSS из node_modules не должен попадать в vendor-чанк (теряется при
  подключении) — исключён в `manualChunks`.
- IntersectionObserver срабатывает только при ИЗМЕНЕНИИ пересечения:
  автоподгрузка реагирует и на завершение загрузки, пока сентинел виден.
- `ResizeImageGet` требует из `b_file` поля `WIDTH/HEIGHT/MODULE_ID`.

## Требования

- PHP >= 8.1, модуль `iblock`
- Права на запись в `/local/components/`, `/bitrix/js/`, корень сайта
  (установщик копирует страницу и бандл)

## Лицензия

MIT
