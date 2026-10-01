<script setup lang="ts">
import { onMounted, reactive, ref, watch } from 'vue';
import type { Album, GalleryConfig, Permissions, Photo } from '../js/types';
import { Api } from '../js/api';
import { bindViewer } from '../js/viewer';
import PhotoGrid from './PhotoGrid.vue';
import ReactionBar from './ReactionBar.vue';
import InfiniteSentinel from './InfiniteSentinel.vue';
import Uploader from './Uploader.vue';
import AlbumDialog from './AlbumDialog.vue';
import PhotoDialog from './PhotoDialog.vue';
import ConfirmDialog from './ConfirmDialog.vue';

const props = defineProps<{ config: GalleryConfig }>();

const api = new Api(props.config);

const rootEl = ref<HTMLElement | null>(null);
const albumsEl = ref<HTMLElement | null>(null);

const albums = ref<Album[]>([]);
const albumsLoading = ref(true);
const error = ref('');
const permissions = ref<Permissions>({ ...props.config.permissions });

const currentAlbum = ref<Album | null>(null);
const photos = ref<Photo[]>([]);
const photoCursor = ref<number | null>(0); // курсор пагинации: 0 = с начала, null = страницы закончились
const photosLoading = ref(false);
const photosError = ref('');

const albumDialog = reactive({ open: false, id: 0, name: '' });
const photoDialog = reactive({ open: false, photo: null as Photo | null });
const confirmState = reactive({ open: false, title: '', text: '', action: '' as 'photo' | 'album', id: 0, name: '' });

const totalPhotos = ref(0);

/** виден ли сентинел автоподгрузки (сообщает InfiniteSentinel) */
const sentinelInview = ref(false);

/** перетаскивание альбомов (HTML5 DnD), индексы в списке albums */
const albumDragIndex = ref<number | null>(null);
const albumOverIndex = ref<number | null>(null);

function onAlbumDragStart(index: number, event: DragEvent): void {
  albumDragIndex.value = index;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  }
}

function onAlbumDragOver(index: number, event: DragEvent): void {
  if (albumDragIndex.value === null) {
    return;
  }
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  albumOverIndex.value = index;
}

function onAlbumDrop(index: number, event: DragEvent): void {
  event.preventDefault();
  const from = albumDragIndex.value;
  resetAlbumDrag();
  if (from === null || from === index) {
    return;
  }
  const reordered = [...albums.value];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(index, 0, moved);
  albums.value = reordered;
  void saveAlbumOrder(reordered);
}

function resetAlbumDrag(): void {
  albumDragIndex.value = null;
  albumOverIndex.value = null;
}

async function saveAlbumOrder(reordered: Album[]): Promise<void> {
  try {
    await api.albumReorder(reordered.map((album) => album.id));
  } catch (e) {
    error.value = formatError(e, 'Не удалось сохранить порядок альбомов');
    void loadAlbums();
  }
}

/** порядок фотографий изменён перетаскиванием в сетке */
async function savePhotoOrder(reordered: Photo[]): Promise<void> {
  photos.value = reordered;
  if (!currentAlbum.value) {
    return;
  }
  try {
    await api.photoReorder(currentAlbum.value.id, reordered.map((photo) => photo.id));
  } catch (e) {
    photosError.value = e instanceof Error ? e.message : 'Не удалось сохранить порядок фотографий';
    photoCursor.value = 0;
    photos.value = [];
    await loadMorePhotos();
  }
}

async function loadAlbums(): Promise<void> {
  albumsLoading.value = true;
  error.value = '';
  try {
    const response = await api.albumList();
    albums.value = response.albums;
    permissions.value = response.permissions;
    totalPhotos.value = albums.value.reduce((sum, album) => sum + album.count, 0);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось загрузить альбомы';
  } finally {
    albumsLoading.value = false;
  }
}

async function loadMorePhotos(): Promise<void> {
  if (!currentAlbum.value || photosLoading.value || photoCursor.value === null) {
    return;
  }
  photosLoading.value = true;
  photosError.value = '';
  try {
    const page = await api.photoList(currentAlbum.value.id, photoCursor.value, 24);
    photos.value.push(...page.items);
    photoCursor.value = page.cursor;
    permissions.value = page.permissions;
  } catch (e) {
    photosError.value = e instanceof Error ? e.message : 'Не удалось загрузить фотографии';
  } finally {
    photosLoading.value = false;
  }
}

function showAlbums(): void {
  currentAlbum.value = null;
  photos.value = [];
  photoCursor.value = 0;
  photosError.value = '';
  // обновить счётчики фото/реакций и обложки — они могли измениться
  void loadAlbums();
}

function openAlbum(album: Album): void {
  currentAlbum.value = album;
  photos.value = [];
  photoCursor.value = 0;
  photosError.value = '';
  void loadMorePhotos();
}

function albumById(id: number): Album | undefined {
  return albums.value.find((album) => album.id === id);
}

function bumpAlbumCount(albumId: number, delta: number): void {
  const album = albumById(albumId);
  if (album) {
    album.count += delta;
    if (album.count < 0) {
      album.count = 0;
    }
  }
  totalPhotos.value += delta;
  if (totalPhotos.value < 0) {
    totalPhotos.value = 0;
  }
}

function onPhotoUploaded(photo: Photo): void {
  if (currentAlbum.value && !photos.value.some((item) => item.id === photo.id)) {
    photos.value.unshift(photo);
    const album = albumById(currentAlbum.value.id);
    if (album) {
      album.count += 1;
      if (!album.cover) {
        album.cover = photo;
      }
    }
  }
}

function onPhotoRemoved(id: number): void {
  photos.value = photos.value.filter((photo) => photo.id !== id);
  if (currentAlbum.value) {
    bumpAlbumCount(currentAlbum.value.id, -1);
  }
}

function askDeletePhoto(photo: Photo): void {
  confirmState.open = true;
  confirmState.action = 'photo';
  confirmState.id = photo.id;
  confirmState.name = photo.name;
  confirmState.title = 'Удалить фотографию?';
  confirmState.text = `«${photo.name}» будет удалена безвозвратно.`;
}

function askEditPhoto(photo: Photo): void {
  photoDialog.photo = photo;
  photoDialog.open = true;
}

async function savePhoto(name: string, description: string): Promise<void> {
  if (!photoDialog.photo) {
    return;
  }
  const id = photoDialog.photo.id;
  await api.photoUpdate(id, name, description);
  const photo = photos.value.find((item) => item.id === id);
  if (photo) {
    photo.name = name;
    photo.description = description;
  }
}

/** изображение заменено из попапа редактирования — обновить карточку в сетке */
function onPhotoReplaced(replaced: Photo): void {
  const photo = photos.value.find((item) => item.id === replaced.id);
  if (photo) {
    photo.thumbUrl = replaced.thumbUrl;
    photo.fullUrl = replaced.fullUrl;
    photo.size = replaced.size;
    photo.ext = replaced.ext;
  }
  if (photoDialog.photo?.id === replaced.id) {
    photoDialog.photo = { ...photoDialog.photo, ...replaced, name: photoDialog.photo.name, description: photoDialog.photo.description };
  }
  // обложка альбома могла быть этой фотографией — обновим список альбомов лениво при возврате
}

function askCreateAlbum(): void {
  albumDialog.id = 0;
  albumDialog.name = '';
  albumDialog.open = true;
}

function askRenameAlbum(album: Album): void {
  albumDialog.id = album.id;
  albumDialog.name = album.name;
  albumDialog.open = true;
}

async function saveAlbum(id: number, name: string): Promise<number> {
  const savedId = await api.albumSave(id, name);
  await loadAlbums();
  return savedId;
}

function askDeleteAlbum(album: Album): void {
  const photosText = album.count > 0 ? ` Вместе с ним будут удалены фотографии: ${album.count}.` : '';
  confirmState.open = true;
  confirmState.action = 'album';
  confirmState.id = album.id;
  confirmState.name = album.name;
  confirmState.title = 'Удалить альбом?';
  confirmState.text = `«${album.name}» будет удалён безвозвратно.${photosText}`;
}

async function onConfirm(): Promise<void> {
  if (confirmState.action === 'photo') {
    await api.photoDelete(confirmState.id);
    photos.value = photos.value.filter((photo) => photo.id !== confirmState.id);
    if (currentAlbum.value) {
      bumpAlbumCount(currentAlbum.value.id, -1);
    }
  } else {
    await api.albumDelete(confirmState.id);
    if (currentAlbum.value?.id === confirmState.id) {
      showAlbums();
    }
    await loadAlbums();
  }
}

onMounted(() => {
  if (rootEl.value) {
    bindViewer(rootEl.value);
  }
  void loadAlbums();
});

// Цепочка автоподгрузки: не только при входе сентинела в зону видимости,
// но и после окончания каждой загрузки, пока он виден (иначе при большом
// экране/руут-маргине она застревает после первой страницы — observer
// срабатывает лишь при ИЗМЕНЕНИИ пересечения)
watch([sentinelInview, photosLoading, photoCursor], () => {
  if (
    sentinelInview.value &&
    !photosLoading.value &&
    photoCursor.value !== null &&
    currentAlbum.value
  ) {
    void loadMorePhotos();
  }
});
</script>

<template>
  <div
    ref="rootEl"
    class="mtai-gallery"
  >
    <div
      v-if="error"
      class="mtai-gallery__error"
    >
      {{ error }}
    </div>

    <!-- Список альбомов -->
    <section v-if="!currentAlbum">
      <div class="mtai-gallery__bar">
        <div class="mtai-gallery__bar-title">
          Альбомы <span class="mtai-gallery__muted">{{ albums.length }}</span>
          <span class="mtai-gallery__sep">·</span>
          <span class="mtai-gallery__muted">{{ totalPhotos }} фото</span>
        </div>
        <button
          v-if="permissions.addAlbum"
          class="mtai-gallery__btn mtai-gallery__btn--primary"
          type="button"
          @click="askCreateAlbum"
        >
          + Создать альбом
        </button>
      </div>

      <div
        v-if="albumsLoading"
        class="mtai-gallery__hint"
      >
        Загрузка…
      </div>
      <div
        v-else-if="!albums.length"
        class="mtai-gallery__hint"
      >
        Альбомов пока нет.
        <template v-if="permissions.addAlbum">
          Создайте первый альбом и загрузите в него фотографии.
        </template>
      </div>

      <div
        v-else
        ref="albumsEl"
        class="mtai-gallery__albums"
      >
        <div
          v-for="(album, index) in albums"
          :key="album.id"
          class="mtai-album"
          :class="{
            'mtai-album--draggable': permissions.editAlbum,
            'mtai-album--dragging': albumDragIndex === index,
            'mtai-album--over': albumOverIndex === index && albumDragIndex !== null && albumDragIndex !== index,
          }"
          :draggable="permissions.editAlbum"
          @click="openAlbum(album)"
          @dragstart="onAlbumDragStart(index, $event)"
          @dragover="onAlbumDragOver(index, $event)"
          @drop="onAlbumDrop(index, $event)"
          @dragend="resetAlbumDrag"
          @dragleave="albumOverIndex === index && (albumOverIndex = null)"
        >
          <div class="mtai-album__cover">
            <img
              v-if="album.cover"
              :src="album.cover.thumbUrl"
              :alt="album.name"
              :draggable="false"
              loading="lazy"
            >
            <div
              v-else
              class="mtai-album__placeholder"
            >
              нет фото
            </div>
            <span class="mtai-album__count">{{ album.count }}</span>
          </div>
          <div
            class="mtai-album__name"
            :title="album.name"
          >
            {{ album.name }}
          </div>
          <div class="mtai-album__meta">
            <ReactionBar
              small
              :api="api"
              entity-type="IBLOCK_SECTION"
              :entity-id="album.id"
              :rating="album.rating"
            />
          </div>
          <div
            v-if="permissions.editAlbum || permissions.deleteAlbum"
            class="mtai-album__actions"
          >
            <button
              v-if="permissions.editAlbum"
              class="mtai-icon-btn"
              type="button"
              title="Переименовать"
              @click.stop="askRenameAlbum(album)"
            >
              <svg
                viewBox="0 0 16 16"
                width="14"
                height="14"
              ><path
                d="M11.3 1.7a2.4 2.4 0 0 1 3.4 3.4l-8.5 8.5-4 1.1 1.1-4 8-8zM10 4l2.3 2.3 1.3-1.3a1.1 1.1 0 0 0-1.6-1.6L10.7 4 10 4z"
                fill="currentColor"
              /></svg>
            </button>
            <button
              v-if="permissions.deleteAlbum"
              class="mtai-icon-btn mtai-icon-btn--danger"
              type="button"
              title="Удалить альбом"
              @click.stop="askDeleteAlbum(album)"
            >
              <svg
                viewBox="0 0 16 16"
                width="14"
                height="14"
              ><path
                d="M6 2h4v1h3v1.5H3V3h3V2zM4 6h8l-.7 8H4.7L4 6zm2.6 1.5v5h1.2v-5H6.6zm2.6 0v5h1.2v-5H9.2z"
                fill="currentColor"
              /></svg>
            </button>
          </div>
        </div>
      </div>
    </section>

    <!-- Один альбом -->
    <section v-else>
      <div class="mtai-gallery__bar">
        <div class="mtai-gallery__bar-title">
          <button
            class="mtai-gallery__back"
            type="button"
            title="К альбомам"
            @click="showAlbums"
          >
            <svg
              viewBox="0 0 16 16"
              width="16"
              height="16"
            ><path
              d="M10.5 3 5.5 8l5 5 1.1-1.1L7.7 8l3.9-3.9L10.5 3z"
              fill="currentColor"
            /></svg>
          </button>
          <span
            class="mtai-gallery__album-name"
            :title="currentAlbum.name"
          >{{ currentAlbum.name }}</span>
          <span class="mtai-gallery__muted">{{ currentAlbum.count }} фото</span>
          <ReactionBar
            class="mtai-gallery__album-like"
            :api="api"
            entity-type="IBLOCK_SECTION"
            :entity-id="currentAlbum.id"
            :rating="currentAlbum.rating"
          />
        </div>
        <div class="mtai-gallery__bar-actions">
          <button
            v-if="permissions.editAlbum"
            class="mtai-gallery__btn"
            type="button"
            @click="askRenameAlbum(currentAlbum)"
          >
            Переименовать
          </button>
          <button
            v-if="permissions.deleteAlbum"
            class="mtai-gallery__btn mtai-gallery__btn--danger"
            type="button"
            @click="askDeleteAlbum(currentAlbum)"
          >
            Удалить альбом
          </button>
        </div>
      </div>

      <Uploader
        v-if="permissions.upload"
        :api="api"
        :process-action="props.config.actions.photoUpload"
        :process-params="{ albumId: currentAlbum.id }"
        @added="onPhotoUploaded"
        @removed="onPhotoRemoved"
      />

      <div
        v-if="photosError"
        class="mtai-gallery__error"
      >
        {{ photosError }}
      </div>

      <div
        v-if="!photos.length && !photosLoading"
        class="mtai-gallery__hint"
      >
        <template v-if="permissions.upload">
          Перетащите фотографии в загрузчик выше — они появятся в альбоме.
        </template>
        <template v-else>
          В альбоме пока нет фотографий.
        </template>
      </div>

      <PhotoGrid
        :api="api"
        :photos="photos"
        :can-edit="permissions.editPhoto"
        :can-delete="permissions.deletePhoto"
        @edit="askEditPhoto"
        @delete="askDeletePhoto"
        @reorder="savePhotoOrder"
      />

      <InfiniteSentinel
        :active="photoCursor !== null"
        @intersect="(visible: boolean) => (sentinelInview = visible)"
      />
      <div
        v-if="photosLoading"
        class="mtai-gallery__hint"
      >
        Загрузка…
      </div>
    </section>

    <AlbumDialog
      v-model:open="albumDialog.open"
      :album-id="albumDialog.id"
      :name="albumDialog.name"
      :save="saveAlbum"
    />
    <PhotoDialog
      v-model:open="photoDialog.open"
      :api="api"
      :config="props.config"
      :photo="photoDialog.photo"
      :can-replace="permissions.editPhoto"
      :save="savePhoto"
      @replaced="onPhotoReplaced"
    />
    <ConfirmDialog
      v-model:open="confirmState.open"
      :title="confirmState.title"
      :text="confirmState.text"
      confirm-text="Удалить"
      :on-confirm="onConfirm"
    />
  </div>
</template>

<style scoped>
.mtai-gallery {
  --mtai-accent: #2fc7f7;
  --mtai-danger: #ff5752;
  color: #232323;
  font-size: 14px;
  padding: 12px 0 32px;
}

.mtai-gallery__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  margin-bottom: 16px;
}

.mtai-gallery__bar-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 17px;
  font-weight: 600;
  min-width: 0;
}

.mtai-gallery__album-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 60vw;
}

.mtai-gallery__muted {
  color: #92979c;
  font-size: 13px;
  font-weight: 400;
}

.mtai-gallery__sep {
  color: #d0d4d9;
}

.mtai-gallery__back {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #7d8288;
  cursor: pointer;
}

.mtai-gallery__back:hover {
  background: #f0f2f5;
  color: #232323;
}

.mtai-gallery__bar-actions {
  display: flex;
  gap: 8px;
}

.mtai-gallery__btn {
  border: 1px solid #d5d9df;
  border-radius: 6px;
  background: #fff;
  color: #232323;
  padding: 7px 14px;
  font-size: 13px;
  cursor: pointer;
}

.mtai-gallery__btn:hover {
  border-color: var(--mtai-accent);
  color: #0f8fbf;
}

.mtai-gallery__btn--primary {
  border-color: var(--mtai-accent);
  background: var(--mtai-accent);
  color: #fff;
}

.mtai-gallery__btn--primary:hover {
  background: #14b3e6;
  color: #fff;
}

.mtai-gallery__btn--danger {
  border-color: transparent;
  color: var(--mtai-danger);
}

.mtai-gallery__btn--danger:hover {
  border-color: var(--mtai-danger);
}

.mtai-gallery__error {
  margin-bottom: 12px;
  padding: 10px 14px;
  border-radius: 6px;
  background: #fdecec;
  color: #d9433e;
}

.mtai-gallery__hint {
  padding: 40px 0;
  text-align: center;
  color: #92979c;
}

.mtai-gallery__albums {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 20px;
}

.mtai-album {
  position: relative;
  border-radius: 10px;
}

.mtai-album--draggable {
  cursor: grab;
}

.mtai-album--dragging {
  opacity: 0.4;
}

.mtai-album--over {
  outline: 2px dashed var(--mtai-accent);
  outline-offset: 4px;
}

.mtai-album__cover {
  position: relative;
  aspect-ratio: 1 / 1;
  border-radius: 10px;
  overflow: hidden;
  background: #eef1f5;
}

.mtai-album__cover img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.2s ease;
}

.mtai-album:hover .mtai-album__cover img {
  transform: scale(1.04);
}

.mtai-album__placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: #aeb4bb;
  font-size: 13px;
}

.mtai-album__count {
  position: absolute;
  right: 8px;
  top: 8px;
  padding: 2px 8px;
  border-radius: 12px;
  background: rgba(28, 32, 38, 0.65);
  color: #fff;
  font-size: 12px;
}

.mtai-album__name {
  margin-top: 8px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mtai-album__meta {
  margin-top: 6px;
}

.mtai-gallery__album-like {
  margin-left: 8px;
}

.mtai-album__actions {
  position: absolute;
  top: 8px;
  left: 8px;
  display: none;
  gap: 4px;
}

.mtai-album:hover .mtai-album__actions {
  display: flex;
}

.mtai-icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 6px;
  background: rgba(28, 32, 38, 0.65);
  color: #fff;
  cursor: pointer;
}

.mtai-icon-btn:hover {
  background: rgba(28, 32, 38, 0.85);
}

.mtai-icon-btn--danger:hover {
  background: var(--mtai-danger);
}
</style>
