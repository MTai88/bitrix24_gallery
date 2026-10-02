<script setup lang="ts">
import { ref } from 'vue';
import type { Api } from '../js/api';
import type { Photo } from '../js/types';
import ReactionBar from './ReactionBar.vue';

const props = defineProps<{
  api: Api;
  photos: Photo[];
  canEdit: boolean;
  canDelete: boolean;
  /** доступен штатный редактор изображений (config.imageEditor) */
  canEditImage: boolean;
  /** id фотографии, которая сейчас редактируется (кнопка занята) */
  editingId: number | null;
}>();

const emit = defineEmits<{
  edit: [photo: Photo];
  delete: [photo: Photo];
  /** открыть штатный редактор изображений */
  editImage: [photo: Photo];
  /** порядок изменён перетаскиванием — присылается новый массив */
  reorder: [photos: Photo[]];
}>();

/**
 * Перетаскивание карточек (HTML5 DnD). Родитель применяет порядок
 * оптимистично и отправляет его на сервер.
 */
const dragIndex = ref<number | null>(null);
const overIndex = ref<number | null>(null);

function onDragStart(index: number, event: DragEvent): void {
  dragIndex.value = index;
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(index));
  }
}

function onDragOver(index: number, event: DragEvent): void {
  if (dragIndex.value === null) {
    return;
  }
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = 'move';
  }
  overIndex.value = index;
}

function onDrop(index: number, event: DragEvent): void {
  event.preventDefault();
  const from = dragIndex.value;
  resetDrag();
  if (from === null || from === index) {
    return;
  }
  const reordered = [...props.photos];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(index, 0, moved);
  emit('reorder', reordered);
}

function resetDrag(): void {
  dragIndex.value = null;
  overIndex.value = null;
}

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
      v-for="(photo, index) in photos"
      :key="photo.id"
      class="mtai-photo-card"
      :class="{
        'mtai-photo-card--draggable': canEdit,
        'mtai-photo-card--dragging': dragIndex === index,
        'mtai-photo-card--over': overIndex === index && dragIndex !== null && dragIndex !== index,
      }"
      :draggable="canEdit"
      @dragstart="onDragStart(index, $event)"
      @dragover="onDragOver(index, $event)"
      @drop="onDrop(index, $event)"
      @dragend="resetDrag"
      @dragleave="overIndex === index && (overIndex = null)"
    >
      <!--
        Разметка как у поля «файл» списков: клик открывает штатный
        просмотрщик Bitrix24 (BX.UI.Viewer), карусель — все фото сетки.
        draggable=false: иначе браузер тащит саму картинку, а не карточку.
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
        :draggable="false"
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
          v-if="canEdit && canEditImage"
          class="mtai-photo-card__btn"
          type="button"
          :disabled="editingId !== null"
          title="Редактировать изображение"
          @click.stop="emit('editImage', photo)"
        >
          <svg
            viewBox="0 0 16 16"
            width="14"
            height="14"
          ><path
            d="M2.5 13.5l.7-2.8 7-7 2.1 2.1-7 7-2.8.7zm8.4-10.6l1.2-1.2c.4-.4 1-.4 1.4 0l.7.7c.4.4.4 1 0 1.4l-1.2 1.2-2.1-2.1zM5 2l.5 1.2L6.7 3.7 5.5 4.2 5 5.4l-.5-1.2L3.3 3.7l1.2-.5L5 2zm6.5 6l.4.9.9.4-.9.4-.4.9-.4-.9-.9-.4.9-.4.4-.9z"
            fill="currentColor"
          /></svg>
        </button>
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

.mtai-photo-card--draggable {
  cursor: grab;
}

.mtai-photo-card--dragging {
  opacity: 0.4;
}

.mtai-photo-card--over {
  outline: 2px dashed #2fc7f7;
  outline-offset: -2px;
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
