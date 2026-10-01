<?php

namespace Mtai\Gallery;

use Bitrix\Main\SiteTable;
use CIBlock;
use CIBlockType;
use RuntimeException;

/**
 * Инфоблок галереи: тип mtai_gallery + инфоблок «Галерея».
 *
 * Разделы инфоблока — альбомы, элементы — фотографии (файл в DETAIL_PICTURE,
 * подпись в PREVIEW_TEXT). Инфоблок создаётся сразу с расширенным управлением
 * прав (RIGHTS_MODE=E): по умолчанию администраторы (группа 1) имеют полный
 * доступ (X), все пользователи (группа 2) — чтение (R). Дальше права
 * настраиваются в админке (в том числе по разделам); публичная страница и
 * AJAX-контроллеры проверяют права через CIBlockRights::UserHasRightTo().
 */
class IblockManager
{
	/** Собственный тип инфоблоков модуля. */
	public const IBLOCK_TYPE = 'mtai_gallery';

	/** Символьный код инфоблока галереи. */
	public const IBLOCK_CODE = 'mtai_gallery';

	/** Публичная страница галереи. */
	public const PUBLIC_PATH = '/gallery/';

	/** Размер квадратной миниатюры сетки, px. */
	public const THUMB_SIZE = 480;

	/**
	 * @return int ID инфоблока галереи, 0 если ещё не создан
	 */
	public static function getGalleryIblockId(): int
	{
		$row = CIBlock::GetList(
			[],
			[
				'TYPE' => self::IBLOCK_TYPE,
				'CODE' => self::IBLOCK_CODE,
				'CHECK_PERMISSIONS' => 'N',
			]
		)->Fetch();

		return $row ? (int)$row['ID'] : 0;
	}

	/**
	 * Создаёт тип инфоблоков и инфоблок галереи. Повторный вызов безопасен:
	 * существующий инфоблок переиспользуется, настроенные вручную права
	 * не перезаписываются.
	 *
	 * @return int ID инфоблока галереи
	 * @throws RuntimeException
	 */
	public static function installInfoblock(): int
	{
		$iblockId = self::getGalleryIblockId();
		if ($iblockId > 0)
		{
			self::enableExtendedRights($iblockId);

			return $iblockId;
		}

		$rsType = CIBlockType::GetList([], ['=ID' => self::IBLOCK_TYPE]);
		if (!$rsType->Fetch())
		{
			$obType = new CIBlockType();
			$ok = $obType->Add([
				'ID' => self::IBLOCK_TYPE,
				'SECTIONS' => 'Y',
				'SORT' => 96,
				'LANG' => [
					'ru' => [
						'NAME' => 'Галерея',
						'SECTION_NAME' => 'Альбом',
						'ELEMENT_NAME' => 'Фотография',
					],
					'en' => [
						'NAME' => 'Gallery',
						'SECTION_NAME' => 'Album',
						'ELEMENT_NAME' => 'Photo',
					],
				],
			]);
			if (!$ok)
			{
				throw new RuntimeException('iblock type: ' . $obType->LAST_ERROR);
			}
		}

		$siteIds = [];
		$rsSites = SiteTable::getList(['select' => ['LID'], 'filter' => ['=ACTIVE' => 'Y']]);
		while ($site = $rsSites->fetch())
		{
			$siteIds[] = $site['LID'];
		}
		if (!$siteIds)
		{
			$siteIds = ['s1'];
		}

		$obIblock = new CIBlock();
		$iblockId = (int)$obIblock->Add([
			'ACTIVE' => 'Y',
			'NAME' => 'Галерея',
			'CODE' => self::IBLOCK_CODE,
			'IBLOCK_TYPE_ID' => self::IBLOCK_TYPE,
			'SITE_ID' => $siteIds,
			'SORT' => 100,
			// 1 = администраторы портала, 2 = все пользователи (читают галерею;
			// редактирование — у тех, кому выданы соответствующие права).
			// RIGHTS_MODE=E: расширенное управление правами; ядро само конвертирует
			// GROUP_ID в права инфоблока при создании (ConvertGroups + SetRights),
			// дальше права настраиваются в админке, данные фильтруются по ним.
			'RIGHTS_MODE' => 'E',
			'GROUP_ID' => [1 => 'X', 2 => 'R'],
			'WORKFLOW' => 'N',
			'LIST_PAGE_URL' => '#SITE_DIR#gallery/',
			'SECTION_PAGE_URL' => '#SITE_DIR#gallery/?album=#SECTION_ID#',
			'DETAIL_PAGE_URL' => '#SITE_DIR#gallery/',
			'INDEX_ELEMENT' => 'N',
			'INDEX_SECTION' => 'N',
			'FIELDS' => [
				// подпись к фотографии под полным изображением
				'PREVIEW_TEXT' => ['IS_REQUIRED' => 'N', 'DEFAULT_VALUE' => '', 'USE_EDITOR' => 'N'],
				'PREVIEW_TEXT_TYPE' => ['DEFAULT_VALUE' => 'text'],
				'DETAIL_PICTURE' => ['IS_REQUIRED' => 'Y'],
			],
		]);
		if ($iblockId <= 0)
		{
			throw new RuntimeException('iblock: ' . $obIblock->LAST_ERROR);
		}

		return $iblockId;
	}

	/**
	 * Переводит инфоблок галереи в режим расширенных прав, если он ещё в простом.
	 * Уже настроенные права при этом не трогаются.
	 *
	 * @param int $iblockId ID инфоблока галереи
	 */
	public static function enableExtendedRights(int $iblockId): void
	{
		$current = CIBlock::GetArrayByID($iblockId);
		if (!$current || ($current['RIGHTS_MODE'] ?? 'S') === 'E')
		{
			return;
		}

		$obIblock = new CIBlock();
		$obIblock->Update($iblockId, [
			'RIGHTS_MODE' => 'E',
			'GROUP_ID' => [1 => 'X', 2 => 'R'],
		]);
	}

	/**
	 * Удаляет инфоблок галереи вместе с содержимым и тип инфоблоков модуля.
	 */
	public static function uninstallInfoblock(): void
	{
		$iblockId = self::getGalleryIblockId();
		if ($iblockId > 0)
		{
			\CIBlockSection::DeleteAll($iblockId);
			\CIBlockElement::DeleteAll($iblockId);
			CIBlock::Delete($iblockId);
		}

		$rsType = CIBlockType::GetList([], ['=ID' => self::IBLOCK_TYPE]);
		if ($rsType->Fetch())
		{
			CIBlockType::Delete(self::IBLOCK_TYPE);
		}
	}
}
