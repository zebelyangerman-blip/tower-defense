# Tower Defense: Reforged — R51 / 1.3.1

**Финальная контрольная сборка от 10.10.2026.** Базируется на R50 / 1.3.0.

## Изменения по сравнению с R50

- Исправлена устаревшая метка сборки `window.TD_RELEASE.version`: вместо `REFORGED-R49-1.2.0` теперь `REFORGED-R51-1.3.1`.
- У ссылки на `game.js` в `index.html` обновлён параметр версии (`r51.2`), чтобы веб-браузер не использовал закэшированный старый сценарий.
- Убрана устаревшая видимая подпись «R49» из исторического окна уведомления: теперь оно показывает нейтральное название игры. Ключ ранее просмотренного уведомления НЕ меняется, повторного показа не создаём.
- Другие игровые JavaScript, CSS, WebP и MP3 **не изменялись**. Боевой баланс, оформление, дороги, точки башен, управление, SDK и схема сохранений (9) остаются как в R50. Все функции подтверждения мобильного строительства без затемнения сохранены.

## Установка

1. Сохраните предыдущую R50 как резервную копию.
2. Загрузите **всё содержимое** архива R51 в корень репозитория игры, сохраняя папки `images/`, `audio/`, `vendor/`. Файл `index.html` должен находиться в корне сайта.
3. Выполните проверку игры на реальном целевом сайте и на своих Android/iOS с учётом мобильной ориентации, облачных сохранений и платформенной рекламы. При неудаче верните целиком предыдущий комплект R50, а не отдельные файлы.

## Независимая контрольная проверка

R51 повторно протестирована на основе оригинального релизного ZIP R50: технические прохождения 60 уровней × 13 разрешений, последовательная кампания на ПК и телефоне, 20 разрешений интерфейса, логика строительства/улучшений, досрочные волны, 12 боссов, ресурсы и геометрия арен. Сценарии с тестовым бессмертием и уроном подтверждают только техническую проходимость, а не честный баланс. Дополнительные фиксированные боты с обычным HP/уроном проходят 58/60 уровней с ожиданием и 48/60 с мгновенной волной; это не означает непроходимости проигранных уровней. Тесты сохранений и рекламы проведены с эмуляцией платформы, не с реальным VK/OK или настоящим облаком. Подробности в отдельном R51 QA-отчёте.

## Что сохранено из R50

1. **Mobile build confirmation.** Select a tower and tap a highlighted build pad to see a ghost tower and radius. A small fixed row below the battlefield (portrait) or to its right (landscape) offers **Build / Cancel**. The battle is not darkened and no central modal blocks play. No gold is taken until confirmation. On confirmation gold, availability, build pad, tower selection and cap are rechecked. Double taps cannot grant duplicate towers. Switching pad, canceling, Escape, pausing, leaving the level or changing tower selection clears the preview. Desktop mouse building remains one-click.
2. **Desktop canvas stability.** Reserving a fixed preparation/boss HUD area and floating the upgrade inspector prevents arena resizing across prep, wave and tower upgrade in tested desktop viewports. Combat/Canvas coordinate system is unchanged.
3. **Six new B world variants.** Each of the first six worlds has its own map B WebP art (autumn, moonlit ice, ember, spectral marsh, volcanic dusk, twilight siege). They reuse the *verified existing road geometry*, so this adds weather, color and scenery variation **without** replacing road topology or moving build pads. All 24 arenas still have separate geometry declarations, and worlds 4/10 retain two routes. The R49 A art is untouched.
4. **Levels 55/59.** Evaluated several tactics with legitimate attainable castle upgrades. Both levels were won without assistance by multiple tactical bots (artillery, sniper, laser, Tesla), so no global/unsupported nerfs were made to enemy/tower values or to the established 60-level balance. Some less effective fixed strategies still lose, as expected for late game.
