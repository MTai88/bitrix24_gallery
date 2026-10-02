<?php

if (!defined('B_PROLOG_INCLUDED') || B_PROLOG_INCLUDED !== true)
{
	die();
}

/**
 * Компонент mtai:gallery.app — точка входа публичной галереи /gallery/.
 *
 * Сама галерея — Vue-приложение (сборка Vite, install/client), компонент
 * готовит конфиг (права, sessid, действия ajax), подключает просмотрщик
 * Bitrix24 (ui.viewer) и бандл из /bitrix/js/mtai.gallery/dist/manifest.json.
 */

use Bitrix\Main\Application;
use Bitrix\Main\Loader;
use Bitrix\Main\UI\Extension;
use Mtai\Gallery\IblockManager;
use Mtai\Gallery\Permission;

$arResult = [
	'IBLOCK_ID' => 0,
	'CONFIG' => [],
	'CSS' => [],
	'JS_URL' => '',
	'VENDOR_URL' => '',
];

if (!Loader::includeModule('iblock') || !Loader::includeModule('mtai.gallery'))
{
	ShowError('Модуль mtai.gallery не установлен');
	return;
}

$iblockId = IblockManager::getGalleryIblockId();
if ($iblockId <= 0)
{
	ShowError('Инфоблок галереи не найден');
	return;
}

$arResult['IBLOCK_ID'] = $iblockId;

$arResult['CONFIG'] = [
	'sessid' => bitrix_sessid(),
	'iblockId' => $iblockId,
	'ajaxUrl' => '/bitrix/services/main/ajax.php',
	// реакции (лайки) — штатный эндпоинт rating.vote, голоса в стандартных
	// таблицах рейтингов; ключи данные списков приносят с собой
	'voteUrl' => '/bitrix/components/bitrix/rating.vote/vote.ajax.php',
	'profilePath' => '/company/personal/user/#user_id#/',
	'actions' => [
		'albumList' => 'mtai:gallery.album.list',
		'albumSave' => 'mtai:gallery.album.save',
		'albumReorder' => 'mtai:gallery.album.reorder',
		'albumDelete' => 'mtai:gallery.album.delete',
		'photoList' => 'mtai:gallery.photo.list',
		'photoUpload' => 'mtai:gallery.photo.upload',
		'photoReplace' => 'mtai:gallery.photo.replace',
		'photoReorder' => 'mtai:gallery.photo.reorder',
		'photoRevert' => 'mtai:gallery.photo.revert',
		'photoUpdate' => 'mtai:gallery.photo.update',
		'photoDelete' => 'mtai:gallery.photo.delete',
	],
	'permissions' => Permission::getFlags($iblockId),
];

// редактор изображений: расширение mtai.image_editor (обёртка над штатным
// редактором «Сайтов», репозиторий bitrix24_image_editor) + модуль landing.
// Если расширения нет — кнопки редактирования просто не будет
$arResult['CONFIG']['imageEditor'] = false;
foreach (['/local/js/mtai/image_editor/config.php', '/bitrix/js/mtai/image_editor/config.php'] as $editorConfig)
{
	if (is_file(Application::getDocumentRoot() . $editorConfig))
	{
		Extension::load('mtai.image_editor');
		$arResult['CONFIG']['imageEditor'] = true;
		break;
	}
}

// штатный просмотрщик изображений Bitrix24 (BX.UI.Viewer)
Extension::load('ui.viewer');

// собранный Vue-бандл: имена с хешами читаем из manifest.json
// (формат скаффолда Vite: main.js/main.css — вход, vendor.js — общий чанк)
$distDir = '/bitrix/js/mtai.gallery/dist';
$manifestPath = Application::getDocumentRoot() . $distDir . '/manifest.json';
if (is_file($manifestPath))
{
	$manifest = json_decode((string)file_get_contents($manifestPath), true);
	if (is_array($manifest))
	{
		foreach ($manifest as $key => $path)
		{
			if (preg_match('/\.css$/', (string)$key))
			{
				$arResult['CSS'][] = $distDir . '/' . $path;
			}
		}
		$arResult['JS_URL'] = !empty($manifest['main.js']) ? $distDir . '/' . $manifest['main.js'] : '';
		$arResult['VENDOR_URL'] = !empty($manifest['vendor.js']) ? $distDir . '/' . $manifest['vendor.js'] : '';
	}
}

$this->IncludeComponentTemplate();
