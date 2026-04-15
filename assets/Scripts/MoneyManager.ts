import { _decorator, Component, Label } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('MoneyManager')
export class MoneyManager extends Component {

    @property({ type: Label })
    moneyLabel: Label = null;

    // Принимаем массив от emit([amount])
    addMoney(amount: number | number[] | any) {
        if (!this.moneyLabel) return;

        // Если пришёл массив (как делает emit([value]))
        let realAmount = 1;
        
        if (Array.isArray(amount) && amount.length > 0) {
            realAmount = Number(amount[0]) || 1;
        } else if (typeof amount === 'number') {
            realAmount = amount;
        }

        const current = parseInt(this.moneyLabel.string || '0', 10);
        const newTotal = (isNaN(current) ? 0 : current) + realAmount;

        this.moneyLabel.string = newTotal.toString();
    }
}