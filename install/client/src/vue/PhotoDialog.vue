<script setup lang="ts">
import { ref, watch } from 'vue';
import type { GalleryConfig, Photo } from '../js/types';
import type { Api } from '../js/api';
import { editImage } from '../js/editor';
import Uploader from './Uploader.vue';

const props = defineProps<{
  api: Api;
  config: GalleryConfig;
  open: boolean;
  photo: Photo | null;
  /** право element_edit: показывать ли загрузчик замены изображения */
  canReplace: boolean;
  save: (name: string, description: string) => Promise<void>;
}>();

const emit = defineEmits<{
  'update:open': [value: boolean];
  /** изображение заменено — карточку в сетке нужно обновить */
  replaced: [photo: Photo];
}>();

const name = ref('');
const description = ref('');
const error = ref('');
const saving = ref(false);
/** превью обновляется сразу после замены изображения */
const previewUrl = ref('');

watch(
  () => props.open,
  (open) => {
    if (open && props.photo) {
      name.value = props.photo.name;
      description.value = props.photo.description;
      previewUrl.value = props.photo.thumbUrl;
      error.value = '';
    }
  },
);

function onReplaced(photo: Photo): void {
  previewUrl.value = photo.thumbUrl;
  emit('replaced', photo);
}

/** Штатный редактор Bitrix24: результат сразу уходит в photo.replace. */
const editingImage = ref(false);

async function editCurrent(): Promise<void> {
  if (!props.photo || editingImage.value) {
    return;
  }
  editingImage.value = true;
  error.value = '';
  try {
    const file = await editImage(props.photo.fullUrl);
    if (file && props.photo) {
      const updated = await props.api.photoReplace(props.photo.id, file);
      onReplaced(updated);
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось сохранить отредактированное изображение';
  } finally {
    editingImage.value = false;
  }
}

async function submit(): Promise<void> {
  if (!name.value.trim()) {
    error.value = 'Укажите название фотографии';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    await props.save(name.value.trim(), description.value.trim());
    emit('update:open', false);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось сохранить фотографию';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open && photo"
      class="mtai-modal"
      @click.self="emit('update:open', false)"
    >
      <div class="mtai-modal__dialog">
        <div class="mtai-modal__title">
          Фотография
        </div>
        <div
          v-if="previewUrl"
          class="mtai-photo-dialog__preview-wrap"
        >
          <img
            class="mtai-photo-dialog__preview"
            :src="previewUrl"
            :alt="photo.name"
          >
          <button
            v-if="canReplace && config.imageEditor && photo"
            class="mtai-photo-dialog__edit"
            type="button"
            :disabled="editingImage"
            :title="editingImage ? 'Открытие редактора…' : 'Редактировать изображение'"
            @click="editCurrent"
          >
            <svg
              viewBox="0 0 16 16"
              width="14"
              height="14"
            ><path
              d="M11.3 1.7a2.4 2.4 0 0 1 3.4 3.4l-8.5 8.5-4 1.1 1.1-4 8-8zM10 4l2.3 2.3 1.3-1.3a1.1 1.1 0 0 0-1.6-1.6L10.7 4 10 4z"
              fill="currentColor"
            /></svg>
            <span>{{ editingImage ? 'Открываем редактор…' : 'Редактировать' }}</span>
          </button>
        </div>
        <template v-if="canReplace && photo">
          <label class="mtai-modal__label">Заменить изображение</label>
          <Uploader
            :api="api"
            :process-action="config.actions.photoReplace"
            :process-params="{ id: photo.id }"
            :multiple="false"
            :revert-deletes="false"
            idle-label="Перетащите изображение или &lt;span class='filepond--label-action'&gt;выберите&lt;/span&gt; — применяется сразу"
            @added="onReplaced"
          />
        </template>
        <label class="mtai-modal__label">Название</label>
        <input
          v-model="name"
          class="mtai-modal__input"
          type="text"
          maxlength="255"
          @keyup.enter="submit"
          @input="error = ''"
        >
        <label class="mtai-modal__label">Подпись</label>
        <textarea
          v-model="description"
          class="mtai-modal__textarea"
          maxlength="2000"
          placeholder="Подпись к фотографии"
        />
        <div
          v-if="error"
          class="mtai-modal__error"
        >
          {{ error }}
        </div>
        <div class="mtai-modal__buttons">
          <button
            class="mtai-modal__btn"
            type="button"
            @click="emit('update:open', false)"
          >
            Отмена
          </button>
          <button
            class="mtai-modal__btn mtai-modal__btn--primary"
            type="button"
            :disabled="saving"
            @click="submit"
          >
            {{ saving ? 'Сохранение…' : 'Сохранить' }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
<style scoped>
.mtai-photo-dialog__edit {
  margin-top: 8px;
}

/* диалог телепортируется в body — вне .mtai-gallery, глобального box-sizing
   нет; width:100% у полей с padding/border вылезал за окно */
.mtai-modal,
.mtai-modal *,
.mtai-modal *::before,
.mtai-modal *::after {
  box-sizing: border-box;
}

.mtai-modal {
  position: fixed;
  inset: 0;
  z-index: 2100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(15, 18, 22, 0.5);
}

.mtai-modal__dialog {
  width: min(420px, calc(100vw - 32px));
  max-height: calc(100vh - 32px);
  overflow-y: auto;
  background: #fff;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 12px 40px rgba(15, 18, 22, 0.25);
}

.mtai-modal__title {
  font-size: 16px;
  font-weight: 600;
  margin-bottom: 14px;
}

.mtai-modal__label {
  display: block;
  margin: 12px 0 6px;
  font-size: 13px;
  color: #7d8288;
}

.mtai-photo-dialog__preview-wrap {
  position: relative;
}

.mtai-photo-dialog__preview {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 8px;
  background: #eef1f5;
}

/* кнопка редактирования поверх изображения — белая плашка с карандашом */
.mtai-photo-dialog__edit {
  position: absolute;
  left: 10px;
  bottom: 10px;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 6px 12px;
  border: none;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.94);
  color: #232323;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(15, 18, 22, 0.25);
}

.mtai-photo-dialog__edit:hover {
  color: #0f8fbf;
}

.mtai-photo-dialog__edit:disabled {
  opacity: 0.7;
  cursor: default;
}

.mtai-modal__input,
.mtai-modal__textarea {
  width: 100%;
  border: 1px solid #d5d9df;
  border-radius: 6px;
  padding: 8px 10px;
  font: inherit;
  color: #232323;
  background: #fff;
}

.mtai-modal__input:focus,
.mtai-modal__textarea:focus {
  outline: none;
  border-color: #2fc7f7;
}

.mtai-modal__textarea {
  min-height: 90px;
  resize: vertical;
}

.mtai-modal__error {
  margin-top: 8px;
  color: #d9433e;
  font-size: 13px;
}

.mtai-modal__buttons {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 16px;
}

.mtai-modal__btn {
  border: 1px solid #d5d9df;
  border-radius: 6px;
  background: #fff;
  color: #232323;
  padding: 7px 16px;
  font-size: 13px;
  cursor: pointer;
}

.mtai-modal__btn:hover {
  border-color: #2fc7f7;
}

.mtai-modal__btn--primary {
  border-color: #2fc7f7;
  background: #2fc7f7;
  color: #fff;
}

.mtai-modal__btn--primary:hover {
  background: #14b3e6;
}

.mtai-modal__btn:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
