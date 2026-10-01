<?php
/**
 * Пункт меню «Контент → Галерея» админки (модуль mtai.gallery):
 * список альбомов (разделов) инфоблока галереи.
 */

use Bitrix\Main\Loader;

$iblockId = 0;
if (Loader::includeModule('iblock'))
{
	$row = CIBlock::GetList(
		[],
		[
			'TYPE' => 'mtai_gallery',
			'CODE' => 'mtai_gallery',
			'CHECK_PERMISSIONS' => 'N',
		]
	)->Fetch();
	if ($row)
	{
		$iblockId = (int)$row['ID'];
	}
}

if ($iblockId > 0)
{
	$url = 'iblock_section_admin.php?IBLOCK_ID=' . $iblockId . '&type=mtai_gallery&lang=' . LANGUAGE_ID;
}
else
{
	$url = 'iblock_admin.php?type=mtai_gallery&lang=' . LANGUAGE_ID;
}

$aMenu = [
	'parent_menu' => 'global_content',
	'sort' => 361,
	'url' => $url,
	'text' => 'Галерея',
	'title' => 'Фотогалерея (альбомы — разделы, фото — элементы). Публичная страница /gallery/',
	'icon' => 'iblock_menu_icon_types',
	'page_id' => 'mtai_gallery',
];

return $aMenu;
