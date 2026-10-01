<script setup lang="ts">
import type { Api } from '../js/api';
import type { Photo } from '../js/types';
import ReactionBar from './ReactionBar.vue';

defineProps<{
  api: Api;
  photos: Photo[];
  canEdit: boolean;
  canDelete: boolean;
}>();

const emit = defineEmits<{
  edit: [photo: Photo];
  delete: [photo: Photo];
}>();

function formatSize(size: number): string {
  if (size <= 0) {
    return '';
  }
  if (size < 1024 * 1024) {
    return Math.max(1, Math.round(size / 1024)) + ' КБ';
  }
  return (size / (1024 * 1024)).toFixed(1) + ' МБ';
}
</script>

<template>
  <div
    v-if="photos.length"
    class="mtai-photo-grid"
  >
    <div
      v-for="photo in photos"
      :key="photo.id"
      class="mtai-photo-card"
    >
      <!--
        Разметка как у поля «файл» списков: клик открывает штатный
        просмотрщик Bitrix24 (BX.UI.Viewer), карусель — все фото сетки.
      -->
      <img
        class="mtai-photo-card__image"
        :src="photo.thumbUrl"
        data-viewer=""
        data-viewer-type="image"
        :data-src="photo.fullUrl"
        :data-title="photo.name"
        :data-download-url="photo.fullUrl"
        :alt="photo.name"
        loading="lazy"
      >
      <div class="mtai-photo-card__overlay">
        <div class="mtai-photo-card__texts">
          <span
            class="mtai-photo-card__name"
            :title="photo.name"
          >{{ photo.name }}</span>
          <span
            v-if="photo.description"
            class="mtai-photo-card__description"
            :title="photo.description"
          >{{ photo.description }}</span>
        </div>
        <span
          v-if="photo.size"
          class="mtai-photo-card__size"
        >{{ formatSize(photo.size) }}</span>
      </div>
      <div class="mtai-photo-card__reaction">
        <ReactionBar
          small
          :api="api"
          entity-type="IBLOCK_ELEMENT"
          :entity-id="photo.id"
          :rating="photo.rating"
        />
      </div>
      <div
        v-if="canEdit || canDelete"
        class="mtai-photo-card__actions"
      >
        <button
          v-if="canEdit"
          class="mtai-photo-card__btn"
          type="button"
          title="Изменить название и подпись"
          @click.stop="emit('edit', photo)"
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
          v-if="canDelete"
          class="mtai-photo-card__btn mtai-photo-card__btn--danger"
          type="button"
          title="Удалить фотографию"
          @click.stop="emit('delete', photo)"
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
</template>

<style scoped>
.mtai-photo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px;
  margin-top: 16px;
}

.mtai-photo-card {
  position: relative;
  border-radius: 8px;
  /* без overflow: hidden — он обрезал бы всплывающую панель реакций;
     скругление углов у картинки и градиентной подписи */
  background: #eef1f5;
}

.mtai-photo-card__image {
  display: block;
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 8px;
  cursor: zoom-in;
}

.mtai-photo-card__overlay {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 8px;
  padding: 22px 10px 8px;
  background: linear-gradient(transparent, rgba(15, 18, 22, 0.72));
  border-radius: 0 0 8px 8px;
  color: #fff;
  opacity: 0;
  transition: opacity 0.15s ease;
  pointer-events: none;
}

.mtai-photo-card:hover .mtai-photo-card__overlay {
  opacity: 1;
}

.mtai-photo-card__texts {
  flex: 1;
  min-width: 0;
}

.mtai-photo-card__name {
  display: block;
  font-size: 13px;
  font-weight: 600;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mtai-photo-card__description {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-top: 2px;
  font-size: 12px;
  line-height: 1.35;
  color: rgba(255, 255, 255, 0.75);
  white-space: normal;
  overflow-wrap: anywhere;
}

/* верхний левый угол: внизу карточка занята всплывающей подписью фото */
.mtai-photo-card__reaction {
  position: absolute;
  left: 8px;
  top: 8px;
  z-index: 5;
}

.mtai-photo-card__size {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.8);
  flex-shrink: 0;
}

.mtai-photo-card__actions {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.mtai-photo-card:hover .mtai-photo-card__actions {
  opacity: 1;
}

.mtai-photo-card__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border: none;
  border-radius: 6px;
  background: rgba(28, 32, 38, 0.65);
  color: #fff;
  cursor: pointer;
}

.mtai-photo-card__btn:hover {
  background: rgba(28, 32, 38, 0.85);
}

.mtai-photo-card__btn--danger:hover {
  background: #ff5752;
}
</style>
