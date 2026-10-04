/**
 * Штатный просмотрщик изображений Bitrix24 (BX.UI.Viewer).
 *
 * Разметка карточки фото повторяет поле «файл» универсальных списков:
 * <img data-viewer data-viewer-type="image" data-src="оригинал" data-title>.
 *
 * BX.UI.Viewer.bind() вешает делегированный обработчик на контейнер, поэтому
 * одного вызова на корень приложения достаточно: фотографии, добавляемые
 * Vue динамически (автоподгрузка при скролле, загрузка), подхватываются
 * автоматически, а коллекцией просмотра становятся все отрендеренные фото.
 */

type BxViewer = { bind: (container: HTMLElement, filter?: unknown) => void };
type BxLike = { UI?: { Viewer?: BxViewer } };

const bound = new WeakSet<HTMLElement>();

export function bindViewer(container: HTMLElement): void {
  if (bound.has(container)) {
    return;
  }

  const bx = (window as { BX?: BxLike }).BX;
  if (bx?.UI?.Viewer?.bind) {
    bx.UI.Viewer.bind(container);
    bound.add(container);
  }
}
