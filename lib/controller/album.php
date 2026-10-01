<?php

namespace Mtai\Gallery\Controller;

use Bitrix\Main\Application;
use Bitrix\Main\Engine\ActionFilter;
use Bitrix\Main\Error;
use CIBlockSection;
use CIBlockElement;
use Mtai\Gallery\Permission;
use Mtai\Gallery\Photo;
use Mtai\Gallery\Rating;

/**
 * Альбомы галереи (разделы инфоблока) для публичной страницы.
 *
 * Действия (ajax.php?action=...):
 *   mtai:gallery.album.list          — список с количеством и обложками
 *   mtai:gallery.album.save          — создание/переименование
 *   mtai:gallery.album.delete        — удаление вместе с фотографиями
 */
class Album extends Base
{
	private const SECTION_RIGHTS_ERROR = 'Нет прав на управление альбомами';

	/**
	 * Ключ конфига — именно 'prefilters': вариант 'filters' ядро молча
	 * игнорирует и применяет дефолтный набор (в котором Csrf обязателен
	 * и для GET). Авторизация проверяется в Base::requireIblockId().
	 */
	public function configureActions(): array
	{
		return [
			'list' => ['prefilters' => [new ActionFilter\HttpMethod([ActionFilter\HttpMethod::METHOD_GET])]],
			'save' => ['prefilters' => $this->postFilters()],
			'reorder' => ['prefilters' => $this->postFilters()],
			'delete' => ['prefilters' => $this->postFilters()],
		];
	}

	/**
	 * @return array{albums: array[], permissions: array}
	 */
	public function listAction(): array
	{
		$iblockId = $this->requireIblockId();
		if ($iblockId <= 0)
		{
			return [];
		}

		$albums = [];
		// порядок — ручная сортировка (SORT ASC, внутри равных — новые вперёд)
		$rs = CIBlockSection::GetList(
			['SORT' => 'ASC', 'ID' => 'DESC'],
			[
				'IBLOCK_ID' => $iblockId,
				'ACTIVE' => 'Y',
				'CHECK_PERMISSIONS' => 'Y',
				// счётчик только активных элементов
				'CNT_ACTIVE' => 'Y',
			],
			true // bIncCnt => ELEMENT_CNT
		);
		while ($section = $rs->Fetch())
		{
			$albums[] = [
				'id' => (int)$section['ID'],
				'name' => (string)$section['NAME'],
				'depth' => (int)$section['DEPTH_LEVEL'],
				'count' => (int)$section['ELEMENT_CNT'],
				'cover' => $this->findCover($iblockId, (int)$section['ID']),
			];
		}

		// реакции альбомов (штатные рейтинги, сущность IBLOCK_SECTION)
		$ratings = Rating::formatBatch('IBLOCK_SECTION', array_column($albums, 'id'));
		foreach ($albums as &$album)
		{
			$album['rating'] = $ratings[$album['id']];
		}
		unset($album);

		return [
			'albums' => $albums,
			'permissions' => Permission::getFlags($iblockId),
		];
	}

	/**
	 * Создание (id=0) или переименование альбома.
	 *
	 * @return array{id: int}
	 */
	public function saveAction(int $id = 0, string $name = ''): array
	{
		$iblockId = $this->requireIblockId();
		if ($iblockId <= 0)
		{
			return [];
		}

		$name = trim($name);
		if ($name === '')
		{
			$this->addError(new Error('Укажите название альбома'));

			return [];
		}

		$section = new CIBlockSection();
		if ($id > 0)
		{
			if (!$this->ownSection($iblockId, $id))
			{
				$this->addError(new Error('Альбом не найден'));

				return [];
			}
			if (!Permission::has($iblockId, 'section_edit'))
			{
				$this->addError(new Error(self::SECTION_RIGHTS_ERROR));

				return [];
			}

			$ok = $section->Update($id, ['NAME' => $name]);
			if (!$ok)
			{
				$this->addError(new Error($section->LAST_ERROR));

				return [];
			}

			return ['id' => $id];
		}

		if (!Permission::has($iblockId, 'section_section_bind'))
		{
			$this->addError(new Error(self::SECTION_RIGHTS_ERROR));

			return [];
		}

		$newId = (int)$section->Add([
			'IBLOCK_ID' => $iblockId,
			'NAME' => $name,
			'ACTIVE' => 'Y',
			// новые альбомы — в начало (перед минимальным SORT)
			'SORT' => $this->nextPrependSort($iblockId),
		]);
		if ($newId <= 0)
		{
			$this->addError(new Error($section->LAST_ERROR));

			return [];
		}

		return ['id' => $newId];
	}

	/**
	 * Удаление альбома вместе со всеми фотографиями внутри.
	 *
	 * @return array{id: int}
	 */
	public function deleteAction(int $id): array
	{
		$iblockId = $this->requireIblockId();
		if ($iblockId <= 0)
		{
			return [];
		}

		if (!$this->ownSection($iblockId, $id))
		{
			$this->addError(new Error('Альбом не найден'));

			return [];
		}
		if (!Permission::has($iblockId, 'section_delete'))
		{
			$this->addError(new Error(self::SECTION_RIGHTS_ERROR));

			return [];
		}

		if (!CIBlockSection::Delete($id))
		{
			$this->addError(new Error('Не удалось удалить альбом'));

			return [];
		}

		return ['id' => $id];
	}

	/**
	 * Альбом принадлежит инфоблоку галереи?
	 */
	private function ownSection(int $iblockId, int $id): bool
	{
		return (bool)CIBlockSection::GetList(
			[],
			['ID' => $id, 'IBLOCK_ID' => $iblockId, 'CHECK_PERMISSIONS' => 'N'],
			false,
			['ID']
		)->Fetch();
	}

	/**
	 * Ручная сортировка альбомов: клиент присылает порядок id разделов,
	 * SORT расставляется с шагом 100. Право — section_edit.
	 *
	 * @return array{sorted: int}
	 */
	public function reorderAction(string $ids = ''): array
	{
		$iblockId = $this->requireIblockId();
		if ($iblockId <= 0)
		{
			return [];
		}

		if (!Permission::has($iblockId, 'section_edit'))
		{
			$this->addError(new Error(self::SECTION_RIGHTS_ERROR));

			return [];
		}

		$sectionIds = array_map('intval', array_filter(explode(',', $ids)));
		if (!$sectionIds)
		{
			$this->addError(new Error('Не передан порядок альбомов'));

			return [];
		}

		// все переданные id должны быть альбомами этого инфоблока
		foreach ($sectionIds as $sectionId)
		{
			if (!$this->ownSection($iblockId, $sectionId))
			{
				$this->addError(new Error('Альбом не найден'));

				return [];
			}
		}

		// прямой SQL вместо CIBlockSection::Update — тот тяжёлый и надолго
		// блокирует PHP-сессию (см. комментарий в photo.reorder)
		$connection = Application::getConnection();
		foreach (array_values($sectionIds) as $index => $sectionId)
		{
			$connection->queryExecute(
				'UPDATE b_iblock_section'
				. ' SET SORT = ' . (($index + 1) * 100)
				. ' WHERE ID = ' . $sectionId . ' AND IBLOCK_ID = ' . $iblockId
			);
		}
		\CIBlock::clearIblockTagCache($iblockId);

		return ['sorted' => count($sectionIds)];
	}

	/**
	 * SORT нового альбома: перед минимальным существующим, шаг 100.
	 */
	private function nextPrependSort(int $iblockId): int
	{
		$min = CIBlockSection::GetList(
			['SORT' => 'ASC'],
			['IBLOCK_ID' => $iblockId, 'CHECK_PERMISSIONS' => 'N'],
			false,
			['SORT']
		)->Fetch();

		return $min ? (int)$min['SORT'] - 100 : 100;
	}

	/**
	 * Обложка альбома — самая свежая фотография (включая подразделы).
	 */
	private function findCover(int $iblockId, int $sectionId): ?array
	{
		$row = CIBlockElement::GetList(
			['ID' => 'DESC'],
			[
				'IBLOCK_ID' => $iblockId,
				'SECTION_ID' => $sectionId,
				'INCLUDE_SUBSECTIONS' => 'Y',
				'ACTIVE' => 'Y',
				'CHECK_PERMISSIONS' => 'Y',
			],
			false,
			['nTopCount' => 1],
			['ID', 'NAME', 'PREVIEW_TEXT', 'DETAIL_PICTURE']
		)->Fetch();

		return $row ? Photo::formatElement($row) : null;
	}

	private function postFilters(): array
	{
		return [
			new ActionFilter\HttpMethod([ActionFilter\HttpMethod::METHOD_POST]),
			new ActionFilter\Csrf(),
		];
	}
}
