import { _decorator, Component, Label, tween, Tween } from 'cc';
import { formatMoneyDisplay, formatPassiveIncomePerSecond } from './formatMoneyDisplay';
import { notifyProgressChanged } from './ProgressBridge';
import { PassiveIncomeManager } from './PassiveIncomeManager';
import { dlog } from './Debug';



const { ccclass, property } = _decorator;



@ccclass('MoneyManager')

export class MoneyManager extends Component {

    @property({ type: Label, tooltip: 'Label с деньгами (MoneyTextCount)' })

    moneyLabel: Label = null;

    @property({
        type: Label,
        tooltip: 'Индикатор пассивного дохода +X/с (например Label на ноде MoneyDPS); иначе ищем MoneyDPS рядом с moneyLabel',
    })
    passiveIncomeLabel: Label | null = null;



    @property({ tooltip: 'Баланс при старте сцены (до add/subtract)' })

    startingBalance = 0;

    @property({ tooltip: 'Длительность rewarded-бафа x2 по умолчанию (сек)' })
    defaultDoubleHarvestDurationSec = 120;



    /** Единственный источник правды: целое число, не строка UI. */

    private _balance = 0;

    /** Сумма всех положительных начислений (для квестов total_earned). */

    private _totalEarned = 0;
    private _displayBalance = 0;
    private _labelTweenState = { value: 0 };
    private _labelTween: Tween<{ value: number }> | null = null;
    private _doubleHarvestUntil = 0;



    private static _instance: MoneyManager | null = null;



    public static get instance(): MoneyManager {

        if (!MoneyManager._instance) {

            console.error('[MoneyManager] ❌ Instance not found! Убедись, что MoneyManager добавлен на сцену.');

        }

        return MoneyManager._instance!;

    }



    public static getInstance(): MoneyManager | null {

        return MoneyManager._instance;

    }



    onLoad() {

        if (MoneyManager._instance && MoneyManager._instance !== this) {

            console.warn('[MoneyManager] Multiple instances detected. Destroying duplicate.');

            this.node.destroy();

            return;

        }



        MoneyManager._instance = this;



        this.applyStartingBalance();

        this.bindPassiveIncomeLabelIfNeeded();
        this.syncPassiveIncomeLabel();

        dlog(`[MoneyManager] ✅ Singleton initialized | Баланс: ${this._balance}`);

    }

    update() {
        this.syncPassiveIncomeLabel();
    }



    onDestroy() {

        if (MoneyManager._instance === this) {

            MoneyManager._instance = null;

        }

    }



    private applyStartingBalance() {

        const v = Math.max(0, Math.floor(this.startingBalance));

        this._balance = v;
        this._displayBalance = v;
        this._labelTweenState.value = v;

        this.syncLabel();

        if (!this.moneyLabel) {

            console.error('[MoneyManager] ❌ moneyLabel не назначен в инспекторе!');

            return;

        }

        dlog(`[MoneyManager] 💰 Начальный баланс: ${this._balance}`);

    }

    private bindPassiveIncomeLabelIfNeeded() {
        if (this.passiveIncomeLabel?.node?.isValid) {
            return;
        }
        const parent = this.moneyLabel?.node?.parent;
        if (!parent?.isValid) {
            return;
        }
        const dps = parent.getChildByName('MoneyDPS');
        const lbl = dps?.getComponent(Label) ?? null;
        if (lbl) {
            this.passiveIncomeLabel = lbl;
        }
    }



    /** Абсолютная установка (сейв, отладка, старт из другого UI). */

    setMoney(value: number) {

        const v = Math.max(0, Math.floor(Number(value) || 0));

        this._balance = v;

        this.syncLabel();

        dlog(`[MoneyManager] 💰 Баланс установлен: ${this._balance}`);
        notifyProgressChanged();

    }

    /** Восстановление из сейва одним шагом, чтобы total_earned не пересчитывался как новый доход. */
    restoreMoney(balance: number, totalEarned: number) {

        this._balance = Math.max(0, Math.floor(Number(balance) || 0));

        this._totalEarned = Math.max(0, Math.floor(Number(totalEarned) || 0));
        this._displayBalance = this._balance;
        this._labelTweenState.value = this._balance;

        this.syncLabel();

        dlog(`[MoneyManager] 💾 Баланс восстановлен: ${this._balance}, всего заработано: ${this._totalEarned}`);

    }



    getMoney(): number {

        return this._balance;

    }



    getTotalEarned(): number {

        return this._totalEarned;

    }

    public activateDoubleHarvest(durationSec = this.defaultDoubleHarvestDurationSec): void {
        const durationMs = Math.max(0, Math.floor(durationSec * 1000));
        this._doubleHarvestUntil = Math.max(this._doubleHarvestUntil, Date.now() + durationMs);
    }

    public hasDoubleHarvestActive(now = Date.now()): boolean {
        return now < this._doubleHarvestUntil;
    }

    public applyHarvestMultiplier(baseReward: number): number {
        const value = Math.max(0, Math.floor(baseReward));
        if (!this.hasDoubleHarvestActive()) {
            return value;
        }
        return value * 2;
    }



    /** Списывает сумму, если баланс достаточен. */

    subtractMoney(amount: number): boolean {

        const cost = Math.max(0, Math.floor(amount));

        if (this._balance < cost) {

            return false;

        }

        this._balance -= cost;

        this.syncLabel();

        dlog(`[MoneyManager] 💰 -${cost} | Новый баланс: ${this._balance}`);
        notifyProgressChanged();

        return true;

    }



    addMoney(amount: number) {

        const delta = Math.floor(amount);

        this._balance += delta;

        if (delta > 0) {

            this._totalEarned += delta;

        }

        this.syncLabel();

        dlog(`[MoneyManager] 💰 +${delta} | Новый баланс: ${this._balance}`);
        notifyProgressChanged();

    }



    private syncLabel() {

        if (!this.moneyLabel) {

            return;

        }

        this.animateMoneyLabelTo(this._balance);
        this.syncPassiveIncomeLabel();

    }

    private animateMoneyLabelTo(targetBalance: number) {
        if (!this.moneyLabel?.isValid) {
            return;
        }
        const target = Math.max(0, Math.floor(targetBalance));
        if (this._labelTween) {
            this._labelTween.stop();
            this._labelTween = null;
        }
        const from = Math.max(0, Math.floor(this._displayBalance));
        if (from === target) {
            this.moneyLabel.string = formatMoneyDisplay(target);
            return;
        }
        this._labelTweenState.value = from;
        this._labelTween = tween(this._labelTweenState)
            .to(0.2, { value: target }, {
                easing: 'quadOut',
                onUpdate: (state) => {
                    const v = Math.max(0, Math.floor(state.value));
                    this._displayBalance = v;
                    if (this.moneyLabel?.isValid) {
                        this.moneyLabel.string = formatMoneyDisplay(v);
                    }
                },
            })
            .call(() => {
                this._displayBalance = target;
                if (this.moneyLabel?.isValid) {
                    this.moneyLabel.string = formatMoneyDisplay(target);
                }
                this._labelTween = null;
            })
            .start();
    }

    private syncPassiveIncomeLabel() {
        this.bindPassiveIncomeLabelIfNeeded();
        if (!this.passiveIncomeLabel?.node?.isValid) {
            return;
        }
        const rate = PassiveIncomeManager.getCurrentIncomePerSecond();
        this.passiveIncomeLabel.string = formatPassiveIncomePerSecond(rate);
    }

}

