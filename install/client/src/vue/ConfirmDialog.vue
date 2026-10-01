<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  open: boolean;
  title: string;
  text: string;
  confirmText: string;
  onConfirm: () => Promise<void>;
}>();

const emit = defineEmits<{ 'update:open': [value: boolean] }>();

const error = ref('');
const working = ref(false);

watch(
  () => props.open,
  (open) => {
    if (open) {
      error.value = '';
    }
  },
);

async function confirm(): Promise<void> {
  working.value = true;
  error.value = '';
  try {
    await props.onConfirm();
    emit('update:open', false);
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Ошибка';
  } finally {
    working.value = false;
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
          {{ title }}
        </div>
        <div class="mtai-modal__text">
          {{ text }}
        </div>
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
            :disabled="working"
            @click="emit('update:open', false)"
          >
            Отмена
          </button>
          <button
            class="mtai-modal__btn mtai-modal__btn--danger"
            type="button"
            :disabled="working"
            @click="confirm"
          >
            {{ working ? 'Удаление…' : confirmText }}
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
/* диалог телепортируется в body — вне .mtai-gallery, глобального box-sizing нет */
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
  width: min(400px, calc(100vw - 32px));
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
  margin-bottom: 10px;
}

.mtai-modal__text {
  color: #4b5158;
  overflow-wrap: anywhere;
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
