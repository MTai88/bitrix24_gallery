<?php

namespace Mtai\Gallery;

use Bitrix\Main\Security\Sign\TimeSigner;

/**
 * Реакции («лайки») альбомов и фотографий на штатных рейтингах Bitrix24 —
 * как в решении bitrix24_likes: голоса, счётчики и списки реакций живут в
 * стандартных таблицах (b_rating_vote / b_rating_voting_reaction), своих
 * таблиц нет.
 *
 * Фотографии = элементы инфоблока (IBLOCK_ELEMENT), альбомы = разделы
 * (IBLOCK_SECTION). Голосование выполняет штатный эндпоинт
 * /bitrix/components/bitrix/rating.vote/vote.ajax.php: клиент шлёт sessid +
 * подписанный ключ (TimeSigner, соль main.rating.vote, payload «TYPE-ID»),
 * этот класс ключи только выдаёт вместе с данными списка.
 */
final class Rating
{
	/** Реакции живой ленты (эмодзи знает клиент). */
	public const REACTIONS = ['like', 'kiss', 'laugh', 'wonder', 'cry', 'anger', 'facepalm'];

	/**
	 * Пакет данных реакций для списка сущностей.
	 *
	 * @param string $entityType IBLOCK_ELEMENT | IBLOCK_SECTION
	 * @param array<int, int> $entityIds
	 * @return array<int, array{count: int, reactions: array<string, int>, myReaction: string|null, key: string}>
	 */
	public static function formatBatch(string $entityType, array $entityIds): array
	{
		$result = [];
		$entityIds = array_values(array_unique(array_map('intval', $entityIds)));
		if (!$entityIds)
		{
			return $result;
		}

		$votes = \CRatings::GetRatingVoteResult($entityType, $entityIds);
		foreach ($entityIds as $id)
		{
			$vote = $votes[$id] ?? [];

			$reactions = [];
			foreach (($vote['REACTIONS_LIST'] ?? []) as $reaction => $count)
			{
				if ((int)$count > 0 && in_array($reaction, self::REACTIONS, true))
				{
					$reactions[(string)$reaction] = (int)$count;
				}
			}

			$result[$id] = [
				'count' => (int)($vote['TOTAL_POSITIVE_VOTES'] ?? 0),
				'reactions' => $reactions,
				'myReaction' => ($vote['USER_HAS_VOTED'] ?? 'N') === 'Y'
					? (string)($vote['USER_REACTION'] ?: 'like')
					: null,
				'key' => self::signKey($entityType, $id),
			];
		}

		return $result;
	}

	/**
	 * Подписанный ключ голосования для одной сущности (payload «TYPE-ID»,
	 * соль main.rating.vote, +1 день — как в bitrix:rating.vote).
	 */
	public static function signKey(string $entityType, int $entityId): string
	{
		return (new TimeSigner())->sign(
			$entityType . '-' . $entityId,
			'+1 day',
			'main.rating.vote'
		);
	}
}
