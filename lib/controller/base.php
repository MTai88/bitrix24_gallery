<?php

namespace Mtai\Gallery\Controller;

use Bitrix\Main\Engine\Controller;
use Bitrix\Main\Engine\CurrentUser;
use Bitrix\Main\Error;
use Bitrix\Main\Loader;
use Mtai\Gallery\IblockManager;

/**
 * Общее для контроллеров галереи: авторизация, подключение модулей,
 * поиск инфоблока галереи.
 */
abstract class Base extends Controller
{
	/** ID инфоблока галереи; 0 (с ошибкой в ответе), если не найден. */
	protected function requireIblockId(): int
	{
		if (!Loader::includeModule('iblock'))
		{
			$this->addError(new Error('Модуль iblock не установлен'));

			return 0;
		}

		$user = CurrentUser::get();
		if ((int)$user->getId() <= 0)
		{
			$this->addError(new Error('Требуется авторизация'));

			return 0;
		}

		$iblockId = IblockManager::getGalleryIblockId();
		if ($iblockId <= 0)
		{
			$this->addError(new Error('Инфоблок галереи не найден'));

			return 0;
		}

		return $iblockId;
	}
}
