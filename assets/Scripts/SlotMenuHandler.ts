import { _decorator, Component, Node, Button, tween, Vec3, director } from 'cc';
import { VegetableMenuHandler } from './VegetableMenuHandler';
import { PlantFieldState } from './PlantFieldState';
import { AdaptiveScale } from './ResolutionAdapter';

const { ccclass, property } = _decorator;
@ccclass('SlotMenuHandler')
export class SlotMenuHandler extends Component {
    @property({ type: Node, tooltip: 'Ссылка на VegetableList (оставь пустым — найдётся автоматически)' })
    menuPanel: Node = null;
    @property({ tooltip: 'Использовать анимацию открытия/закрытия' })
    useAnimation: boolean = true;
    /** Совпадает с VegetableMenuHandler: куда кладётся префаб овоща. */
    private readonly CONTENT_NAME = 'Content';
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
        if (this.cellHasPlacedFood()) {
            return;
        }
        const menuHandler = this.resolveMenuHandler();
        if (!menuHandler) {
            console.error(`[SlotMenuHandler] ❌ VegetableList не найден!`);
            return;
        }
        this.menuPanel = menuHandler.node;
        menuHandler.setTargetCell(this.node);
        if (this._isOpen) return;
        this._isOpen = true;
        this.menuPanel.active = true;
        const adapter = director.getScene()?.getComponentInChildren(AdaptiveScale);
        const endScale = adapter ? adapter.fitVegetableList(false) : 1;
        const endV = new Vec3(endScale, endScale, 1);
        console.log(`[SlotMenuHandler] 🚀 Открыто меню для: ${this.node.name}`);
        if (this.useAnimation) {
            this.menuPanel.scale = new Vec3(0, 0, 0);
            tween(this.menuPanel).to(0.25, { scale: endV }, { easing: 'backOut' }).start();
        } else if (adapter) {
            adapter.fitVegetableList(true);
        } else {
            this.menuPanel.setScale(1, 1, 1);
        }
    };

    public closeMenu = () => {
        if (!this._isOpen || !this.menuPanel) return;
        this._isOpen = false;
        console.log('[SlotMenuHandler] 🔒 Закрываем VegetableList');
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

    private cellHasPlacedFood(): boolean {
        return PlantFieldState.getInstance().isOccupied(this.node, this.CONTENT_NAME);
    }

    /** Меню скрыто внешним обработчиком (выбор еды или кнопка закрытия) — сбрасываем флаг. */
    public notifyMenuClosed() {
        this._isOpen = false;
    }

    /** Backward compatibility для уже существующих вызовов из меню. */
    public notifyMenuClosedByPick() {
        this.notifyMenuClosed();
    }

    private resolveMenuHandler(): VegetableMenuHandler | null {
        if (this.menuPanel?.isValid) {
            const existing = this.menuPanel.getComponent(VegetableMenuHandler);
            if (existing) {
                return existing;
            }
        }

        const scene = director.getScene();
        if (!scene) {
            return null;
        }

        const found = scene.getComponentInChildren(VegetableMenuHandler);
        if (found) {
            this.menuPanel = found.node;
            console.log('[SlotMenuHandler] ✅ VegetableList найден через VegetableMenuHandler');
        } else {
            console.warn('[SlotMenuHandler] ⚠️ VegetableMenuHandler не найден в сцене');
        }
        return found;
    }

    private resolveMenuPanel(): Node | null {
        return this.resolveMenuHandler()?.node ?? null;
    }

    onDestroy() {
        this.node.off(Button.EventType.CLICK, this.openMenu, this);
    }
}
