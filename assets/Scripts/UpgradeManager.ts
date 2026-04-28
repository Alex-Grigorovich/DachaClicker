import { DEFAULT_BALANCE_RESOURCE_PATH, BalanceCultureKey, BalanceUpgradeDef, loadBalanceData } from './BalanceData';
import { MoneyManager } from './MoneyManager';
import { upgradeProgressGetLevel, upgradeProgressSetLevel } from './UpgradeProgressStore';
import { UnlockManager } from './UnlockManager';

export type UpgradeBuyResultReason =
    | 'ok'
    | 'not_ready'
    | 'not_found'
    | 'locked'
    | 'max_level'
    | 'not_enough_money'
    | 'money_manager_missing';

export interface UpgradeBuyResult {
    ok: boolean;
    reason: UpgradeBuyResultReason;
    levelAfter: number;
    costPaid: number;
}

/**
 * Доменный менеджер апгрейдов.
 * Не привязан к конкретному узлу сцены: хранит определения, проверяет unlock, покупает уровни
 * и отдаёт модификаторы для клика/кулдауна/квест-наград.
 */
export class UpgradeManager {
    private static _inited = false;
    private static _loading = false;
    private static _resourcePath = DEFAULT_BALANCE_RESOURCE_PATH;
    private static _upgrades: BalanceUpgradeDef[] = [];
    private static _byId = new Map<string, BalanceUpgradeDef>();

    public static initialize(resourcePath = DEFAULT_BALANCE_RESOURCE_PATH): void {
        if (resourcePath) {
            this._resourcePath = resourcePath;
        }
        if (this._inited || this._loading) {
            return;
        }
        this._loading = true;
        loadBalanceData(this._resourcePath, (err, data) => {
            this._loading = false;
            if (err || !data) {
                console.warn('[UpgradeManager] Не удалось загрузить BALANCE_DATA, апгрейды временно отключены.', err);
                return;
            }

            this._upgrades = [...(data.upgrades ?? [])];
            this._byId.clear();
            for (const u of this._upgrades) {
                if (u?.id) {
                    this._byId.set(u.id, u);
                }
            }
            this._inited = true;
            console.log(`[UpgradeManager] ✅ Загружено апгрейдов: ${this._upgrades.length}`);
        });
    }

    public static isReady(): boolean {
        return this._inited;
    }

    public static getAll(): BalanceUpgradeDef[] {
        return [...this._upgrades];
    }

    public static getLevel(upgradeId: string): number {
        return upgradeProgressGetLevel(upgradeId);
    }

    public static getNextCost(upgradeId: string): number {
        const def = this._byId.get(upgradeId);
        if (!def) {
            return 0;
        }
        const level = this.getLevel(upgradeId);
        if (level >= Math.max(0, def.maxLevel)) {
            return 0;
        }
        const idx = Math.max(0, Math.min(level, def.costs.length - 1));
        return Math.max(0, Math.floor(def.costs[idx] ?? 0));
    }

    public static canPurchase(upgradeId: string): UpgradeBuyResultReason {
        if (!this._inited) {
            return 'not_ready';
        }
        const def = this._byId.get(upgradeId);
        if (!def) {
            return 'not_found';
        }
        if (!this.isUnlocked(def)) {
            return 'locked';
        }
        const level = this.getLevel(upgradeId);
        if (level >= Math.max(0, def.maxLevel)) {
            return 'max_level';
        }
        const mm = MoneyManager.getInstance();
        if (!mm) {
            return 'money_manager_missing';
        }
        const cost = this.getNextCost(upgradeId);
        if (mm.getMoney() < cost) {
            return 'not_enough_money';
        }
        return 'ok';
    }

    public static purchase(upgradeId: string): UpgradeBuyResult {
        const reason = this.canPurchase(upgradeId);
        const before = this.getLevel(upgradeId);
        if (reason !== 'ok') {
            return {
                ok: false,
                reason,
                levelAfter: before,
                costPaid: 0,
            };
        }

        const mm = MoneyManager.getInstance();
        if (!mm) {
            return {
                ok: false,
                reason: 'money_manager_missing',
                levelAfter: before,
                costPaid: 0,
            };
        }

        const cost = this.getNextCost(upgradeId);
        if (!mm.subtractMoney(cost)) {
            return {
                ok: false,
                reason: 'not_enough_money',
                levelAfter: before,
                costPaid: 0,
            };
        }

        const after = before + 1;
        upgradeProgressSetLevel(upgradeId, after);
        console.log(`[UpgradeManager] 🛒 Куплен ${upgradeId}: ${before} -> ${after}, cost=${cost}`);
        return {
            ok: true,
            reason: 'ok',
            levelAfter: after,
            costPaid: cost,
        };
    }

    public static getCultureUnlockCost(baseCost: number): number {
        const discountPct = this.getSummedPercentEffect('culture_unlock_discount_percent');
        const mul = Math.max(0, 1 - discountPct / 100);
        return Math.max(0, Math.floor(baseCost * mul));
    }

    public static getQuestMoneyReward(baseAmount: number): number {
        const pct = this.getSummedPercentEffect('quest_money_bonus_percent');
        return Math.max(0, Math.floor(baseAmount * (1 + pct / 100)));
    }

    public static getCooldownTime(baseCooldown: number): number {
        const mulA = this.getCombinedMultiplierEffect('cooldown_multiplier');
        const mulB = this.getCombinedMultiplierEffect('extra_cooldown_multiplier');
        const out = baseCooldown * mulA * mulB;
        return Math.max(0.05, out);
    }

    public static getClickReward(baseClickIncome: number, cultureKey: BalanceCultureKey | '' | 'unknown'): number {
        let value = Math.max(0, baseClickIncome);

        value += this.getSummedFlatEffect('add_click_income_flat');

        if (cultureKey && cultureKey !== 'unknown') {
            value += this.getCropSpecificFlatBonus(cultureKey);
        }

        const globalPct = this.getSummedPercentEffect('global_click_bonus_percent');
        if (globalPct > 0) {
            value *= 1 + globalPct / 100;
        }

        const doubleChancePct = this.getSummedPercentEffect('double_click_chance_percent');
        if (doubleChancePct > 0) {
            const p = Math.max(0, Math.min(1, doubleChancePct / 100));
            if (Math.random() < p) {
                value *= 2;
            }
        }

        return Math.max(0, Math.floor(value));
    }

    /**
     * Детерминированное значение для UI (без случайного x2),
     * чтобы лейблы не "прыгали" от double_click_chance_percent.
     */
    public static getClickRewardPreview(baseClickIncome: number, cultureKey: BalanceCultureKey | '' | 'unknown'): number {
        let value = Math.max(0, baseClickIncome);

        value += this.getSummedFlatEffect('add_click_income_flat');

        if (cultureKey && cultureKey !== 'unknown') {
            value += this.getCropSpecificFlatBonus(cultureKey);
        }

        const globalPct = this.getSummedPercentEffect('global_click_bonus_percent');
        if (globalPct > 0) {
            value *= 1 + globalPct / 100;
        }

        return Math.max(0, Math.floor(value));
    }

    private static isUnlocked(def: BalanceUpgradeDef): boolean {
        const cond = def.unlockCondition;
        if (!cond?.type) {
            return true;
        }

        if (cond.type === 'culture_unlocked') {
            const key = cond.cultureKey;
            return key ? UnlockManager.isCultureUnlocked(key) : false;
        }

        const mm = MoneyManager.getInstance();
        if (!mm) {
            return false;
        }

        if (cond.type === 'earned_money') {
            return mm.getTotalEarned() >= Math.max(0, cond.value ?? 0);
        }
        if (cond.type === 'current_money') {
            return mm.getMoney() >= Math.max(0, cond.value ?? 0);
        }

        return true;
    }

    private static getSummedFlatEffect(effectType: string): number {
        if (!this._inited) {
            return 0;
        }
        let sum = 0;
        for (const def of this._upgrades) {
            if (def.effectType !== effectType) {
                continue;
            }
            const level = Math.min(this.getLevel(def.id), Math.max(0, def.maxLevel));
            if (level <= 0) {
                continue;
            }
            for (let i = 1; i <= level; i++) {
                sum += this.getValueAtLevel(def, i);
            }
        }
        return sum;
    }

    private static getSummedPercentEffect(effectType: string): number {
        return this.getSummedFlatEffect(effectType);
    }

    private static getCombinedMultiplierEffect(effectType: string): number {
        if (!this._inited) {
            return 1;
        }
        let mul = 1;
        for (const def of this._upgrades) {
            if (def.effectType !== effectType) {
                continue;
            }
            const level = Math.min(this.getLevel(def.id), Math.max(0, def.maxLevel));
            if (level <= 0) {
                continue;
            }
            const v = this.getValueAtLevel(def, level);
            if (v > 0) {
                mul *= v;
            }
        }
        return Math.max(0.05, mul);
    }

    private static getCropSpecificFlatBonus(cultureKey: BalanceCultureKey): number {
        if (!this._inited) {
            return 0;
        }
        let sum = 0;
        for (const def of this._upgrades) {
            if (def.effectType !== 'add_crop_click_income_flat') {
                continue;
            }
            if (def.unlockCondition?.cultureKey !== cultureKey) {
                continue;
            }
            const level = Math.min(this.getLevel(def.id), Math.max(0, def.maxLevel));
            if (level <= 0) {
                continue;
            }
            for (let i = 1; i <= level; i++) {
                sum += this.getValueAtLevel(def, i);
            }
        }
        return sum;
    }

    private static getValueAtLevel(def: BalanceUpgradeDef, level: number): number {
        if (level <= 0) {
            return 0;
        }
        if (!def.effectValues.length) {
            return 0;
        }
        const idx = Math.max(0, Math.min(level - 1, def.effectValues.length - 1));
        const v = Number(def.effectValues[idx] ?? 0);
        return Number.isFinite(v) ? v : 0;
    }
}
