import { _decorator, Component, Node, Button, Prefab, instantiate, Label, director } from 'cc';
import { MoneyManager } from './MoneyManager';
import { SlotMenuHandler } from './SlotMenuHandler';
import { PlantFieldState } from './PlantFieldState';
import {
    BalanceCultureDef,
    BalanceCultureKey,
    DEFAULT_BALANCE_RESOURCE_PATH,
    loadBalanceData,
} from './BalanceData';
import { formatMoneyDisplay } from './formatMoneyDisplay';
import { VegClickMoney } from './VegClickMoney';
import { notifyQuestProgress } from './QuestBridge';
import { isProgressPersistenceDisabled, notifyProgressChanged } from './ProgressBridge';
import { readProgressSave, SavedFieldCellState } from './ProgressSave';
import { UnlockManager } from './UnlockManager';
import { UpgradeManager } from './UpgradeManager';
import { shakeAndFlashRed } from './UiMoneyDenyFeedback';

const { ccclass, property } = _decorator;

const FALLBACK_MENU_ITEMS: BalanceCultureDef[] = [
    {
        key: 'carrot',
        title: 'Морковь',
        rowName: 'CellListCarrot',
        prefabKey: 'carrot',
        baseClickReward: 4,
        unlockCost: 0,
        unlockedByDefault: true,
        menuOrder: 1,
    },
    {
        key: 'cabbage',
        title: 'Капуста',
        rowName: 'CellListCabbage',
        prefabKey: 'cabbage',
        baseClickReward: 11,
        unlockCost: 90,
        unlockedByDefault: false,
        blockName: 'cellListBlockCabbage',
        menuOrder: 2,
    },
    {
        key: 'tomato',
        title: 'Томат',
        rowName: 'CellListTomato',
        prefabKey: 'tomato',
        baseClickReward: 28,
        unlockCost: 420,
        unlockedByDefault: false,
        blockName: 'cellListBlockTomato',
        menuOrder: 3,
    },
    {
        key: 'chili',
        title: 'Острый перец',
        rowName: 'CellListChiliPepper',
        prefabKey: 'chili',
        baseClickReward: 70,
        unlockCost: 1700,
        unlockedByDefault: false,
        blockName: 'cellListBlockChiliPepper',
        menuOrder: 4,
    },
];

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

    @property({ type: Button, tooltip: 'Кнопка закрытия меню (можно оставить пустой — найдётся автоматически)' })
    closeButton: Button | null = null;

    @property({ type: Node, tooltip: 'Корень поиска строк/блоков меню (пусто — текущая нода)' })
    rowsRoot: Node | null = null;

    @property({ type: [Node], tooltip: 'Явные строки культур (CellList*). Приоритет над поиском по имени.' })
    cultureRows: Node[] = [];

    @property({ type: [Node], tooltip: 'Явные блоки блокировки (cellListBlock*). Приоритет над поиском по имени.' })
    cultureBlocks: Node[] = [];

    @property({ type: Node, tooltip: 'Явная ссылка на VegetableListUnlocked для авто-настройки роли' })
    unlockMenuNode: Node | null = null;

    @property({ tooltip: 'Путь в assets/resources без расширения, например balance/BALANCE_DATA' })
    balanceResourcePath = DEFAULT_BALANCE_RESOURCE_PATH;

    @property({ tooltip: 'Разрешить выбор культуры для выставления в слот' })
    allowPlacement = true;

    @property({ tooltip: 'Разрешить покупку/разблокировку культур в этом меню' })
    allowUnlocking = true;

    private targetCell: Node | null = null;
    private readonly CONTENT_NAME = 'Content';
    private _menuItems: BalanceCultureDef[] = FALLBACK_MENU_ITEMS;
    private _balanceLoaded = false;
    private _inited = false;

    /** Защита от двойного срабатывания TOUCH_END + MOUSE_UP по одному пункту. */
    private _lastPickKey: BalanceCultureKey | '' = '';
    private _lastPickAt = 0;

    /**
     * Можно вызвать извне (например из VegetableUnlockListToggle) ещё до первой активации ноды,
     * чтобы баланс и click-хэндлеры были готовы к первому открытию.
     */
    public preInit() {
        if (this._inited) {
            return;
        }
        this._inited = true;
        this.autoConfigureRoleByNodeName();
        this.setupCloseButton();
        this.loadMenuBalance();
    }

    /**
     * Загрузку баланса и кнопку закрытия делаем в onLoad, а не в start:
     * нода может быть неактивна до первого открытия — тогда start откладывается и меню «пустое».
     */
    onLoad() {
        this.preInit();
    }

    private autoConfigureRoleByNodeName() {
        const scene = director.getScene();
        if (!scene) {
            return;
        }
        const hasUnlockList = !!(this.unlockMenuNode?.isValid || this.findNodeDeep(scene, 'VegetableListUnlocked'));
        if (!hasUnlockList) {
            return;
        }
        if (this.node.name === 'VegetableList') {
            this.allowUnlocking = false;
            return;
        }
        if (this.node.name === 'VegetableListUnlocked') {
            this.allowPlacement = false;
            this.allowUnlocking = true;
        }
    }

    private setupCloseButton() {
        const closeButton = this.resolveCloseButton();
        if (!closeButton) {
            console.warn('[VegetableMenuHandler] Кнопка закрытия меню не найдена');
            return;
        }

        closeButton.node.off(Button.EventType.CLICK, this.closeMenu, this);
        closeButton.node.off(Node.EventType.TOUCH_END, this.closeMenu, this);
        closeButton.node.off(Node.EventType.MOUSE_UP, this.closeMenu, this);
        closeButton.node.on(Button.EventType.CLICK, this.closeMenu, this);
        closeButton.node.on(Node.EventType.TOUCH_END, this.closeMenu, this);
        closeButton.node.on(Node.EventType.MOUSE_UP, this.closeMenu, this);
    }

    private loadMenuBalance() {
        loadBalanceData(this.balanceResourcePath, (err, data) => {
            if (err || !data?.cultures?.length) {
                console.warn('[VegetableMenuHandler] Не удалось загрузить баланс культур, используем fallback', err);
                this._menuItems = FALLBACK_MENU_ITEMS;
            } else {
                this._menuItems = [...data.cultures].sort((a, b) => (a.menuOrder ?? 0) - (b.menuOrder ?? 0));
            }
            this._balanceLoaded = true;
            UpgradeManager.initialize(this.balanceResourcePath);
            const save = isProgressPersistenceDisabled() ? null : readProgressSave();
            UnlockManager.restoreCultureUnlocksFromSave(save?.unlockedCultures, this._menuItems);
            this.wireMenuRows();
        });
    }

    public isBalanceReady(): boolean {
        return this._balanceLoaded;
    }

    /**
     * В балансе указано имя строки как в меню посадки (`CellListCabbage`).
     * Параллельная разметка в `VegetableListUnlocked` в сцене названа с суффиксом `Unb` (`CellListCabbageUnb`).
     */
    private resolveCultureRow(item: BalanceCultureDef): Node | null {
        const explicit =
            this.findByNameInPool(this.cultureRows, item.rowName) ??
            this.findByNameInPool(this.cultureRows, `${item.rowName}Unb`);
        if (explicit) {
            return explicit;
        }
        const root = this.rowsRoot?.isValid ? this.rowsRoot : this.node;
        let row = this.findNodeDeep(root, item.rowName);
        if (!row) {
            row = this.findNodeDeep(root, `${item.rowName}Unb`);
        }
        return row;
    }

    private resolveCultureBlock(blockName: string): Node | null {
        const explicit = this.findByNameInPool(this.cultureBlocks, blockName);
        if (explicit) {
            return explicit;
        }
        const root = this.rowsRoot?.isValid ? this.rowsRoot : this.node;
        return this.findNodeDeep(root, blockName);
    }

    private findByNameInPool(pool: Node[], name: string): Node | null {
        for (const n of pool) {
            if (n?.isValid && n.name === name) {
                return n;
            }
        }
        return null;
    }

    private wireMenuRows() {
        for (const item of this._menuItems) {
            const row = this.resolveCultureRow(item);
            if (!row) {
                console.warn(`[VegetableMenuHandler] Нода строки не найдена: ${item.rowName}`);
                continue;
            }

            const menuButton = row.getComponent(Button) ?? row.getComponentInChildren(Button);
            if (!menuButton) {
                console.warn(`[VegetableMenuHandler] Нет Button в ${item.rowName}`);
                continue;
            }

            // Клик попадает в дочерний cellList (спрайт/лейбл), а не в ноду с Button — слушаем hit-ноду.
            const hitNode = row.getChildByName('cellList') ?? row;
            const onPick = () => this.tryPickMenuItem(item.key, menuButton, row);
            hitNode.on(Node.EventType.TOUCH_END, onPick, this);
            hitNode.on(Node.EventType.MOUSE_UP, onPick, this);

            const blockName = item.blockName;
            if (!blockName) {
                menuButton.interactable = true;
                continue;
            }

            const block = this.resolveCultureBlock(blockName);
            const priceLabel = block?.getComponentInChildren(Label) ?? null;
            if (!block || !priceLabel) {
                console.warn(`[VegetableMenuHandler] Не удалось настроить блокировку для ${item.rowName}`);
                continue;
            }

            const cultureUnlocked = UnlockManager.isCultureUnlocked(item.key);
            this.applyLockedRowLabel(item, block, priceLabel, cultureUnlocked);
            block.active = !cultureUnlocked;
            menuButton.interactable = cultureUnlocked;

            if (this.allowUnlocking) {
                // Используем TOUCH_END/MOUSE_UP напрямую — надёжнее, чем Button.EventType.CLICK
                // на динамически созданных/неактивных нодах в Cocos Creator.
                block.off(Node.EventType.TOUCH_END);
                block.off(Node.EventType.MOUSE_UP);
                const onUnlock = (evt?: { stopPropagation?: () => void }) => {
                    evt?.stopPropagation?.();
                    this.onLockedRowBlockClicked(block, menuButton, item);
                };
                block.on(Node.EventType.TOUCH_END, onUnlock, this);
                block.on(Node.EventType.MOUSE_UP, onUnlock, this);
            }
        }
    }

    /** В меню посадки заблокированные культуры показывают «Недоступно», в меню разблокировки — цену. */
    private applyLockedRowLabel(
        item: BalanceCultureDef,
        block: Node,
        priceLabel: Label,
        cultureUnlocked: boolean,
    ) {
        if (cultureUnlocked) {
            return;
        }
        if (this.allowUnlocking) {
            priceLabel.string = formatMoneyDisplay(this.getUnlockCost(item));
        } else {
            priceLabel.string = 'Недоступно';
        }
    }

    private tryPickMenuItem(key: BalanceCultureKey, menuButton: Button, row: Node) {
        if (!this.allowPlacement) {
            return;
        }
        if (!menuButton.interactable) {
            const item = this._menuItems.find(i => i.key === key);
            if (item?.blockName) {
                const block = this.resolveCultureBlock(item.blockName);
                if (block?.active) {
                    shakeAndFlashRed(block);
                } else {
                    shakeAndFlashRed(row);
                }
            }
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



    private onLockedRowBlockClicked(block: Node, menuButton: Button, item: BalanceCultureDef) {
        if (!this.allowUnlocking) {
            return;
        }
        if (!block.active) {
            return;
        }

        const moneyManager = MoneyManager.getInstance();
        if (!moneyManager) {
            console.warn('[VegetableMenuHandler] MoneyManager ещё не готов');
            return;
        }

        const cost = this.getUnlockCost(item);
        if (moneyManager.getMoney() < cost) {
            shakeAndFlashRed(block);
            return;
        }

        if (!moneyManager.subtractMoney(cost)) {
            shakeAndFlashRed(block);
            return;
        }

        UnlockManager.unlockCulture(item.key);
        block.active = false;
        menuButton.interactable = true;
        this.syncAllVegetableMenusUnlockUi();
        notifyQuestProgress();
        notifyProgressChanged();
        console.log(`[VegetableMenuHandler] ${item.key} разблокирован за ${cost}`);
    }

    private syncAllVegetableMenusUnlockUi() {
        const scene = director.getScene();
        if (!scene) {
            this.syncUnlockUiFromManager();
            return;
        }
        const handlers = scene.getComponentsInChildren(VegetableMenuHandler);
        for (const h of handlers) {
            h.syncUnlockUiFromManager();
        }
    }

    private getUnlockCost(item: BalanceCultureDef): number {
        const base = Math.max(0, Math.floor(item.unlockCost || 0));
        return UpgradeManager.getCultureUnlockCost(base);
    }

    private onItemClicked(key: BalanceCultureKey) {
        const selectedPrefab = this.getPrefabForItem(key);
        if (!selectedPrefab) {
            console.error(`[VegetableMenuHandler] Префаб для ${key} не назначен!`);
            return;
        }

        this.placeInCell(selectedPrefab, key);
        this.closeMenu();
    }

    private getPrefabForItem(key: BalanceCultureKey): Prefab | null {
        const prefabKey = this._menuItems.find(item => item.key === key)?.prefabKey ?? key;
        switch (prefabKey) {
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

    private resolveCloseButton(): Button | null {
        if (this.closeButton?.isValid) {
            return this.closeButton;
        }

        const byName = this.findNodeDeep(this.node, 'ButtonClose');
        if (!byName?.isValid) {
            return null;
        }
        const resolved = byName.getComponent(Button) ?? byName.getComponentInChildren(Button) ?? byName.addComponent(Button);
        resolved.transition = Button.Transition.NONE;
        resolved.zoomScale = 1;
        if (resolved) {
            this.closeButton = resolved;
        }
        return resolved;
    }

    private placeInCell(prefab: Prefab, cultureKey: BalanceCultureKey) {
        if (!this.targetCell) {
            console.error('[VegetableMenuHandler] targetCell не установлен!');
            return;
        }

        const contentNode = this.targetCell.getChildByName(this.CONTENT_NAME) || this.targetCell;
        contentNode.destroyAllChildren();

        const newItem = instantiate(prefab);
        this.applyCultureBalance(newItem, cultureKey);
        contentNode.addChild(newItem);
        newItem.setPosition(0, 0, 0);

        PlantFieldState.getInstance().setCellCulture(this.targetCell, cultureKey);
        console.log(`[VegetableMenuHandler] В слот ${this.targetCell.name} помещён: ${prefab.name} (${cultureKey})`);
        notifyQuestProgress();
        notifyProgressChanged();
    }

    public restoreFieldCells(savedCells: SavedFieldCellState[], fieldCells: Node[]) {
        const bySlotId = new Map(savedCells.map(item => [item.slotId, item]));
        const byUuid = new Map(savedCells.map(item => [item.uuid, item]));
        const byName = new Map(savedCells.map(item => [item.name, item]));
        const used = new Set<SavedFieldCellState>();
        for (let index = 0; index < fieldCells.length; index++) {
            const cell = fieldCells[index];
            if (!cell?.isValid) {
                continue;
            }

            const slotId = this.resolveCellSlotId(cell, index + 1);
            const saved =
                (slotId > 0 ? bySlotId.get(slotId) : undefined) ??
                byUuid.get(cell.uuid) ??
                byName.get(cell.name);
            if (!saved || !this.isKnownCultureKey(saved.culture)) {
                this.clearSavedCell(cell);
                continue;
            }
            if (used.has(saved)) {
                this.clearSavedCell(cell);
                continue;
            }
            used.add(saved);

            this.placeSavedCulture(cell, saved.culture);
        }
    }

    private resolveCellSlotId(cell: Node, fallback: number): number {
        const m = cell.name.match(/(\d+)(?!.*\d)/);
        if (m) {
            const parsed = Math.floor(Number(m[1]));
            if (Number.isFinite(parsed) && parsed > 0) {
                return parsed;
            }
        }
        return Math.max(0, Math.floor(fallback));
    }

    public getUnlockedCultureKeys(): BalanceCultureKey[] {
        return UnlockManager.getUnlockedCultureKeysOrdered(this._menuItems) as BalanceCultureKey[];
    }

    public getMenuCultureDefs(): BalanceCultureDef[] {
        return this._menuItems;
    }

    public restoreUnlockedCultures(keys: string[]) {
        UnlockManager.restoreCultureUnlocksFromSave(keys, this._menuItems);
        this.syncUnlockUiFromManager();
    }

    public syncUnlockUiFromManager() {
        for (const item of this._menuItems) {
            const unlocked = !item.blockName || UnlockManager.isCultureUnlocked(item.key);
            this.applyCultureUnlockState(item, unlocked);
        }
    }

    private applyCultureUnlockState(item: BalanceCultureDef, unlocked: boolean) {
        const row = this.resolveCultureRow(item);
        const menuButton = row?.getComponent(Button) ?? row?.getComponentInChildren(Button) ?? null;
        if (menuButton) {
            menuButton.interactable = unlocked;
        }

        if (!item.blockName) {
            return;
        }

        const block = this.resolveCultureBlock(item.blockName);
        if (!block) {
            return;
        }
        const priceLabel = block.getComponentInChildren(Label);
        if (priceLabel && !unlocked) {
            this.applyLockedRowLabel(item, block, priceLabel, unlocked);
        }
        block.active = !unlocked;
    }

    private placeSavedCulture(cell: Node, cultureKey: BalanceCultureKey) {
        const selectedPrefab = this.getPrefabForItem(cultureKey);
        if (!selectedPrefab) {
            console.warn(`[VegetableMenuHandler] Не удалось восстановить культуру ${cultureKey}: префаб не назначен`);
            this.clearSavedCell(cell);
            return;
        }

        const contentNode = cell.getChildByName(this.CONTENT_NAME) || cell;
        contentNode.destroyAllChildren();

        const newItem = instantiate(selectedPrefab);
        this.applyCultureBalance(newItem, cultureKey);
        contentNode.addChild(newItem);
        newItem.setPosition(0, 0, 0);
        PlantFieldState.getInstance().setCellCulture(cell, cultureKey);
    }

    private clearSavedCell(cell: Node) {
        const contentNode = cell.getChildByName(this.CONTENT_NAME) || cell;
        contentNode.destroyAllChildren();
        PlantFieldState.getInstance().clearCell(cell);
    }

    private isKnownCultureKey(key: string): key is BalanceCultureKey {
        return key === 'carrot' || key === 'cabbage' || key === 'tomato' || key === 'chili';
    }

    /** Число разблокированных платных культур (cabbage, tomato, chili), не считая морковь. */
    public getUnlockedExtraCulturesCount(): number {
        return UnlockManager.getUnlockedExtraCulturesCount(this._menuItems);
    }

    public setTargetCell(cell: Node) {
        this.targetCell = cell;
    }

    private applyCultureBalance(root: Node, cultureKey: BalanceCultureKey) {
        const config = this._menuItems.find(item => item.key === cultureKey);
        if (!config) {
            return;
        }

        const clicker = root.getComponent(VegClickMoney) ?? root.getComponentInChildren(VegClickMoney);
        if (clicker) {
            clicker.setBaseClickReward(config.baseClickReward);
        }
    }

    private closeMenu() {
        this.node.active = false;
        if (this.allowPlacement) {
            const scene = director.getScene();
            if (scene) {
                const slots = scene.getComponentsInChildren(SlotMenuHandler);
                for (let i = 0; i < slots.length; i++) {
                    slots[i].notifyMenuClosed();
                }
            }
        }
        console.log('[VegetableMenuHandler] Меню закрыто');
    }

    onDestroy() {
        if (this.closeButton?.isValid) {
            this.closeButton.node.off(Button.EventType.CLICK, this.closeMenu, this);
            this.closeButton.node.off(Node.EventType.TOUCH_END, this.closeMenu, this);
            this.closeButton.node.off(Node.EventType.MOUSE_UP, this.closeMenu, this);
        }
    }
}