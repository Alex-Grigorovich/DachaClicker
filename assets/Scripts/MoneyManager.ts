import { _decorator, Component, Label } from 'cc';
import { formatMoneyDisplay, formatPassiveIncomePerSecond } from './formatMoneyDisplay';
import { notifyProgressChanged } from './ProgressBridge';
import { PassiveIncomeManager } from './PassiveIncomeManager';



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



    /** Единственный источник правды: целое число, не строка UI. */

    private _balance = 0;

    /** Сумма всех положительных начислений (для квестов total_earned). */

    private _totalEarned = 0;



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

        console.log(`[MoneyManager] ✅ Singleton initialized | Баланс: ${this._balance}`);

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

        this.syncLabel();

        if (!this.moneyLabel) {

            console.error('[MoneyManager] ❌ moneyLabel не назначен в инспекторе!');

            return;

        }

        console.log(`[MoneyManager] 💰 Начальный баланс: ${this._balance}`);

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

        console.log(`[MoneyManager] 💰 Баланс установлен: ${this._balance}`);
        notifyProgressChanged();

    }

    /** Восстановление из сейва одним шагом, чтобы total_earned не пересчитывался как новый доход. */
    restoreMoney(balance: number, totalEarned: number) {

        this._balance = Math.max(0, Math.floor(Number(balance) || 0));

        this._totalEarned = Math.max(0, Math.floor(Number(totalEarned) || 0));

        this.syncLabel();

        console.log(`[MoneyManager] 💾 Баланс восстановлен: ${this._balance}, всего заработано: ${this._totalEarned}`);

    }



    getMoney(): number {

        return this._balance;

    }



    getTotalEarned(): number {

        return this._totalEarned;

    }



    /** Списывает сумму, если баланс достаточен. */

    subtractMoney(amount: number): boolean {

        const cost = Math.max(0, Math.floor(amount));

        if (this._balance < cost) {

            return false;

        }

        this._balance -= cost;

        this.syncLabel();

        console.log(`[MoneyManager] 💰 -${cost} | Новый баланс: ${this._balance}`);
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

        console.log(`[MoneyManager] 💰 +${delta} | Новый баланс: ${this._balance}`);
        notifyProgressChanged();

    }



    private syncLabel() {

        if (!this.moneyLabel) {

            return;

        }

        this.moneyLabel.string = formatMoneyDisplay(this._balance);
        this.syncPassiveIncomeLabel();

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

