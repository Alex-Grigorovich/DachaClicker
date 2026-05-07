import { _decorator, Button, Component, director, Node, tween, Tween, Vec3, UITransform, view } from 'cc';
import { ExclusiveUIPanelId, closeOtherExclusivePanels } from './ExclusiveUIPanels';
import { UpgradeListPanel } from './UpgradeListPanel';

const { ccclass, property } = _decorator;

/**
 * Кнопка ButtonsUpgrade / ButtonClose: открытие и закрытие UpgradeList
 * в том же стиле, что VegetableList (масштаб 0↔1, backOut / quadIn) и ButtonTasks
 * (клик по зоне кнопки, защита от двойного срабатывания за кадр).
 */
@ccclass('UpgradeListToggle')
export class UpgradeListToggle extends Component {
    @property({ type: Node, tooltip: 'Корень поиска нод (пусто — вся сцена).' })
    searchRoot: Node | null = null;

    @property({ type: Node, tooltip: 'Кнопка (например ButtonsUpgrade). Пусто — ищем по имени в сцене.' })
    trigger: Node | null = null;

    @property({ type: Node, tooltip: 'Панель UpgradeList. Пусто — ищем по имени в сцене.' })
    upgradeList: Node | null = null;

    @property({ type: Node, tooltip: 'Кнопка закрытия внутри UpgradeList. Пусто — ищем ButtonClose под панелью.' })
    closeButton: Node | null = null;

    @property({ tooltip: 'Анимация открытия/закрытия, как у VegetableList' })
    useAnimation: boolean = true;

    @property({ tooltip: 'Длительность открытия (с), как SlotMenuHandler → VegetableList' })
    openDuration: number = 0.25;

    @property({ tooltip: 'Длительность закрытия (с)' })
    closeDuration: number = 0.18;

    /** Подписка на все cc.Button под ButtonsUpgrade, чтобы клик по детям (иконка) срабатывал. */
    private _triggerClickButtons: Button[] = [];
    private _closeBtn: Button | null = null;
    private _closeNode: Node | null = null;
    private _animating = false;
    private _inputWired = false;
    private _closeWired = false;
    /** Как в TasksPanelToggle — и CLICK, и TOUCH/MOUSE в один кадр. */
    private _toggleFrameLock = false;

    onLoad() {
        this.resolveNodes();
        if (this.upgradeList?.isValid && !this.upgradeList.getComponent(UpgradeListPanel)) {
            this.upgradeList.addComponent(UpgradeListPanel);
        }
    }

    start() {
        this.wireOpenTrigger();
        this.bindClose();
    }

    onEnable() {
        this.wireOpenTrigger();
        this.bindClose();
    }

    onDisable() {
        this.unwireOpenTrigger();
        this.unbindCloseOnly();
    }

    onDestroy() {
        this.unwireOpenTrigger();
        this.unbindCloseOnly();
        if (this.upgradeList?.isValid) {
            Tween.stopAllByTarget(this.upgradeList);
        }
    }

    private resolveNodes() {
        const scene = director.getScene();
        const searchBase = this.searchRoot?.isValid ? this.searchRoot : scene;
        if (!this.trigger?.isValid) {
            this.trigger = searchBase ? this.findDeep(searchBase, 'ButtonsUpgrade') : null;
        }
        if (!this.upgradeList?.isValid) {
            this.upgradeList = searchBase ? this.findDeep(searchBase, 'UpgradeList') : null;
        }
        if (!this.trigger) {
            console.warn('[UpgradeListToggle] Нода ButtonsUpgrade не найдена');
        }
        if (!this.upgradeList) {
            console.warn('[UpgradeListToggle] Нода UpgradeList не найдена');
        }
    }

    private findDeep(root: Node, name: string): Node | null {
        if (root.name === name) {
            return root;
        }
        for (const c of root.children) {
            const f = this.findDeep(c, name);
            if (f) {
                return f;
            }
        }
        return null;
    }

    private collectButtonsUnder(root: Node): Button[] {
        const out: Button[] = [];
        const walk = (n: Node) => {
            const b = n.getComponent(Button);
            if (b) {
                out.push(b);
            }
            for (const c of n.children) {
                walk(c);
            }
        };
        walk(root);
        return out;
    }

    private findDeepUnder(root: Node, name: string): Node | null {
        if (root.name === name) {
            return root;
        }
        for (const c of root.children) {
            const f = this.findDeepUnder(c, name);
            if (f) {
                return f;
            }
        }
        return null;
    }

    private wireOpenTrigger() {
        if (this._inputWired) {
            return;
        }
        if (!this.trigger?.isValid) {
            this.resolveNodes();
        }
        const node = this.trigger;
        if (!node?.isValid) {
            return;
        }

        // Все cc.Button под зоной (часто на дочерней плашке); обход с корня — без двусмысленности API
        const buttons = this.collectButtonsUnder(node);
        if (buttons.length === 0) {
            const btn = node.addComponent(Button);
            btn.transition = Button.Transition.NONE;
            btn.zoomScale = 1;
            buttons.push(btn);
        }

        for (const b of buttons) {
            b.node.on(Button.EventType.CLICK, this.onToggleOpen, this);
            this._triggerClickButtons.push(b);
        }

        // Важно: не вешать ещё и TOUCH_END на предка — сработает вместе с CLICK = двойной toggle (панель «не открывается»)
        this._inputWired = true;
    }

    private unwireOpenTrigger() {
        if (!this._inputWired) {
            return;
        }
        for (const b of this._triggerClickButtons) {
            if (b?.isValid) {
                b.node.off(Button.EventType.CLICK, this.onToggleOpen, this);
            }
        }
        this._triggerClickButtons = [];
        this._inputWired = false;
    }

    private bindClose() {
        if (this._closeWired) {
            return;
        }
        if (!this.upgradeList?.isValid) {
            this.resolveNodes();
        }
        const list = this.upgradeList;
        if (!list?.isValid) {
            return;
        }
        const closeNode = this.closeButton?.isValid
            ? this.closeButton
            : this.findDeepUnder(list, 'ButtonClose');
        if (!closeNode) {
            console.warn('[UpgradeListToggle] ButtonClose внутри UpgradeList не найден');
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

    private unbindCloseOnly() {
        if (!this._closeWired) {
            return;
        }
        if (this._closeBtn?.isValid) {
            this._closeBtn.node.off(Button.EventType.CLICK, this.onCloseOnly, this);
        }
        this._closeBtn = null;
        if (this._closeNode?.isValid) {
            this._closeNode.off(Node.EventType.TOUCH_END, this.onCloseOnly, this);
            this._closeNode.off(Node.EventType.MOUSE_UP, this.onCloseOnly, this);
        }
        this._closeNode = null;
        this._closeWired = false;
    }

    private onToggleOpen = () => {
        if (this._toggleFrameLock) {
            return;
        }
        this._toggleFrameLock = true;
        this.scheduleOnce(() => {
            this._toggleFrameLock = false;
        }, 0);

        if (!this.upgradeList?.isValid) {
            this.resolveNodes();
        }
        const list = this.upgradeList;
        if (!list) {
            return;
        }
        if (!list.active) {
            this._animating = false;
        }
        if (this._animating) {
            return;
        }
        if (list.active) {
            this.closePanel();
        } else {
            closeOtherExclusivePanels(ExclusiveUIPanelId.UpgradeList);
            this.openPanel();
        }
    };

    private onCloseOnly = () => {
        if (this._toggleFrameLock) {
            return;
        }
        this._toggleFrameLock = true;
        this.scheduleOnce(() => {
            this._toggleFrameLock = false;
        }, 0);
        if (this._animating) {
            return;
        }
        if (this.upgradeList?.active) {
            this.closePanel();
        }
    };

    private openPanel() {
        const root = this.upgradeList!;
        if (!root.active) {
            this._animating = false;
        }
        if (this._animating) {
            return;
        }
        const endScale = this.fitPanelToScreenWidth(root);
        if (!this.useAnimation) {
            root.active = true;
            root.setScale(endScale, endScale, 1);
            return;
        }
        this._animating = true;
        Tween.stopAllByTarget(root);
        const endV = new Vec3(endScale, endScale, 1);

        root.active = true;
        root.setScale(0, 0, 0);
        const dur = Math.max(0.05, this.openDuration);
        tween(root)
            .to(dur, { scale: endV }, { easing: 'backOut' })
            .call(() => {
                this._animating = false;
            })
            .start();
    }

    private closePanel() {
        const root = this.upgradeList!;
        if (this._animating) {
            return;
        }
        if (!root.active) {
            return;
        }
        if (!this.useAnimation) {
            root.active = false;
            root.setScale(1, 1, 1);
            return;
        }
        this._animating = true;
        Tween.stopAllByTarget(root);
        const dur = Math.max(0.05, this.closeDuration);
        tween(root)
            .to(dur, { scale: new Vec3(0, 0, 0) }, { easing: 'quadIn' })
            .call(() => {
                root.active = false;
                root.setScale(1, 1, 1);
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
