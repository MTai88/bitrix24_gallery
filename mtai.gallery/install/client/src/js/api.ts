/**
 * Клиент ajax-контроллеров модуля mtai.gallery.
 *
 * Все запросы идут на /bitrix/services/main/ajax.php?action=mtai:gallery.*,
 * формат ответа Bitrix: {status: 'success'|'error', data, errors}.
 */
import type { GalleryConfig } from './types';

export class ApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export class Api {
  private readonly config: GalleryConfig;

  constructor(config: GalleryConfig) {
    this.config = config;
  }

  get sessid(): string {
    return this.config.sessid;
  }

  /** URL действия для FilePond (server.process). */
  actionUrl(action: string, params: Record<string, string | number> = {}): string {
    const query = new URLSearchParams({ action });
    for (const [key, value] of Object.entries(params)) {
      query.set(key, String(value));
    }
    return `${this.config.ajaxUrl}?${query.toString()}`;
  }

  async albumList(): Promise<import('./types').AlbumListResponse> {
    return this.call('albumList');
  }

  async albumSave(id: number, name: string): Promise<number> {
    const data = await this.post('albumSave', { id, name });
    return data.id as number;
  }

  async albumDelete(id: number): Promise<void> {
    await this.post('albumDelete', { id });
  }

  /**
   * Страница сетки альбома. cursor здесь — offset пагинации (0 = начало,
   * null пришёл — страницы закончились).
   */
  async photoList(albumId: number, cursor: number | null, limit: number): Promise<import('./types').PhotoPage> {
    const params: Record<string, string | number> = { albumId, limit };
    if (cursor !== null) {
      params.cursor = cursor;
    }
    return this.call('photoList', params);
  }

  /** Ручная сортировка фотографий: порядок id видимой части сетки. */
  async photoReorder(albumId: number, ids: number[]): Promise<void> {
    await this.post('photoReorder', { albumId, ids: ids.join(',') });
  }

  /** Ручная сортировка альбомов: порядок id. */
  async albumReorder(ids: number[]): Promise<void> {
    await this.post('albumReorder', { ids: ids.join(',') });
  }

  /**
   * Замена изображения существующей фотографии файлом (из редактора и т.п.).
   * Возвращает обновлённую карточку.
   */
  async photoReplace(id: number, file: File): Promise<import('./types').Photo> {
    const body = new FormData();
    body.set('sessid', this.config.sessid);
    body.set('id', String(id));
    // файл из редактора может прийти без расширения в имени — серверная
    // валидация смотрит расширение, восстановим его из mime-типа
    let name = file.name || 'photo';
    if (!/\.[a-z0-9]+$/i.test(name) && file.type && file.type.startsWith('image/')) {
      name += '.' + (file.type.split('/')[1].split('+')[0] || 'jpg').toLowerCase();
    }
    body.set('file', file, name);

    const response = await fetch(this.actionUrl(this.config.actions.photoReplace), {
      method: 'POST',
      credentials: 'same-origin',
      body,
    });
    return this.unwrap(await response.json(), 'photoReplace');
  }

  async photoUpdate(id: number, name: string, description: string): Promise<void> {
    await this.post('photoUpdate', { id, name, description });
  }

  async photoDelete(id: number): Promise<void> {
    await this.post('photoDelete', { id });
  }

  /** FilePond revert: удаляет только что загруженную фотографию. */
  async photoRevert(id: number): Promise<void> {
    await this.post('photoRevert', { id });
  }



  private async call(action: keyof GalleryConfig['actions'], params: Record<string, string | number> = {}): Promise<any> {
    const url = this.actionUrl(this.config.actions[action], params);
    const response = await fetch(url, { credentials: 'same-origin' });
    return this.unwrap(await response.json(), action);
  }

  private async post(action: keyof GalleryConfig['actions'], fields: Record<string, string | number>): Promise<any> {
    const body = new FormData();
    body.set('sessid', this.config.sessid);
    for (const [key, value] of Object.entries(fields)) {
      body.set(key, String(value));
    }

    const response = await fetch(this.actionUrl(this.config.actions[action]), {
      method: 'POST',
      credentials: 'same-origin',
      body,
    });
    return this.unwrap(await response.json(), action);
  }

  private unwrap(payload: any, action: string): any {
    if (payload && payload.status === 'success') {
      return payload.data ?? {};
    }
    const message =
      payload && Array.isArray(payload.errors) && payload.errors.length
        ? payload.errors[0].message
        : `Ошибка запроса (${action})`;
    throw new ApiError(String(message));
  }
}
