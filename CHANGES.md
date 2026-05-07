# 📋 План для Cursor AI — Подготовка к релизу на Яндекс Игры

> Адаптировано под реальную структуру проекта: Cocos Creator `3.8.8`, TypeScript, design resolution `1280x720`, `fitHeight=true`.
> Сцена: `assets/Scenes/scene.scene`. Скрипты: `assets/Scripts/*.ts`. Баланс: `assets/resources/balance/BALANCE_DATA.json`. Шрифт: `assets/resources/fonts/Caveat.ttf`.

## 🟢 Что уже сделано в проекте (не трогать)

- Сохранение прогресса: `assets/Scripts/ProgressManager.ts` + `assets/Scripts/ProgressSave.ts`. Ключ `farm_clicker_progress_v1`, версия `4`, миграции, debounce-автосейв + periodic autosave.
- Оффлайн доход: `assets/Scripts/PassiveIncomeManager.ts` → `applyOfflineCatchUp()`.
- Адаптация UI (текущий стек): **`assets/Scripts/ResponsiveSides.ts`** — боковые колонки, поле, кнопки `ButtonsVegetables` / `ButtonsUpgrade`, подстройка ширины поля по режимам; опционально **`assets/Scripts/SideButtonsResponsive.ts`** (упрощённый вариант по `canvas-resize`). Старые **`ResolutionAdapter` / `ResponsiveLayout` / `UIAdapter` удалены** из проекта.
- **Меню на узком портрете:** авто‑подгонка ширины панелей **`VegetableList`**, **`VegetableListUnlocked`**, **`UpgradeList`** — рассчитываемый scale от `view.getVisibleSize()` (`fitPanelToScreenWidth` в `SlotMenuHandler`, `VegetableUnlockListToggle`, `UpgradeListToggle`), до **90%** ширины экрана.
- **Открытие списков по клику:** `VegetableUnlockListToggle` и `UpgradeListToggle` дополнительно поднимаются на активную ноду через **`FontLoader.ensurePanelToggles()`** (старые экземпляры на неактивных панелях отключаются), иначе клики по `ButtonsVegetables` / `ButtonsUpgrade` могли не подписываться.
- Подписи у **трёх активных** кнопок: `assets/Scripts/ButtonCaptions.ts` (+ мета ассета), общая загрузка TTF **`loadSharedTtf`** и **`loadTtfFontForLabel`** в **`assets/Scripts/FontLoader.ts`**, автоподключение **`ensureButtonCaptions()`** из **`FontLoader.onLoad()`** на `Canvas/UI/Container`; отдельно **`fontSizeVegetables`** (по умолчанию **20**) для `CaptionVegetables`.
- **Мобильный bootstrap** (через **`FontLoader.ensureRuntimeMobileAdapters()`** на `Canvas/UI`): **`SafeAreaLayout.ts`**, **`PerformanceManager.ts`**, **`MobileInputGuard.ts`**, **`MobileTouchTargets.ts`** (+ **`UiPress`** на кнопках колонок).
- **FX / анимации клика и урожая:** **`FloatingText.ts`**, **`FxPool.ts`** (пул «искр» на лейблах, лимит с учётом `farm_clicker_quality_v1`), ripple в **`SlotMenuHandler.playClickRipple`**, press feedback в **`UiPress`**, плавающий `+N` и рост культуры / покачивание моркови в **`VegClickMoney`**; count-up баланса в **`MoneyManager`**, tween прогресса уровня в **`LevelProgressController`**, пульсация доступных строк в **`UpgradeListPanel`**.
- Tween-анимации и полёт монеты к moneybar: `assets/Scripts/VegClickMoney.ts`.
- Эксклюзивность модалок: `assets/Scripts/ExclusiveUIPanels.ts` + `*Toggle.ts`.
- Доменные менеджеры: `MoneyManager`, `UpgradeManager`, `QuestManager`, `UnlockManager`, `LevelProgressController`, `PlantFieldState`.
- **Туториал:** `TutorialManager`, `TutorialBridge`, ключ `farm_clicker_tutorial_v1`; нода **`finger`**, события посадки/сбора моркови из `VegetableMenuHandler` / `VegClickMoney`; автодобавление компонента на `Canvas/UI` через **`FontLoader.ensureTutorialManager()`**.
- **Верхний HUD (`Moneybar`):** усилены лейблы монеты, пассива и уровня (outline/shadow, размеры 36 / 15 / 32); фон суммы затемнён и переведён на **sliced** `BackgroundDialogue` (cap inset **40** в `.meta`, при необходимости поправить в редакторе); прогресс-бар выше и с филлом **#FFD93D**; нода **`IconLevelStar`** (24×24); **`XpHint`** — текст **`xp.hint`** через **`LocalizationManager.t`** в **`LevelProgressController`** (fallback, если ключ не найден). Отдельного `fitMoneybar()` пока нет.
- **Яндекс Игры (код):** **`YandexSDKManager.ts`** (`YaGames.init`, player, fullscreen/rewarded, лидерборды, `player.setStats` для достижений), **`AchievementsManager.ts`**, **`LeaderboardPanel.ts`**; облако — **`ProgressSave.cloudRead` / `cloudWrite`** и **`ProgressManager`** (при старте приоритет облака по `savedAt`, debounced cloud write после локального сейва); **`LevelProgressController`** — отправка счёта в лидерборд **`total_earned`**, fullscreen при level-up с кулдауном; **`MoneyManager`** — баф «двойной урожай» после rewarded; привязка rewarded к **`ButtonX2`**, **`ButtonsShop-002`**.
- **Шаблон `web-mobile`:** **`build-templates/web-mobile/index.html`** (скрипт SDK v2, `viewport-fit=cover`, Open Graph, title **«Дача кликер — …»**), **`manifest.json`** (`"name": "Дача кликер"`), иконки **`build-templates/web-mobile/icons/`** (`icon-512.png`, `favicon-32.png`, `apple-touch-icon-180.png`).
- **Локализация:** **`LocalizationManager.ts`**, **`assets/resources/locales/ru.json`**, **`en.json`**; кнопки — **`ButtonCaptions`** (`captionKey` + fallback), апгрейды — **`UpgradeListPanel`**, XP-подсказка — **`LevelProgressController`**; квесты — поля **`titleKey`** / **`descKey`** в **`QUESTS_DRAFT.json`** / **`BALANCE_DATA.json`**, вывод в **`QuestManager`**.
- **Отладка и аналитика:** **`Debug.ts`** — **`dlog` / `dinfo`** (только при **`DEBUG`** из `cc/env`), **`installGlobalErrorHandlers()`** (ошибки и `unhandledrejection` в **debug**-сборке на вебе); **`DebugPanel.ts`** (FPS, видимый размер, активные FX из **`FxPool.getActiveCount()`**, кнопки +1000 и «открыть всё»); **`AnalyticsManager.ts`** — события `game_started`, `tutorial_completed`, `first_upgrade_purchased`, `session_ended` + **`GameplayAPI`** при готовом SDK. Подключение: **`FontLoader.onLoad`** — `installGlobalErrorHandlers`, `LocalizationManager.init`, **`ensureRuntimeMobileAdapters()`** добавляет **`YandexSDKManager`**, **`AchievementsManager`**, **`AnalyticsManager`**, **`DebugPanel`** на **`Canvas/UI`**.

---

## 🎯 Этап 1: Критические исправления UI/UX (Высокий приоритет)

### Сводка статусов (актуально по коду в репозитории)

| Код | Задача | Статус |
|:---:|:---|:---|
| **1.1** | Подписи у 3 активных боковых кнопок (`ButtonCaptions`, `FontLoader`) | **Готово** |
| **1.1b** | Горизонтальный зазор `GameField` ↔ боковые колонки, боковые отступы | **Готово** (через `ResponsiveSides` / `SideButtonsResponsive`; старый `minGapBetween` из `AdaptiveScale` **снят**) |
| **1.1c** | Ширина `VegetableList` / `VegetableListUnlocked` / `UpgradeList` на узком портрете | **Готово** (`fitPanelToScreenWidth` в соответствующих скриптах) |
| **1.2** | HUD: outline/shadow, `IconLevelStar`, `XpHint`, стиль прогресс-бара | **Готово** (без отдельного `fitMoneybar()` — при тестах на узких экранах при необходимости добавить) |
| **1.3** | Туториал (`TutorialManager`, `finger`, `ExclusiveUIPanels`) | **Готово** (без полноэкранной `#000000AA` — перекрывала бы поле; `replay()` для кнопки «Помощь») |
| **1.4** | `FloatingText`, ripple, `FxPool`, `UiPress`, анимации в скриптах | **Готово** (искры через `FxPool` на лейблах, не `ParticleSystem2D`; цвета критов/отказа для `FloatingText` — при появлении логики критов/денай) |
| **1.5** | Safe area, `PerformanceManager`, `MobileInputGuard`, хитбоксы 44px | **Готово (код)**; **осталось вручную:** Auto Atlas UI в редакторе (см. план 1.5) и финальный прогон на устройствах с вырезом |
| **2.1** | Yandex SDK, cloud save, реклама, лидерборды | **Готово (код)**; в кабинете Яндекс Игр — завести лидерборд **`total_earned`**, достижения (**`posad_10_carrots`**, **`earn_100_money`**, **`unlock_all_cultures`**) и проверить на прод-домене |
| **2.2** | `build-templates/web-mobile`, манифест, иконки, `Debug.ts` / `dlog` вместо `console.log` | **Готово**; настройки билда Cocos (**MD5**, **Source Maps**, атласы) — по желанию перед релизом |
| **3.1** | `LocalizationManager`, `locales/*.json` | **Готово** |
| **3.2** | `DebugPanel`, `AnalyticsManager`, глобальные error hooks | **Готово** |

*Критерий: наличие ожидаемых файлов и логики в `assets/Scripts`, `assets/resources/locales`, `build-templates/web-mobile/`; сцена может потребовать ручной привязки `LeaderboardPanel` / полей `DebugPanel`.*

---

### **Задача 1.1: Подписи к кнопкам — готово**

Кнопки слева и справа от поля грядок — навигация сцены (не апгрейды из `UpgradeList`). Группы: `ButtonsLeft` (5 кнопок), `ButtonsRight` (3 кнопки).

**Реализовано:**

- Компонент **`ButtonCaptions`** (`assets/Scripts/ButtonCaptions.ts`): только **3 активные** ноды `ButtonTasks`, `ButtonsVegetables`, `ButtonsUpgrade`; поиск через `findDeep`; шрифт `fonts/Caveat` одной загрузкой **`loadSharedTtf`** из **`FontLoader.ts`**.
- Стилизация: белый текст, чёрный outline (2 px), свойство **`fontSize`** (дефолт **30**); для **`CaptionVegetables`** — **`fontSizeVegetables`** (дефолт **20**, `0` = как `fontSize`); **`offsetBelow`** — расстояние от **нижнего края видимого квадрата** до текста, настраивается в инспекторе у `ButtonCaptions` на `Container`.
- Позиция по **X/Y**: нижний центр **мирового** `UITransform.getBoundingBoxToWorld()` визуального дочернего узла (`IconButtonGreen`, `ButtonSmallWhite`, …), затем `convertToNodeSpaceAR` в систему родителя-кнопки — чтобы масштаб колонки и раздутый корневой `UITransform` не разносили текст. Повторная укладка через **~0,12 с** после старта (таймер в `ButtonCaptions`).
- Дочерние узлы подписей: имя **`Caption`**, или существующие **`CaptionTask`** / **`CaptionVegetables`** (если они дочерние у соответствующей кнопки). Если в сцене остался **лишний** `CaptionVegetables` не под `ButtonsVegetables` — лучше удалить/скрыть, чтобы не было дубликата строки.

**Логика текстов:**

- В **`DEFAULT_BUTTON_CAPTIONS`** — **`captionKey`** (`button.tasks`, `button.vegetables`, `button.upgrade`) и **`fallback`**; после **`LocalizationManager.init()`** в подписи идёт **`LocalizationManager.tryT(key) ?? fallback`**, обновление при **`LocalizationManager.onChange`**.

**Соответствие иконок и нод (активные кнопки):**

| Цвет / Иконка | Нода в сцене | Статус | Подпись (пример в коде) |
|---|---|---|---|
| Зелёная с галочкой `IconCheckmark` | `ButtonsLeft/ButtonTasks` (L558) | Активна | **`button.tasks`** → «Задания» (`ru.json`) |
| Жёлтая со звездой `CheckboxStarFill` | `ButtonsLeft/ButtonsVegetables` (L1627) | Активна | **`button.vegetables`** → «Список продуктов» |
| Синяя со стрелкой `IconArrow` | `ButtonsLeft/ButtonsUpgrade` (L2661) | Активна | **`button.upgrade`** → «Улучшить» |

**Резерв (подписи не вешаем, пока кнопки выключены):**

- `ButtonsLeft/ButtonsPrestige`, `ButtonsLeft/ButtonsShop`, `ButtonsRight/ButtonsShop`, `ButtonsRight/ButtonX2`, `ButtonsRight/ButtonsShop-002`.

**Файлы:**

- `assets/Scripts/ButtonCaptions.ts`, `assets/Scripts/ButtonCaptions.ts.meta`
- `assets/Scripts/FontLoader.ts` — `loadSharedTtf`, `loadTtfFontForLabel`, **`ensureButtonCaptions()`**, **`ensurePanelToggles()`**, **`ensureRuntimeMobileAdapters()`** (`SafeAreaLayout`, `MobileInputGuard`, `MobileTouchTargets`, `PerformanceManager`, **`YandexSDKManager`**, **`AchievementsManager`**, **`AnalyticsManager`**, **`DebugPanel`**), **`installGlobalErrorHandlers()`**, **`LocalizationManager.init()`**
- `assets/Scripts/ResponsiveSides.ts` — отступы боковых колонок / поля (вместо удалённого `AdaptiveScale`)

---

### **Задача 1.1b: Отступ боковых кнопок от GameField — готово (новая реализация)**

**Реализовано:** горизонтальные отступы колонок `ButtonsLeft` / `ButtonsRight` и масштаб поля по трём режимам (узкий портрет / средний / широкий ландшафт) — **`ResponsiveSides.ts`** (см. свойства порогов и `fieldWidthMul*`), либо упрощённо — **`SideButtonsResponsive.ts`**.

**Снято:** единое свойство **`minGapBetween`** из удалённого `AdaptiveScale` (`ResolutionAdapter.ts` больше нет). Значения из инспектора старой ноды в сцене не переносятся автоматически — при необходимости повторить отступы в `ResponsiveSides`.

---

### **Задача 1.2: Улучшить верхнюю панель (HUD) — готово**

**Реализовано:**

1–3. **Лейблы** `MoneyTextCount`, `MoneyDPS`, `LevelText`: включены outline (**2 px**, чёрный) и shadow (`#00000088`, смещение **(2, −2)**, **blur 4**). Заливка текста переведена на **белый** для контраста. Размеры: монета **36 / bold**, надпись DPS остаётся **15**, уровень **32**.
4. **`BackgroundBarContainer`**: `_color` умножение **RGBA(0,0,0,170)**; **`BackgroundDialogue`** + **`_type: sliced`** (`assets/Sprites/BackgroundDialogue.png.meta`: border **40** для скругления по краям — подогнать в редакторе при артефактах).
5. **Трек и филл прогресса**: высота строки около **×1,3** (15 → **20**), цвет полосы **#FFD93D** (`rgb(255,217,61)` на спрайте `Bar`).
6. **`IconLevelStar`** (первым ребёнком у общей обёртки прогресса рядом с `LevelText`, **24×24**, `CheckboxStarFill`) и **`XpHint`** (Label **14** в сцене) — текст из **`LevelProgressController`** по ключу **`xp.hint`** (`LocalizationManager.t`, параметры накопленного и нужного XP).

**Осталось по желанию:** п. **7** — явный **`fitMoneybar()`** или проход пресетов разрешений (сейчас нет специализированной логики, только общий канвас/виджеты).

**Файлы:** `assets/Scenes/scene.scene`, `assets/Sprites/BackgroundDialogue.png.meta`, `assets/Scripts/LevelProgressController.ts`.

---

### **Задача 1.3: Туториал для новых игроков — готово**

**Реализовано:**

1. **`TutorialManager`** (`assets/Scripts/TutorialManager.ts`) — singleton на `Canvas/UI`, `getInstance()`, флаг в **`sys.localStorage`** (`farm_clicker_tutorial_v1`), `skip()`, `replay()`. Шаги заданы машиной состояний (посадка моркови → сбор → открытие **`UpgradeList`**). Пульсация `tween` по цели, палец — нода **`finger`** (поднимается в иерархии к корню **`TutorialRoot`**).
2. **`TutorialBridge`** — `notifyCarrotPlanted` / `notifyCarrotHarvested` из **`VegetableMenuHandler.placeInCell`** и **`VegClickMoney.applyHarvestEffects`**.
3. **`ExclusiveUIPanels`**: **`ExclusiveUIPanelId.Tutorial`** — при старте туториала закрываются `VegetableList`, `UpgradeList`, `Tasks` (см. `closeOtherExclusivePanels`).
4. UI: пузырь с **`cc.Label`** и кнопкой **«Пропустить»**, появление **`UIOpacity`** fade-in. Полноэкранное затемнение из плана **не** включено: оно перехватывало бы клики по грядкам; при необходимости — отдельная доработка (дырка в маске / только нижняя шторка).
5. Подключение: **`FontLoader.ensureTutorialManager()`** добавляет компонент на **`Canvas/UI`**.

**Не делалось (опционально):** нода **«Помощь»** в сцене — вызови **`TutorialManager.getInstance()?.replay()`** с кнопки, когда появится; отдельный **`TutorialStep.ts`** не выносился — типы шага внутри `TutorialManager`.

**Файлы:** `TutorialManager.ts`, `TutorialBridge.ts`, `ExclusiveUIPanels.ts`, `FontLoader.ts`, `VegetableMenuHandler.ts`, `VegClickMoney.ts`.

---

### **Задача 1.1c: Ширина меню списков на узком портрете — готово**

**Реализовано:** при открытии панелей масштаб подбирается так, чтобы ширина не превышала **~90%** видимой области (`view.getVisibleSize()`), с учётом `contentSize` и масштаба родителей.

**Файлы:** `SlotMenuHandler.ts` (`VegetableList`), `VegetableUnlockListToggle.ts`, `UpgradeListToggle.ts`.

---

### **Задача 1.4: Анимации и визуальные эффекты — готово**

**Реализовано:**

1. **`FloatingText`** (`assets/Scripts/FloatingText.ts`): `spawn(parent, worldPos, text, color)` — `Label` (Caveat, **22** pt, outline **2**), смещение **~0.6 с** + fade-out, затем `destroy()`. При сборе урожая из `VegClickMoney.applyHarvestEffects` после `addMoney` — текст **`+N`** цветом **#7CFC00**. Цвета **#FFD93D** / **#FF4D4D** из плана — использовать при появлении логики критов / отказа (сейчас не заведены отдельные события).
2. **Появление культуры / морковь:** в `VegClickMoney.onLoad` для каждого `VegClick` — scale **0.8 → 1.0** за **0.2 с** (`backOut`); для нод с **`carrot`** в имени — бесконечное покачивание по **Z** (секвенция **0.3 / 0.6 / 0.3** как в плане).
3. **Эффекты клика:** ripple — `SlotMenuHandler.playClickRipple` (Graphics + масштаб + прозрачность **0.3 с**); **`UiPress`** — `to(0.05, scale 1.1)` → `to(0.1, scale 1.0)`; компонент навешивается на кнопки колонок через **`MobileTouchTargets`**.
4. **«Частицы» при сборе:** `FxPool` (`assets/Scripts/FxPool.ts`) — короткоживущие лейблы-звёздочки, лимит **50** активных (**25** при `farm_clicker_quality_v1 = low`). Отдельный **`ParticleSystem2D`** и свечение **`IconRare`** — не делалось (по плану отложено / опционально).
5. **Анимация UI:** count-up **MoneyTextCount** — `MoneyManager.animateMoneyLabelTo` (**0.2 с**); прогресс уровня — `LevelProgressController.animateProgressBar` + ширина `Bar` при наличии `UITransform`; пульсация строк апгрейдов при **`canPurchase() === 'ok'`** — `UpgradeListPanel.updateRowPulse`.

**Файлы:** `FloatingText.ts`, `FxPool.ts`, `UiPress.ts`, `VegClickMoney.ts`, `SlotMenuHandler.ts`, `MoneyManager.ts`, `LevelProgressController.ts`, `UpgradeListPanel.ts`, `MobileTouchTargets.ts`, `FontLoader.ts`.

---

### **Задача 1.5: Оптимизация под мобильные устройства — готово (код); atlas и QA — вручную**

**Статус:** скрипты **`SafeAreaLayout`**, **`PerformanceManager`**, **`MobileInputGuard`**, **`MobileTouchTargets`** есть и добавляются на **`Canvas/UI`** из **`FontLoader.ensureRuntimeMobileAdapters()`** (в редакторе не нужно вешать вручную). Safe area учитывается для **`Moneybar`** / **`Container`** (iOS, через API `screen`).

**Что ещё по желанию / вне кода:**

- **Auto Atlas** для UI-спрайтов — только в Cocos Editor (Asset → Auto Atlas), см. перечень в плане ниже.
- Прогон на целевых разрешениях и **реальных** iPhone с вырезом.

**Что оставлено из плана «Что добавить» как справка (основное уже в коде):**

1. **Touch targets** — реализовано в **`MobileTouchTargets`** (минимум **44** px с учётом `worldScale`, зазор **Layout ≥ 8** на `ButtonsLeft` / `ButtonsRight`).
2. **Safe area** — **`SafeAreaLayout.ts`**.
3. **Производительность** — **`PerformanceManager`** (`game.frameRate` 60↔30, ключ **`farm_clicker_quality_v1`**, влияние на outline/shadow HUD и лимит `FxPool`). **Atlas** — вручную в редакторе.
4. **Управление** — **`MobileInputGuard`** (`touchmove` + `viewport` meta). Press — **`UiPress`**.
5. **Тестирование** — в **`PerformanceManager`**: лог `view.getVisibleSize()` при **`DEBUG`**, toast при узкой ширине кадра.

**Файлы:** `SafeAreaLayout.ts`, `PerformanceManager.ts`, `MobileInputGuard.ts`, `MobileTouchTargets.ts`, `FontLoader.ts`; при необходимости точечно `scene.scene` (Widget), `ResponsiveSides.ts`.

---

## 🚀 Этап 2: Интеграция Яндекс Игр SDK

### **Задача 2.1: Настройка Яндекс SDK — готово (код)**

**Реализовано:**

1. **`assets/Scripts/YandexSDKManager.ts`** — компонент на **`Canvas/UI`** (через **`FontLoader.ensureRuntimeMobileAdapters()`**), singleton **`getInstance()`** / **`ensureInstance()`**, **`initialize()`** (`window.YaGames?.init?.()`), **`getPlayer()`**, **`getPayments({ signed: true })`**, **`LoadingAPI.ready`**, **`GameplayAPI.start`**. Методы: **`showFullscreenAd`**, **`showRewardedVideo`**, **`submitScore`**, **`getLeaderboard`**, **`unlockAchievement`** (`player.setStats`).
2. **Облако** — **`ProgressSave.cloudRead` / `cloudWrite`**; **`ProgressManager.bootstrapRestoreFromBestSource()`** сравнивает **`savedAt`** с локальным снимком; **`scheduleCloudSave`** / **`saveCloudNow`** (debounce **`cloudSaveDelay`**) после **`saveNow`**.
3. **Реклама** — fullscreen с кулдауном (**`fullscreenCooldownSec`**, по умолчанию 240 с); rewarded выдаёт **`MoneyManager.activateDoubleHarvest(rewardedDoubleHarvestSec)`** и начисление монет в обработчике кнопок; поиск и привязка **`ButtonX2`**, **`ButtonsShop-002`** в **`bindRewardedButtons`**.
4. **Лидерборд** — при повышении уровня **`LevelProgressController.handleLevelUp`** вызывает **`submitScore('total_earned', score)`** (имя дублирует константу в коде — должно совпадать с кабинетом Яндекс Игр).
5. **Достижения** — **`AchievementsManager`** (компонент на UI): **`posad_10_carrots`**, **`earn_100_money`**, **`unlock_all_cultures`**; не **`QuestManager`**, а отдельный **`update()`**-цикл по состоянию поля / монет / **`UnlockManager`**.
6. **`LeaderboardPanel.ts`** — **`refresh()`** читает топ через **`YandexSDKManager.getLeaderboard`** (нужно повесить на ноду в сцене при желании UI).

**Осталось вне репозитория:** зарегистрировать в кабинете Яндекс Игр лидерборд, достижения и домены; прогнать билд на **`https://yandex.ru/games/`** (локально SDK частично недоступен).

**Файлы:** `YandexSDKManager.ts`, `AchievementsManager.ts`, `LeaderboardPanel.ts`, `ProgressSave.ts`, `ProgressManager.ts`, `LevelProgressController.ts`, `MoneyManager.ts`, `FontLoader.ts`, `build-templates/web-mobile/index.html`.

---

### **Задача 2.2: Манифест и метаданные — готово (код)**

**Реализовано:**

1. **`build-templates/web-mobile/manifest.json`** — **`"name": "Дача кликер"`**, описание, **`portrait`**, **`fullscreen`**, ссылка на **`icons/icon-512.png`**.
2. **`build-templates/web-mobile/icons/`** — **`icon-512.png`**, **`favicon-32.png`**, **`apple-touch-icon-180.png`**.
3. **`build-templates/web-mobile/index.html`** — подключение SDK v2, **`viewport-fit=cover`**, отключение зума, title **«Дача кликер — Играй бесплатно на Яндекс Играх»**, Open Graph, **`link rel="icon"`** и **apple-touch-icon**.
4. **Логи** — **`assets/Scripts/Debug.ts`**: **`dlog` / `dinfo`** завязаны на **`DEBUG`** (`cc/env`); вызовы **`console.log`** для отладки в скриптах заменены на **`dlog`**. Сообщения **`console.warn`** при ошибках загрузки баланса/сцены и в **`ProgressManager`/`YandexSDKManager`** оставлены для видимости сбоев (при желании унифицировать под **`dlog`**).

**По желанию перед релизом:** в Cocos **Build → Web Mobile** — **Compress Texture**, **MD5 Cache**, **Source Maps = off**, UI **Auto Atlas**; проверить размер билда **&lt; 10 МБ**.

**Файлы:** `build-templates/web-mobile/*`, `assets/Scripts/Debug.ts`, массовая замена вызовов на **`dlog`** в `assets/Scripts/*.ts`.

---

## 📦 Этап 3: Финальная подготовка

### **Задача 3.1: Локализация — готово**

**Реализовано:**

1. **`assets/Scripts/LocalizationManager.ts`** — **`init()`** (язык из окружения SDK / `navigator.language` / **`ru`**), **`t` / `tryT`**, подстановка **`{n}`**, **`{cur}`**, **`{need}`** и др. в строках, **`resources.load('locales/<lang>', JsonAsset)`**, событие **`onChange`** при смене словаря.
2. **`assets/resources/locales/ru.json`**, **`en.json`** — ключи апгрейдов, кнопок, **`xp.hint`**, **`quests.all_done`**, строки квестов **`quest.<id>.title`** / **`.desc`** (синхронизированы с данными квестов).
3. **`ButtonCaptions`** — **`captionKey` + fallback**, подписка на **`LocalizationManager.onChange`**.
4. **`UpgradeListPanel`** — **`upgrade.max`**, **`upgrade.level`**.
5. **`LevelProgressController`** — **`XpHint`** через **`LocalizationManager.t('xp.hint', { cur, need })`**.
6. **`QuestManager`** — **`titleKey` / `descKey`** из баланса, **`resolveQuestText`**, завершение списка — **`quests.all_done`**.
7. **`BalanceData.ts`** — опциональные **`titleKey`**, **`descKey`** в типе квеста; JSON квестов обновлены.

**Файлы:** `LocalizationManager.ts`, `locales/ru.json`, `locales/en.json`, `ButtonCaptions.ts`, `UpgradeListPanel.ts`, `LevelProgressController.ts`, `QuestManager.ts`, `BalanceData.ts`, `QUESTS_DRAFT.json`, `BALANCE_DATA.json`, `FontLoader.ts` / **`QuestManager` / `ButtonCaptions`** вызывают **`LocalizationManager.init()`** где нужно.

---

### **Задача 3.2: Тестирование и отладка — готово (код)**

**Реализовано:**

1. **`DebugPanel.ts`** — при **`DEBUG`** с **Cocos**: FPS в **`update`**, **`view.getVisibleSize()`**, **`FxPool.getActiveCount()`**; опциональные ссылки на **`debugLabel`**, **`addMoneyButton`**, **`unlockAllButton`** (если ноды заданы — привязка; иначе компонент только считает метрики). **`UnlockManager.unlockAll`**, **`CellLockHandler.unlockByScript`** для «открыть всё».
2. **`AnalyticsManager.ts`** — события **`game_started`**, **`tutorial_completed`**, **`first_upgrade_purchased`**, **`session_ended`**; опрос **`TutorialManager`** / **`UpgradeManager`** в **`update`**; при наличии SDK — **`GameplayAPI.start/stop`** в **`reportEvent`**.
3. **`Debug.ts`** — **`installGlobalErrorHandlers()`** — `window` **`error`** и **`unhandledrejection`** → **`console.error`** (только если **`DEBUG`** и есть **`window`**).

**Чеклист перед релизом** (ручная проверка):

- [ ] Игра загружается за &lt; 3 секунды на 4G.
- [ ] Все кнопки работают на мобильном (touch targets ≥ 44×44).
- [ ] Туториал проходит за &lt; 60 секунд.
- [ ] Сохранение: local + cloud на портале Яндекс Игр.
- [ ] Реклама fullscreen + rewarded на проде.
- [ ] В production-сборке нет лишнего шума от **`dlog`** (они отключены при **`DEBUG = false`**).

**Файлы:** `Debug.ts`, `DebugPanel.ts`, `AnalyticsManager.ts`, `FontLoader.ts`, `FxPool.ts` (**`getActiveCount`**), `UnlockManager.ts` (**`unlockAll`**).

---

## 📅 Примерный таймлайн (с учётом уже сделанного)

| Этап | Задачи | Время |
|------|--------|-------|
| День 1 | ~~1.1 / 1.1b / 1.1c / 1.2~~ (сделано) — полировка и тесты по разрешениям | 1-2 часа |
| День 2 | ~~1.3 (туториал)~~ (сделано) — полировка UX туториала, кнопка «Помощь» | 1-2 часа |
| День 3 | ~~1.4 (FloatingText, FX, UI tweens)~~ (сделано) — полировка интенсивности FX | 1-2 часа |
| День 4 | ~~1.5 (mobile bootstrap)~~ (сделано) — **Auto Atlas** в редакторе + тесты на устройствах | 2-3 часа |
| День 5-6 | ~~2.1 (Yandex SDK + cloud)~~, ~~2.2 (manifest, icons, dlog)~~ — **код готов**; кабинет Яндекс, prod-настройки билда, размер &lt; 10 МБ | 2-4 часа |
| День 7 | ~~3.1 (i18n)~~, ~~3.2 (Debug, analytics)~~ — **код готов**; привязать **LeaderboardPanel** / ноды **DebugPanel** в сцене при необходимости | 1-2 часа |
| День 8 | Финальное тестирование, фиксы | 4 часа |

**Итого: релизная полировка** — **1.1 / 1.1b / 1.1c / 1.2 / 1.3 / 1.4 / 1.5 (код)**, **2.1 / 2.2 / 3.1 / 3.2 (код)** закрыты; дальше — **кабинет Яндекс Игр**, **Auto Atlas**, **QA на устройствах**, **скриншоты**, проверка размера билда; опционально — `fitMoneybar()`, полноэкранное затемнение туториала с «дыркой», кнопка «Помощь», `ParticleSystem2D` вместо лейблов в `FxPool`.

---

## 🎯 Чеклист перед публикацией

- [x] **1.1** Подписи у трёх активных боковых кнопок (`ButtonCaptions` + Caveat через `FontLoader`).
- [x] **1.1b** Горизонтальный зазор `GameField` ↔ боковые колонки (`ResponsiveSides` / `SideButtonsResponsive`; старый `minGapBetween` снят).
- [x] **1.1c** Ширина `VegetableList` / `VegetableListUnlocked` / `UpgradeList` на узком портрете (`fitPanelToScreenWidth`).
- [x] **1.2** HUD (outline/shadow, `IconLevelStar`, `XpHint`, фон суммы и прогресс-бар); опционально — `fitMoneybar()`.
- [x] **1.3** Туториал (`TutorialManager`, `TutorialBridge`, `finger`).
- [x] **1.4** Floating text, ripple, FX-пул, `UiPress`, tween прогресса / count-up / пульсация апгрейдов (см. задачу 1.4).
- [x] **1.5** Mobile bootstrap: `SafeAreaLayout`, `PerformanceManager`, `MobileInputGuard`, `MobileTouchTargets` (44px + gap); **вручную:** UI Auto Atlas и финальный QA на девайсах.
- [x] **2.1** Yandex SDK + cloud save + реклама + лидерборды/ачивки (**код**); проверка на портале и в кабинете — отдельно.
- [x] **2.2** `build-templates/web-mobile`, манифест (**«Дача кликер»**), иконки, **`dlog`** вместо прямого **`console.log`** в скриптах.
- [x] **3.1** Локализация (`LocalizationManager`, `locales`, квесты с ключами).
- [x] **3.2** `DebugPanel`, `AnalyticsManager`, глобальные error hooks в **debug**-сборке.
- [x] `YandexSDKManager` добавляется на `Canvas/UI` из `FontLoader`, singleton после init сцены.
- [ ] Cloud save проверен на **реальном** окружении Яндекс Игр (`player.setData/getData` + фолбэк на `localStorage`).
- [ ] Реклама fullscreen + rewarded проверена на проде без ошибок.
- [ ] Лидерборды + достижения **зарегистрированы** в Яндекс Кабинете и совпадают с идентификаторами в коде (`total_earned`, `posad_10_carrots`, …).
- [x] `manifest.json`, `icon-512.png`, favicon, apple-touch-icon в `build-templates/web-mobile/`.
- [x] `console.log` в `assets/Scripts/*.ts` для отладки убран (используется **`dlog`**); **`console.warn`**/`console.error` для диагностики и глобальных ошибок могут оставаться.
- [ ] Размер билда `web-mobile` < 10 МБ.
- [ ] Игра протестирована на 3+ мобильных устройствах (iOS + Android).
- [ ] Туториал понятен новому игроку (≤ 60 секунд).
- [ ] FPS стабильный (60 на средних, 30+ на слабых).
- [ ] Подготовлены скриншоты (минимум 4) и описание для Яндекс Игр.

Удачи с релизом! 🥕🚀
