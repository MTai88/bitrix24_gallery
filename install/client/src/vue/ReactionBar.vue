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

const props = withDefaults(
  defineProps<{
    config: GalleryConfig;
    entityType: string;
    entityId: number;
    rating: Rating;
    /** pill — белая пилюля (на фото), plain — без подложки (альбомы) */
    variant?: 'pill' | 'plain';
  }>(),
  {
    variant: 'pill',
  },
);

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
  // начальное «моё» состояние кнопки — как bx-you-like-button в log.entry
  // (после голосования класс переключает сам RatingLike)
  const youLikeButton = rating.myReaction ? ' bx-you-like-button' : '';
  const count = rating.count > 0 ? rating.count : 0;
  const hasReactions = Object.keys(rating.reactions).length > 0;
  const you = rating.myReaction !== null;
  const topUsersHtml = buildTopUsersText(you, Math.max(0, count - (you ? 1 : 0)));

  // ВАЖНО: кнопка — СНАРУЖИ контейнера feed-post-emoji-top-panel-box, как в
  // socialnetwork.log.entry (кнопка в строке информеров, панель отдельно):
  // штатный CSS держит панель свёрнутой (max-height: 0 + overflow: hidden)
  // до появления голосов — кнопка внутри контейнера обрезалась бы вместе
  // с ней и была бы невидима на карточках без голосов.
  // Счётчика (bx-ilike-right-wrap) в кнопке тоже нет — как в ленте: RatingLike
  // тогда берёт счётчик из панели (bx-ilike-count-<id>), и при нуле голосов
  // видна только подпись «Нравится», а не «0 Нравится»
  host.value.innerHTML = `
<span class="ilike-light">
  <span class="bx-ilike-button feed-new-like" id="bx-ilike-button-${likeId}" data-vote-key-signed="${escHtml(rating.key)}">
    <span class="bx-ilike-left-wrap${youLikeButton}"><a href="#like" class="bx-ilike-text">${escHtml(props.config.ratingTexts.like)}</a></span>
  </span>
</span>
<div id="feed-post-emoji-top-panel-container-${likeId}" class="feed-post-emoji-top-panel-box${count > 0 ? ' feed-post-emoji-top-panel-container-active' : ''}">
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
    :class="`mtai-reaction--${props.variant}`"
  />
</template>

<style scoped>
/* блок реакций нереактивен: RatingLike (main.rating) сам управляет
   содержимым и стилями — локально только контейнер */
.mtai-reaction {
  display: inline-flex;
  align-items: center;
}
</style>

<!-- разметка собирается через innerHTML — scoped-атрибутов на ней нет,
     поэтому переопределение штатных стилей ленты глобальное -->
<style>
/* у панели реакций убираем отступы живой ленты (панель под постом
   со сдвигом): у нас она в строку рядом с кнопкой */
.mtai-reaction .feed-post-emoji-top-panel-box {
  padding: 0;
  margin: 0;
  flex: 0 1 auto;
  min-width: 0;
}

/* ── обвязка под карточки галереи ────────────────────────────────────────
   Штатные стили блока рассчитаны на белый фон ленты; здесь блок живёт
   на фотографиях: белая пилюля-подложка, нейтральный текст, крупные
   иконки без обрезки (штатно 18px с толстой белой врезкой и
   max-height 22px — на карточке это режет спрайт). */

.mtai-reaction {
  background: rgba(255, 255, 255, 0.92);
  border-radius: 14px;
  padding: 4px 9px;
  line-height: 1;
  box-shadow: 0 1px 4px rgba(15, 18, 22, 0.18);
}

/* штатный .feed-new-like reserves 13px справа под всплывающую панель
   выбора реакций — у нас панель позиционируется от кнопки, запас не нужен */
.mtai-reaction .feed-new-like {
  margin-right: 0;
}

/* альбомы: без пилюли — фон и так белый, чип выглядел чужеродно */
.mtai-reaction--plain {
  background: transparent;
  border-radius: 0;
  padding: 0;
  box-shadow: none;
}

/* тёмный чип (на белом фоне тулбара/плашки альбома): реакции со светлыми
   спрайтами и белыми кольцами читаются только на тёмном */
.mtai-reaction--dark {
  background: rgba(15, 18, 22, 0.55);
  border-radius: 14px;
  padding: 3px 9px;
  box-shadow: none;
  flex-shrink: 0;
}

.mtai-reaction--dark .ilike-light .bx-ilike-button,
.mtai-reaction--dark .ilike-light .bx-ilike-text,
.mtai-reaction--dark .ilike-light .bx-ilike-right,
.mtai-reaction--dark .feed-post-emoji-top-panel-box .feed-post-emoji-text-box,
.mtai-reaction--dark .feed-post-emoji-text-box .feed-post-emoji-text-item {
  color: #fff;
}

.mtai-reaction--dark .ilike-light .bx-ilike-button:hover .bx-ilike-text {
  color: #7fd6ff;
}

/* «Нравится» — нейтральный текст вместо ссылки в цвет портала */
.mtai-reaction .ilike-light .bx-ilike-button {
  height: auto;
  color: #535c69;
}

.mtai-reaction .ilike-light .bx-ilike-text {
  height: auto;
  padding: 5px 0;
  color: #535c69;
  font-size: 12px;
  line-height: 1;
}

.mtai-reaction .ilike-light .bx-ilike-button:hover .bx-ilike-text {
  color: #2fa6dd;
}

.mtai-reaction .ilike-light .bx-ilike-right-wrap {
  height: auto;
  margin-left: 7px;
}

.mtai-reaction .ilike-light .bx-ilike-right {
  color: #535c69;
  font-size: 12px;
  font-weight: 600;
  line-height: 1;
}

/* текст «Вы и еще N»: контейнер штатно красит слова между спанами (#2066B0) */
.mtai-reaction .feed-post-emoji-top-panel-box .feed-post-emoji-text-box {
  color: #535c69;
  font-size: 12px;
  border-bottom: none;
  margin: 0 0 0 7px;
}

.mtai-reaction .feed-post-emoji-top-panel-box .feed-post-emoji-text-box:hover {
  border-bottom: none;
}

.mtai-reaction .feed-post-emoji-text-box .feed-post-emoji-text-item {
  color: #535c69;
  font-size: 12px;
  border-bottom: none;
}

/* иконки реакций крупнее и целиком; вертикаль — по центру строки,
   иначе inline-block на базовой линии подрезается снизу пилюлей.
   !important против штатных .feed-post-emoji-icon-box-show { max-height: 22px }
   (два класса, порядок загрузки CSS не гарантирован) — иначе низ иконки
   срезается ровно на 2px */
.mtai-reaction .feed-post-emoji-icon-box,
.mtai-reaction .feed-post-emoji-icon-box.feed-post-emoji-icon-box-show,
.mtai-reaction .feed-post-emoji-icon-container,
.mtai-reaction .feed-post-emoji-top-panel-box .feed-post-emoji-icon-box,
.mtai-reaction .feed-post-emoji-top-panel-box .feed-post-emoji-icon-container {
  max-height: none !important;
  height: auto;
  min-width: 0;
  min-height: 0;
  line-height: 0;
  overflow: visible;
  align-items: center;
}

.mtai-reaction .feed-post-emoji-top-panel-box .feed-post-emoji-icon-item,
.mtai-reaction .feed-post-emoji-icon-item {
  /* border-box: 24px ВМЕСТЕ с рамкой — иначе иконка 28px вылезает
     на 2px ниже пилюли (глобального box-sizing тут нет) */
  box-sizing: border-box;
  width: 24px;
  height: 24px;
  border: 2px solid #fff;
  border-radius: 100%;
  background-size: cover;
  box-shadow: none;
  margin-left: -7px;
  vertical-align: middle;
  align-self: center;
}

/* панель без иконок (ни одного голоса) не должна раздувать пилюлю справа:
   скрытый счётчик-элемент — тоже элемент, поэтому матчим строго по иконкам
   (при голосах реакции есть всегда, при нуле — панели нет) */
.mtai-reaction .feed-post-emoji-top-panel-box:not(:has(.feed-post-emoji-icon-item)) {
  display: none;
}

.mtai-reaction .feed-post-emoji-top-panel-box {
  margin-left: 7px;
}

.mtai-reaction .feed-post-emoji-top-panel-box .feed-post-emoji-icon-item-1,
.mtai-reaction .feed-post-emoji-icon-item-1 {
  margin-left: 0;
}
</style>
