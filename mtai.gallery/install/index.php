<?php
/**
 * Installer of the module mtai.gallery.
 *
 * On install:
 *   1. infoblock type + infoblock «Галерея» with extended rights (RIGHTS_MODE=E);
 *   2. public page /gallery/ (Vue app on the built bundle);
 *   3. component mtai:gallery.app → local/components/mtai/;
 *   4. client bundle install/client/dist → /bitrix/js/mtai.gallery/dist.
 *
 * On uninstall all of the above are removed, including photos and albums.
 */

use Bitrix\Main\Application;
use Bitrix\Main\EventManager;
use Bitrix\Main\Localization\Loc;
use Bitrix\Main\ModuleManager;
use Mtai\Gallery\IblockManager;

// модуль ещё не зарегистрирован — автозагрузка lib/ недоступна
require_once __DIR__ . '/../lib/IblockManager.php';

Loc::loadMessages(__FILE__);

class mtai_gallery extends CModule
{
	public $MODULE_ID = 'mtai.gallery';
	public $MODULE_VERSION;
	public $MODULE_VERSION_DATE;
	public $MODULE_NAME;
	public $MODULE_DESCRIPTION;
	public $MODULE_GROUP_RIGHTS = 'N';

	public function __construct()
	{
		$arModuleVersion = [];
		include __DIR__ . '/version.php';

		$this->MODULE_VERSION = (string)($arModuleVersion['VERSION'] ?? '');
		$this->MODULE_VERSION_DATE = (string)($arModuleVersion['VERSION_DATE'] ?? '');

		$this->MODULE_NAME = Loc::getMessage('MTAI_GAL_MODULE_NAME');
		$this->MODULE_DESCRIPTION = Loc::getMessage('MTAI_GAL_MODULE_DESCRIPTION');
		$this->PARTNER_NAME = Loc::getMessage('MTAI_GAL_PARTNER_NAME');
		$this->PARTNER_URI = Loc::getMessage('MTAI_GAL_PARTNER_URI');
	}

	public function InstallDB(): bool
	{
		ModuleManager::registerModule($this->MODULE_ID);

		IblockManager::installInfoblock();

		return true;
	}

	public function UnInstallDB(): bool
	{
		IblockManager::uninstallInfoblock();

		ModuleManager::unRegisterModule($this->MODULE_ID);

		return true;
	}

	public function InstallEvents(): bool
	{
		return true;
	}

	public function UnInstallEvents(): bool
	{
		return true;
	}

	public function InstallFiles(): bool
	{
		global $APPLICATION;

		$documentRoot = Application::getDocumentRoot();

		// public page /gallery/
		CopyDirFiles(__DIR__ . '/public', $documentRoot, true, True);

		// component mtai:gallery.app → local/components/mtai/
		$componentsDir = $documentRoot . '/local/components';
		CheckDirPath($componentsDir . '/mtai/');
		CopyDirFiles(__DIR__ . '/components', $componentsDir, true, true);

		// built Vue app (npm run build in install/client) → /bitrix/js/mtai.gallery/dist
		if (is_dir(__DIR__ . '/client/dist'))
		{
			CheckDirPath($documentRoot . '/bitrix/js/' . $this->MODULE_ID . '/dist/');
			CopyDirFiles(
				__DIR__ . '/client/dist',
				$documentRoot . '/bitrix/js/' . $this->MODULE_ID . '/dist',
				true,
				true
			);
		}

		// group 2 = all users incl. guests; unauthorized visitors are redirected
		// to /auth/ by the page itself
		$APPLICATION->SetFileAccessPermission(IblockManager::PUBLIC_PATH, [2 => 'R']);

		return true;
	}

	public function UnInstallFiles(): bool
	{
		global $APPLICATION;

		DeleteDirFilesEx(IblockManager::PUBLIC_PATH);
		DeleteDirFilesEx('/local/components/mtai/gallery.app/');
		DeleteDirFilesEx('/bitrix/js/' . $this->MODULE_ID . '/dist/');

		$APPLICATION->SetFileAccessPermission(IblockManager::PUBLIC_PATH, []);

		return true;
	}

	public function DoInstall(): bool
	{
		global $APPLICATION;

		if (!\Bitrix\Main\Loader::includeModule('iblock'))
		{
			$APPLICATION->ThrowException(Loc::getMessage('MTAI_GAL_INSTALL_ERROR_IBLOCK'));

			return false;
		}

		$this->InstallDB();
		$this->InstallEvents();
		$this->InstallFiles();

		return true;
	}

	public function DoUninstall(): bool
	{
		$this->UnInstallFiles();
		$this->UnInstallEvents();
		$this->UnInstallDB();

		return true;
	}
}
