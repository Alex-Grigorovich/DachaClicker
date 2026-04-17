import { _decorator, Component, Label } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('MoneyManager')
export class MoneyManager extends Component {
    @property({ type: Label, tooltip: 'Label с деньгами (MoneyTextCount)' })
    moneyLabel: Label = null;

    private static _instance: MoneyManager | null = null;

    public static get instance(): MoneyManager {
        if (!MoneyManager._instance) {
            console.error('[MoneyManager] ❌ Instance not found! Убедись, что MoneyManager добавлен на сцену.');
        }
        return MoneyManager._instance!;
    }

    onLoad() {
        if (MoneyManager._instance && MoneyManager._instance !== this) {
            console.warn('[MoneyManager] Multiple instances detected. Destroying duplicate.');
            this.node.destroy();
            return;
        }

        MoneyManager._instance = this;

        // ←←← ЭТО САМОЕ ВАЖНОЕ ИСПРАВЛЕНИЕ
        this.resetToZero();

        console.log('[MoneyManager] ✅ Singleton initialized | Баланс сброшен в 0');
    }

    onDestroy() {
        if (MoneyManager._instance === this) {
            MoneyManager._instance = null;
        }
    }

    /** Сбрасывает деньги в 0 при старте игры */
    private resetToZero() {
        if (!this.moneyLabel) {
            console.error('[MoneyManager] ❌ moneyLabel не назначен в инспекторе!');
            return;
        }

        this.moneyLabel.string = '0';
        console.log('[MoneyManager] 💰 Начальный баланс установлен: 0');
    }

    addMoney(amount: number) {
        if (!this.moneyLabel) {
            console.error('[MoneyManager] ❌ moneyLabel не назначен!');
            return;
        }

        const current = parseInt(this.moneyLabel.string || '0', 10) || 0;
        const newTotal = current + Math.floor(amount);   // на всякий случай целое число

        this.moneyLabel.string = newTotal.toString();
        console.log(`[MoneyManager] 💰 +${amount} | Новый баланс: ${newTotal}`);
    }
}