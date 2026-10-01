<script setup lang="ts">
import { ref, watch } from 'vue';
import type { Photo } from '../js/types';

const props = defineProps<{
  open: boolean;
  photo: Photo | null;
  save: (name: string, description: string) => Promise<void>;
}>();

const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const name = ref('');
const description = ref('');
const error = ref('');
const saving = ref(false);

watch(
  () => props.open,
  (open) => {
    if (open && props.photo) {
      name.value = props.photo.name;
      description.value = props.photo.description;
      error.value = '';
    }
  },
);

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
        <img
          v-if="photo.thumbUrl"
          class="mtai-photo-dialog__preview"
          :src="photo.thumbUrl"
          :alt="photo.name"
        >
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

.mtai-photo-dialog__preview {
  width: 100%;
  aspect-ratio: 1 / 1;
  object-fit: cover;
  border-radius: 8px;
  background: #eef1f5;
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
