import { _decorator, Component, Node, Label, Button } from 'cc';
const { ccclass, property } = _decorator;

@ccclass('CellLockHandler')
export class CellLockHandler extends Component {
    @property({ type: Node, tooltip: 'Нода Lock (фон + замок + текст)' })
    lockNode: Node | null = null;

    @property({ type: Label, tooltip: 'LabelLock с ценой разблокировки' })
    labelLock: Label | null = null;

    @property({ type: Node, tooltip: 'Нода MoneyTextCount (отображает текущий баланс)' })
    moneyTextNode: Node | null = null;

    @property({ tooltip: 'Блокировка без цены: клик по замку не снимает её (разблокировка только из кода)' })
    lockWithoutPrice: boolean = false;

    private _cellButton: Button | null = null;
    private _isLocked: boolean = true; // По умолчанию всегда заблокировано

    onLoad() {
        // Получаем кнопку ячейки
        this._cellButton = this.node.getComponent(Button);
        
        // 🔒 ПРИНУДИТЕЛЬНО БЛОКИРУЕМ ЯЧЕЙКУ ПРИ СТАРТЕ
        // Это гарантирует, что даже если цена 0, замок будет висеть до клика
        this.applyLockState(true);

        // Вешаем клик на саму ноду Lock
        if (this.lockNode) {
            this.lockNode.on(Node.EventType.TOUCH_END, this.onLockClicked, this);
            this.lockNode.on(Node.EventType.MOUSE_UP, this.onLockClicked, this);
        }
    }

    /** Обработка клика по замку */
    private onLockClicked() {
        if (this.lockWithoutPrice) {
            return;
        }

        // Проверяем актуальный баланс и цену
        const cost = this.parseNumber(this.labelLock?.string || '0');
        const moneyLabel = this.moneyTextNode?.getComponent(Label);
        const currentMoney = moneyLabel ? this.parseNumber(moneyLabel.string) : 0;

        // ✅ Если денег достаточно (или цена бесплатная = 0), разблокируем
        if (currentMoney >= cost) {
            console.log(`[CellLockHandler] ✅ Разблокировано! (Цена: ${cost}, Баланс: ${currentMoney})`);
            this.applyLockState(false); // Снимаем блок
            
            // 💰 Если нужно списывать деньги даже за 0 (для активации триггеров), раскомментируй:
            // this.deductMoney(cost);
        } else {
            // ❌ Денег не хватает
            console.log(`[CellLockHandler]  Недостаточно средств! Нужно: ${cost}, Есть: ${currentMoney}`);
            // Здесь можно добавить анимацию "отказа" (тряску)
        }
    }

    /** Снять блокировку из другого скрипта (при lockWithoutPrice клик по замку не работает) */
    public unlockByScript() {
        this.applyLockState(false);
    }

    /** Применяет состояние блокировки (Визуал + Кнопка) */
    private applyLockState(isLocked: boolean) {
        this._isLocked = isLocked;

        // 1. Скрываем/показываем замок
        if (this.lockNode) {
            this.lockNode.active = isLocked;
        }

        // 2. Блокируем/разблокируем клик по ячейке (чтобы SlotMenuHandler не сработал)
        if (this._cellButton) {
            this._cellButton.interactable = !isLocked;
        }
    }

    /** Утилита: извлекает только цифры из строки */
    private parseNumber(str: string): number {
        if (!str) return 0;
        // Убираем всё кроме цифр
        const cleanStr = str.replace(/\D/g, '');
        return parseInt(cleanStr) || 0;
    }

    /** Пример функции списания денег */
    private deductMoney(amount: number) {
        // Интеграция с MoneyManager
        console.log(`[CellLockHandler] Списано: ${amount}`);
    }
}