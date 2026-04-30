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

- `SlotMenuHandler` открывает `VegetableList` по клику на слоты поля (в т.ч. занятые), обновляя `targetCell`.
- `PlantFieldState` хранит `cell -> culture`.
- Восстановление посадок: приоритет `slotId`, затем fallback по `uuid` и `name` (важно для Preview).

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
- Формат сейва: `PROGRESS_SAVE_VERSION = 3`.
- Сохраняются:
  - деньги (`balance`, `totalEarned`);
  - квесты (`activeIndex`, `totalClicks`);
  - посадки (`fieldCells`);
  - разблокированные культуры (`unlockedCultures`);
  - замки (`cellLocks`);
  - уровни апгрейдов (`upgrades`).
- Миграции:
  - есть цепочка `MIGRATIONS`;
  - реализованы шаги `v1 -> v2` (поле `upgrades`) и `v2 -> v3` (`fieldCells[].slotId`, `cellLocks[].slotId`).
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
- `UpgradeListPanel` довязан к `UpgradeManager`:
  - строки `ColList` сопоставляются с `upgradeId` через встроенный mapping + `rowBindings`;
  - покупка по клику с защитой от дублей и единым deny-feedback (`shakeAndFlashRed`);
  - обновление уровней/цен в строках (`LevelText`, `CostText`) и внешних cost-лейблах;
  - после покупки принудительно обновляются активные `VegClickMoney` для корректных UI-значений.
- `UpgradeListToggle` управляет открытием/закрытием панели с анимацией и интеграцией в `ResolutionAdapter.fitUpgradeList`.

### UI/сервис

- `ResolutionAdapter` масштабирует `GameField`, боковые панели, `VegetableList`, `VegetableListUnlocked`, `UpgradeList`.
- `ExclusiveUIPanels` обеспечивает взаимоисключение основных окон (`VegetableList`, `VegetableListUnlocked`, `UpgradeList`, `Tasks`): при открытии одного остальные закрываются автоматически.
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

- Введен стабильный `slotId` в сейве (`fieldCells`, `cellLocks`) и в runtime-сопоставлении.
- Для совместимости со старыми/нестабильными данными в Preview сохранены fallback'и по `uuid` и `name`.

### Поиск по строковым именам

- Для scene/UI стоит продолжать выносить ссылки в `@property`.
- Исключение: логика, завязанная на контракт префаба культуры (`VegClickMoney`, поиск `VegClick`, `IconCoin` и т.п.), может оставаться на стабильных именах внутри префаба.

## 4) Приоритеты на следующий этап

### Высокий

1. **Сделано:** апгрейды доведены до игрового UI:
   - покупка и валидация через `UpgradeManager`;
   - UI-интеграция через `UpgradeListPanel`/`UpgradeListToggle`;
   - эффекты уже работают в клике/кулдауне/квест-наградах/скидке на unlock;
   - уровни апгрейдов сохраняются и восстанавливаются через текущий save-flow.
2. **Сделано:** введены стабильные `slotId` и миграция `v2 -> v3` сейва:
   - `ProgressSave`: версия поднята до `v3`, добавлен шаг миграции `2 -> 3` для `fieldCells[].slotId` и `cellLocks[].slotId`;
   - `ProgressManager`/`VegetableMenuHandler`: сохранение и восстановление теперь в первую очередь работают по `slotId` (с fallback на `uuid`/`name`).
3. **Следующий шаг:** закрыть UX-ветку денежных отказов:
   - добавить опциональный аудио-фидбек к `UiMoneyDenyFeedback`;
   - при необходимости вынести настройки deny-feedback в editor-friendly компонент.

### Средний

1. **Сделано:** уменьшен string-based поиск по сцене:
   - `VegClickMoney` уже использует явные ссылки `canvasRoot` и `moneybarRoot`;
   - в `VegetableMenuHandler` добавлены `@property` для критичных узлов (`rowsRoot`, `cultureRows`, `cultureBlocks`, `unlockMenuNode`) с fallback на поиск по имени;
   - в `UpgradeListToggle` добавлены `@property` (`searchRoot`, `adaptiveScale`) с fallback на поиск по сцене;
   - изменения сделаны без правки префабов (runtime-only).
2. **Сделано:** подготовлена стратегия миграций сейва `v3+`:
   - в `ProgressSave.ts` добавлен `PROGRESS_SAVE_MIGRATION_PLAN`;
   - добавлена runtime-проверка полноты цепочки `MIGRATIONS` с предупреждением в лог, если шагов не хватает.
3. **Сделано:** формализован smoke/regression-проход (минимальный чеклист):
   - **Шаг 1 (чистый старт):** удалить localStorage-ключ `farm_clicker_progress_v1`, запустить сцену; ожидаемо: баланс 0, только базовая культура, стартовые слоты/замки в дефолте.
   - **Шаг 2 (базовый прогресс):** заработать деньги, посадить культуры в несколько слотов, открыть 1-2 культуры через `VegetableListUnlocked`; ожидаемо: UI и квест-метрики обновляются без ошибок.
   - **Шаг 3 (апгрейды):** купить несколько апгрейдов в `UpgradeList`; ожидаемо: уровни/цены обновились, эффекты применяются к клику/кулдауну/стоимости unlock.
   - **Шаг 4 (перезагрузка):** reload сцены/перезапуск Preview; ожидаемо: корректно восстановлены `money`, `upgrades`, `unlockedCultures`, `fieldCells`, `cellLocks`.
   - **Шаг 5 (v2->v3 совместимость):** загрузить старый сейв без `slotId`; ожидаемо: миграция в `v3` проходит автоматически, посадки и замки матчатся по `slotId`/fallback без потерь.
4. При необходимости расширить `UnlockManager` на другие типы разблокировок.

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
- `UpgradeManager` — уровни апгрейдов и применение эффектов; UI-покупки и отображение статусов обслуживаются через `UpgradeListPanel`.

### Игровые компоненты

- `VegClickMoney`, `SlotMenuHandler`, `VegetableMenuHandler`, `CellLockHandler`, `QuestManager`.
- `UiMoneyDenyFeedback` — чистые функции тряски/красной вспышки для отказов по деньгам и замкам (без компонента на сцене).

### Данные

- `BALANCE_DATA.json` — культуры, квесты, слот-прогрессия, апгрейды.
- `ProgressSave.ts` — версия формата, миграции и типы сейва.

## 6) Итог

Фундамент прототипа стабилен: деньги, посадки, квесты, разблокировки и апгрейды (включая UI-покупки/уровни) переживают перезапуск сцены через persist-сейв.

Критичный шаг со стабильными `slotId` уже закрыт (миграция `v2 -> v3` в проде), а UI-панели переведены на взаимоисключающее открытие. Следующие продуктовые шаги — UX-полировка денежных отказов (звук/настройки из редактора) и дальнейшее планомерное сокращение string-based зависимостей там, где это безопасно для сцены/префабов.
