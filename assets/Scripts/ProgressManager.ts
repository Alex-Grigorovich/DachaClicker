import { _decorator, Component, director, Node } from 'cc';
import { CellLockHandler } from './CellLockHandler';
import { MoneyManager } from './MoneyManager';
import { PlantFieldState } from './PlantFieldState';
import { PassiveIncomeManager } from './PassiveIncomeManager';
import { notifyQuestProgress } from './QuestBridge';
import { QuestManager } from './QuestManager';
import { setProgressChangedNotifier, setProgressPersistenceDisabled } from './ProgressBridge';
import { SlotMenuHandler } from './SlotMenuHandler';
import { UpgradeManager } from './UpgradeManager';
import { dlog } from './Debug';
import {
    cloudRead,
    cloudWrite,
    createDefaultProgressSave,
    ProgressSaveData,
    readProgressSave,
    writeProgressSave,
} from './ProgressSave';
import { TutorialManager } from './TutorialManager';
import { VegetableMenuHandler } from './VegetableMenuHandler';
import { upgradeProgressGetSnapshot, upgradeProgressReplaceAll } from './UpgradeProgressStore';

const { ccclass, property } = _decorator;

@ccclass('ProgressManager')
export class ProgressManager extends Component {
    @property({ tooltip: 'Для тестов: не читать и не писать прогресс в localStorage' })
    disableSaving = false;

    @property({ tooltip: 'Задержка автосохранения после изменения прогресса, чтобы сгруппировать несколько событий' })
    saveDelay = 0.15;

    @property({ tooltip: 'Резервный автосейв раз в N секунд. 0 = выключить' })
    autosaveInterval = 1;

    @property({ tooltip: 'Задержка cloud-сейва после изменений (сек)' })
    cloudSaveDelay = 30;

    @property({ tooltip: 'Сколько раз ждать готовности UI/баланса перед восстановлением поля' })
    restoreRetries = 20;

    @property({ tooltip: 'Пауза между попытками восстановления (сек)' })
    restoreRetryDelay = 0.1;

    private static _instance: ProgressManager | null = null;

    private _save: ProgressSaveData | null = null;
    private _restoring = false;
    private _restoreCompleted = false;
    private _pendingSaveRequested = false;
    private readonly _delayedSave = () => this.saveNow();
    private readonly _delayedCloudSave = () => void this.saveCloudNow();

    /** После восстановления: начислить оффлайн-пассивку от этого timestamp (мс). */
    private _offlineLastSessionMs: number | null = null;
    private _offlineApplyAttempts = 0;
    private readonly _applyOfflineIncomeTick = () => this.tryApplyOfflineIncomeOnce();

    public static getInstance(): ProgressManager | null {
        return ProgressManager._instance;
    }

    onLoad() {
        if (ProgressManager._instance && ProgressManager._instance !== this) {
            this.destroy();
            return;
        }

        ProgressManager._instance = this;
        setProgressPersistenceDisabled(this.disableSaving);
        this._save = this.disableSaving ? null : readProgressSave();
        setProgressChangedNotifier(() => this.saveSoon());
    }

    start() {
        if (this.disableSaving) {
            this._restoreCompleted = true;
            return;
        }
        this._restoreCompleted = false;
        void this.bootstrapRestoreFromBestSource();
    }

    onDestroy() {
        if (ProgressManager._instance === this) {
            ProgressManager._instance = null;
            setProgressChangedNotifier(null);
            setProgressPersistenceDisabled(false);
        }
    }

    public setSavingDisabled(disabled: boolean) {
        if (this.disableSaving === disabled) {
            return;
        }

        this.disableSaving = disabled;
        setProgressPersistenceDisabled(disabled);
        this.unscheduleAllCallbacks();

        if (disabled) {
            this._save = null;
            this._restoreCompleted = true;
            this._pendingSaveRequested = false;
            return;
        }

        this._save = readProgressSave();
        this._restoreCompleted = false;
        this._pendingSaveRequested = false;
        void this.bootstrapRestoreFromBestSource();
    }

    public saveSoon() {
        if (this.disableSaving || this._restoring) {
            return;
        }
        if (!this._restoreCompleted) {
            this._pendingSaveRequested = true;
            return;
        }
        this.unschedule(this._delayedSave);
        this.scheduleOnce(this._delayedSave, Math.max(0, this.saveDelay));
    }

    public saveNow = () => {
        if (this.disableSaving || this._restoring) {
            return;
        }
        if (!this._restoreCompleted) {
            this._pendingSaveRequested = true;
            return;
        }

        const scene = director.getScene();
        if (!scene) {
            return;
        }

        const money = MoneyManager.getInstance();
        const quests = this.findQuestManager(scene);
        const vegetableMenu = this.findVegetableMenu(scene);
        const locks = scene.getComponentsInChildren(CellLockHandler);
        const fieldCells = this.collectFieldCells(scene, quests);

        const save: ProgressSaveData = {
            ...createDefaultProgressSave(),
            tutorialCompleted: TutorialManager.getInstance()?.hasCompletedTutorial() ?? false,
            money: {
                balance: money?.getMoney() ?? 0,
                totalEarned: money?.getTotalEarned() ?? 0,
            },
            quests: quests?.getQuestState() ?? createDefaultProgressSave().quests,
            unlockedCultures: vegetableMenu?.getUnlockedCultureKeys() ?? [],
            cellLocks: locks.map((lock, index) => ({
                slotId: this.resolveSlotId(lock.node, index + 1),
                uuid: lock.node.uuid,
                name: lock.node.name,
                locked: lock.isLockedNow(),
            })),
            fieldCells: fieldCells.map((cell, index) => ({
                slotId: this.resolveSlotId(cell, index + 1),
                uuid: cell.uuid,
                name: cell.name,
                culture: PlantFieldState.getInstance().getCellCulture(cell),
            })),
            upgrades: upgradeProgressGetSnapshot(),
            passiveIncome: {
                lastSessionTimestamp: Date.now(),
                autoCollectEnabled: PassiveIncomeManager.getAutoCollectEnabled(),
                autoCollectEfficiency: PassiveIncomeManager.getAutoCollectEfficiency(),
            },
        };

        writeProgressSave(save);
        this._save = save;
        this.scheduleCloudSave();
        const upg = Object.keys(save.upgrades).filter(id => (save.upgrades[id] ?? 0) > 0).length;
        dlog(
            `[ProgressManager] 💾 Сохранено: money=${save.money.balance}, planted=${save.fieldCells.filter(c => c.culture).length}, unlocked=${save.unlockedCultures.length}, upgrades>0=${upg}`,
        );
    };

    private scheduleCloudSave() {
        this.unschedule(this._delayedCloudSave);
        this.scheduleOnce(this._delayedCloudSave, Math.max(0, this.cloudSaveDelay));
    }

    private async saveCloudNow() {
        if (this.disableSaving || this._restoring || !this._save) {
            return;
        }
        try {
            await cloudWrite(this._save);
        } catch (err) {
            console.warn('[ProgressManager] cloud save failed, keep local save only', err);
        }
    }

    private async bootstrapRestoreFromBestSource() {
        const local = this._save;
        let selected = local;
        try {
            const cloud = await cloudRead();
            if (cloud && (!local || (cloud.savedAt ?? 0) > (local.savedAt ?? 0))) {
                selected = cloud;
            }
        } catch (err) {
            console.warn('[ProgressManager] cloud read failed, use local save', err);
        }
        this._save = selected;
        this.scheduleOnce(() => this.restoreWhenReady(this.restoreRetries), 0);
    }

    private restoreWhenReady(retriesLeft: number) {
        if (this.disableSaving) {
            return;
        }

        const save = this._save;
        if (!save) {
            this.finishRestoreCycle();
            return;
        }

        const scene = director.getScene();
        if (!scene) {
            return;
        }

        const quests = this.findQuestManager(scene);
        const vegetableMenu = this.findVegetableMenu(scene);

        if (!quests && retriesLeft > 0) {
            this.scheduleOnce(() => this.restoreWhenReady(retriesLeft - 1), this.restoreRetryDelay);
            return;
        }

        this._restoring = true;
        try {
            MoneyManager.getInstance()?.restoreMoney(save.money.balance, save.money.totalEarned);
            quests?.restoreQuestState(save.quests);

            const lockBySlotId = new Map(save.cellLocks.map(item => [item.slotId, item]));
            const lockByUuid = new Map(save.cellLocks.map(item => [item.uuid, item]));
            const lockByName = new Map(save.cellLocks.map(item => [item.name, item]));
            for (const lock of scene.getComponentsInChildren(CellLockHandler)) {
                const slotId = this.resolveSlotId(lock.node, 0);
                const savedLock = (slotId > 0 ? lockBySlotId.get(slotId) : undefined) ?? lockByUuid.get(lock.node.uuid) ?? lockByName.get(lock.node.name);
                if (savedLock) {
                    lock.restoreLockState(savedLock.locked);
                }
            }

            if (vegetableMenu) {
                vegetableMenu.restoreUnlockedCultures(save.unlockedCultures);
                vegetableMenu.restoreFieldCells(save.fieldCells, this.collectFieldCells(scene, quests));
            }

            upgradeProgressReplaceAll(save.upgrades);
            PassiveIncomeManager.setAutoCollectEnabled(!!save.passiveIncome?.autoCollectEnabled);
            PassiveIncomeManager.setAutoCollectEfficiency(Number(save.passiveIncome?.autoCollectEfficiency ?? 1));

            const ts = save.passiveIncome?.lastSessionTimestamp ?? save.savedAt;
            this._offlineLastSessionMs = typeof ts === 'number' && Number.isFinite(ts) ? Math.floor(ts) : Date.now();

            notifyQuestProgress();
        } finally {
            this._restoring = false;
        }

        this.finishRestoreCycle();
    }

    private startPeriodicAutosave() {
        this.unschedule(this.saveNow);
        if (this.disableSaving || this.autosaveInterval <= 0) {
            return;
        }
        this.schedule(this.saveNow, this.autosaveInterval);
    }

    private collectFieldCells(scene: Node, quests: QuestManager | null): Node[] {
        const out: Node[] = [];
        const seen = new Set<string>();

        for (const cell of quests?.getFieldCells() ?? []) {
            this.addFieldCell(out, seen, cell);
        }

        for (const slot of scene.getComponentsInChildren(SlotMenuHandler)) {
            this.addFieldCell(out, seen, slot.node);
        }

        return out;
    }

    private addFieldCell(out: Node[], seen: Set<string>, cell: Node | null | undefined) {
        if (!cell?.isValid || seen.has(cell.uuid)) {
            return;
        }
        seen.add(cell.uuid);
        out.push(cell);
    }

    /** Стабильный id слота: число из конца имени (`Cell1` -> 1), иначе fallback. */
    private resolveSlotId(node: Node | null | undefined, fallback: number): number {
        if (node?.isValid) {
            const m = node.name.match(/(\d+)(?!.*\d)/);
            if (m) {
                const parsed = Math.floor(Number(m[1]));
                if (Number.isFinite(parsed) && parsed > 0) {
                    return parsed;
                }
            }
        }
        const normalizedFallback = Math.floor(Number(fallback));
        return Number.isFinite(normalizedFallback) && normalizedFallback > 0 ? normalizedFallback : 0;
    }

    private finishRestoreCycle() {
        this._restoreCompleted = true;
        this.startPeriodicAutosave();
        if (!this.disableSaving && this._offlineLastSessionMs !== null) {
            this._offlineApplyAttempts = 0;
            this.scheduleOnce(this._applyOfflineIncomeTick, 0);
        }
        if (this._pendingSaveRequested) {
            this._pendingSaveRequested = false;
            this.saveSoon();
        }
    }

    private tryApplyOfflineIncomeOnce() {
        if (this.disableSaving || this._offlineLastSessionMs === null) {
            return;
        }
        if (!PassiveIncomeManager.isReadyForOffline() || !UpgradeManager.isReady()) {
            if (this._offlineApplyAttempts < 120) {
                this._offlineApplyAttempts++;
                this.scheduleOnce(this._applyOfflineIncomeTick, 0.05);
            }
            return;
        }
        const ts = this._offlineLastSessionMs;
        this._offlineLastSessionMs = null;
        this._offlineApplyAttempts = 0;
        PassiveIncomeManager.applyOfflineCatchUp(ts);
        notifyQuestProgress();
        this.saveSoon();
    }
    private findQuestManager(root: Node): QuestManager | null {
        const stack: Node[] = [root];
        while (stack.length) {
            const n = stack.pop()!;
            const qm = n.getComponent(QuestManager);
            if (qm) {
                return qm;
            }
            for (let i = 0; i < n.children.length; i++) {
                stack.push(n.children[i]);
            }
        }
        return null;
    }

    private findVegetableMenu(root: Node): VegetableMenuHandler | null {
        const stack: Node[] = [root];
        while (stack.length) {
            const n = stack.pop()!;
            const vm = n.getComponent(VegetableMenuHandler);
            if (vm) {
                return vm;
            }
            for (let i = 0; i < n.children.length; i++) {
                stack.push(n.children[i]);
            }
        }
        return null;
    }
}
