<?php

if (!defined('B_PROLOG_INCLUDED') || B_PROLOG_INCLUDED !== true)
{
	die();
}

/**
 * @var array $arResult
 * @var CBitrixComponentTemplate $this
 */

// конфиг для Vue-приложения. НЕТ одинарных кавычек: шаблонизатор/компрессор
// Bitrix переписывает их в двойные и ломает JSON. Двойные кавычки атрибута +
// htmlspecialchars: браузер декодирует &quot; обратно, JSON.parse получает
// исходную строку
$configJson = json_encode(
	$arResult['CONFIG'],
	JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP
);
?>
<div id="mtai-gallery-app" class="mtai-gallery" data-config="<?= htmlspecialcharsbx($configJson) ?>"></div>

<?php if ($arResult['JS_URL'] !== ''): ?>
	<?php foreach ($arResult['CSS'] as $cssUrl): ?>
		<link rel="stylesheet" href="<?= htmlspecialcharsbx($cssUrl) ?>">
	<?php endforeach; ?>

	<?php if ($arResult['VENDOR_URL'] !== ''): ?>
		<link rel="modulepreload" href="<?= htmlspecialcharsbx($arResult['VENDOR_URL']) ?>">
	<?php endif; ?>

	<?php // бандл — ESM: подключать можно только type=module, не addJs() ?>
	<script type="module" src="<?= htmlspecialcharsbx($arResult['JS_URL']) ?>"></script>
<?php else: ?>
	<div style="padding: 16px; color: #f00;">
		Сборка галереи не найдена (bitrix/js/mtai.gallery/dist). Выполните
		<code>npm ci &amp;&amp; npm run build</code> в install/client модуля
		и переустановите модуль.
	</div>
<?php endif; ?>
