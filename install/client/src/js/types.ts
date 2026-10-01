/** Фотография (элемент инфоблока галереи). */
export interface Photo {
  id: number;
  name: string;
  description: string;
  thumbUrl: string;
  fullUrl: string;
  size: number;
  ext: string;
}

/** Альбом (раздел инфоблока галереи). */
export interface Album {
  id: number;
  name: string;
  depth: number;
  count: number;
  cover: Photo | null;
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
  actions: {
    albumList: string;
    albumSave: string;
    albumDelete: string;
    photoList: string;
    photoUpload: string;
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
