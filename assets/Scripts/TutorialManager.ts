import {
    _decorator,
    Button,
    Color,
    Component,
    director,
    Label,
    Node,
    screen,
    Tween,
    UITransform,
    UIOpacity,
    Vec3,
    Widget,
    view,
    sys,
    tween,
} from 'cc';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { PlantFieldState } from './PlantFieldState';
import { CellLockHandler } from './CellLockHandler';
import { ExclusiveUIPanelId, closeOtherExclusivePanels } from './ExclusiveUIPanels';
import { notifyProgressChanged } from './ProgressBridge';
import { readProgressSave, writeProgressSave } from './ProgressSave';
import { registerTutorialHooks, unregisterTutorialHooks } from './TutorialBridge';

const { ccclass, property } = _decorator;

const STORAGE_KEY = 'farm_clicker_tutorial_v1';

const FINGER_NAME = 'finger';

const enum TutorialPhase {
    PlantCarrot,
    Harvest,
    Upgrade,
    Finished,
}

function findDeep(root: Node | null, name: string): Node | null {
    if (!root?.isValid) {
        return null;
    }
    if (root.name === name) {
        return root;
    }
    for (const c of root.children) {
        const f = findDeep(c, name);
        if (f) {
            return f;
        }
    }
    return null;
}

function collectCellsSorted(gameField: Node): Node[] {
    const cells: Node[] = [];
    const stack: Node[] = [...gameField.children];
    while (stack.length) {
        const n = stack.pop()!;
        if (/^Cell\d+$/.test(n.name)) {
            cells.push(n);
        }
        for (const c of n.children) {
            stack.push(c);
        }
    }
    cells.sort((a, b) => {
        const na = parseInt(a.name.replace(/\D+/g, ''), 10) || 0;
        const nb = parseInt(b.name.replace(/\D+/g, ''), 10) || 0;
        return na - nb;
    });
    return cells;
}

/** Ячейка без замка или снятого CellLockHandler — на неё можно открыть посадку. */
function isTutorialCellInteractable(cell: Node | null): boolean {
    if (!cell?.isValid) {
        return false;
    }
    const lock = cell.getComponent(CellLockHandler);
    if (!lock) {
        return true;
    }
    return !lock.isLockedNow();
}

function findFirstUnlockedCell(gameField: Node | null): Node | null {
    if (!gameField?.isValid) {
        return null;
    }
    for (const cell of collectCellsSorted(gameField)) {
        if (isTutorialCellInteractable(cell)) {
            return cell;
        }
    }
    return null;
}

function findCarrotCellForTutorial(gameField: Node | null, pfs: PlantFieldState): Node | null {
    if (!gameField?.isValid) {
        return null;
    }
    for (const cell of collectCellsSorted(gameField)) {
        if (pfs.getCellCulture(cell) === 'carrot' && isTutorialCellInteractable(cell)) {
            return cell;
        }
    }
    return null;
}

@ccclass('TutorialManager')
export class TutorialManager extends Component {
    @property({ tooltip: 'Задержка перед автостартом туториала (сек)' })
    startDelay = 0.45;

    @property({ tooltip: 'Амплитуда пульса (множитель scale)' })
    pulseScale = 1.06;

    @property({ tooltip: 'Полупериод пульсации (сек)' })
    pulseHalf = 0.4;

    @property({ tooltip: 'Отступ пузыря туториала от верха экрана (мир/видимая высота, ×)' })
    tutorialTopMarginMul = 0.06;

    @property({ tooltip: 'Минимальный отступ пузыря от верха (px)' })
    tutorialTopMarginMinPx = 36;

    private static _instance: TutorialManager | null = null;

    private _phase: TutorialPhase = TutorialPhase.Finished;
    private _tutorialRoot: Node | null = null;
    private _tutorialBubbleUt: UITransform | null = null;
    private _tutorialHintNode: Node | null = null;
    private _tutorialHintUt: UITransform | null = null;
    private _tutorialSkipNode: Node | null = null;
    private _hintLabel: Label | null = null;
    private _finger: Node | null = null;
    private _pulseTarget: Node | null = null;
    private _openedUpgradeOnce = false;

    onLoad() {
        if (TutorialManager._instance && TutorialManager._instance !== this) {
            this.node.destroy();
            return;
        }
        TutorialManager._instance = this;
        this._finger = findDeep(this.node, FINGER_NAME);
        if (this._finger?.isValid) {
            this._finger.active = false;
        }
        registerTutorialHooks({
            onCarrotPlanted: () => this.onCarrotPlanted(),
            onCarrotHarvested: () => this.onCarrotHarvested(),
        });
    }

    onDestroy() {
        if (TutorialManager._instance === this) {
            TutorialManager._instance = null;
        }
        unregisterTutorialHooks();
        if (!EDITOR_NOT_IN_PREVIEW) {
            screen.off('window-resize', this.onTutorialWindowResize, this);
        }
        this.stopPulse();
        this.stopFingerTween();
    }

    public static getInstance(): TutorialManager | null {
        return TutorialManager._instance;
    }

    start() {
        if (EDITOR_NOT_IN_PREVIEW) {
            return;
        }
        screen.on('window-resize', this.onTutorialWindowResize, this);
        this.scheduleOnce(() => this.tryBeginNewPlayerTutorial(), Math.max(0.05, this.startDelay));
    }

    private onTutorialWindowResize() {
        if (this._phase === TutorialPhase.Finished || !this._tutorialRoot?.active) {
            return;
        }
        this.layoutTutorialBubble();
    }

    /**
     * Завершён ли туториал: legacy localStorage или поле сейва (после миграции v5).
     * Сначала ключ — чтобы не повторять туториал, если сейв ещё не успел записаться.
     */
    public hasCompletedTutorial(): boolean {
        try {
            if (sys.localStorage.getItem(STORAGE_KEY) === '1') {
                return true;
            }
        } catch {
            /* ignore */
        }
        return readProgressSave()?.tutorialCompleted === true;
    }

    private markTutorialCompleted() {
        try {
            sys.localStorage.setItem(STORAGE_KEY, '1');
        } catch {
            /* ignore */
        }
        notifyProgressChanged();
    }

    private clearTutorialProgress() {
        try {
            sys.localStorage.removeItem(STORAGE_KEY);
        } catch {
            /* ignore */
        }
    }

    /** Для будущей кнопки «Помощь»: повтор туториала. */
    public replay(): void {
        this.clearTutorialProgress();
        try {
            const cur = readProgressSave();
            if (cur) {
                writeProgressSave({ ...cur, tutorialCompleted: false });
            }
        } catch {
            /* ignore */
        }
        this.hideTutorialUi();
        this._phase = TutorialPhase.Finished;
        this.scheduleOnce(() => this.tryBeginNewPlayerTutorial(), 0.05);
    }

    private tryBeginNewPlayerTutorial() {
        // По требованию дизайна туториал стартует в начале каждого запуска игры.
        this.clearTutorialProgress();
        try {
            const cur = readProgressSave();
            if (cur) {
                writeProgressSave({ ...cur, tutorialCompleted: false });
            }
        } catch {
            /* ignore */
        }
        if (!this._finger?.isValid) {
            return;
        }
        closeOtherExclusivePanels(ExclusiveUIPanelId.Tutorial);
        this._phase = TutorialPhase.PlantCarrot;
        this._openedUpgradeOnce = false;
        this.buildTutorialRootIfNeeded();
        this.showTutorialUi();
        this.refreshStepPresentation(true);
    }

    private onCarrotPlanted() {
        if (this._phase !== TutorialPhase.PlantCarrot) {
            return;
        }
        this.advance(TutorialPhase.Harvest);
    }

    private onCarrotHarvested() {
        if (this._phase !== TutorialPhase.Harvest) {
            return;
        }
        this.advance(TutorialPhase.Upgrade);
    }

    private advance(next: TutorialPhase) {
        this._phase = next;
        this.refreshStepPresentation(false);
    }

    update() {
        if (this._phase !== TutorialPhase.Upgrade || this._openedUpgradeOnce) {
            return;
        }
        const list = findDeep(director.getScene(), 'UpgradeList');
        if (list?.activeInHierarchy) {
            this._openedUpgradeOnce = true;
            this.finishTutorial();
        }
    }

    private finishTutorial() {
        this._phase = TutorialPhase.Finished;
        this.markTutorialCompleted();
        this.hideTutorialUi();
    }

    private refreshStepPresentation(isFirstShow: boolean) {
        this.stopPulse();
        this.stopFingerTween();

        if (this._phase === TutorialPhase.Finished) {
            return;
        }

        const scene = director.getScene();
        const gameField = findDeep(scene, 'GameField');
        const pfs = PlantFieldState.getInstance();

        let pulseNode: Node | null = null;
        let fingerTarget: Node | null = null;
        let message = '';

        switch (this._phase) {
            case TutorialPhase.PlantCarrot:
                fingerTarget = findFirstUnlockedCell(gameField);
                pulseNode = fingerTarget;
                message =
                    'Нажми на свободную грядку и посади морковь. В меню нажми «Морковь».';
                break;
            case TutorialPhase.Harvest: {
                const carrotCell = findCarrotCellForTutorial(gameField, pfs);
                const tasks = findDeep(scene, 'ButtonTasks');
                const mark =
                    (tasks && (findDeep(tasks, 'IconCheckmark') ?? findDeep(tasks, 'IconButtonGreenCheck'))) || tasks;
                fingerTarget = carrotCell ?? mark ?? tasks;
                pulseNode = carrotCell ?? mark ?? tasks;
                message =
                    'Собери урожай: тапни по созревшей моркови на грядке или нажми кнопку с галочкой.';
                break;
            }
            case TutorialPhase.Upgrade:
                fingerTarget = findDeep(scene, 'ButtonsUpgrade');
                pulseNode = fingerTarget;
                message = 'Открой улучшения и развивай ферму дальше.';
                break;
            default:
                break;
        }

        if (this._hintLabel?.isValid) {
            this._hintLabel.string = message;
        }
        this.layoutTutorialBubble();

        if (pulseNode?.isValid) {
            this.startPulse(pulseNode);
        }
        this.positionFingerOn(fingerTarget ?? pulseNode);
        this.startFingerFloat();

        if (isFirstShow && this._tutorialRoot?.isValid) {
            const op = this._tutorialRoot.getComponent(UIOpacity) ?? this._tutorialRoot.addComponent(UIOpacity);
            op.opacity = 0;
            tween(op)
                .to(0.35, { opacity: 255 }, { easing: 'quadOut' })
                .start();
            this._tutorialRoot.active = true;
        }
    }

    /** Узкая ширина экрана: пузырь не шире viewport + перенос строк, высота под контент. */
    private layoutTutorialBubble() {
        const bubbleUt = this._tutorialBubbleUt;
        const hintUt = this._tutorialHintUt;
        const hintLabel = this._hintLabel;
        const root = this._tutorialRoot;
        if (!bubbleUt?.node.isValid || !hintUt?.node.isValid || !hintLabel?.isValid || !root?.isValid) {
            return;
        }

        const vs = view.getVisibleSize();
        const sideMargin = 20;
        const maxDesignW = 540;
        const bubbleW = Math.min(maxDesignW, Math.max(120, vs.width - sideMargin * 2));
        const padX = 12;
        const textW = Math.max(96, bubbleW - padX * 2);

        hintLabel.enableWrapText = true;
        hintLabel.overflow = Label.Overflow.RESIZE_HEIGHT;
        hintLabel.horizontalAlign = Label.HorizontalAlign.CENTER;

        bubbleUt.setContentSize(bubbleW, Math.max(bubbleUt.height, 130));
        hintUt.setContentSize(textW, 1);

        this.placeTutorialBubbleNearTop(bubbleUt.node, vs, Math.max(118, bubbleUt.height));

        this.unschedule(this.finishTutorialBubbleLayout);
        this.scheduleOnce(this.finishTutorialBubbleLayout, 0);
    }

    private readonly finishTutorialBubbleLayout = () => {
        if (
            !this._tutorialBubbleUt?.node.isValid ||
            !this._tutorialHintUt?.node.isValid ||
            !this._tutorialHintNode?.isValid ||
            !this._tutorialSkipNode?.isValid ||
            !this._hintLabel?.isValid
        ) {
            return;
        }
        const hintH = Math.max(this._tutorialHintUt.height, 44);
        const bubbleW = this._tutorialBubbleUt.width;
        const bubbleH = Math.min(340, Math.max(118, hintH + 78));
        this._tutorialBubbleUt.setContentSize(bubbleW, bubbleH);
        const vs = view.getVisibleSize();
        this.placeTutorialBubbleNearTop(this._tutorialBubbleUt.node, vs, bubbleH);
        const half = bubbleH * 0.5;
        const topPad = 8;
        this._tutorialHintNode.setPosition(0, half - hintH * 0.5 - topPad, 0);
        const skipUi = this._tutorialSkipNode.getComponent(UITransform);
        const skipHalf = (skipUi?.height ?? 46) * 0.5;
        this._tutorialSkipNode.setPosition(0, -half + skipHalf + 10, 0);
    };

    /** Пузырь у верхнего края — не перекрывает центр с GameField. */
    private placeTutorialBubbleNearTop(bubbleNode: Node, vs: { width: number; height: number }, bubbleH: number) {
        const topMargin = Math.max(
            this.tutorialTopMarginMinPx,
            vs.height * Math.max(0.02, this.tutorialTopMarginMul),
        );
        const yCenter = vs.height * 0.5 - topMargin - bubbleH * 0.5;
        bubbleNode.setPosition(0, yCenter, 0);
    }

    private buildTutorialRootIfNeeded() {
        if (this._tutorialRoot?.isValid) {
            return;
        }

        const vs = view.getVisibleSize();

        const root = new Node('TutorialRoot');
        root.layer = this.node.layer;
        this.node.addChild(root);
        root.setSiblingIndex(this.node.children.length - 1);

        const ui = root.addComponent(UITransform);
        ui.setContentSize(vs.width, vs.height);
        const widget = root.addComponent(Widget);
        widget.isAlignTop = widget.isAlignBottom = widget.isAlignLeft = widget.isAlignRight = true;
        widget.top = widget.bottom = widget.left = widget.right = 0;
        widget.alignMode = Widget.AlignMode.ON_WINDOW_RESIZE;
        widget.updateAlignment();

        root.addComponent(UIOpacity).opacity = 255;

        const bubble = new Node('TutorialBubble');
        bubble.layer = root.layer;
        root.addChild(bubble);
        bubble.setSiblingIndex(900);
        const bUt = bubble.addComponent(UITransform);
        bUt.setContentSize(540, 130);
        this.placeTutorialBubbleNearTop(bubble, vs, 130);
        this._tutorialBubbleUt = bUt;

        const hl = new Node('Hint');
        hl.layer = bubble.layer;
        bubble.addChild(hl);
        const hlUt = hl.addComponent(UITransform);
        hlUt.setContentSize(520, 100);
        hl.setPosition(0, 14, 0);
        this._tutorialHintNode = hl;
        this._tutorialHintUt = hlUt;
        const hint = hl.addComponent(Label);
        hint.string = '';
        hint.fontSize = 20;
        hint.lineHeight = 26;
        hint.overflow = Label.Overflow.RESIZE_HEIGHT;
        hint.enableWrapText = true;
        hint.horizontalAlign = Label.HorizontalAlign.CENTER;
        hint.verticalAlign = Label.VerticalAlign.CENTER;
        hint.color = Color.WHITE;
        hint.enableOutline = true;
        hint.outlineColor = Color.BLACK;
        hint.outlineWidth = 2;
        this._hintLabel = hint;

        const skipN = new Node('ButtonSkip');
        skipN.layer = bubble.layer;
        bubble.addChild(skipN);
        this._tutorialSkipNode = skipN;
        const sUt = skipN.addComponent(UITransform);
        sUt.setContentSize(168, 46);
        skipN.setPosition(0, -48, 0);
        const btn = skipN.addComponent(Button);
        const sl = skipN.addComponent(Label);
        sl.string = 'Пропустить';
        sl.fontSize = 20;
        sl.horizontalAlign = Label.HorizontalAlign.CENTER;
        sl.verticalAlign = Label.VerticalAlign.CENTER;
        sl.color = new Color(220, 240, 255);
        sl.enableOutline = true;
        sl.outlineColor = Color.BLACK;
        sl.outlineWidth = 2;
        btn.node.on(Button.EventType.CLICK, () => this.skip(), this);

        this._tutorialRoot = root;
        this.layoutTutorialBubble();

        if (this._finger?.isValid && this._finger.parent !== root) {
            const world = this._finger.worldPosition.clone();
            this._finger.removeFromParent();
            root.addChild(this._finger);
            const pUt = root.getComponent(UITransform);
            if (pUt) {
                const local = pUt.convertToNodeSpaceAR(world);
                this._finger.setPosition(local.x, local.y, 0);
            }
        }
    }

    private showTutorialUi() {
        this.buildTutorialRootIfNeeded();
        if (this._tutorialRoot?.isValid) {
            this._tutorialRoot.active = true;
        }
        if (this._finger?.isValid) {
            this._finger.active = true;
        }
    }

    private hideTutorialUi() {
        this.stopPulse();
        this.stopFingerTween();
        if (this._finger?.isValid) {
            this._finger.active = false;
        }
        if (this._tutorialRoot?.isValid) {
            Tween.stopAllByTarget(this._tutorialRoot);
            this._tutorialRoot.active = false;
        }
    }

    public skip() {
        this.markTutorialCompleted();
        this._phase = TutorialPhase.Finished;
        this.hideTutorialUi();
    }

    private stopPulse() {
        if (this._pulseTarget?.isValid) {
            Tween.stopAllByTarget(this._pulseTarget);
            this._pulseTarget.setScale(1, 1, 1);
        }
        this._pulseTarget = null;
    }

    private startPulse(target: Node) {
        this._pulseTarget = target;
        const up = this.pulseScale;
        const half = Math.max(0.12, this.pulseHalf);
        const run = () => {
            if (!this._pulseTarget?.isValid || this._pulseTarget !== target) {
                return;
            }
            tween(target)
                .to(half, { scale: new Vec3(up, up, 1) })
                .to(half, { scale: new Vec3(1, 1, 1) })
                .call(run)
                .start();
        };
        run();
    }

    private stopFingerTween() {
        if (this._finger?.isValid) {
            Tween.stopAllByTarget(this._finger);
        }
    }

    private startFingerFloat() {
        if (!this._finger?.isValid) {
            return;
        }
        const base = this._finger.position.clone();
        tween(this._finger)
            .repeatForever(
                tween()
                    .to(0.35, { position: new Vec3(base.x, base.y + 8, base.z) })
                    .to(0.35, { position: base }),
            )
            .start();
    }

    private positionFingerOn(target: Node | null | undefined) {
        if (!this._finger?.isValid || !target?.isValid) {
            return;
        }
        const parent = this._finger.parent;
        const t = target.getComponent(UITransform);
        const pUt = parent?.getComponent(UITransform);
        if (!t || !pUt) {
            return;
        }
        const box = t.getBoundingBoxToWorld();
        const world = new Vec3(box.x + box.width * 0.5, box.y - 12, 0);
        const local = pUt.convertToNodeSpaceAR(world);
        this._finger.setPosition(local.x, local.y, 0);
        this._finger.setSiblingIndex(this._finger.parent!.children.length - 1);
    }
}
