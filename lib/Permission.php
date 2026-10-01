<?php

namespace Mtai\Gallery;

use CIBlockRights;

/**
 * Права на галерею в терминах операций инфоблока.
 *
 * CIBlock::GetPermission() читает только таблицу простых прав (b_iblock_group)
 * и в расширенном режиме (RIGHTS_MODE=E) возвращает мусор. Правильный API —
 * CIBlockRights::UserHasRightTo() / ::RETURN_OPERATIONS: он разбирает
 * b_iblock_right по задачам и работает в обоих режимах.
 *
 * Соответствие операций буквам задач (b_task, модуль iblock):
 *   R  iblock_read         — element_read, section_read
 *   E  iblock_element_add  — section_element_bind (добавление элементов)
 *   U  iblock_limited_edit — element_edit/delete + section_element_bind
 *   W  iblock_full_edit    — element_* + section_edit/delete/bind
 *   X  iblock_full         — всё
 */
class Permission
{
	/** Массив операций текущего пользователя на инфоблоке галереи. */
	private static array $operations = [];

	private static function operations(int $iblockId): array
	{
		$key = (string)$iblockId;
		if (!isset(self::$operations[$key]))
		{
			self::$operations[$key] = CIBlockRights::UserHasRightTo(
				$iblockId,
				$iblockId,
				'element_read',
				CIBlockRights::RETURN_OPERATIONS
			) ?: [];
		}

		return self::$operations[$key];
	}

	/** Может читать галерею (operation element_read). */
	public static function canRead(int $iblockId): bool
	{
		return isset(self::operations($iblockId)['element_read']);
	}

	/**
	 * Гранулярные права для интерфейса: что показывать из редактирования.
	 * Одна операция на действие контроллера — сервер проверяет каждое
	 * действие отдельно, это только флаги для UI.
	 *
	 * @return array{read: bool, upload: bool, editPhoto: bool, deletePhoto: bool, addAlbum: bool, editAlbum: bool, deleteAlbum: bool}
	 */
	public static function getFlags(int $iblockId): array
	{
		$ops = self::operations($iblockId);

		return [
			'read' => isset($ops['element_read']),
			'upload' => isset($ops['section_element_bind']),
			'editPhoto' => isset($ops['element_edit']),
			'deletePhoto' => isset($ops['element_delete']),
			'addAlbum' => isset($ops['section_section_bind']),
			'editAlbum' => isset($ops['section_edit']),
			'deleteAlbum' => isset($ops['section_delete']),
		];
	}

	/** Проверка одной операции (используют контроллеры). */
	public static function has(int $iblockId, string $operation): bool
	{
		return isset(self::operations($iblockId)[$operation]);
	}
}
