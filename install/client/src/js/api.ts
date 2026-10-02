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

  /**
   * Реакция («лайк») — штатный эндпоинт rating.vote: голоса, счётчики и
   * списки реакций живут в стандартных таблицах рейтингов Bitrix24.
   *
   * @param action plus | change | cancel
   * @param reaction имя реакции (like, kiss, laugh, wonder, cry, anger, facepalm)
   * @returns обновлённое состояние или null (нет прав / пустой ответ ядра)
   */
  async vote(
    entityType: string,
    entityId: number,
    keySigned: string,
    action: 'plus' | 'change' | 'cancel',
    reaction: string,
  ): Promise<{ reactions: Record<string, number>; items_all: number; resultVotes: number } | null> {
    const body = new URLSearchParams({
      sessid: this.config.sessid,
      RATING_VOTE_KEY_SIGNED: keySigned,
      RATING_VOTE_TYPE_ID: entityType,
      RATING_VOTE_ENTITY_ID: String(entityId),
      RATING_VOTE: 'Y',
      RATING_VOTE_ACTION: action,
      RATING_VOTE_REACTION: reaction,
      RATING_RESULT: 'Y',
    });
    const response = await fetch(this.config.voteUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    return this.parseVoteResponse(await response.text());
  }

  /** Список проголосовавших (штатный rating.vote, RATING_VOTE_LIST). */
  async voteList(
    entityType: string,
    entityId: number,
    keySigned: string,
    page: number,
    reaction = '',
  ): Promise<{
    items: Array<{ USER_ID: number; FULL_NAME: string; PHOTO_SRC: string; URL: string; VOTE_VALUE: number }>;
    items_all: number;
    items_page: number;
  } | null> {
    const body = new URLSearchParams({
      sessid: this.config.sessid,
      RATING_VOTE_KEY_SIGNED: keySigned,
      RATING_VOTE_TYPE_ID: entityType,
      RATING_VOTE_ENTITY_ID: String(entityId),
      RATING_VOTE_LIST: 'Y',
      RATING_VOTE_LIST_PAGE: String(page),
      RATING_VOTE_REACTION: reaction,
      PATH_TO_USER_PROFILE: this.config.profilePath,
    });
    const response = await fetch(this.config.voteUrl, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    return this.parseVoteResponse(await response.text());
  }

  /** vote.ajax.php отвечает JSON-ом с content-type x-javascript или пусто. */
  private parseVoteResponse<T>(text: string): T | null {
    if (!text) {
      return null;
    }
    try {
      const data = JSON.parse(text);
      return typeof data === 'object' && data !== null ? (data as T) : null;
    } catch {
      return null;
    }
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
