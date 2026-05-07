import { _decorator, Color, Component, Node, Button, director, Graphics, tween, UIOpacity, UITransform, Vec3, view } from 'cc';
import { ExclusiveUIPanelId, closeOtherExclusivePanels } from './ExclusiveUIPanels';
import { VegetableMenuHandler } from './VegetableMenuHandler';
import { VegClickMoney } from './VegClickMoney';
import { dlog } from './Debug';

const { ccclass, property } = _decorator;
@ccclass('SlotMenuHandler')
export class SlotMenuHandler extends Component {
    @property({ type: Node, tooltip: 'Ссылка на VegetableList (оставь пустым — найдётся автоматически)' })
    menuPanel: Node = null;

    @property({ tooltip: 'Имя ноды меню выставления культур' })
    menuNodeName: string = 'VegetableList';

    @property({ tooltip: 'Использовать анимацию открытия/закрытия' })
    useAnimation: boolean = true;
    private _isOpen: boolean = false;
    private _clickHandlerAdded: boolean = false;
    onLoad() {
        this.resolveMenuPanel();
    }

    onEnable() {
        this.setupClickHandler();
    }

    private setupClickHandler() {
        if (this._clickHandlerAdded) return;
        const button = this.node.getComponent(Button);
        if (button) {
            button.node.on(Button.EventType.CLICK, this.openMenu, this);
        } else {
            console.warn(`[SlotMenuHandler] Нет Button на ноде ${this.node.name}`);
        }
        this._clickHandlerAdded = true;
    }

    public openMenu = () => {
        /** Клик по Cell с посаженным префабом: урожай через VegClickMoney (иначе открывается меню посадки). */
        const clicker = this.node.getComponentInChildren(VegClickMoney);
        if (clicker?.tryHarvestFromCellButton()) {
            return;
        }
        this.playClickRipple();

        closeOtherExclusivePanels(ExclusiveUIPanelId.VegetableList);
        const menuHandler = this.resolveMenuHandler();
        if (!menuHandler) {
            console.error(`[SlotMenuHandler] ❌ VegetableList не найден!`);
            return;
        }
        this.menuPanel = menuHandler.node;
        menuHandler.setTargetCell(this.node);

        const endScale = this.fitPanelToScreenWidth(this.menuPanel);
        const endV = new Vec3(endScale, endScale, 1);

        /* Уже открыто — меняем только целевой слот и подгоняем масштаб (повторный клик по другому Cell или после странных состояний). */
        if (this.menuPanel.active) {
            this.menuPanel.setScale(endScale, endScale, 1);
            this._isOpen = true;
            dlog(`[SlotMenuHandler] Цель слота обновлена: ${this.node.name}`);
            return;
        }

        this._isOpen = true;
        this.menuPanel.active = true;
        dlog(`[SlotMenuHandler] 🚀 Открыто меню для: ${this.node.name}`);
        if (this.useAnimation) {
            this.menuPanel.scale = new Vec3(0, 0, 0);
            tween(this.menuPanel).to(0.25, { scale: endV }, { easing: 'backOut' }).start();
        } else {
            this.menuPanel.setScale(endScale, endScale, 1);
        }
    };

    public closeMenu = () => {
        if (!this._isOpen || !this.menuPanel) return;
        this._isOpen = false;
        dlog('[SlotMenuHandler] 🔒 Закрываем VegetableList');
        if (this.useAnimation) {
            tween(this.menuPanel)
                .to(0.18, { scale: new Vec3(0, 0, 0) }, { easing: 'quadIn' })
                .call(() => {
                    if (this.menuPanel) this.menuPanel.active = false;
                })
                .start();
        } else {
            this.menuPanel.active = false;
        }
    };

    /** Меню скрыто внешним обработчиком (выбор еды или кнопка закрытия) — сбрасываем флаг. */
    public notifyMenuClosed() {
        this._isOpen = false;
    }

    /** Backward compatibility для уже существующих вызовов из меню. */
    public notifyMenuClosedByPick() {
        this.notifyMenuClosed();
    }

    private resolveMenuHandler(): VegetableMenuHandler | null {
        const requestedMenuName = this.getRequestedMenuName();
        const scene = director.getScene();

        /** Только меню посадки в слот — не VegetableListUnlocked. */
        const isPlacementCandidate = (h: VegetableMenuHandler | null): h is VegetableMenuHandler =>
            !!(
                h?.node?.isValid &&
                h.node.name !== 'VegetableListUnlocked' &&
                h.allowPlacement !== false
            );

        if (scene) {
            const byName = this.findNodeDeep(scene, requestedMenuName);
            if (byName?.isValid) {
                const byNameHandler = byName.getComponent(VegetableMenuHandler);
                if (byNameHandler && isPlacementCandidate(byNameHandler)) {
                    this.menuPanel = byNameHandler.node;
                    dlog(`[SlotMenuHandler] ✅ ${requestedMenuName} найден по имени`);
                    return byNameHandler;
                }
                if (byNameHandler && !isPlacementCandidate(byNameHandler)) {
                    console.warn(
                        `[SlotMenuHandler] Нода "${requestedMenuName}" найдена, но это не меню посадки — проверь компонент и имя VegetableListUnlocked.`,
                    );
                }
            }
        }

        if (this.menuPanel?.isValid) {
            const existing = this.menuPanel.getComponent(VegetableMenuHandler);
            if (existing && this.menuPanel.name === requestedMenuName && isPlacementCandidate(existing)) {
                return existing;
            }
        }

        if (!scene) {
            return null;
        }

        const handlers = scene.getComponentsInChildren(VegetableMenuHandler);

        const found =
            handlers.find(h => h.node?.isValid && h.node.name === requestedMenuName && isPlacementCandidate(h)) ??
            handlers.find(h => isPlacementCandidate(h));
        if (!found) {
            console.warn(
                `[SlotMenuHandler] ⚠️ Нет подходящего VegetableMenuHandler для слотов (ожидали ноду "${requestedMenuName}", без VegetableListUnlocked).`,
            );
            return null;
        }
        this.menuPanel = found.node;
        dlog(`[SlotMenuHandler] ✅ ${found.node.name} найден через VegetableMenuHandler`);
        return found;
    }

    private resolveMenuPanel(): Node | null {
        return this.resolveMenuHandler()?.node ?? null;
    }

    private findNodeDeep(root: Node, name: string): Node | null {
        if (root.name === name) {
            return root;
        }
        for (const child of root.children) {
            const found = this.findNodeDeep(child, name);
            if (found) {
                return found;
            }
        }
        return null;
    }

    private getRequestedMenuName(): string {
        const raw = `${this.menuNodeName ?? ''}`.trim();
        return raw || 'VegetableList';
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

    onDestroy() {
        this.node.off(Button.EventType.CLICK, this.openMenu, this);
    }

    private playClickRipple() {
        const ui = this.node.getComponent(UITransform);
        if (!ui) {
            return;
        }
        const ripple = new Node('SlotRipple');
        ripple.layer = this.node.layer;
        this.node.addChild(ripple);
        ripple.setSiblingIndex(this.node.children.length - 1);
        ripple.setPosition(0, 0, 0);

        const rUi = ripple.addComponent(UITransform);
        const size = Math.max(20, Math.min(ui.contentSize.width, ui.contentSize.height) * 0.45);
        rUi.setContentSize(size, size);
        const op = ripple.addComponent(UIOpacity);
        op.opacity = 220;
        const g = ripple.addComponent(Graphics);
        g.fillColor = new Color(255, 255, 255, 80);
        g.circle(0, 0, size * 0.5);
        g.fill();

        tween(ripple)
            .parallel(
                tween(ripple).to(0.3, { scale: new Vec3(2, 2, 1) }, { easing: 'quadOut' }),
                tween(op).to(0.3, { opacity: 0 }, { easing: 'quadIn' }),
            )
            .call(() => {
                if (ripple.isValid) {
                    ripple.destroy();
                }
            })
            .start();
    }
}
