import { _decorator, Component, EditBox, Node } from 'cc';

const { ccclass, property } = _decorator;

@ccclass('MoneyBar')
export class MoneyBar extends Component {
    @property({ type: EditBox, tooltip: 'EditBox для отображения денег' })
    moneyText: EditBox = null;

    @property({ tooltip: 'Стартовое значение денег' })
    startMoney = 0;

    onLoad() {
        if (!this.moneyText) {
            const moneyTextNode = this.findFirstNodeByName(this.node, 'MoneyText');
            this.moneyText = moneyTextNode?.getComponent(EditBox) ?? null;
        }
        this.setMoney(this.getMoney() || this.startMoney);
    }

    add(amount: number) {
        this.setMoney(this.getMoney() + amount);
    }

    getMoney(): number {
        const s = (this.moneyText?.string ?? '').trim();
        const n = Number.parseInt(s, 10);
        return Number.isFinite(n) ? n : 0;
    }

    setMoney(value: number) {
        if (!this.moneyText) return;
        const v = Number.isFinite(value) ? Math.trunc(value) : 0;
        this.moneyText.string = String(v);
    }

    private findFirstNodeByName(root: Node, name: string): Node | null {
        const stack: Node[] = [root];
        while (stack.length) {
            const n = stack.pop()!;
            if (n.name === name) return n;
            for (const c of n.children) stack.push(c);
        }
        return null;
    }
}

