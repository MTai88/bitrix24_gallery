<?php

/**
 * Конфигурация ajax-контроллеров модуля.
 *
 * Контроллеры лежат в lib/controller/ и доступны как
 *   /bitrix/services/main/ajax.php?action=mtai:gallery.<controller>.<action>
 * например:
 *   mtai:gallery.album.list
 *   mtai:gallery.photo.upload
 *
 * Резолвер собирает имя класса из defaultNamespace + имени контроллера
 * (в нижнем регистре): album => \Mtai\Gallery\Controller\Album (lib/controller/album.php).
 */

return [
	'controllers' => [
		'value' => [
			'defaultNamespace' => '\\Mtai\\Gallery\\Controller',
		],
		'readonly' => true,
	],
];
