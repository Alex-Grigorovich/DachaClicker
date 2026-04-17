import { _decorator, Component, Node, Button, tween, Vec3, find } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('SlotMenuHandler')
export class SlotMenuHandler extends Component {

    @property({ type: Node, tooltip: 'Ссылка на VegetableList (оставь пустым — найдётся автоматически)' })
    menuPanel: Node = null;

    @property({ tooltip: 'Использовать анимацию открытия/закрытия' })
    useAnimation: boolean = true;

    // Путь к меню
    private readonly MENU_PATH = 'Canvas/UI/VegetableList';

    // Полный путь к кнопке закрытия (от VegetableList)
    private readonly CLOSE_BUTTON_PATH = 'ButtonClose/ButtonClose';   // ← самое важное изменение

    private _isOpen: boolean = false;
    private _clickHandlerAdded: boolean = false;

    private _closeButton: Node | null = null;

    onLoad() {
        // Автопоиск меню
        if (!this.menuPanel) {
            this.menuPanel = find(this.MENU_PATH);
            if (this.menuPanel) {
                console.log(`[SlotMenuHandler] ✅ VegetableList найден: ${this.MENU_PATH}`);
            } else {
                console.warn(`[SlotMenuHandler] ⚠️ VegetableList не найден по пути ${this.MENU_PATH}`);
            }
        }

        this.findCloseButton();
    }

    private findCloseButton() {
        if (!this.menuPanel) return;

        // Ищем по относительному пути внутри меню
        this._closeButton = find(this.CLOSE_BUTTON_PATH, this.menuPanel);

        if (this._closeButton) {
            console.log(`[SlotMenuHandler] ✅ Кнопка закрытия найдена по пути: ${this.CLOSE_BUTTON_PATH}`);
        } else {
            console.error(`[SlotMenuHandler] ❌ Кнопка закрытия не найдена! Проверь путь "${this.CLOSE_BUTTON_PATH}"`);
            // Альтернативный поиск по имени во всём меню (на случай, если структура другая)
            this._closeButton = this.menuPanel.getChildByPath(this.CLOSE_BUTTON_PATH);
        }
    }

    onEnable() {
        this.setupClickHandler();
        this.setupCloseButton();
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

    private setupCloseButton() {
        if (!this._closeButton) {
            this.findCloseButton();
        }

        if (this._closeButton) {
            this._closeButton.off(Button.EventType.CLICK, this.closeMenu, this);
            this._closeButton.on(Button.EventType.CLICK, this.closeMenu, this);
            console.log(`[SlotMenuHandler] ✅ Обработчик на кнопку закрытия установлен`);
        }
    }

    public openMenu = () => {
        if (!this.menuPanel) {
            this.menuPanel = find(this.MENU_PATH);
            if (this.menuPanel) this.findCloseButton();
        }

        if (!this.menuPanel) {
            console.error(`[SlotMenuHandler] ❌ VegetableList не найден!`);
            return;
        }

        // ←←← НОВОЕ: передаём текущий Cell в меню
        const menuHandler = this.menuPanel.getComponent('VegetableMenuHandler') as VegetableMenuHandler;
        if (menuHandler && menuHandler.setTargetCell) {
            menuHandler.setTargetCell(this.node);   // this.node = текущий Cell1
        }

        if (this._isOpen) return;

        this._isOpen = true;
        this.menuPanel.active = true;

        console.log(`[SlotMenuHandler] 🚀 Открыто меню для: ${this.node.name}`);

        if (this.useAnimation) {
            this.menuPanel.scale = new Vec3(0, 0, 0);
            tween(this.menuPanel)
                .to(0.25, { scale: new Vec3(1, 1, 1) }, { easing: 'backOut' })
                .start();
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

    onDestroy() {
        this.node.off(Button.EventType.CLICK, this.openMenu, this);

        if (this._closeButton) {
            this._closeButton.off(Button.EventType.CLICK, this.closeMenu, this);
        }
    }
}