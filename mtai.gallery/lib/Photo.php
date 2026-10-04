<?php

namespace Mtai\Gallery;

use Bitrix\Main\FileTable;
use CFile;

/**
 * Форматирование фотографий (элементов инфоблока) для публичного JSON:
 * миниатюра через ResizeImageGet (кеш в /upload/resize_cache), оригинал
 * из b_file, размеры файла пакетно одним запросом.
 */
final class Photo
{
	/** Разрешённые типы изображений: расширение => IMAGETYPE_* для getimagesize(). */
	public const ALLOWED_TYPES = [
		'jpg' => IMAGETYPE_JPEG,
		'jpeg' => IMAGETYPE_JPEG,
		'png' => IMAGETYPE_PNG,
		'gif' => IMAGETYPE_GIF,
		'webp' => IMAGETYPE_WEBP,
	];

	/**
	 * @param array $rows строки CIBlockElement::GetList (ID, NAME, PREVIEW_TEXT, DETAIL_PICTURE)
	 * @return array[] для JSON: id, name, description, thumbUrl, fullUrl, size, ext
	 */
	public static function formatList(array $rows): array
	{
		$fileIds = [];
		foreach ($rows as $row)
		{
			if ((int)($row['DETAIL_PICTURE'] ?? 0) > 0)
			{
				$fileIds[] = (int)$row['DETAIL_PICTURE'];
			}
		}

		$files = [];
		if ($fileIds)
		{
			$rs = FileTable::getList([
				'select' => ['ID', 'FILE_SIZE', 'FILE_NAME', 'SUBDIR', 'CONTENT_TYPE', 'MODULE_ID', 'WIDTH', 'HEIGHT'],
				'filter' => ['@ID' => array_unique($fileIds)],
			]);
			while ($file = $rs->fetch())
			{
				$files[(int)$file['ID']] = $file;
			}
		}

		$list = [];
		foreach ($rows as $row)
		{
			$photo = self::formatElement($row, $files);
			if ($photo)
			{
				$list[] = $photo;
			}
		}

		return $list;
	}

	/**
	 * Один элемент =>payload для JSON, null если картинка потерялась.
	 *
	 * @param array $row
	 * @param array|null $files предварительно выбранные строки b_file (ID => row)
	 */
	public static function formatElement(array $row, ?array $files = null): ?array
	{
		$fileId = (int)($row['DETAIL_PICTURE'] ?? 0);
		if ($fileId <= 0)
		{
			return null;
		}

		if ($files === null || !isset($files[$fileId]))
		{
			$files = [];
			$rs = FileTable::getList([
				'select' => ['ID', 'FILE_SIZE', 'FILE_NAME', 'SUBDIR', 'CONTENT_TYPE', 'MODULE_ID', 'WIDTH', 'HEIGHT'],
				'filter' => ['=ID' => $fileId],
			]);
			if ($file = $rs->fetch())
			{
				$files[$fileId] = $file;
			}
		}

		$file = $files[$fileId] ?? null;
		if (!$file)
		{
			return null;
		}

		$thumb = CFile::ResizeImageGet(
			$file,
			['width' => IblockManager::THUMB_SIZE, 'height' => IblockManager::THUMB_SIZE],
			BX_RESIZE_IMAGE_EXACT,
			true
		);
		// путь ресайза приходит сырым (кириллица/пробелы) — кодируем сегменты
		$thumbSrc = (string)($thumb['src'] ?? '');
		$thumbSrc = '/' . implode('/', array_map('rawurlencode', explode('/', trim($thumbSrc, '/'))));

		return [
			'id' => (int)$row['ID'],
			'name' => (string)$row['NAME'],
			'description' => (string)($row['PREVIEW_TEXT'] ?? ''),
			'thumbUrl' => $thumbSrc,
			'fullUrl' => self::fileUrl($file),
			'size' => (int)$file['FILE_SIZE'],
			'ext' => mb_strtolower(pathinfo($file['FILE_NAME'], PATHINFO_EXTENSION)),
		];
	}

	/**
	 * URL файла из строки b_file с кодированием каждого сегмента пути
	 * (кириллица и пробелы в именах файлов).
	 *
	 * @param array $file строка b_file (SUBDIR, FILE_NAME)
	 */
	public static function fileUrl(array $file): string
	{
		$path = 'upload/' . $file['SUBDIR'] . '/' . $file['FILE_NAME'];

		return '/' . implode('/', array_map('rawurlencode', explode('/', $path)));
	}
}
