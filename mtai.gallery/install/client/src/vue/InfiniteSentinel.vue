<script setup lang="ts">
/**
 * Сентинел автоподгрузки: IntersectionObserver следит за видимостью
 * элемента и сообщает её родителю (emit('intersect', boolean)).
 *
 * Сам ничего не загружает: родитель реагирует на видимость в связке со
 * своим состоянием (loading/cursor) — иначе наблюдатель срабатывает только
 * при ИЗМЕНЕНИИ пересечения, и если сентинел остаётся в зоне видимости
 * (большой rootMargin / большой экран), автоподгрузка застревает после
 * первой страницы.
 */
import { onBeforeUnmount, onMounted, ref } from 'vue';

defineProps<{
  /** есть ли смысл показывать сентинел (страницы ещё не закончились) */
  active: boolean;
}>();

const emit = defineEmits<{
  intersect: [visible: boolean];
}>();

const el = ref<HTMLElement | null>(null);
let observer: IntersectionObserver | null = null;

onMounted(() => {
  observer = new IntersectionObserver(
    (entries) => emit('intersect', entries.some((entry) => entry.isIntersecting)),
    { rootMargin: '600px 0px' },
  );
  if (el.value) {
    observer.observe(el.value);
  }
});

onBeforeUnmount(() => {
  observer?.disconnect();
});
</script>

<template>
  <div
    v-show="active"
    ref="el"
    class="mtai-gallery__sentinel"
  />
</template>

<style scoped>
.mtai-gallery__sentinel {
  height: 1px;
}
</style>
