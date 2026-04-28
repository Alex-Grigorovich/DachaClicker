import { _decorator, Button, Color, Component, director, Label, Node, Sprite, tween, Tween, UITransform } from 'cc';
import { DEFAULT_BALANCE_RESOURCE_PATH } from './BalanceData';
import { formatMoneyDisplay } from './formatMoneyDisplay';
import { shakeAndFlashRed } from './UiMoneyDenyFeedback';
import { UpgradeManager } from './UpgradeManager';
import { VegClickMoney } from './VegClickMoney';

const { ccclass, property } = _decorator;

/** Имена строк под ColList в сцене → id из BALANCE_DATA.upgrades */
const DEFAULT_ROW_TO_UPGRADE_ID: Readonly<Record<string, string>> = {
    StrongClick: 'click_power_basic',
    Hand: 'click_speed',
    FreshCarrot: 'carrot_mastery',
    StrongCabbage: 'cabbage_mastery',
    Harvest: 'profitable_harvest',
    Reward: 'quest_bonus',
};

const COST_LABEL_BY_UPGRADE_ID: Readonly<Record<string, string>> = {
    click_power_basic: 'costClick',
    click_speed: 'costHand',
    carrot_mastery: 'costCarrot',
    cabbage_mastery: 'costCabbage',
    profitable_harvest: 'costHarvest',
    quest_bonus: 'costRevard',
};

@ccclass('UpgradeListRowBind')
export class UpgradeListRowBind {
    @property({ tooltip: 'Имя ноды строки (ребёнок ColList), например StrongClick' })
    rowName = '';

    @property({ tooltip: 'id апгрейда из BALANCE_DATA.json' })
    upgradeId = '';
}

interface WiredRow {
    upgradeId: string;
    rowRoot: Node;
    hitNodes: Node[];
    clickButtons: Button[];
    onHit: () => void;
}

@ccclass('UpgradeListPanel')
export class UpgradeListPanel extends Component {
    @property({ tooltip: 'Родитель строк (пусто — ищем ColList под этой нодой)' })
    colListRoot: Node | null = null;

    @property({ tooltip: 'Путь resources без .json, как в QuestManager' })
    balanceResourcePath = DEFAULT_BALANCE_RESOURCE_PATH;

    @property({
        type: [UpgradeListRowBind],
        tooltip: 'Переопределения или доп. строки: rowName → upgradeId. Пусто — только встроенный маппинг DEFAULT.',
    })
    rowBindings: UpgradeListRowBind[] = [];

    private _wired: WiredRow[] = [];
    private _clickUntil = 0;
    private _rowsReady = false;
    private _costLabelByUpgradeId = new Map<string, Label>();

    onLoad() {
        this.ensureColList();
        this.cacheCostLabels();
    }

    start() {
        UpgradeManager.initialize(this.balanceResourcePath);
        let tries = 0;
        const tick = () => {
            tries++;
            if (UpgradeManager.isReady()) {
                if (!this._rowsReady) {
                    this.wireRowsIfNeeded();
                }
                this.refreshAllRows();
                return;
            }
            if (tries < 80) {
                this.scheduleOnce(tick, 0.05);
            } else {
                console.warn('[UpgradeListPanel] UpgradeManager не стал готов — проверь BALANCE_DATA');
            }
        };
        this.scheduleOnce(tick, 0);
    }

    onEnable() {
        this.scheduleOnce(() => {
            if (UpgradeManager.isReady() && !this._rowsReady) {
                this.wireRowsIfNeeded();
            }
            this.refreshAllRows();
        }, 0);
    }

    onDestroy() {
        this.unwireHits();
    }

    /** Вызов после покупки или смены баланса снаружи (опционально). */
    public refreshAllRows() {
        if (!UpgradeManager.isReady()) {
            return;
        }
        for (const w of this._wired) {
            this.applyRowLabels(w.upgradeId, w.rowRoot);
        }
        for (const [upgradeId, label] of this._costLabelByUpgradeId.entries()) {
            if (!label?.isValid) {
                continue;
            }
            label.string = this.getCostText(upgradeId);
        }
    }

    private ensureColList() {
        if (this.colListRoot?.isValid) {
            return;
        }
        this.colListRoot = this.findDeepChildByName(this.node, 'ColList');
        if (!this.colListRoot) {
            console.warn('[UpgradeListPanel] ColList не найден под UpgradeList');
        }
    }

    private buildRowNameMap(): Map<string, string> {
        const m = new Map<string, string>();
        for (const name in DEFAULT_ROW_TO_UPGRADE_ID) {
            if (!Object.prototype.hasOwnProperty.call(DEFAULT_ROW_TO_UPGRADE_ID, name)) {
                continue;
            }
            m.set(name, DEFAULT_ROW_TO_UPGRADE_ID[name]);
        }
        for (const b of this.rowBindings) {
            if (b.rowName && b.upgradeId) {
                m.set(b.rowName, b.upgradeId);
            }
        }
        return m;
    }

    private wireRowsIfNeeded() {
        if (this._rowsReady) {
            this.refreshAllRows();
            return;
        }
        this.ensureColList();
        const col = this.colListRoot;
        if (!col?.isValid) {
            return;
        }

        this.unwireHits();
        const nameToId = this.buildRowNameMap();
        const wired: WiredRow[] = [];

        for (const row of col.children) {
            const upgradeId = nameToId.get(row.name);
            if (!upgradeId) {
                continue;
            }
            const hitRoot = row.getChildByName('bgList3') ?? row.children[0];
            if (!hitRoot) {
                console.warn(`[UpgradeListPanel] У строки ${row.name} нет bgList3 / детей`);
                continue;
            }
            const hitNodes = this.collectHitNodes(hitRoot);
            const clickButtons = this.collectButtonsUnder(hitRoot);
            if (clickButtons.length === 0) {
                const btn = hitRoot.addComponent(Button);
                btn.transition = Button.Transition.NONE;
                btn.zoomScale = 1;
                clickButtons.push(btn);
            }
            const onHit = () => this.onRowHit(upgradeId, row);
            for (const n of hitNodes) {
                n.on(Node.EventType.TOUCH_END, onHit, this);
                n.on(Node.EventType.MOUSE_UP, onHit, this);
            }
            for (const b of clickButtons) {
                b.node.on(Button.EventType.CLICK, onHit, this);
            }
            wired.push({ upgradeId, rowRoot: row, hitNodes, clickButtons, onHit });
        }

        this._wired = wired;
        this._rowsReady = true;
        this.refreshAllRows();

        if (wired.length === 0) {
            console.warn('[UpgradeListPanel] Ни одна строка не сопоставлена с upgradeId (проверь имена детей ColList)');
        }
    }

    private unwireHits() {
        for (const w of this._wired) {
            for (const n of w.hitNodes) {
                if (n?.isValid) {
                    n.off(Node.EventType.TOUCH_END, w.onHit, this);
                    n.off(Node.EventType.MOUSE_UP, w.onHit, this);
                }
            }
            for (const b of w.clickButtons) {
                if (b?.isValid) {
                    b.node.off(Button.EventType.CLICK, w.onHit, this);
                }
            }
        }
        this._wired = [];
        this._rowsReady = false;
    }

    private collectHitNodes(root: Node): Node[] {
        const out: Node[] = [];
        const stack: Node[] = [root];
        while (stack.length) {
            const n = stack.pop()!;
            if (n.getComponent(UITransform)) {
                out.push(n);
            }
            stack.push(...n.children);
        }
        return out;
    }

    private onRowHit(upgradeId: string, rowRoot: Node) {
        const now = performance.now();
        if (now < this._clickUntil) {
            return;
        }
        this._clickUntil = now + 160;

        if (!UpgradeManager.isReady()) {
            UpgradeManager.initialize(this.balanceResourcePath);
            return;
        }

        const reason = UpgradeManager.canPurchase(upgradeId);
        if (reason === 'not_enough_money' || reason === 'money_manager_missing') {
            shakeAndFlashRed(rowRoot);
            return;
        }

        if (reason === 'locked' || reason === 'max_level' || reason === 'not_found' || reason === 'not_ready') {
            shakeAndFlashRed(rowRoot);
            return;
        }

        const result = UpgradeManager.purchase(upgradeId);
        if (!result.ok) {
            shakeAndFlashRed(rowRoot);
            return;
        }
        this.flashRowGreen(rowRoot);
        this.refreshAllRows();
        this.refreshActiveVegClickLabels();
    }

    private applyRowLabels(upgradeId: string, rowRoot: Node) {
        const levelLabel = this.findLabelDeep(rowRoot, 'LevelText');
        const costLabel = this.findLabelDeep(rowRoot, 'CostText') ?? this._costLabelByUpgradeId.get(upgradeId) ?? null;

        const level = UpgradeManager.getLevel(upgradeId);
        const reason = UpgradeManager.canPurchase(upgradeId);
        const nextCost = UpgradeManager.getNextCost(upgradeId);

        if (levelLabel) {
            if (reason === 'max_level') {
                levelLabel.string = 'МАКС';
            } else {
                levelLabel.string = `ур. ${level}`;
            }
        }

        if (costLabel) {
            costLabel.string = this.getCostText(upgradeId, reason, nextCost);
        }
    }

    private getCostText(upgradeId: string, reason?: ReturnType<typeof UpgradeManager.canPurchase>, nextCost?: number): string {
        const r = reason ?? UpgradeManager.canPurchase(upgradeId);
        const c = nextCost ?? UpgradeManager.getNextCost(upgradeId);
        if (r === 'max_level') {
            return 'MAX';
        }
        if (c <= 0) {
            return '—';
        }
        return formatMoneyDisplay(c);
    }

    private cacheCostLabels() {
        this._costLabelByUpgradeId.clear();
        for (const upgradeId in COST_LABEL_BY_UPGRADE_ID) {
            if (!Object.prototype.hasOwnProperty.call(COST_LABEL_BY_UPGRADE_ID, upgradeId)) {
                continue;
            }
            const labelName = COST_LABEL_BY_UPGRADE_ID[upgradeId];
            const label = this.findLabelByContainerName(this.node, labelName);
            if (label) {
                this._costLabelByUpgradeId.set(upgradeId, label);
            } else {
                console.warn(`[UpgradeListPanel] Не найден label цены для ${upgradeId} (${labelName})`);
            }
        }
    }

    private flashRowGreen(rowRoot: Node) {
        const green = new Color(80, 220, 120, 255);
        const pairs: Array<{ target: Sprite | Label; original: Color }> = [];
        for (const s of rowRoot.getComponentsInChildren(Sprite)) {
            pairs.push({ target: s, original: s.color.clone() });
            Tween.stopAllByTarget(s);
            s.color = green;
        }
        for (const l of rowRoot.getComponentsInChildren(Label)) {
            pairs.push({ target: l, original: l.color.clone() });
            Tween.stopAllByTarget(l);
            l.color = green;
        }
        tween(rowRoot)
            .delay(0.15)
            .call(() => {
                for (const p of pairs) {
                    if (p.target?.isValid) {
                        p.target.color = p.original;
                    }
                }
            })
            .start();
    }

    private collectButtonsUnder(root: Node): Button[] {
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

    private refreshActiveVegClickLabels() {
        const scene = director.getScene();
        if (!scene) {
            return;
        }
        for (const v of scene.getComponentsInChildren(VegClickMoney)) {
            v.setBaseClickReward(v.baseAddPerClick);
        }
    }

    /** Ищет ноду-контейнер по имени и возвращает Label на ней или внутри. */
    private findLabelByContainerName(root: Node | null, containerName: string): Label | null {
        const container = this.findDeepChildByName(root, containerName);
        if (!container?.isValid) {
            return null;
        }
        return container.getComponent(Label) ?? container.getComponentInChildren(Label) ?? null;
    }

    private findLabelDeep(root: Node | null, nodeName: string): Label | null {
        if (!root?.isValid) {
            return null;
        }
        if (root.name === nodeName) {
            const l = root.getComponent(Label);
            if (l) {
                return l;
            }
        }
        for (const c of root.children) {
            const f = this.findLabelDeep(c, nodeName);
            if (f) {
                return f;
            }
        }
        return null;
    }

    private findDeepChildByName(root: Node | null, name: string): Node | null {
        if (!root?.isValid) {
            return null;
        }
        if (root.name === name) {
            return root;
        }
        for (const c of root.children) {
            const f = this.findDeepChildByName(c, name);
            if (f) {
                return f;
            }
        }
        return null;
    }
}
