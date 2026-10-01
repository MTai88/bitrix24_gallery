<script setup lang="ts">
/**
 * Реакции («лайки») фотографии/альбома — как в живой ленте, на штатных
 * рейтингах Bitrix24: клик по кнопке открывает панель реакций, голосование
 * идёт в стандартный rating.vote (ключ данные списка приносят подписанным),
 * клик по счётчику — список проголовавших с аватарами.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import type { Api } from '../js/api';
import type { Rating } from '../js/types';

const props = defineProps<{
  api: Api;
  entityType: string;
  entityId: number;
  rating: Rating;
  /** компактный режим — на карточках сетки */
  small?: boolean;
}>();

interface Voter {
  USER_ID: number;
  FULL_NAME: string;
  PHOTO_SRC: string;
  URL: string;
  VOTE_VALUE: number;
}

/** реакции живой ленты: имя => эмодзи и подпись */
const REACTIONS: Array<{ name: string; emoji: string; title: string }> = [
  { name: 'like', emoji: '👍', title: 'Нравится' },
  { name: 'kiss', emoji: '😍', title: 'Восторг' },
  { name: 'laugh', emoji: '😄', title: 'Смешно' },
  { name: 'wonder', emoji: '😮', title: 'Удивление' },
  { name: 'cry', emoji: '😢', title: 'Грусть' },
  { name: 'anger', emoji: '😡', title: 'Возмущение' },
  { name: 'facepalm', emoji: '🤦', title: 'Facepalm' },
];

const state = reactive({
  count: props.rating.count,
  reactions: { ...props.rating.reactions } as Record<string, number>,
  myReaction: props.rating.myReaction,
  key: props.rating.key,
});

// список перезагрузили (смена альбома/страницы) — синхронизируемся
watch(
  () => props.rating,
  (rating) => {
    state.count = rating.count;
    state.reactions = { ...rating.reactions };
    state.myReaction = rating.myReaction;
    state.key = rating.key;
  },
);

const panelOpen = ref(false);
const votersOpen = ref(false);
const voters = ref<Voter[]>([]);
const votersTotal = ref(0);
const votersPage = ref(0);
const votersLoading = ref(false);

/** до трёх самых популярных реакций — на кнопке */
const topReactions = computed(() =>
  Object.entries(state.reactions)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, count, ...REACTIONS.find((r) => r.name === name) })),
);

function togglePanel(): void {
  panelOpen.value = !panelOpen.value;
  if (panelOpen.value) {
    votersOpen.value = false;
  }
}

// клик мимо — закрыть панель и список проголосовавших
function onDocumentClick(): void {
  panelOpen.value = false;
  votersOpen.value = false;
}

onMounted(() => {
  document.addEventListener('click', onDocumentClick);
});

onBeforeUnmount(() => {
  document.removeEventListener('click', onDocumentClick);
});

async function vote(reaction: string): Promise<void> {
  const previous = { count: state.count, reactions: { ...state.reactions }, myReaction: state.myReaction };
  const action = state.myReaction === reaction ? 'cancel' : state.myReaction ? 'change' : 'plus';

  // оптимистично: применяем локально, при отказе ядра — откат
  if (action === 'cancel') {
    state.myReaction = null;
    state.count -= 1;
    state.reactions[reaction] = Math.max(0, (state.reactions[reaction] ?? 1) - 1);
    if (!state.reactions[reaction]) {
      delete state.reactions[reaction];
    }
  } else {
    if (state.myReaction) {
      state.reactions[state.myReaction] = Math.max(0, (state.reactions[state.myReaction] ?? 1) - 1);
      if (!state.reactions[state.myReaction]) {
        delete state.reactions[state.myReaction];
      }
    } else {
      state.count += 1;
    }
    state.myReaction = reaction;
    state.reactions[reaction] = (state.reactions[reaction] ?? 0) + 1;
  }

  const response = await props.api.vote(props.entityType, props.entityId, state.key, action, reaction);
  if (response) {
    // ядро — источник истины: счётчики и разбивку берём из ответа
    state.count = Number(response.items_all ?? response.resultVotes ?? state.count);
    const reactions: Record<string, number> = {};
    for (const [name, count] of Object.entries(response.reactions ?? {})) {
      if ((count as number) > 0) {
        reactions[name] = count as number;
      }
    }
    state.reactions = reactions;
    state.myReaction = action === 'cancel' ? null : reaction;
  } else {
    Object.assign(state, previous);
  }

  panelOpen.value = false;
}

async function openVoters(): Promise<void> {
  votersOpen.value = !votersOpen.value;
  panelOpen.value = false;
  if (votersOpen.value && !voters.value.length) {
    await loadVoters();
  }
}

async function loadVoters(): Promise<void> {
  votersLoading.value = true;
  try {
    const response = await props.api.voteList(props.entityType, props.entityId, state.key, votersPage.value + 1);
    if (response) {
      voters.value = voters.value.concat(response.items ?? []);
      votersTotal.value = Number(response.items_all ?? voters.value.length);
      votersPage.value = Number(response.items_page ?? voters.value.length ? 1 : 0);
    }
  } finally {
    votersLoading.value = false;
  }
}
</script>

<template>
  <div
    class="mtai-reaction"
    @click.stop
    @keyup.stop
  >
    <button
      class="mtai-reaction__btn"
      :class="{ 'mtai-reaction__btn--mine': !!state.myReaction, 'mtai-reaction__btn--small': small }"
      type="button"
      title="Реакция"
      @click="togglePanel"
    >
      <span
        v-if="topReactions.length"
        class="mtai-reaction__stack"
      >
        <span
          v-for="r in topReactions"
          :key="r.name"
          class="mtai-reaction__stack-emoji"
        >{{ r.emoji }}</span>
      </span>
      <span
        v-else
        class="mtai-reaction__thumb"
        :class="{ 'mtai-reaction__thumb--mine': !!state.myReaction }"
      >👍</span>
    </button>
    <button
      v-if="state.count > 0"
      class="mtai-reaction__count"
      :class="{ 'mtai-reaction__count--small': small }"
      type="button"
      title="Кто поставил реакцию"
      @click="openVoters"
    >
      {{ state.count }}
    </button>

    <!-- панель выбора реакции -->
    <div
      v-if="panelOpen"
      class="mtai-reaction__panel"
    >
      <button
        v-for="r in REACTIONS"
        :key="r.name"
        class="mtai-reaction__emoji"
        :class="{ 'mtai-reaction__emoji--mine': state.myReaction === r.name }"
        type="button"
        :title="r.title"
        @click="vote(r.name)"
      >
        {{ r.emoji }}
      </button>
    </div>

    <!-- список проголосовавших -->
    <div
      v-if="votersOpen"
      class="mtai-reaction__voters"
    >
      <div
        v-if="votersLoading && !voters.length"
        class="mtai-reaction__voters-hint"
      >
        Загрузка…
      </div>
      <a
        v-for="voter in voters"
        :key="voter.USER_ID"
        class="mtai-reaction__voter"
        :href="voter.URL"
        target="_blank"
      >
        <img
          v-if="voter.PHOTO_SRC"
          class="mtai-reaction__voter-photo"
          :src="voter.PHOTO_SRC"
          alt=""
        >
        <span
          v-else
          class="mtai-reaction__voter-photo mtai-reaction__voter-photo--empty"
        >
          {{ voter.FULL_NAME.slice(0, 1) }}
        </span>
        <span class="mtai-reaction__voter-name">{{ voter.FULL_NAME }}</span>
      </a>
      <button
        v-if="voters.length < votersTotal"
        class="mtai-reaction__voters-more"
        type="button"
        :disabled="votersLoading"
        @click="loadVoters"
      >
        {{ votersLoading ? 'Загрузка…' : `Показать ещё (${votersTotal - voters.length})` }}
      </button>
      <div
        v-else-if="!voters.length && !votersLoading"
        class="mtai-reaction__voters-hint"
      >
        Пока никто не поставил реакцию
      </div>
    </div>
  </div>
</template>

<style scoped>
.mtai-reaction {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.mtai-reaction__btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 30px;
  height: 30px;
  padding: 0 6px;
  border: none;
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.85);
  cursor: pointer;
  transition: background 0.15s ease;
}

.mtai-reaction__btn:hover {
  background: #fff;
}

.mtai-reaction__btn--small {
  min-width: 26px;
  height: 26px;
  border-radius: 13px;
}

.mtai-reaction__stack {
  display: inline-flex;
}

.mtai-reaction__stack-emoji {
  font-size: 14px;
  margin-right: -4px;
}

.mtai-reaction__stack-emoji:last-child {
  margin-right: 0;
}

.mtai-reaction__thumb {
  font-size: 14px;
  filter: grayscale(1);
  opacity: 0.55;
}

.mtai-reaction__thumb--mine {
  filter: none;
  opacity: 1;
}

.mtai-reaction__count {
  border: none;
  padding: 0;
  background: transparent;
  font-size: 13px;
  font-weight: 600;
  color: #2b6ca3;
  cursor: pointer;
}

.mtai-reaction__count:hover {
  text-decoration: underline;
}

.mtai-reaction__count--small {
  font-size: 12px;
}

.mtai-reaction__panel {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 30;
  display: flex;
  gap: 2px;
  padding: 4px 6px;
  border-radius: 18px;
  background: #fff;
  box-shadow: 0 4px 18px rgba(15, 18, 22, 0.25);
}

.mtai-reaction__emoji {
  border: none;
  background: transparent;
  font-size: 20px;
  line-height: 1.4;
  padding: 2px 3px;
  border-radius: 8px;
  cursor: pointer;
  transition: transform 0.1s ease;
}

.mtai-reaction__emoji:hover {
  transform: scale(1.25);
}

.mtai-reaction__emoji--mine {
  background: #e7f6fd;
}

.mtai-reaction__voters {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  z-index: 30;
  width: 260px;
  max-height: 300px;
  overflow-y: auto;
  padding: 10px;
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 4px 18px rgba(15, 18, 22, 0.25);
}

.mtai-reaction__voter {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 2px;
  color: #232323;
}

.mtai-reaction__voter:hover {
  color: #2b6ca3;
}

.mtai-reaction__voter-photo {
  width: 24px;
  height: 24px;
  border-radius: 12px;
  object-fit: cover;
  flex-shrink: 0;
}

.mtai-reaction__voter-photo--empty {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #dfe7ec;
  font-size: 12px;
  color: #5f6a74;
}

.mtai-reaction__voter-name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mtai-reaction__voters-more,
.mtai-reaction__voters-hint {
  margin-top: 6px;
  font-size: 13px;
  color: #2b6ca3;
}

.mtai-reaction__voters-more {
  border: none;
  background: transparent;
  padding: 0;
  cursor: pointer;
}

.mtai-reaction__voters-hint {
  color: #92979c;
}
</style>
