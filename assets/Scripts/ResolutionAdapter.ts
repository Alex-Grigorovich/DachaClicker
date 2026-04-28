import { _decorator, Component, director, Layout, Node, screen, UITransform, Vec3, Widget } from 'cc';

const { ccclass, property, executeInEditMode } = _decorator;

@ccclass('AdaptiveScale')
@executeInEditMode   // чтобы работало и в редакторе при смене ориентации
export class AdaptiveScale extends Component {
    @property({ type: Node, tooltip: 'GameField — основное игровое поле' })
    gameField: Node | null = null;

    @property({ type: Node, tooltip: 'Корневой ряд: ButtonsLeft + GameField + ButtonsRight' })
    rowRoot: Node | null = null;

    @property({ type: Node, tooltip: 'Видимая область, обычно Canvas. Если пусто — найдётся автоматически' })
    screenRoot: Node | null = null;

    @property({ type: Node, tooltip: 'Панель слева' })
    buttonsLeft: Node | null = null;

    @property({ type: Node, tooltip: 'Панель справа' })
    buttonsRight: Node | null = null;

    @property({ type: Node, tooltip: 'VegetableList — панель выбора культур (должна целиком влезать в экран)' })
    vegetableList: Node | null = null;

    @property({ type: Node, tooltip: 'UpgradeList — панель апгрейдов (вписывается по ширине/высоте в экран)' })
    upgradeList: Node | null = null;

    @property({ tooltip: 'Макс. доля ширины экрана для UpgradeList' })
    upgradeListMaxWidthRatio: number = 0.88;

    @property({ tooltip: 'В портрете: макс. доля высоты под UpgradeList' })
    upgradeListPortraitMaxHeightRatio: number = 0.72;

    @property({ tooltip: 'В ландшафте: макс. доля высоты под UpgradeList' })
    upgradeListLandscapeMaxHeightRatio: number = 0.88;

    @property({ tooltip: 'Запас по горизонтали (px): вычитается из доступной ширины, чтобы не касаться краёв' })
    upgradeListSidePadding: number = 24;

    @property({ tooltip: 'Резерв сверху (px) — под валюту/шапку' })
    upgradeListTopPadding: number = 96;

    @property({ tooltip: 'Резерв снизу (px)' })
    upgradeListBottomPadding: number = 28;

    @property({ tooltip: 'Нижний предел масштаба UpgradeList' })
    upgradeListMinScale: number = 0.32;

    @property({ tooltip: 'В портрете: после вписывания умножить масштаб (как у VegetableList)' })
    upgradeListPortraitTightenMul: number = 0.94;

    @property({ tooltip: 'В портрете: макс. доля высоты экрана под панель (остальное — шапка/зазор)' })
    vegetableListPortraitMaxHeightRatio: number = 0.58;

    @property({ tooltip: 'В ландшафте: макс. доля высоты под панель' })
    vegetableListLandscapeMaxHeightRatio: number = 0.9;

    @property({ tooltip: 'Макс. доля ширины экрана для панели (уже = заметно меньше меню в портрете)' })
    vegetableListMaxWidthRatio: number = 0.84;

    @property({ tooltip: 'Портрет: после расчёта вписывания умножить масштаб (меньше 1 — ещё мельче, типично 0.85–0.92)' })
    vegetableListPortraitTightenMul: number = 0.9;

    @property({ tooltip: 'Резерв сверху (px) — под валюту/шапку' })
    vegetableListTopPadding: number = 96;

    @property({ tooltip: 'Резерв снизу (px)' })
    vegetableListBottomPadding: number = 20;

    @property({ tooltip: 'Нижний предел масштаба панели' })
    vegetableListMinScale: number = 0.32;

    @property({ tooltip: 'Пороговое соотношение (width/height). Ниже — портрет' })
    portraitThreshold: number = 0.9;   // 0.9 — хороший баланс (меньше 1 — портрет)

    @property({ tooltip: 'Масштаб поля в портретном режиме (0.7–0.85 обычно хватает)' })
    portraitScale: number = 0.78;

    @property({ tooltip: 'Масштаб поля в ландшафтном режиме' })
    landscapeScale: number = 1.0;

    @property({ tooltip: 'Масштаб поля в маленьком ландшафте (мобильный rotate)' })
    smallLandscapeFieldScale: number = 0.82;

    @property({ tooltip: 'Если min(ширина, высота) ≤ этого значения (px), ландшафт считается маленьким' })
    smallLandscapeShortEdgeMax: number = 520;

    @property({ tooltip: 'Если min(ширина, высота) ≥ этого (px) — чуть крупнее GameField (планшет, ПК)' })
    largeDisplayShortEdgeMin: number = 900;

    @property({ tooltip: 'Множитель GameField на крупных разрешениях' })
    largeDisplayFieldScaleMul: number = 1.04;

    @property({ tooltip: 'Потолок масштаба GameField на крупных разрешениях' })
    largeDisplayFieldScaleCap: number = 1.08;

    @property({
        tooltip:
            'Доп. множитель GameField только при min(ширина,высота) ≥ largeDisplayShortEdgeMin (после portrait/landscape и gameFieldTuning). На телефонах не применяется.',
    })
    largeDisplayGameFieldExtraMul: number = 1.22;

    @property({
        tooltip:
            'Потолок итогового масштаба GameField на крупных экранах (после largeDisplayGameFieldExtraMul). На мобильных по-прежнему действует gameFieldTuningMax.',
    })
    largeDisplayGameFieldMax: number = 1.55;

    @property({
        group: { name: 'GameField — ручная настройка', id: 'gf_tune' },
        range: [0.5, 1.5, 0.01],
        tooltip: 'Доп. множитель к итоговому масштабу (1 = без изменений, >1 — крупнее поле). Удобно крутить, если поле визуально мало.',
    })
    gameFieldTuning: number = 1;

    @property({
        group: { name: 'GameField — ручная настройка', id: 'gf_tune' },
        range: [0.7, 2, 0.01],
        tooltip: 'Потолок итогового масштаба GameField (после tuning). Ограничивает, если поставили большой gameFieldTuning.',
    })
    gameFieldTuningMax: number = 1.2;

    @property({ tooltip: 'Равные зазоры слева/справа от GameField (px в мировой X для UI); меньше — шире полосы под боковые кнопки' })
    minGapBetween: number = 4;

    @property({ tooltip: 'Отступ боковых блоков от края экрана' })
    screenSidePadding: number = 0;

    @property({ tooltip: 'Максимальный масштаб ButtonsLeft/ButtonsRight при свободном месте' })
    sideButtonsMaxScale: number = 1.25;

    @property({ tooltip: 'Минимальный масштаб ButtonsLeft/ButtonsRight при схлопывании' })
    sideButtonsMinScale: number = 0.5;

    @property({ tooltip: 'Дополнительно ужимать боковые панели на мобилках по min(ширина, высота); выкл. — крупнее на телефонах' })
    sideButtonsMobileShrink: boolean = false;

    @property({ tooltip: 'Если min(ширина, высота) ≥ этого (px) — мобильный ужим не применяется' })
    sideButtonsMobileNoShrinkShortEdge: number = 800;

    @property({ tooltip: 'При min(ширина, высота) ≤ этого (px) — максимальное ужатие' })
    sideButtonsMobileMaxShrinkShortEdge: number = 360;

    @property({ tooltip: 'На очень узком экране: нижняя граница мобильного множителя (1 = не ужимать)' })
    sideButtonsMobileMinScaleMul: number = 0.92;

    @property({ tooltip: 'Отключить cc.Layout на rowRoot, чтобы вручную задавать позиции' })
    disableRowLayout: boolean = true;

    @property({ tooltip: 'Отключать Widget на трёх нодах ряда, чтобы не сбрасывали setPosition' })
    disableRowWidgets: boolean = true;

    @property({
        tooltip:
            'Для тестов: отключить чтение и запись прогресса. При включении старый сейв не восстанавливается, новые изменения не сохраняются.',
    })
    disableProgressSaving: boolean = false;

    private originalScales = new Map<Node, number>();
    private vegetableListBaseScale = 1;
    private upgradeListBaseScale = 1;
    private readonly _tmpWorld = new Vec3();
    private readonly _tmpLocal = new Vec3();

    onLoad() {
        this.resolveRowNodes();
        this.saveOriginalScales();
        this.saveVegetableListBaseScale();
        this.resolveUpgradeList();
        this.saveUpgradeListBaseScale();
        this.disableLayoutOnRow();
        this.applyGameRowLayout();
        if (!this.node.getComponent('UpgradeListToggle')) {
            this.node.addComponent('UpgradeListToggle');
        }
        const progressManager = this.resolveProgressManager();
        progressManager?.setSavingDisabled?.(this.disableProgressSaving || !!progressManager.disableSaving);
    }

    start() {
        this.applyAdaptiveScale();
        this.scheduleOnce(this.applyGameRowLayout, 0.02);
        screen.on('window-resize', this.onScreenResize, this);
    }

    onDestroy() {
        screen.off('window-resize', this.onScreenResize, this);
    }

    private resolveRowNodes() {
        const root = this.rowRoot;
        if (!root?.isValid) {
            return;
        }
        if (!this.buttonsLeft) {
            this.buttonsLeft = root.getChildByName('ButtonsLeft') ?? null;
        }
        if (!this.buttonsRight) {
            this.buttonsRight = root.getChildByName('ButtonsRight') ?? null;
        }
        if (!this.gameField) {
            this.gameField = root.getChildByName('GameField') ?? null;
        }
        if (!this.screenRoot) {
            this.screenRoot = this.findTopUiAncestor(root);
        }
        this.resolveUpgradeList();
    }

    private resolveUpgradeList() {
        if (this.upgradeList?.isValid) {
            return;
        }
        const start = this.screenRoot;
        if (start?.isValid) {
            this.upgradeList = this.findNodeDeepByName(start, 'UpgradeList');
        }
    }

    private findNodeDeepByName(root: Node, name: string): Node | null {
        if (root.name === name) {
            return root;
        }
        for (const c of root.children) {
            const f = this.findNodeDeepByName(c, name);
            if (f) {
                return f;
            }
        }
        return null;
    }

    /**
     * Только поиск существующего ProgressManager. Не добавляем компонент сами —
     * иначе при расхождении порядка onLoad/Preview легко получить второй экземпляр и шум в логах.
     */
    private resolveProgressManager(): any {
        const scene = director.getScene();
        if (!scene) {
            return null;
        }
        return this.findComponentDeepByName(scene, 'ProgressManager') ?? this.node.getComponent('ProgressManager') ?? null;
    }

    private findComponentDeepByName(root: Node, className: string): any {
        const found = root.getComponent(className);
        if (found) {
            return found;
        }
        for (const child of root.children) {
            const childFound = this.findComponentDeepByName(child, className);
            if (childFound) {
                return childFound;
            }
        }
        return null;
    }

    private findTopUiAncestor(node: Node): Node | null {
        let current: Node | null = node;
        let result: Node | null = node.getComponent(UITransform) ? node : null;
        while (current?.parent) {
            current = current.parent;
            if (current.getComponent(UITransform)) {
                result = current;
            }
        }
        return result;
    }

    private disableLayoutOnRow() {
        if (!this.disableRowLayout) {
            return;
        }
        const root = this.rowRoot;
        if (!root?.isValid) {
            return;
        }
        const l = root.getComponent(Layout);
        if (l) {
            l.enabled = false;
        }
    }

    private disableRowWidgetsOnNodes() {
        if (!this.disableRowWidgets) {
            return;
        }
        for (const n of [this.buttonsLeft, this.gameField, this.buttonsRight]) {
            if (!n?.isValid) {
                continue;
            }
            const w = n.getComponent(Widget);
            if (w) {
                w.enabled = false;
            }
        }
    }

    private saveOriginalScales() {
        for (const n of [this.gameField, this.buttonsLeft, this.buttonsRight]) {
            if (n?.isValid) {
                this.originalScales.set(n, n.scale.x);
            }
        }
    }

    private onScreenResize() {
        this.scheduleOnce(() => {
            this.applyAdaptiveScale();
        }, 0.05);
    }

    private applyAdaptiveScale() {
        const size = screen.windowSize;           // актуальный размер экрана
        const ratio = size.width / size.height;   // ширина / высота

        const isPortrait = ratio < this.portraitThreshold;
        const shortEdge = Math.min(size.width, size.height);
        const isSmallLandscape = !isPortrait && shortEdge <= this.smallLandscapeShortEdgeMax;

        let fieldScale = isPortrait ? this.portraitScale : this.landscapeScale;
        if (isSmallLandscape) {
            fieldScale = Math.min(fieldScale, this.smallLandscapeFieldScale);
        }
        if (shortEdge >= this.largeDisplayShortEdgeMin) {
            const boosted = fieldScale * this.largeDisplayFieldScaleMul;
            fieldScale = Math.min(this.largeDisplayFieldScaleCap, boosted);
        }

        const t = this.gameFieldTuning > 0 ? this.gameFieldTuning : 1;
        const cap = this.gameFieldTuningMax > 0 ? this.gameFieldTuningMax : 1.2;
        fieldScale = Math.min(cap, fieldScale * t);

        if (shortEdge >= this.largeDisplayShortEdgeMin) {
            const extra = this.largeDisplayGameFieldExtraMul > 0 ? this.largeDisplayGameFieldExtraMul : 1;
            const largeCap = this.largeDisplayGameFieldMax > 0 ? this.largeDisplayGameFieldMax : cap;
            fieldScale = Math.min(largeCap, fieldScale * extra);
        }

        console.log(
            `[AdaptiveScale] ratio: ${ratio.toFixed(3)}, ${isPortrait ? 'ПОРТРЕТ' : 'ЛАНДШАФТ'}, ` +
                `field: ${fieldScale.toFixed(3)} (tuning×${t.toFixed(2)} cap≤${cap.toFixed(2)}), ` +
                `smallLandscape: ${isSmallLandscape}, shortEdge: ${shortEdge.toFixed(0)}`,
        );

        if (this.gameField) {
            const orig = this.originalScales.get(this.gameField) || 1;
            this.gameField.setScale(orig * fieldScale, orig * fieldScale, 1);
        }
        this.applyGameRowLayout();
        this.fitVegetableList(true);
        this.fitUpgradeList(true);
    }

    /**
     * Равные зазоры между (Left|Field) и (Field|Right), GameField по центру rowRoot по X.
     */
    public applyGameRowLayout = () => {
        this.resolveRowNodes();
        this.disableLayoutOnRow();
        this.disableRowWidgetsOnNodes();
        const root = this.rowRoot;
        const left = this.buttonsLeft;
        const field = this.gameField;
        const right = this.buttonsRight;
        if (!root?.isValid || !left?.isValid || !field?.isValid || !right?.isValid) {
            return;
        }
        if (left.parent !== root || field.parent !== root || right.parent !== root) {
            return;
        }

        const screenUi = (this.screenRoot ?? root).getComponent(UITransform);
        if (!screenUi) {
            return;
        }

        this.applySideButtonsCollapseScale(screenUi, left, field, right);

        const wL = this.getWorldWidth(left);
        const wF = this.getWorldWidth(field);
        const wR = this.getWorldWidth(right);
        if (wL <= 0 || wF <= 0 || wR <= 0) {
            return;
        }

        const screenWorld = screenUi.getBoundingBoxToWorld();
        if (screenWorld.width <= 0) {
            return;
        }

        const cx = screenWorld.xMin + screenWorld.width * 0.5;
        const fieldLeft = cx - wF * 0.5;
        const fieldRight = cx + wF * 0.5;
        const screenLeft = screenWorld.xMin + this.screenSidePadding;
        const screenRight = screenWorld.xMax - this.screenSidePadding;

        const leftMinCenter = screenLeft + wL * 0.5;
        const leftMaxCenter = fieldLeft - this.minGapBetween - wL * 0.5;
        const rightMinCenter = fieldRight + this.minGapBetween + wR * 0.5;
        const rightMaxCenter = screenRight - wR * 0.5;

        const leftWorldX = Math.max(leftMinCenter, leftMaxCenter);
        const fieldWorldX = cx;
        const rightWorldX = Math.min(rightMaxCenter, rightMinCenter);

        this.setLocalXFromWorldX(left, leftWorldX);
        this.setLocalXFromWorldX(field, fieldWorldX);
        this.setLocalXFromWorldX(right, rightWorldX);
    };

    private applySideButtonsCollapseScale(screenUi: UITransform, left: Node, field: Node, right: Node) {
        const mobileMul = this.getShortEdgeSideButtonScaleMul();
        const maxScale = this.sideButtonsMaxScale * mobileMul;
        this.setNodeScaleFromOriginal(left, maxScale);
        this.setNodeScaleFromOriginal(right, maxScale);

        const screenWorld = screenUi.getBoundingBoxToWorld();
        const wF = this.getWorldWidth(field);
        const wL = this.getWorldWidth(left);
        const wR = this.getWorldWidth(right);
        if (screenWorld.width <= 0 || wF <= 0 || wL <= 0 || wR <= 0) {
            return;
        }

        const cx = screenWorld.xMin + screenWorld.width * 0.5;
        const fieldLeft = cx - wF * 0.5;
        const fieldRight = cx + wF * 0.5;
        const leftLane = fieldLeft - screenWorld.xMin - this.screenSidePadding - this.minGapBetween;
        const rightLane = screenWorld.xMax - fieldRight - this.screenSidePadding - this.minGapBetween;
        /** Доля от текущей ширины, чтобы влезть в полосы; не больше 1 (не растягиваем) */
        const laneFit = Math.min(1, leftLane / wL, rightLane / wR);
        const scale = maxScale * laneFit;
        // Если места совсем мало, важнее оставить блоки на экране, чем держать заданный нижний предел.
        const minScale = this.sideButtonsMinScale * mobileMul;
        const effectiveMin = scale < minScale ? Math.max(0.05, scale) : minScale;
        const finalScale = Math.max(effectiveMin, scale);
        this.setNodeScaleFromOriginal(left, finalScale);
        this.setNodeScaleFromOriginal(right, finalScale);
    }

    /** 0..1 — на узком экране боковые панели мельче; на планшетах/десктопе ≈1 */
    private getShortEdgeSideButtonScaleMul(): number {
        if (!this.sideButtonsMobileShrink) {
            return 1;
        }
        const s = Math.min(screen.windowSize.width, screen.windowSize.height);
        const high = this.sideButtonsMobileNoShrinkShortEdge;
        const low = this.sideButtonsMobileMaxShrinkShortEdge;
        if (s >= high) {
            return 1;
        }
        if (s <= low) {
            return this.sideButtonsMobileMinScaleMul;
        }
        if (high <= low) {
            return 1;
        }
        const t = (s - low) / (high - low);
        return this.sideButtonsMobileMinScaleMul + t * (1 - this.sideButtonsMobileMinScaleMul);
    }

    private setNodeScaleFromOriginal(node: Node, scale: number) {
        const orig = this.originalScales.get(node) || 1;
        node.setScale(orig * scale, orig * scale, node.scale.z);
    }

    private getWorldWidth(node: Node): number {
        const ui = node.getComponent(UITransform);
        if (!ui) {
            return 0;
        }
        const b = ui.getBoundingBoxToWorld();
        return b.width > 0 ? b.width : ui.contentSize.width * Math.abs(node.worldScale.x);
    }

    private setLocalXFromWorldX(node: Node, worldCenterX: number) {
        const ui = node.getComponent(UITransform);
        if (!ui) {
            return;
        }
        const parent = node.parent;
        const pui = parent?.getComponent(UITransform);
        if (!pui) {
            return;
        }
        const wp = node.worldPosition;
        this._tmpWorld.set(worldCenterX, wp.y, wp.z);
        pui.convertToNodeSpaceAR(this._tmpWorld, this._tmpLocal);
        node.setPosition(this._tmpLocal.x, node.position.y, node.position.z);
    }

    // Для удобства — можно вызвать вручную из другого скрипта
    public refresh() {
        this.applyAdaptiveScale();
    }

    private saveVegetableListBaseScale() {
        const n = this.vegetableList;
        if (n?.isValid) {
            this.vegetableListBaseScale = n.scale.x;
        }
    }

    private saveUpgradeListBaseScale() {
        this.resolveUpgradeList();
        const n = this.upgradeList;
        if (n?.isValid) {
            this.upgradeListBaseScale = n.scale.x;
        }
    }

    /**
     * Подгоняет масштаб VegetableList, чтобы панель целиком влезала в видимую область.
     * @param apply false — только вернуть итоговый масштаб, не выставлять на ноде (например перед tween от 0)
     * @returns итоговый равномерный масштаб (с учётом дизайнерского base)
     */
    public fitVegetableList(apply: boolean = true): number {
        const n = this.vegetableList;
        if (!n?.isValid) {
            return 1;
        }
        this.resolveRowNodes();
        const screenForFit = this.screenRoot ?? this.findTopUiAncestor(n);
        const screenUi = screenForFit?.getComponent(UITransform);
        if (!screenUi) {
            return this.vegetableListBaseScale;
        }
        const listUi = n.getComponent(UITransform);
        if (!listUi) {
            return this.vegetableListBaseScale;
        }

        const screenWorld = screenUi.getBoundingBoxToWorld();
        if (screenWorld.width <= 0 || screenWorld.height <= 0) {
            return this.vegetableListBaseScale;
        }

        const sizeW = screen.windowSize.width / screen.windowSize.height;
        const isPortrait = sizeW < this.portraitThreshold;
        const hRatio = isPortrait
            ? this.vegetableListPortraitMaxHeightRatio
            : this.vegetableListLandscapeMaxHeightRatio;

        const maxH =
            screenWorld.height * hRatio - this.vegetableListTopPadding - this.vegetableListBottomPadding;
        const maxW = screenWorld.width * this.vegetableListMaxWidthRatio;

        const ch = listUi.contentSize.height;
        const cw = listUi.contentSize.width;
        const parentSy = this.getCumulativeParentScale(n, 'y');
        const parentSx = this.getCumulativeParentScale(n, 'x');
        const base = Math.max(1e-4, this.vegetableListBaseScale);
        // Мир-размер при дизайн-масштабе (onLoad), не при текущем n.scale (tween/предыдущий fit)
        const worldH = ch * base * parentSy;
        const worldW = cw * base * parentSx;

        if (worldH <= 0 || worldW <= 0) {
            return this.vegetableListBaseScale;
        }

        const sH = maxH / worldH;
        const sW = maxW / worldW;
        let fitMul = Math.min(1, sH, sW);
        if (isPortrait) {
            const m = this.vegetableListPortraitTightenMul;
            if (m > 0 && m < 1) {
                fitMul *= m;
            }
        }
        const minRel = this.vegetableListMinScale / this.vegetableListBaseScale;
        fitMul = Math.max(fitMul, minRel);

        const finalS = this.vegetableListBaseScale * fitMul;
        if (apply) {
            n.setScale(finalS, finalS, n.scale.z);
        }
        return finalS;
    }

    /**
     * Подгоняет масштаб UpgradeList по ширине и высоте видимой области (равномерный scale).
     * @param apply false — только вернуть масштаб (перед tween от 0), не выставлять на ноде
     */
    public fitUpgradeList(apply: boolean = true): number {
        this.resolveUpgradeList();
        const n = this.upgradeList;
        if (!n?.isValid) {
            return 1;
        }
        this.resolveRowNodes();
        const screenForFit = this.screenRoot ?? this.findTopUiAncestor(n);
        const screenUi = screenForFit?.getComponent(UITransform);
        if (!screenUi) {
            return this.upgradeListBaseScale;
        }
        const listUi = n.getComponent(UITransform);
        if (!listUi) {
            return this.upgradeListBaseScale;
        }

        const screenWorld = screenUi.getBoundingBoxToWorld();
        if (screenWorld.width <= 0 || screenWorld.height <= 0) {
            return this.upgradeListBaseScale;
        }

        const sizeW = screen.windowSize.width / screen.windowSize.height;
        const isPortrait = sizeW < this.portraitThreshold;
        const hRatio = isPortrait
            ? this.upgradeListPortraitMaxHeightRatio
            : this.upgradeListLandscapeMaxHeightRatio;

        const maxW = Math.max(
            0,
            screenWorld.width * this.upgradeListMaxWidthRatio - this.upgradeListSidePadding,
        );
        const maxH =
            screenWorld.height * hRatio - this.upgradeListTopPadding - this.upgradeListBottomPadding;

        const ch = listUi.contentSize.height;
        const cw = listUi.contentSize.width;
        const parentSy = this.getCumulativeParentScale(n, 'y');
        const parentSx = this.getCumulativeParentScale(n, 'x');
        const base = Math.max(1e-4, this.upgradeListBaseScale);
        const worldH = ch * base * parentSy;
        const worldW = cw * base * parentSx;

        if (worldH <= 0 || worldW <= 0 || maxW <= 0 || maxH <= 0) {
            return this.upgradeListBaseScale;
        }

        const sH = maxH / worldH;
        const sW = maxW / worldW;
        let fitMul = Math.min(1, sH, sW);
        if (isPortrait) {
            const m = this.upgradeListPortraitTightenMul;
            if (m > 0 && m < 1) {
                fitMul *= m;
            }
        }
        const minRel = this.upgradeListMinScale / this.upgradeListBaseScale;
        fitMul = Math.max(fitMul, minRel);

        const finalS = this.upgradeListBaseScale * fitMul;
        if (apply) {
            n.setScale(finalS, finalS, n.scale.z);
        }
        return finalS;
    }

    /** Сумма масштабов по цепи родителей (без node), ось: произведение. */
    private getCumulativeParentScale(node: Node, axis: 'x' | 'y'): number {
        let s = 1;
        let p: Node | null = node.parent;
        while (p) {
            s *= Math.abs(p.scale[axis]);
            p = p.parent;
        }
        return s;
    }
}
