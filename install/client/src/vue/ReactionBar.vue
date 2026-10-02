<script setup lang="ts">
/**
 * Реакции («лайки») — ШТАТНЫЙ рендер живой ленты Bitrix24: разметка как у
 * bitrix:rating.vote (шаблоны like + like_react) + обёртка top-panel-container
 * как в socialnetwork.log.entry; поведением управляет RatingLike из
 * main.rating — он сам рисует анимированные смайлы-спрайты, голосует через
 * штатный rating.vote, открывает попап «кто поставил» с аватарами.
 *
 * Разметку собираем один раз при монтировании в нереактивный host —
 * RatingLike мутирует DOM сам, Vue внутрь не лезет. Данные (счётчик,
 * разбивка реакций, моя реакция, подписанный ключ) приходят в rating
 * полем album.list / photo.list (lib/Rating.php).
 */
import { onMounted, ref, watch } from 'vue';
import type { GalleryConfig, Rating } from '../js/types';

const props = defineProps<{
  config: GalleryConfig;
  entityType: string;
  entityId: number;
  rating: Rating;
}>();

const host = ref<HTMLElement | null>(null);

let mount: (() => void) | null = null;

// рейтинг пришёл заново (например, loadAlbums после возврата из альбома) —
// пересобираем блок: внутренности не реактивны, RatingLike сам их не обновит
watch(
  () => props.rating,
  () => {
    mount?.();
  },
);

function escHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Стартовый текст «Вы и ещё N» под реакциями — по образцу
 * RatingRender.getTopUsersText (после голосования текст перепишет сам
 * RatingLike). Клик/hover по этому тексту открывает штатный попап
 * «кто поставил» — пустой текст делал его недоступным.
 */
function buildTopUsersText(you: boolean, more: number): string {
  const span = (text: string | number) => `<span class="feed-post-emoji-text-item">${text}</span>`;
  if (you) {
    return more > 0 ? `${span('Вы')}&nbsp;и еще ${span(more)}` : span('Вы');
  }
  return more > 0 ? span(more) : '';
}

// сборка и инициализация блока; вызывается при монтировании и при обновлении
// props.rating (внутренности не реактивны — проще пересобрать с новым likeId)
mount = () => {
  if (!host.value) {
    return;
  }
  const rating = props.rating;
  // likeId уникален на каждый монтаж (как VOTE_ID в rating.vote:
  // TYPE-ID-{time+random}) — RatingLike хранит инстансы в статическом repo
  // и после голосования обновляет их по likeId/entity: переиспользование id
  // на размонтированных карточках роняет обработчик
  const likeId = `mtai-${props.entityType.toLowerCase()}-${props.entityId}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const youLike = rating.myReaction ? ' bx-you-like' : '';
  const count = rating.count > 0 ? rating.count : 0;
  const hasReactions = Object.keys(rating.reactions).length > 0;
  const you = rating.myReaction !== null;
  const topUsersHtml = buildTopUsersText(you, Math.max(0, count - (you ? 1 : 0)));

  host.value.innerHTML = `
<div id="feed-post-emoji-top-panel-container-${likeId}" class="feed-post-emoji-top-panel-box${count > 0 ? ' feed-post-emoji-top-panel-container-active' : ''}">
  <span class="ilike-light">
    <span class="bx-ilike-button" id="bx-ilike-button-${likeId}" data-vote-key-signed="${escHtml(rating.key)}">
      <span class="bx-ilike-right-wrap${youLike}"><span class="bx-ilike-right">${count}</span></span>
      <span class="bx-ilike-left-wrap"><a href="#like" class="bx-ilike-text">${escHtml(props.config.ratingTexts.like)}</a></span>
    </span>
  </span>
  <div id="feed-post-emoji-top-panel-${likeId}" class="feed-post-emoji-container${hasReactions ? ' feed-post-emoji-container-nonempty' : ''}" data-popup="N">
    <span id="bx-ilike-user-reaction-${likeId}" data-value="${escHtml(rating.myReaction ?? '')}" style="display: none;"></span>
    <span id="feed-post-emoji-icons-${likeId}" class="feed-post-emoji-icon-box">
      <span data-like-id="${likeId}" data-reactions-data="${escHtml(JSON.stringify(rating.reactions))}" class="feed-post-emoji-icon-container"></span>
      <div id="bx-ilike-count-${likeId}" data-myreaction="${escHtml(rating.myReaction ?? '')}" class="feed-post-emoji-text-box bx-ilike-right-wrap${youLike}">
        <div class="feed-post-emoji-text-item bx-ilike-right${count <= 0 ? ' feed-post-emoji-text-counter-invisible' : ''}">${count}</div>
      </div>
    </span>
    <div class="feed-post-emoji-text-box" id="bx-ilike-top-users-${likeId}">${topUsersHtml}</div>
    <span style="display: none;" id="bx-ilike-top-users-data-${likeId}" data-users="${escHtml(JSON.stringify({ TOP: [], MORE: count }))}"></span>
  </div>
  <span class="bx-ilike-wrap-block bx-ilike-wrap-block-react" id="bx-ilike-popup-cont-${likeId}" style="display:none;">
    <span class="bx-ilike-popup"><span class="bx-ilike-wait"></span></span>
  </span>
</div>`;

  const ratingLike = (window as unknown as { RatingLike?: any }).RatingLike;
  if (!ratingLike) {
    return;
  }
  if (typeof ratingLike.setParams === 'function') {
    ratingLike.setParams({ pathToUserProfile: props.config.profilePath });
  }
  ratingLike.Set({
    likeId,
    keySigned: rating.key,
    entityTypeId: props.entityType,
    entityId: props.entityId,
    available: 'Y',
    userId: props.config.userId,
    localize: {
      LIKE_Y: props.config.ratingTexts.like,
      LIKE_N: props.config.ratingTexts.dislike,
      LIKE_D: props.config.ratingTexts.liked,
    },
    // light — как в живой ленте: иконки реакций рисуются при инициализации
    // из data-reactions-data (в standart — только после голосования)
    template: 'light',
    pathToUserProfile: props.config.profilePath,
    mobile: false,
  });
};

onMounted(mount);
</script>

<template>
  <span
    ref="host"
    class="mtai-reaction"
  />
</template>

<style scoped>
/* блок реакций нереактивен: RatingLike (main.rating) сам управляет
   содержимым и стилями — локально только контейнер */
.mtai-reaction {
  display: inline-flex;
  align-items: baseline;
}
</style>
