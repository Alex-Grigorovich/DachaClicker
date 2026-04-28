# Clicker Design Doc (актуально)

## 1) Краткий статус проекта

Проект — рабочий прототип кликера на Cocos Creator с базовой экономикой, квестами, разблокировками, сохранением прогресса и адаптацией UI под разные разрешения.

Базовый цикл:

1. Игрок кликает по культуре.
2. `VegClickMoney` начисляет валюту через `MoneyManager`.
3. `QuestManager` обновляет прогресс заданий.
4. Через `SlotMenuHandler` открывается `VegetableMenuHandler`.
5. Игрок сажает/разблокирует культуру.
6. `PlantFieldState` фиксирует посадку.
7. `ProgressManager` сохраняет изменения.

## 2) Что реализовано

### Экономика и клик

- `MoneyManager` — единый источник правды для баланса и `totalEarned`.
- `VegClickMoney`:
  - клик с защитой от `TOUCH_END + MOUSE_UP`;
  - локальный кулдаун;
  - анимация культуры и полет монеты в `Moneybar`;
  - обновление квестового прогресса через `QuestBridge`.

### Поле и посадки

- `SlotMenuHandler` открывает меню только для свободной ячейки.
- `PlantFieldState` хранит `cell -> culture`.
- Восстановление посадок: сначала по `uuid`, fallback по `name` (важно для Preview).

### Культуры и разблокировки

- Баланс культур читается из `assets/resources/balance/BALANCE_DATA.json`.
- Разблокировки культур вынесены в `UnlockManager`:
  - `VegetableMenuHandler` только отображает состояние и вызывает `unlockCulture`;
  - `QuestManager` метрику `unlocked_cultures_count` берет из этого же слоя;
  - `ProgressManager` сохраняет/восстанавливает `unlockedCultures`.
- Замки слотов остаются в `CellLockHandler` и квестовых наградах `unlock_slot`.

### Отказ при нехватке денег и клик по замку (UX)

- Общая утилита: `UiMoneyDenyFeedback.ts` — горизонтальная тряска (`shakeNodeHorizontal`), краткая красная подсветка `Sprite`/`Label` в поддереве (`flashSubtreeRed`), комбо `shakeAndFlashRed`, поиск нод по имени и подсветка списка имён (`flashNamedNodesRed`).
- **Меню культур** (`VegetableMenuHandler`): при попытке купить разблокировку без достаточной суммы или при неуспешном `subtractMoney` — **тряска + красная вспышка** на ноде блока (`cellListBlockCabbage`, `cellListBlockTomato`, `cellListBlockChiliPepper` и т.д. по балансу). Клик по строке завязан на hit-ноду (в т.ч. `cellList`), чтобы событие не терялось на дочерних спрайтах.
- **Замки ячеек** (`CellLockHandler`): при клике по активному замку — **тряска корня `lockNode`** и **красная вспышка** нод `Lock1` / `Lock2` / `Lock3` (если есть в иерархии; иначе — fallback на всё поддерево `lockNode`). События `TOUCH_END` / `MOUSE_UP` вешаются на `lockNode` и все потомки с `UITransform` (клик по дочерним спрайтам/лейблу). У квестовых замков с `lockWithoutPrice` — только визуальный отклик, покупка за деньги не выполняется.

### Квесты

- `QuestManager` загружает квесты из `BALANCE_DATA.json`.
- Поддержаны метрики:
  - `total_clicks`, `total_earned`, `current_money`,
  - `planted_slots_count`, `unlocked_cultures_count`,
  - `opened_slot_4`, `opened_slot_5`, `opened_slot_6`.
- Награды: `money`, `unlock_slot`.

### Сохранение прогресса

- `ProgressManager` — singleton-оркестратор сохранения/восстановления.
- Хранилище: `sys.localStorage`, ключ `farm_clicker_progress_v1`.
- Формат сейва: `PROGRESS_SAVE_VERSION = 2`.
- Сохраняются:
  - деньги (`balance`, `totalEarned`);
  - квесты (`activeIndex`, `totalClicks`);
  - посадки (`fieldCells`);
  - разблокированные культуры (`unlockedCultures`);
  - замки (`cellLocks`);
  - уровни апгрейдов (`upgrades`).
- Миграции:
  - есть цепочка `MIGRATIONS`;
  - реализован шаг `v1 -> v2` (поле `upgrades`).
- Для тестов:
  - `ProgressManager.disableSaving`;
  - `ResolutionAdapter.disableProgressSaving`;
  - при отключении сохранения UI не читает `localStorage` (`ProgressBridge.isProgressPersistenceDisabled`).

### Апгрейды

- Данные апгрейдов уже есть в `BALANCE_DATA.json`.
- `UpgradeProgressStore` хранит уровни и интегрирован в сейв.
- `UpgradeManager` внедрён как доменный слой:
  - загрузка и валидация апгрейдов из баланса;
  - покупка уровней через `purchase(id)` с проверкой unlock/cost/maxLevel;
  - применение эффектов к клику (`add_click_income_flat`, `add_crop_click_income_flat`, `global_click_bonus_percent`, `double_click_chance_percent`);
  - модификация кулдауна (`cooldown_multiplier`, `extra_cooldown_multiplier`);
  - бонус к денежным наградам квестов (`quest_money_bonus_percent`);
  - скидка на открытие культур (`culture_unlock_discount_percent`).
- Остаётся UI-привязка `UpgradeList` к конкретным `upgradeId` (кнопки/лейблы уровней и цен).

### UI/сервис

- `ResolutionAdapter` масштабирует `GameField`, боковые панели, `VegetableList`, `UpgradeList`.
- `FontLoader` переведен на мягкую загрузку:
  - путь `fontResourcePath` (по умолчанию `resources/fonts/Caveat`);
  - при ошибке — `console.warn` (без жесткого `console.error`).

## 3) Текущие ограничения и договоренности

### Preview-шум

- `You are trying to destroy a object twice or more` — существенно снижен:
  - защита по `isValid` в `VegClickMoney`;
  - отказ от автоматического `addComponent('ProgressManager')` в `AdaptiveScale`.
- `IPC message has been lost` — ограничение Preview/Electron; на билд напрямую не переносится.

### Идентификаторы ячеек

- В Preview `uuid` может быть нестабильным, поэтому есть fallback по `name`.
- Для production желательно ввести устойчивый явный slot-id.

### Поиск по строковым именам

- Для scene/UI стоит продолжать выносить ссылки в `@property`.
- Исключение: логика, завязанная на контракт префаба культуры (`VegClickMoney`, поиск `VegClick`, `IconCoin` и т.п.), может оставаться на стабильных именах внутри префаба.

## 4) Приоритеты на следующий этап

### Высокий

1. **Частично сделано:** внедрён `UpgradeManager`:
   - чтение `upgrades` из `BALANCE_DATA` — готово;
   - покупка уровней через API `UpgradeManager.purchase(id)` — готово;
   - применение эффектов к клику/кулдауну/наградам — подключено (`VegClickMoney`, `QuestManager`, скидка на unlock в `VegetableMenuHandler`);
   - persistence — используется существующий (`UpgradeProgressStore` + `ProgressManager`);
   - осталось: финальная UI-привязка кнопок `UpgradeList` к конкретным `upgradeId`.
2. **Частично сделано:** единый UX отказа при нехватке денег / клик по замку:
   - визуальный фидбек (shake + красная подсветка) для блоков культур и замков — через `UiMoneyDenyFeedback` + `VegetableMenuHandler` / `CellLockHandler` (см. §2);
   - осталось по желанию: звук ошибки; вынести в отдельный компонент-обёртку, если понадобится настройка из редактора без кода.

### Средний

1. **Частично сделано:** уменьшен string-based поиск по сцене:
   - `VegClickMoney` теперь поддерживает явные ссылки `canvasRoot` и `moneybarRoot` через `@property`;
   - оставшийся поиск по именам оставлен только как fallback и для prefab-контрактов.
2. **Сделано:** подготовлена стратегия миграций сейва `v3+`:
   - в `ProgressSave.ts` добавлен `PROGRESS_SAVE_MIGRATION_PLAN`;
   - добавлена runtime-проверка полноты цепочки `MIGRATIONS` с предупреждением в лог, если шагов не хватает.
3. При необходимости расширить `UnlockManager` на другие типы разблокировок.

### Низкий

1. Пассивный доход/автосбор.
2. Комбо/синергии культур.
3. Расширение контента (новые культуры, слоты, VFX).

## 5) Целевая архитектура (коротко)

### Ядро

- `MoneyManager` — деньги и `totalEarned`.
- `ProgressManager` — save/load и жизненный цикл восстановления.
- `UnlockManager` — доменный статус разблокировок культур (дальше расширяем).
- `PlantFieldState` — состояние посадок.
- `UpgradeManager` — уровни апгрейдов и применение эффектов; UI-покупки в `UpgradeList` ещё нужно довязать.

### Игровые компоненты

- `VegClickMoney`, `SlotMenuHandler`, `VegetableMenuHandler`, `CellLockHandler`, `QuestManager`.
- `UiMoneyDenyFeedback` — чистые функции тряски/красной вспышки для отказов по деньгам и замкам (без компонента на сцене).

### Данные

- `BALANCE_DATA.json` — культуры, квесты, слот-прогрессия, апгрейды.
- `ProgressSave.ts` — версия формата, миграции и типы сейва.

## 6) Итог

Фундамент прототипа стабилен: деньги, посадки, квесты, разблокировки и апгрейд-прогресс (как данные) переживают перезапуск сцены через persist-сейв.

Главный продуктовый шаг — довязать UI `UpgradeList` к `UpgradeManager` (покупки/лейблы/состояния). Визуальный отказ при нехватке денег для меню культур и замков уже задан общей утилитой и двумя обработчиками; при появлении новых денежных действий — переиспользовать `UiMoneyDenyFeedback` или расширить его.
