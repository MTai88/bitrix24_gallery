/** Реакции («лайки») — штатные рейтинги Bitrix24. */
export interface Rating {
  count: number;
  reactions: Record<string, number>;
  myReaction: string | null;
  /** подписанный ключ голосования (TimeSigner, выдаётся данными списка) */
  key: string;
}

/** Фотография (элемент инфоблока галереи). */
export interface Photo {
  id: number;
  name: string;
  description: string;
  thumbUrl: string;
  fullUrl: string;
  size: number;
  ext: string;
  rating: Rating;
}

/** Альбом (раздел инфоблока галереи). */
export interface Album {
  id: number;
  name: string;
  depth: number;
  count: number;
  cover: Photo | null;
  rating: Rating;
}

/** Гранулярные права пользователя на инфоблок (CIBlockRights). */
export interface Permissions {
  read: boolean;
  upload: boolean;
  editPhoto: boolean;
  deletePhoto: boolean;
  addAlbum: boolean;
  editAlbum: boolean;
  deleteAlbum: boolean;
}

/** Конфиг от компонента mtai:gallery.app. */
export interface GalleryConfig {
  sessid: string;
  iblockId: number;
  ajaxUrl: string;
  voteUrl: string;
  profilePath: string;
  actions: {
    albumList: string;
    albumSave: string;
    albumReorder: string;
    albumDelete: string;
    photoList: string;
    photoUpload: string;
    photoReplace: string;
    photoReorder: string;
    photoRevert: string;
    photoUpdate: string;
    photoDelete: string;
  };
  permissions: Permissions;
}

/** Страница photo.list. */
export interface PhotoPage {
  items: Photo[];
  cursor: number | null;
  permissions: Permissions;
}

/** Страница album.list. */
export interface AlbumListResponse {
  albums: Album[];
  permissions: Permissions;
}
