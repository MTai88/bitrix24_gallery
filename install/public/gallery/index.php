<?php
/**
 * Публичная страница «Галерея»: /gallery/
 * Фотогалерея для авторизованных сотрудников; гости перенаправляются на
 * страницу входа. Создаётся установщиком модуля mtai.gallery
 * (install/public → корень сайта).
 */

require($_SERVER['DOCUMENT_ROOT'] . '/bitrix/header.php');

global $APPLICATION, $USER;

if (!$USER->IsAuthorized())
{
	LocalRedirect('/auth/?backurl=' . urlencode($APPLICATION->GetCurPageParam('', ['backurl'])));
}

$APPLICATION->SetTitle('Галерея');
$APPLICATION->IncludeComponent(
	'mtai:gallery.app',
	'',
	[],
	false
);

require($_SERVER['DOCUMENT_ROOT'] . '/bitrix/footer.php');
