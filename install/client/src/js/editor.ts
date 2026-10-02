/**
 * Штатный редактор изображений Bitrix24 (PhotoEditorSDK из модуля «Сайты»)
 * через обёртку BX.Mtai.ImageEditor (расширение mtai.image_editor,
 * репозиторий bitrix24_image_editor): полноэкранный редактор (кадрирование,
 * поворот, фильтры, стикеры, текст) для любого изображения по URL,
 * результат — File (или null при закрытии без сохранения).
 */

type MtaiImageEditor = new (image: HTMLImageElement) => {
  edit: () => Promise<File | null>;
};

function getEditorClass(): MtaiImageEditor | null {
  const bx = (window as { BX?: { Mtai?: { ImageEditor?: MtaiImageEditor } } }).BX;
  return bx?.Mtai?.ImageEditor ?? null;
}

/** Расширение mtai.image_editor доступно на странице. */
export function isEditorAvailable(): boolean {
  return getEditorClass() !== null;
}

/**
 * Открывает редактор с изображением по URL; резолвит отредактированный File
 * или null, если редактор закрыли без сохранения. null также означает
 * «редактор недоступен» (расширение не установлено).
 */
export async function editImage(url: string): Promise<File | null> {
  const Editor = getEditorClass();
  if (!Editor) {
    return null;
  }

  const image = new Image();
  image.src = url;
  await new Promise<void>((resolve, reject) => {
    if (image.complete && image.naturalWidth > 0) {
      resolve();
      return;
    }
    image.onload = () => resolve();
    image.onerror = () => reject(new Error('Не удалось загрузить изображение для редактирования'));
  });

  return new Editor(image).edit();
}
