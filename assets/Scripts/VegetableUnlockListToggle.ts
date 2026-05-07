import { _decorator, Button, Component, Node, Tween, tween, Vec3, director, UITransform, view } from 'cc';
import { ExclusiveUIPanelId, closeOtherExclusivePanels } from './ExclusiveUIPanels';
import { VegetableMenuHandler } from './VegetableMenuHandler';

const { ccclass, property } = _decorator;

@ccclass('VegetableUnlockListToggle')
export class VegetableUnlockListToggle extends Component {
    @property({ type: Node, tooltip: 'Кнопка открытия (ButtonsVegetables). Пусто — ищем по имени.' })
    trigger: Node | null = null;

    @property({ type: Node, tooltip: 'Панель разблокировок (VegetableListUnlocked). Пусто — ищем по имени.' })
    unlockList: Node | null = null;

    @property({ type: Node, tooltip: 'Кнопка закрытия внутри VegetableListUnlocked (ButtonClose).' })
    closeButton: Node | null = null;

    @property({ tooltip: 'Анимация открытия/закрытия' })
    useAnimation = true;

    @property({ tooltip: 'Длительность открытия (сек)' })
    openDuration = 0.25;

    @property({ tooltip: 'Длительность закрытия (сек)' })
    closeDuration = 0.18;

    private _animating = false;
    private _toggleFrameLock = false;
    private _triggerButtons: Button[] = [];
    private _closeBtn: Button | null = null;
    private _closeNode: Node | null = null;
    private _wired = false;
    private _closeWired = false;

    onLoad() {
        this.resolveNodes();
    }

    start() {
        this.wireTrigger();
        this.wireClose();
        this.preInitUnlockPanel();
    }

    /** Запускаем инициализацию VegetableMenuHandler на (возможно неактивной) панели заранее. */
    private preInitUnlockPanel() {
        if (!this.unlockList?.isValid) {
            this.resolveNodes();
        }
        const panel = this.unlockList;
        if (!panel?.isValid) {
            return;
        }
        const handler = this.ensureUnlockMenuHandler(panel);
        if (handler) {
            handler.preInit();
        }
    }

    /**
     * Если VegetableMenuHandler случайно не висит на VegetableListUnlocked,
     * добавляем его автоматически и копируем критичные ссылки с основного VegetableList.
     */
    private ensureUnlockMenuHandler(panel: Node): VegetableMenuHandler | null {
        let handler = panel.getComponent(VegetableMenuHandler);
        if (handler) {
            return handler;
        }

        handler = panel.addComponent(VegetableMenuHandler);
        const scene = director.getScene();
        const sourceNode = scene ? this.findDeep(scene, 'VegetableList') : null;
        const sourceHandler = sourceNode?.getComponent(VegetableMenuHandler) ?? null;
        if (sourceHandler) {
            handler.carrotPrefab = sourceHandler.carrotPrefab;
            handler.cabbagePrefab = sourceHandler.cabbagePrefab;
            handler.tomatoPrefab = sourceHandler.tomatoPrefab;
            handler.chiliPrefab = sourceHandler.chiliPrefab;
            handler.balanceResourcePath = sourceHandler.balanceResourcePath;
        }
        handler.closeButton = this.closeButton?.isValid
            ? this.closeButton.getComponent(Button)
            : null;
        handler.allowPlacement = false;
        handler.allowUnlocking = true;
        console.warn(
            '[VegetableUnlockListToggle] На VegetableListUnlocked отсутствовал VegetableMenuHandler — добавлен автоматически.',
        );
        return handler;
    }

    onEnable() {
        this.wireTrigger();
        this.wireClose();
    }

    onDisable() {
        this.unwireTrigger();
        this.unwireClose();
    }

    onDestroy() {
        this.unwireTrigger();
        this.unwireClose();
        if (this.unlockList?.isValid) {
            Tween.stopAllByTarget(this.unlockList);
        }
    }

    private resolveNodes() {
        const scene = director.getScene();
        if (!this.trigger?.isValid) {
            this.trigger = scene ? this.findDeep(scene, 'ButtonsVegetables') : null;
        }
        if (!this.unlockList?.isValid) {
            this.unlockList = scene ? this.findDeep(scene, 'VegetableListUnlocked') : null;
        }
    }

    private findDeep(root: Node, name: string): Node | null {
        if (root.name === name) {
            return root;
        }
        for (const c of root.children) {
            const found = this.findDeep(c, name);
            if (found) {
                return found;
            }
        }
        return null;
    }

    private collectButtons(root: Node): Button[] {
        const out: Button[] = [];
        const stack: Node[] = [root];
        while (stack.length) {
            const n = stack.pop()!;
            const b = n.getComponent(Button);
            if (b) {
                out.push(b);
            }
            stack.push(...n.children);
        }
        return out;
    }

    private wireTrigger() {
        if (this._wired) {
            return;
        }
        if (!this.trigger?.isValid) {
            this.resolveNodes();
        }
        const trigger = this.trigger;
        if (!trigger?.isValid) {
            return;
        }
        const buttons = this.collectButtons(trigger);
        if (buttons.length === 0) {
            const b = trigger.addComponent(Button);
            b.transition = Button.Transition.NONE;
            b.zoomScale = 1;
            buttons.push(b);
        }
        for (const b of buttons) {
            b.node.off(Button.EventType.CLICK, this.onOpenTriggerClick, this);
            b.node.on(Button.EventType.CLICK, this.onOpenTriggerClick, this);
            this._triggerButtons.push(b);
        }
        this._wired = true;
    }

    private unwireTrigger() {
        if (!this._wired) {
            return;
        }
        for (const b of this._triggerButtons) {
            if (b?.isValid) {
                b.node.off(Button.EventType.CLICK, this.onOpenTriggerClick, this);
            }
        }
        this._triggerButtons = [];
        this._wired = false;
    }

    private wireClose() {
        if (this._closeWired) {
            return;
        }
        if (!this.unlockList?.isValid) {
            this.resolveNodes();
        }
        const panel = this.unlockList;
        if (!panel?.isValid) {
            return;
        }
        const closeNode = this.closeButton?.isValid ? this.closeButton : this.findDeep(panel, 'ButtonClose');
        if (!closeNode) {
            return;
        }
        this._closeNode = closeNode;
        let btn = closeNode.getComponent(Button);
        if (!btn) {
            btn = closeNode.addComponent(Button);
            btn.transition = Button.Transition.NONE;
            btn.zoomScale = 1;
        }
        this._closeBtn = btn;
        btn.node.on(Button.EventType.CLICK, this.onCloseOnly, this);
        closeNode.on(Node.EventType.TOUCH_END, this.onCloseOnly, this);
        closeNode.on(Node.EventType.MOUSE_UP, this.onCloseOnly, this);
        this._closeWired = true;
    }

    private unwireClose() {
        if (!this._closeWired) {
            return;
        }
        if (this._closeBtn?.isValid) {
            this._closeBtn.node.off(Button.EventType.CLICK, this.onCloseOnly, this);
        }
        if (this._closeNode?.isValid) {
            this._closeNode.off(Node.EventType.TOUCH_END, this.onCloseOnly, this);
            this._closeNode.off(Node.EventType.MOUSE_UP, this.onCloseOnly, this);
        }
        this._closeBtn = null;
        this._closeNode = null;
        this._closeWired = false;
    }

    /**
     * Кнопка ButtonsVegetables только открывает панель при каждом клике.
     * Закрытие — только через ButtonClose (иначе второй клик воспринимался как «не открывается»).
     */
    private onOpenTriggerClick = () => {
        if (this._toggleFrameLock) {
            return;
        }
        this._toggleFrameLock = true;
        this.scheduleOnce(() => {
            this._toggleFrameLock = false;
        }, 0);

        if (!this.unlockList?.isValid) {
            this.resolveNodes();
        }
        const panel = this.unlockList;
        if (!panel?.isValid) {
            return;
        }
        closeOtherExclusivePanels(ExclusiveUIPanelId.VegetableListUnlocked);
        this.openPanel();
    };

    private onCloseOnly = () => {
        if (this._toggleFrameLock) {
            return;
        }
        this._toggleFrameLock = true;
        this.scheduleOnce(() => {
            this._toggleFrameLock = false;
        }, 0);
        if (this.unlockList?.active) {
            this.closePanel();
        }
    };

    private openPanel() {
        const panel = this.unlockList!;
        if (!panel.active) {
            this._animating = false;
        }
        const endScale = this.fitPanelToScreenWidth(panel);
        if (!this.useAnimation) {
            panel.active = true;
            panel.setScale(endScale, endScale, 1);
            this.afterUnlockPanelOpen();
            return;
        }

        this._animating = true;
        Tween.stopAllByTarget(panel);
        panel.active = true;
        panel.setScale(0, 0, 0);
        const endV = new Vec3(endScale, endScale, 1);

        tween(panel)
            .to(Math.max(0.05, this.openDuration), { scale: endV }, { easing: 'backOut' })
            .call(() => {
                this._animating = false;
                this.afterUnlockPanelOpen();
            })
            .start();
    }

    /** После показа — актуализировать строки (баланс уже грузится в onLoad у VegetableMenuHandler). */
    private afterUnlockPanelOpen() {
        const panel = this.unlockList;
        if (!panel?.isValid) {
            return;
        }
        const handler = this.ensureUnlockMenuHandler(panel);
        if (!handler) {
            console.warn('[VegetableUnlockListToggle] На VegetableListUnlocked нет VegetableMenuHandler');
            return;
        }
        if (handler.isBalanceReady()) {
            handler.syncUnlockUiFromManager();
        } else {
            // Баланс ещё грузится — ждём одного кадра и повторяем
            this.scheduleOnce(() => this.afterUnlockPanelOpen(), 0.05);
        }
    }

    private closePanel() {
        const panel = this.unlockList!;
        if (!panel.active || this._animating) {
            return;
        }
        if (!this.useAnimation) {
            panel.active = false;
            panel.setScale(1, 1, 1);
            return;
        }
        this._animating = true;
        Tween.stopAllByTarget(panel);
        tween(panel)
            .to(Math.max(0.05, this.closeDuration), { scale: new Vec3(0, 0, 0) }, { easing: 'quadIn' })
            .call(() => {
                panel.active = false;
                panel.setScale(1, 1, 1);
                this._animating = false;
            })
            .start();
    }

    private fitPanelToScreenWidth(panel: Node): number {
        const ui = panel.getComponent(UITransform);
        if (!ui) {
            return 1;
        }
        const visible = view.getVisibleSize();
        if (visible.width <= 0) {
            return 1;
        }
        const parentScaleX = this.getCumulativeParentScaleX(panel);
        const baseWidth = ui.contentSize.width * parentScaleX;
        if (baseWidth <= 0) {
            return 1;
        }
        const targetMaxWidth = visible.width * 0.9;
        const fit = Math.min(1, targetMaxWidth / baseWidth);
        return Math.max(0.35, fit);
    }

    private getCumulativeParentScaleX(node: Node): number {
        let s = 1;
        let p: Node | null = node.parent;
        while (p) {
            s *= Math.abs(p.scale.x);
            p = p.parent;
        }
        return s;
    }
}
