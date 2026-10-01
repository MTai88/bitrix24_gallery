<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  albumId: number;
  name: string;
  save: (id: number, name: string) => Promise<number>;
}>();

const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const localName = ref('');
const error = ref('');
const saving = ref(false);

watch(
  () => props.open,
  (open) => {
    if (open) {
      localName.value = props.name;
      error.value = '';
    }
  },
);

async function submit(): Promise<void> {
  const name = localName.value.trim();
  if (!name) {
    error.value = 'Укажите название альбома';
    return;
  }
  saving.value = true;
  error.value = '';
  try {
    await props.save(props.albumId, name);
    emit('update:open', false);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Не удалось сохранить альбом';
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="open"
      class="mtai-modal"
      @click.self="emit('update:open', false)"
    >
      <div class="mtai-modal__dialog">
        <div class="mtai-modal__title">
          {{ albumId ? 'Переименовать альбом' : 'Новый альбом' }}
        </div>
        <input
          v-model="localName"
          class="mtai-modal__input"
          type="text"
          maxlength="255"
          placeholder="Название альбома"
          @keyup.enter="submit"
          @input="error = ''"
        >
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

.mtai-modal__btn--danger {
  border-color: transparent;
  background: #ff5752;
  color: #fff;
}

.mtai-modal__btn--danger:hover {
  background: #f03630;
}

.mtai-modal__btn:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
