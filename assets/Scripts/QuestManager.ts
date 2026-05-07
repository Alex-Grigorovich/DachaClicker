import { _decorator, Component, director, Label, Node, tween, Tween, Vec3 } from 'cc';
import { MoneyManager } from './MoneyManager';
import { VegetableMenuHandler } from './VegetableMenuHandler';
import { CellLockHandler } from './CellLockHandler';
import { PlantFieldState } from './PlantFieldState';
import { dlog } from './Debug';
import {
    BalanceQuestCondition,
    BalanceQuestDef,
    DEFAULT_BALANCE_RESOURCE_PATH,
    loadBalanceData,
} from './BalanceData';
import { LocalizationManager } from './LocalizationManager';
import { setQuestClickNotifier, setQuestPassiveEarnedNotifier, setQuestProgressNotifier } from './QuestBridge';
import { notifyProgressChanged } from './ProgressBridge';
import { readProgressSave, SavedQuestState } from './ProgressSave';
import { UnlockManager } from './UnlockManager';
import { UpgradeManager } from './UpgradeManager';
import { PassiveIncomeManager } from './PassiveIncomeManager';

const { ccclass, property } = _decorator;

@ccclass('QuestManager')
export class QuestManager extends Component {
    @property({ type: Label, tooltip: 'Текст текущего задания (или дочерняя LabelTasks)' })
    labelTasks: Label | null = null;

    @property({ tooltip: 'Путь в assets/resources без расширения, например balance/BALANCE_DATA' })
    questsResourcePath = DEFAULT_BALANCE_RESOURCE_PATH;

    @property({ tooltip: 'Только квесты из поля minimal_first_implementation в JSON' })
    useMinimalQuestSet = false;

    @property({ type: [Node], tooltip: 'Корневые ноды всех ячеек поля (в каждой дочерняя Content с посадкой)' })
    fieldCells: Node[] = [];

    @property({ type: VegetableMenuHandler, tooltip: 'Меню овощей на сцене (для unlocked_cultures_count)' })
    vegetableMenu: VegetableMenuHandler | null = null;

    @property({ type: [CellLockHandler], tooltip: 'По порядку: замок 4-й, 5-й, 6-й ячейки — для награды unlock_slot' })
    bonusSlotLocks: CellLockHandler[] = [];

    @property({ type: Node, tooltip: 'Корень кнопки ButtonTasks (внутри дочерняя IconCheckmarkCheck)' })
    buttonTasksRoot: Node | null = null;

    @property({ type: Node, tooltip: 'Если задано — использовать эту ноду вместо поиска IconCheckmarkCheck' })
    questDoneCheckIcon: Node | null = null;

    @property({ tooltip: 'Сколько секунд показывать галочку при выполнении задания' })
    questDoneIconShowDuration = 0.5;

    @property({ tooltip: 'Подъём ButtonTasks по Y при выполнении задания (локальные пиксели)' })
    buttonTasksLiftPixels = 10;

    @property({ tooltip: 'Время подъёма кнопки заданий' })
    buttonTasksLiftUpTime = 0.15;

    @property({ tooltip: 'Время возврата кнопки заданий' })
    buttonTasksLiftDownTime = 0.15;

    private readonly _contentName = 'Content';

    private _quests: BalanceQuestDef[] = [];
    private _activeIndex = 0;
    private _totalClicks = 0;
    private _passiveEarned = 0;
    private _loaded = false;
    /** Не реагировать на notify во время выдачи наград (unlock_slot вызывает notify). */
    private _grantPhase = false;

    private _warnedMissingCheckIcon = false;

    onLoad() {
        if (!this.labelTasks) {
            const n = this.node.getChildByName('LabelTasks');
            this.labelTasks = n?.getComponent(Label) ?? null;
        }
        if (!this.labelTasks) {
            console.warn('[QuestManager] Назначь LabelTasks или дочернюю ноду LabelTasks');
        }
        this.resolveQuestDoneCheckIcon();

        setQuestClickNotifier(() => {
            this._totalClicks++;
            this.tryAdvanceQuests();
            notifyProgressChanged();
        });
        setQuestProgressNotifier(() => {
            this.tryAdvanceQuests();
            notifyProgressChanged();
        });
        setQuestPassiveEarnedNotifier((amount: number) => {
            this._passiveEarned += Math.max(0, Math.floor(Number(amount) || 0));
            this.tryAdvanceQuests();
            notifyProgressChanged();
        });

        PlantFieldState.getInstance().registerFieldCells(this.fieldCells, this._contentName);
    }

    start() {
        void LocalizationManager.init();
        UpgradeManager.initialize(this.questsResourcePath);
        PassiveIncomeManager.initialize(this.questsResourcePath);
        loadBalanceData(this.questsResourcePath, (err, data) => {
            if (err || !data) {
                console.error('[QuestManager] Не удалось загрузить баланс/квесты:', err);
                this.setLabelText('Задания: ошибка загрузки JSON');
                return;
            }
            if (!data.quests?.items?.length) {
                console.error('[QuestManager] Пустой список квестов');
                return;
            }
            let list = [...data.quests.items].sort((a, b) => a.order - b.order);
            if (this.useMinimalQuestSet && data.quests.minimal_first_implementation?.length) {
                const allow = new Set(data.quests.minimal_first_implementation);
                list = list.filter(q => allow.has(q.id));
            }
            this._quests = list;
            this._loaded = true;
            this.restoreQuestState(readProgressSave()?.quests ?? null);
            this.tryAdvanceQuests();
        });
    }

    onDestroy() {
        setQuestClickNotifier(null);
        setQuestProgressNotifier(null);
        setQuestPassiveEarnedNotifier(null);
        this.unschedule(this._hideQuestDoneIcon);
    }

    update(dt: number) {
        PassiveIncomeManager.step(dt);
    }

    private setLabelText(text: string) {
        if (this.labelTasks) {
            this.labelTasks.string = text;
        }
    }

    public getQuestState(): SavedQuestState {
        return {
            activeIndex: this._activeIndex,
            totalClicks: this._totalClicks,
            passiveEarned: this._passiveEarned,
        };
    }

    public restoreQuestState(state: SavedQuestState | null) {
        if (!state) {
            this._activeIndex = 0;
            this._totalClicks = 0;
            return;
        }

        this._activeIndex = Math.max(0, Math.floor(state.activeIndex || 0));
        this._totalClicks = Math.max(0, Math.floor(state.totalClicks || 0));
        this._passiveEarned = Math.max(0, Math.floor(state.passiveEarned || 0));
    }

    public getFieldCells(): Node[] {
        return this.fieldCells.filter(cell => cell?.isValid);
    }

    private getStat(key: string): number {
        const mm = MoneyManager.getInstance();
        switch (key) {
            case 'total_clicks':
                return this._totalClicks;
            case 'total_earned':
                return mm?.getTotalEarned() ?? 0;
            case 'current_money':
                return mm?.getMoney() ?? 0;
            case 'passive_earned':
                return this._passiveEarned;
            case 'planted_slots_count':
                return this.countPlantedSlots();
            case 'unlocked_cultures_count':
                return UnlockManager.getUnlockedExtraCulturesCount(this.vegetableMenu?.getMenuCultureDefs() ?? []);
            case 'opened_slot_4':
                return this.isBonusSlotUnlocked(4) ? 1 : 0;
            case 'opened_slot_5':
                return this.isBonusSlotUnlocked(5) ? 1 : 0;
            case 'opened_slot_6':
                return this.isBonusSlotUnlocked(6) ? 1 : 0;
            default:
                console.warn(`[QuestManager] Неизвестный ключ статистики: ${key}`);
                return 0;
        }
    }

    private isBonusSlotUnlocked(slotIndex: number): boolean {
        const i = slotIndex - 4;
        if (i < 0 || i >= this.bonusSlotLocks.length) {
            return false;
        }
        const h = this.bonusSlotLocks[i];
        return h ? !h.isLockedNow() : false;
    }

    private countPlantedSlots(): number {
        return PlantFieldState.getInstance().countPlanted();
    }

    private conditionMet(c: BalanceQuestCondition): boolean {
        const v = this.getStat(c.key);
        if (c.operator === '>=') {
            return v >= c.value;
        }
        if (c.operator === '<=') {
            return v <= c.value;
        }
        if (c.operator === '==') {
            return v === c.value;
        }
        console.warn(`[QuestManager] Оператор не поддерживается: ${c.operator}`);
        return false;
    }

    private tryAdvanceQuests() {
        if (!this._loaded || !this._quests.length || this._grantPhase) {
            return;
        }

        const maxSteps = 32;
        let steps = 0;

        while (steps < maxSteps) {
            steps++;
            const quest = this._quests[this._activeIndex];
            if (!quest) {
                this.setLabelText(LocalizationManager.tryT('quests.all_done') ?? 'Все задания выполнены!');
                return;
            }

            const allMet = quest.conditions.every(c => this.conditionMet(c));
            if (!allMet) {
                const title = this.resolveQuestText(quest, true);
                const desc = this.resolveQuestText(quest, false);
                this.setLabelText(`${title}\n${desc}`);
                return;
            }

            this.grantRewards(quest);
            this._activeIndex++;
        }
    }

    private resolveQuestText(quest: BalanceQuestDef, isTitle: boolean): string {
        const lang = LocalizationManager.getLang();
        const key = isTitle ? quest.titleKey : quest.descKey;
        const fallback = isTitle ? quest.title : quest.description;
        if (!key) {
            return fallback;
        }
        if (lang === 'ru') {
            return fallback;
        }
        return LocalizationManager.tryT(key) ?? fallback;
    }

    private grantRewards(quest: BalanceQuestDef) {
        this._grantPhase = true;
        try {
            const mm = MoneyManager.getInstance();
            for (const r of quest.rewards) {
                if (r.type === 'money' && r.amount != null && mm) {
                    mm.addMoney(UpgradeManager.getQuestMoneyReward(r.amount));
                } else if (r.type === 'unlock_slot' && r.slot_index != null) {
                    const i = r.slot_index - 4;
                    if (i >= 0 && i < this.bonusSlotLocks.length) {
                        const h = this.bonusSlotLocks[i];
                        if (h) {
                            h.unlockByScript();
                        }
                    } else {
                        console.warn(`[QuestManager] Нет CellLockHandler для слота ${r.slot_index}`);
                    }
                }
            }
            dlog(`[QuestManager] Выполнено: ${quest.id}`);
            this.flashQuestDoneIcon();
            this.playButtonTasksLift();
        } finally {
            this._grantPhase = false;
        }
    }

    /**
     * Ищет IconCheckmarkCheck: явная ссылка → дочерняя у ButtonTasks → обход сцены по имени ButtonTasks.
     */
    private resolveQuestDoneCheckIcon(): Node | null {
        if (this.questDoneCheckIcon?.isValid) {
            return this.questDoneCheckIcon;
        }
        if (this.buttonTasksRoot?.isValid) {
            const ch = this.buttonTasksRoot.getChildByName('IconCheckmarkCheck');
            if (ch) {
                this.questDoneCheckIcon = ch;
                return ch;
            }
        }
        const scene = director.getScene();
        if (scene) {
            const btn = this.findFirstNodeByName(scene, 'ButtonTasks');
            if (btn) {
                this.buttonTasksRoot = btn;
                const ch = btn.getChildByName('IconCheckmarkCheck');
                if (ch) {
                    this.questDoneCheckIcon = ch;
                    return ch;
                }
            }
        }
        if (!this._warnedMissingCheckIcon) {
            this._warnedMissingCheckIcon = true;
            console.warn(
                '[QuestManager] Не найдена IconCheckmarkCheck. Проверь имя ноды и что она прямой ребёнок ButtonTasks.',
            );
        }
        return null;
    }

    private findFirstNodeByName(root: Node, name: string): Node | null {
        const stack: Node[] = [root];
        while (stack.length) {
            const n = stack.pop()!;
            if (n.name === name) {
                return n;
            }
            for (let i = 0; i < n.children.length; i++) {
                stack.push(n.children[i]);
            }
        }
        return null;
    }

    /** Кратко показать IconCheckmarkCheck на ButtonTasks при завершении одного задания. */
    private flashQuestDoneIcon() {
        const icon = this.resolveQuestDoneCheckIcon();
        if (!icon?.isValid) {
            return;
        }
        if (icon.parent) {
            icon.setSiblingIndex(icon.parent.children.length - 1);
        }
        icon.active = true;
        this.unschedule(this._hideQuestDoneIcon);
        this.scheduleOnce(this._hideQuestDoneIcon, Math.max(0.05, this.questDoneIconShowDuration));
    }

    private _hideQuestDoneIcon = () => {
        const icon = this.questDoneCheckIcon;
        if (icon?.isValid) {
            icon.active = false;
        }
    };

    private getButtonTasksForAnim(): Node | null {
        if (this.buttonTasksRoot?.isValid) {
            return this.buttonTasksRoot;
        }
        this.resolveQuestDoneCheckIcon();
        return this.buttonTasksRoot?.isValid ? this.buttonTasksRoot : null;
    }

    /** Локальный подъём ButtonTasks на buttonTasksLiftPixels и возврат. */
    private playButtonTasksLift() {
        const btn = this.getButtonTasksForAnim();
        if (!btn?.isValid) {
            return;
        }
        Tween.stopAllByTarget(btn);
        const base = btn.position.clone();
        const dy = this.buttonTasksLiftPixels;
        const up = new Vec3(base.x, base.y + dy, base.z);
        const upT = Math.max(0.01, this.buttonTasksLiftUpTime);
        const downT = Math.max(0.01, this.buttonTasksLiftDownTime);
        tween(btn)
            .to(upT, { position: up }, { easing: 'quadOut' })
            .to(downT, { position: base }, { easing: 'quadIn' })
            .start();
    }
}
