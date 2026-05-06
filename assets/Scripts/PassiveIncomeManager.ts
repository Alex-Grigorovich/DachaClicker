import { BalanceCultureDef, DEFAULT_BALANCE_RESOURCE_PATH, loadBalanceData } from './BalanceData';
import { PlantCultureKey, PlantFieldState } from './PlantFieldState';
import { notifyQuestPassiveEarned } from './QuestBridge';
import { UpgradeManager } from './UpgradeManager';

/** Ленивый доступ к MoneyManager — избегает циклического импорта с MoneyManager → PassiveIncomeManager. */
function getMoneyManagerInstance(): import('./MoneyManager').MoneyManager | null {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('./MoneyManager').MoneyManager.getInstance();
}
/**
 * Доменный менеджер пассивного дохода.
 * Работает тиками: считает доход по посадкам и начисляет агрегированно.
 */
export class PassiveIncomeManager {
    private static _initialized = false;
    private static _loading = false;
    private static _resourcePath = DEFAULT_BALANCE_RESOURCE_PATH;
    private static _incomeByCulture = new Map<PlantCultureKey, number>();
    /** Лимит оффлайн-пассивки в секундах (из баланса или дефолт). */
    private static _offlineCapSeconds = 28800;

    private static _tickIntervalSec = 0.25;
    private static _timeAccumulator = 0;
    private static _moneyAccumulator = 0;

    /** Внешний флаг (например, для квеста/скрипта). */
    private static _autoCollectEnabled = false;
    /** Внешний множитель (например, для спец-ивента). */
    private static _autoCollectEfficiency = 1;

    public static initialize(resourcePath = DEFAULT_BALANCE_RESOURCE_PATH): void {
        if (resourcePath) {
            this._resourcePath = resourcePath;
        }
        if (this._initialized || this._loading) {
            return;
        }
        this._loading = true;
        loadBalanceData(this._resourcePath, (err, data) => {
            this._loading = false;
            if (err || !data) {
                console.warn('[PassiveIncomeManager] Не удалось загрузить BALANCE_DATA, пассивный доход отключен.', err);
                return;
            }
            this._incomeByCulture.clear();
            for (const def of data.cultures ?? []) {
                this._incomeByCulture.set(def.key, this.readPassiveIncome(def));
            }
            const capRaw = Number(data.offlineCapSeconds ?? 28800);
            this._offlineCapSeconds = Number.isFinite(capRaw) ? Math.max(60, Math.floor(capRaw)) : 28800;
            this._initialized = true;
            console.log(`[PassiveIncomeManager] ✅ Загружено культур с пассивкой: ${this._incomeByCulture.size}`);
        });
    }

    public static isReadyForOffline(): boolean {
        return this._initialized && UpgradeManager.isReady();
    }

    /**
     * Одноразовое начисление пассивки за время между lastSessionTimestamp и сейчас (с кэпом).
     * Вызывать после восстановления сейва и загрузки апгрейдов.
     */
    public static applyOfflineCatchUp(lastSessionTimestampMs: number): number {
        if (!this.isReadyForOffline()) {
            return 0;
        }
        const mm = getMoneyManagerInstance();
        if (!mm) {
            return 0;
        }
        const now = Date.now();
        const last = Math.max(0, Math.floor(Number(lastSessionTimestampMs) || 0));
        let elapsedSec = (now - last) / 1000;
        if (elapsedSec <= 1) {
            return 0;
        }
        elapsedSec = Math.min(elapsedSec, this._offlineCapSeconds);
        const perSec = this.getCurrentIncomePerSecond();
        if (perSec <= 0) {
            return 0;
        }
        const grant = Math.floor(perSec * elapsedSec);
        if (grant <= 0) {
            return 0;
        }
        mm.addMoney(grant);
        notifyQuestPassiveEarned(grant);
        return grant;
    }

    public static step(deltaTimeSec: number): void {
        if (!this._initialized) {
            return;
        }
        const dt = Number(deltaTimeSec);
        if (!Number.isFinite(dt) || dt <= 0) {
            return;
        }
        this._timeAccumulator += dt;
        const tick = Math.max(0.05, this._tickIntervalSec);
        if (this._timeAccumulator < tick) {
            return;
        }
        while (this._timeAccumulator >= tick) {
            this._timeAccumulator -= tick;
            this.processTick(tick);
        }
    }

    public static setTickInterval(seconds: number): void {
        if (!Number.isFinite(seconds)) {
            return;
        }
        this._tickIntervalSec = Math.max(0.05, seconds);
    }

    public static setAutoCollectEnabled(enabled: boolean): void {
        this._autoCollectEnabled = !!enabled;
    }

    public static setAutoCollectEfficiency(multiplier: number): void {
        const v = Number(multiplier);
        this._autoCollectEfficiency = Number.isFinite(v) ? Math.max(0, v) : 1;
    }

    public static getAutoCollectEnabled(): boolean {
        return this.isAutoCollectEnabled();
    }

    public static getAutoCollectEfficiency(): number {
        return this.getEffectiveAutoCollectEfficiency();
    }

    public static getCurrentIncomePerSecond(): number {
        if (!this.isAutoCollectEnabled()) {
            return 0;
        }
        return this.computePassivePerSecond() * this.getEffectiveAutoCollectEfficiency();
    }

    private static processTick(tickSec: number): void {
        if (!this.isAutoCollectEnabled()) {
            return;
        }
        const perSecond = this.computePassivePerSecond();
        if (perSecond <= 0) {
            return;
        }
        const earnedFloat = perSecond * tickSec * this.getEffectiveAutoCollectEfficiency();
        if (earnedFloat <= 0) {
            return;
        }

        this._moneyAccumulator += earnedFloat;
        const grant = Math.floor(this._moneyAccumulator);
        if (grant <= 0) {
            return;
        }
        this._moneyAccumulator -= grant;

        const money = getMoneyManagerInstance();
        if (!money) {
            return;
        }
        money.addMoney(grant);
        notifyQuestPassiveEarned(grant);
    }

    private static computePassivePerSecond(): number {
        const field = PlantFieldState.getInstance();
        let basePerSecond = 0;
        for (const key of this._incomeByCulture.keys()) {
            if (!key) {
                continue;
            }
            const count = field.countByCulture(key);
            if (count <= 0) {
                continue;
            }
            basePerSecond += (this._incomeByCulture.get(key) ?? 0) * count;
        }
        return UpgradeManager.getPassiveIncomePerSecond(basePerSecond);
    }

    private static isAutoCollectEnabled(): boolean {
        if (this._autoCollectEnabled) {
            return true;
        }
        return UpgradeManager.hasAutoCollectUnlock();
    }

    private static getEffectiveAutoCollectEfficiency(): number {
        const bonusPct = UpgradeManager.getAutoCollectEfficiencyPercent();
        const byUpgrade = Math.max(0, 1 + bonusPct / 100);
        return Math.max(0, this._autoCollectEfficiency * byUpgrade);
    }

    private static readPassiveIncome(def: BalanceCultureDef): number {
        const raw = Number(def.passiveIncomePerSecond ?? 0);
        if (!Number.isFinite(raw)) {
            return 0;
        }
        return Math.max(0, raw);
    }
}
