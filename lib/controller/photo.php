<?php

namespace Mtai\Gallery\Controller;

use Bitrix\Main\Engine\ActionFilter;
use Bitrix\Main\Error;
use CIBlockElement;
use CIBlockSection;
use Mtai\Gallery\Permission;
use Mtai\Gallery\Photo as PhotoFormatter;
use Mtai\Gallery\Rating;

/**
 * Фотографии галереи (элементы инфоблока) для публичной страницы.
 *
 * Действия (ajax.php?action=...):
 *   mtai:gallery.photo.list    — страница сетки с курсорной пагинацией
 *   mtai:gallery.photo.upload  — FilePond process: файл => элемент создаётся сразу
 *   mtai:gallery.photo.revert  — FilePond revert: файл убрали из пруда => удалить элемент
 *   mtai:gallery.photo.update  — название и подпись
 *   mtai:gallery.photo.delete  — удаление
 *
 * Загрузка «мгновенная» (элемент создаётся в момент выбора файла, как в
 * mtai.bpservices файл уходит сразу): ни формы, ни временных файлов —
 * multipart-часть 'file' попадает в $_FILES этого же запроса и сохраняется
 * через CIBlockElement::Add(DETAIL_PICTURE).
 */
class Photo extends Base
{
	/** Страница сетки, элементов. */
	private const PAGE_SIZE = 24;

	/** Максимальный размер файла, байт (50 МБ). */
	private const MAX_SIZE = 52428800;

	/** Multipart-имя файла от FilePond (у программного пруда fieldName пуст). */
	private const FILE_FIELD = 'file';

	/**
	 * Ключ конфига — именно 'prefilters' (не 'filters' — тот ядро игнорирует).
	 * Авторизация проверяется в Base::requireIblockId().
	 */
	public function configureActions(): array
	{
		return [
			'list' => ['prefilters' => [new ActionFilter\HttpMethod([ActionFilter\HttpMethod::METHOD_GET])]],
			'upload' => ['prefilters' => $this->postFilters()],
			'replace' => ['prefilters' => $this->postFilters()],
			'revert' => ['prefilters' => $this->postFilters()],
			'update' => ['prefilters' => $this->postFilters()],
			'delete' => ['prefilters' => $this->postFilters()],
		];
	}

	/**
	 * Страница сетки альбома, курсорная пагинация (id < cursor) — новые
	 * загрузки не сдвигают уже выданные страницы.
	 *
	 * @return array{items: array[], cursor: int|null, permissions: array}
	 */
	public function listAction(int $albumId, int $cursor = 0, int $limit = self::PAGE_SIZE): array
	{
		$iblockId = $this->requireIblockId();
		if ($iblockId <= 0)
		{
			return [];
		}

		$limit = max(1, min(100, $limit));

		$filter = [
			'IBLOCK_ID' => $iblockId,
			'SECTION_ID' => $albumId,
			'INCLUDE_SUBSECTIONS' => 'Y',
			'ACTIVE' => 'Y',
			'CHECK_PERMISSIONS' => 'Y',
		];
		if ($cursor > 0)
		{
			$filter['<ID'] = $cursor;
		}

		$rows = [];
		$rs = CIBlockElement::GetList(
			['ID' => 'DESC'],
			$filter,
			false,
			['nTopCount' => $limit + 1],
			['ID', 'NAME', 'PREVIEW_TEXT', 'DETAIL_PICTURE']
		);
		while ($row = $rs->Fetch())
		{
			$rows[] = $row;
		}

		$hasMore = count($rows) > $limit;
		if ($hasMore)
		{
			array_pop($rows);
		}

		$items = PhotoFormatter::formatList($rows);

		// реакции фотографий (штатные рейтинги, сущность IBLOCK_ELEMENT)
		$ratings = Rating::formatBatch('IBLOCK_ELEMENT', array_column($items, 'id'));
		foreach ($items as &$item)
		{
			$item['rating'] = $ratings[$item['id']];
		}
		unset($item);

		return [
			'items' => $items,
			'cursor' => ($hasMore && $rows) ? (int)end($rows)['ID'] : null,
			'permissions' => Permission::getFlags($iblockId),
		];
	}

	/**
	 * FilePond process: создаёт элемент с DETAIL_PICTURE, возвращает фотографию.
	 *
	 * @return array фото для вставки в сетку
	 */
	public function uploadAction(int $albumId): array
	{
		$iblockId = $this->requireIblockId();
		if ($iblockId <= 0)
		{
			return [];
		}

		if (!Permission::has($iblockId, 'section_element_bind'))
		{
			$this->addError(new Error('Нет прав на добавление фотографий'));

			return [];
		}

		if (!CIBlockSection::GetList(
			[],
			['ID' => $albumId, 'IBLOCK_ID' => $iblockId, 'CHECK_PERMISSIONS' => 'N'],
			false,
			['ID']
		)->Fetch())
		{
			$this->addError(new Error('Альбом не найден'));

			return [];
		}

		$file = $this->validatedImage();
		if ($file === null)
		{
			return [];
		}
		$size = (int)$file['size'];
		$extension = mb_strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));

		// название — имя файла без расширения
		$name = trim(pathinfo($file['name'], PATHINFO_FILENAME));
		if ($name === '')
		{
			$name = 'Фотография';
		}

		$element = new CIBlockElement();
		$elementId = (int)$element->Add([
			'IBLOCK_ID' => $iblockId,
			'IBLOCK_SECTION_ID' => $albumId,
			'ACTIVE' => 'Y',
			'NAME' => $name,
			'DETAIL_PICTURE' => $file,
			'PREVIEW_TEXT' => '',
			'PREVIEW_TEXT_TYPE' => 'text',
		]);
		if ($elementId <= 0)
		{
			$this->addError(new Error($element->LAST_ERROR ?: 'Не удалось сохранить фотографию'));

			return [];
		}

		// перечитываем созданный элемент: нужен реальный DETAIL_PICTURE
		$row = CIBlockElement::GetList(
			[],
			['ID' => $elementId, 'IBLOCK_ID' => $iblockId, 'CHECK_PERMISSIONS' => 'N'],
			false,
			['nTopCount' => 1],
			['ID', 'NAME', 'PREVIEW_TEXT', 'DETAIL_PICTURE']
		)->Fetch();

		$photo = $row ? PhotoFormatter::formatElement($row) : null;
		if (!$photo)
		{
			$photo = [
				'id' => $elementId,
				'name' => $name,
				'description' => '',
				'thumbUrl' => '',
				'fullUrl' => '',
				'size' => $size,
				'ext' => $extension,
			];
		}
		$photo['id'] = $elementId;
		$photo['rating'] = [
			'count' => 0,
			'reactions' => [],
			'myReaction' => null,
			'key' => Rating::signKey('IBLOCK_ELEMENT', $elementId),
		];

		return $photo;
	}

	/**
	 * FilePond revert: файл убрали из пруда до/после загрузки — удаляем
	 * созданный элемент. Отдельно от delete, чтобы сохранить семантику пруда.
	 *
	 * @return array{id: int}
	 */
	public function revertAction(int $id): array
	{
		return $this->deleteElement($id, 'element_delete');
	}

	/**
	 * FilePond process в попапе редактирования: заменяет DETAIL_PICTURE
	 * существующей фотографии (название и подпись не трогает). Замена
	 * применяется сразу; revert у пруда здесь ничего не откатывает.
	 *
	 * @return array обновлённая фотография
	 */
	public function replaceAction(int $id): array
	{
		$iblockId = $this->requireIblockId();
		if ($iblockId <= 0)
		{
			return [];
		}

		if (!$this->ownElement($iblockId, $id))
		{
			$this->addError(new Error('Фотография не найдена'));

			return [];
		}
		if (!Permission::has($iblockId, 'element_edit'))
		{
			$this->addError(new Error('Нет прав на редактирование фотографий'));

			return [];
		}

		$file = $this->validatedImage();
		if ($file === null)
		{
			return [];
		}

		$element = new CIBlockElement();
		if (!$element->Update($id, ['DETAIL_PICTURE' => $file]))
		{
			$this->addError(new Error($element->LAST_ERROR ?: 'Не удалось заменить изображение'));

			return [];
		}

		$row = CIBlockElement::GetList(
			[],
			['ID' => $id, 'IBLOCK_ID' => $iblockId, 'CHECK_PERMISSIONS' => 'N'],
			false,
			['nTopCount' => 1],
			['ID', 'NAME', 'PREVIEW_TEXT', 'DETAIL_PICTURE']
		)->Fetch();
		$photo = PhotoFormatter::formatElement((array)$row);
		if (!$photo)
		{
			$this->addError(new Error('Не удалось перечитать фотографию'));

			return [];
		}

		// рейтинг не меняется — клиент обновит карточку целиком, отдаём текущий
		$rating = Rating::formatBatch('IBLOCK_ELEMENT', [$id])[$id] ?? null;
		if ($rating)
		{
			$photo['rating'] = $rating;
		}

		return $photo;
	}

	/**
	 * Multipart-файл 'file' (FilePond): получен, в пределах размера, расширение
	 * из белого списка и содержимое действительно изображение.
	 * Ошибки кладёт в ответ, возвращает null при провале.
	 *
	 * @return array|null элемент $_FILES
	 */
	private function validatedImage(): ?array
	{
		$file = $this->request->getFileList()->get(self::FILE_FIELD);
		if (
			!is_array($file)
			|| ($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK
			|| !is_uploaded_file($file['tmp_name'] ?? '')
		)
		{
			$this->addError(new Error('Файл не получен'));

			return null;
		}

		if ((int)$file['size'] <= 0 || (int)$file['size'] > self::MAX_SIZE)
		{
			$this->addError(new Error('Размер файла больше допустимого (50 МБ)'));

			return null;
		}

		$extension = mb_strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
		if ($extension === '' || !isset(PhotoFormatter::ALLOWED_TYPES[$extension]))
		{
			$this->addError(new Error('Разрешены только изображения: ' . implode(', ', array_keys(PhotoFormatter::ALLOWED_TYPES))));

			return null;
		}

		$imageInfo = @getimagesize($file['tmp_name']);
		if (
			!is_array($imageInfo)
			|| ($imageInfo[2] ?? 0) !== PhotoFormatter::ALLOWED_TYPES[$extension]
			|| (int)($imageInfo[0] ?? 0) <= 0
			|| (int)($imageInfo[1] ?? 0) <= 0
		)
		{
			$this->addError(new Error('Файл не является корректным изображением'));

			return null;
		}

		return $file;
	}

	/**
	 * Название и подпись фотографии.
	 *
	 * @return array{id: int, name: string, description: string}
	 */
	public function updateAction(int $id, string $name = '', string $description = ''): array
	{
		$iblockId = $this->requireIblockId();
		if ($iblockId <= 0)
		{
			return [];
		}

		if (!$this->ownElement($iblockId, $id))
		{
			$this->addError(new Error('Фотография не найдена'));

			return [];
		}
		if (!Permission::has($iblockId, 'element_edit'))
		{
			$this->addError(new Error('Нет прав на редактирование фотографий'));

			return [];
		}

		$name = trim($name);
		if ($name === '')
		{
			$this->addError(new Error('Укажите название фотографии'));

			return [];
		}

		$element = new CIBlockElement();
		$ok = $element->Update($id, [
			'NAME' => $name,
			'PREVIEW_TEXT' => $description,
			'PREVIEW_TEXT_TYPE' => 'text',
		]);
		if (!$ok)
		{
			$this->addError(new Error($element->LAST_ERROR));

			return [];
		}

		return ['id' => $id, 'name' => $name, 'description' => $description];
	}

	/**
	 * Удаление фотографии.
	 *
	 * @return array{id: int}
	 */
	public function deleteAction(int $id): array
	{
		return $this->deleteElement($id, 'element_delete');
	}

	private function deleteElement(int $id, string $operation): array
	{
		$iblockId = $this->requireIblockId();
		if ($iblockId <= 0)
		{
			return [];
		}

		if (!$this->ownElement($iblockId, $id))
		{
			$this->addError(new Error('Фотография не найдена'));

			return [];
		}
		if (!Permission::has($iblockId, $operation))
		{
			$this->addError(new Error('Нет прав на удаление фотографий'));

			return [];
		}

		if (!CIBlockElement::Delete($id))
		{
			$this->addError(new Error('Не удалось удалить фотографию'));

			return [];
		}

		return ['id' => $id];
	}

	/**
	 * Элемент принадлежит инфоблоку галереи?
	 */
	private function ownElement(int $iblockId, int $id): bool
	{
		return (bool)CIBlockElement::GetList(
			[],
			['ID' => $id, 'IBLOCK_ID' => $iblockId, 'CHECK_PERMISSIONS' => 'N'],
			false,
			['nTopCount' => 1],
			['ID']
		)->Fetch();
	}

	private function postFilters(): array
	{
		return [
			new ActionFilter\HttpMethod([ActionFilter\HttpMethod::METHOD_POST]),
			new ActionFilter\Csrf(),
		];
	}
}
