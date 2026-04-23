import { _decorator, Component, Node, Button, Prefab, instantiate, Label, director } from 'cc';
import { MoneyManager } from './MoneyManager';
import { SlotMenuHandler } from './SlotMenuHandler';

const { ccclass, property } = _decorator;

const MENU_ITEMS = [
    { key: 'carrot', rowName: 'CellListCarrot' },
    { key: 'cabbage', rowName: 'CellListCabbage', blockName: 'cellListBlockCabbage' },
    { key: 'tomato', rowName: 'CellListTomato', blockName: 'cellListBlockTomato' },
    { key: 'chili', rowName: 'CellListChiliPepper', blockName: 'cellListBlockChiliPepper' },
] as const;

type MenuItemKey = typeof MENU_ITEMS[number]['key'];

@ccclass('VegetableMenuHandler')
export class VegetableMenuHandler extends Component {

    @property({ type: Prefab, tooltip: 'Префаб для Капусты' })
    cabbagePrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: 'Префаб для Моркови' })
    carrotPrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: 'Префаб для Помидоров' })
    tomatoPrefab: Prefab | null = null;

    @property({ type: Prefab, tooltip: 'Префаб для Острого перца' })
    chiliPrefab: Prefab | null = null;

    private targetCell: Node | null = null;
    private readonly CONTENT_NAME = 'Content';

    /** Защита от двойного срабатывания TOUCH_END + MOUSE_UP по одному пункту. */
    private _lastPickKey: MenuItemKey | '' = '';
    private _lastPickAt = 0;

    start() {
        this.wireMenuRows();
    }

    private wireMenuRows() {
        for (const item of MENU_ITEMS) {
            const row = this.findNodeDeep(this.node, item.rowName);
            if (!row) {
                console.warn(`[VegetableMenuHandler] Нода ${item.rowName} не найдена`);
                continue;
            }

            const menuButton = row.getComponent(Button) ?? row.getComponentInChildren(Button);
            if (!menuButton) {
                console.warn(`[VegetableMenuHandler] Нет Button в ${item.rowName}`);
                continue;
            }

            // Клик попадает в дочерний cellList (спрайт/лейбл), а не в ноду с Button — слушаем hit-ноду.
            const hitNode = row.getChildByName('cellList') ?? row;
            const onPick = () => this.tryPickMenuItem(item.key, menuButton);
            hitNode.on(Node.EventType.TOUCH_END, onPick, this);
            hitNode.on(Node.EventType.MOUSE_UP, onPick, this);

            const blockName = 'blockName' in item ? item.blockName : undefined;
            if (!blockName) {
                menuButton.interactable = true;
                continue;
            }

            const block = this.findNodeDeep(this.node, blockName);
            const priceLabel = block?.getComponentInChildren(Label) ?? null;
            if (!block || !priceLabel) {
                console.warn(`[VegetableMenuHandler] Не удалось настроить блокировку для ${item.rowName}`);
                continue;
            }

            menuButton.interactable = !block.active;
            const blockBtn = this.ensureBlockButton(block);
            blockBtn.interactable = block.active;
            blockBtn.node.on(
                Button.EventType.CLICK,
                () => this.onBlockButtonClicked(block, menuButton, priceLabel, item.key, blockBtn),
                this,
            );
        }
    }

    private tryPickMenuItem(key: MenuItemKey, menuButton: Button) {
        if (!menuButton.interactable) {
            return;
        }
        const now = Date.now();
        if (key === this._lastPickKey && now - this._lastPickAt < 250) {
            return;
        }
        this._lastPickKey = key;
        this._lastPickAt = now;
        this.onItemClicked(key);
    }

    private ensureBlockButton(block: Node): Button {
        let btn = block.getComponent(Button);
        if (!btn) {
            btn = block.addComponent(Button);
            btn.transition = Button.Transition.NONE;
            btn.zoomScale = 1;
        }
        return btn;
    }

    private onBlockButtonClicked(
        block: Node,
        menuButton: Button,
        priceLabel: Label,
        key: MenuItemKey,
        blockBtn: Button,
    ) {
        this.onLockedRowBlockClicked(block, menuButton, priceLabel, key);
        blockBtn.interactable = block.active;
    }

    private onLockedRowBlockClicked(block: Node, menuButton: Button, priceLabel: Label, key: MenuItemKey) {
        if (!block.active) {
            return;
        }

        const moneyManager = MoneyManager.getInstance();
        if (!moneyManager) {
            console.warn('[VegetableMenuHandler] MoneyManager ещё не готов');
            return;
        }

        const cost = this.parsePrice(priceLabel.string);
        if (moneyManager.getMoney() < cost) {
            return;
        }

        if (!moneyManager.subtractMoney(cost)) {
            return;
        }

        block.active = false;
        menuButton.interactable = true;
        console.log(`[VegetableMenuHandler] ${key} разблокирован за ${cost}`);
    }

    private onItemClicked(key: MenuItemKey) {
        const selectedPrefab = this.getPrefabForItem(key);
        if (!selectedPrefab) {
            console.error(`[VegetableMenuHandler] Префаб для ${key} не назначен!`);
            return;
        }

        this.placeInCell(selectedPrefab);
        this.closeMenu();
    }

    private getPrefabForItem(key: MenuItemKey): Prefab | null {
        switch (key) {
            case 'carrot':
                return this.carrotPrefab;
            case 'cabbage':
                return this.cabbagePrefab;
            case 'tomato':
                return this.tomatoPrefab;
            case 'chili':
                return this.chiliPrefab;
            default:
                return null;
        }
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

    private parsePrice(str: string): number {
        if (!str) {
            return 0;
        }

        const digits = str.replace(/\D/g, '');
        return parseInt(digits, 10) || 0;
    }

    private placeInCell(prefab: Prefab) {
        if (!this.targetCell) {
            console.error('[VegetableMenuHandler] targetCell не установлен!');
            return;
        }

        const contentNode = this.targetCell.getChildByName(this.CONTENT_NAME) || this.targetCell;
        contentNode.destroyAllChildren();

        const newItem = instantiate(prefab);
        contentNode.addChild(newItem);
        newItem.setPosition(0, 0, 0);

        console.log(`[VegetableMenuHandler] В слот ${this.targetCell.name} помещён: ${prefab.name}`);
    }

    public setTargetCell(cell: Node) {
        this.targetCell = cell;
    }

    private closeMenu() {
        this.node.active = false;
        const scene = director.getScene();
        if (scene) {
            const slots = scene.getComponentsInChildren(SlotMenuHandler);
            for (let i = 0; i < slots.length; i++) {
                slots[i].notifyMenuClosedByPick();
            }
        }
        console.log('[VegetableMenuHandler] Меню закрыто после выбора');
    }
}