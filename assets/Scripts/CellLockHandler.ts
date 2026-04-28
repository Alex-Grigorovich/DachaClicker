import { _decorator, Component, Node, Label, Button, UITransform } from 'cc';
import { MoneyManager } from './MoneyManager';
import { notifyQuestProgress } from './QuestBridge';
import { notifyProgressChanged } from './ProgressBridge';
import { flashNamedNodesRed, shakeNodeHorizontal } from './UiMoneyDenyFeedback';

const { ccclass, property } = _decorator;

const LOCK_ICON_NAMES = ['Lock1', 'Lock2', 'Lock3'] as const;

@ccclass('CellLockHandler')
export class CellLockHandler extends Component {
    @property({ type: Node, tooltip: 'Нода Lock (фон + замок + текст)' })
    lockNode: Node | null = null;

    @property({ type: Label, tooltip: 'LabelLock с ценой разблокировки' })
    labelLock: Label | null = null;

    @property({ tooltip: 'Блокировка без цены: клик по замку не снимает её (разблокировка только из кода)' })
    lockWithoutPrice: boolean = false;

    private _cellButton: Button | null = null;
    private _isLocked: boolean = true; // По умолчанию всегда заблокировано
    private _lockClickConsumeUntil = 0;

    onLoad() {
        // Получаем кнопку ячейки
        this._cellButton = this.node.getComponent(Button);

        this.ensureLockClickBinding();

        // 🔒 ПРИНУДИТЕЛЬНО БЛОКИРУЕМ ЯЧЕЙКУ ПРИ СТАРТЕ
        // Это гарантирует, что даже если цена 0, замок будет висеть до клика
        this.applyLockState(true);
    }

    onDestroy() {
        if (this.lockNode?.isValid) {
            for (const n of this.collectLockPointerNodes()) {
                n.off(Node.EventType.TOUCH_END, this.onLockPointerEnded, this);
                n.off(Node.EventType.MOUSE_UP, this.onLockPointerEnded, this);
            }
        }
    }

    /**
     * Клик попадает в дочерние спрайты/лейбл (как cellList в VegetableMenuHandler), а не в корень Lock.
     * Вешаем TOUCH_END / MOUSE_UP на lockNode и все ноды с UITransform под ним.
     */
    private ensureLockClickBinding() {
        if (!this.lockNode) {
            return;
        }

        for (const n of this.collectLockPointerNodes()) {
            n.on(Node.EventType.TOUCH_END, this.onLockPointerEnded, this);
            n.on(Node.EventType.MOUSE_UP, this.onLockPointerEnded, this);
        }
    }

    private collectLockPointerNodes(): Node[] {
        if (!this.lockNode) {
            return [];
        }
        const out: Node[] = [];
        const stack: Node[] = [this.lockNode];
        while (stack.length) {
            const n = stack.pop()!;
            if (n.getComponent(UITransform)) {
                out.push(n);
            }
            stack.push(...n.children);
        }
        return out;
    }

    private onLockPointerEnded() {
        const now = performance.now();
        if (now < this._lockClickConsumeUntil) {
            return;
        }
        // Подавляем дубли (touch + mouse или всплытие) в одном жесте
        this._lockClickConsumeUntil = now + 180;
        this.onLockClicked();
    }

    /** Обработка клика по замку */
    private onLockClicked() {
        if (!this._isLocked) {
            return;
        }

        if (this.lockNode) {
            shakeNodeHorizontal(this.lockNode);
            flashNamedNodesRed(this.lockNode, LOCK_ICON_NAMES, true);
        }

        if (this.lockWithoutPrice) {
            return;
        }

        const cost = this.parseNumber(this.labelLock?.string || '0');
        // Пустой/нулевой ценник не означает «бесплатно снять с клика» — иначе слоты только из квеста
        // открываются бесплатно. Разблокировка без цены: unlockByScript (например награда unlock_slot).
        if (cost <= 0) {
            return;
        }

        const mm = MoneyManager.getInstance();
        if (!mm) {
            console.warn('[CellLockHandler] MoneyManager не найден — проверка баланса невозможна');
            return;
        }
        const currentMoney = mm.getMoney();

        if (currentMoney >= cost) {
            if (cost > 0 && !mm.subtractMoney(cost)) {
                console.log(`[CellLockHandler] Не удалось списать ${cost}`);
                return;
            }
            console.log(`[CellLockHandler] ✅ Разблокировано! (Цена: ${cost}, Баланс был: ${currentMoney})`);
            this.applyLockState(false);
            notifyQuestProgress();
            notifyProgressChanged();
        } else {
            console.log(`[CellLockHandler]  Недостаточно средств! Нужно: ${cost}, Есть: ${currentMoney}`);
        }
    }

    /** Снять блокировку из другого скрипта (при lockWithoutPrice клик по замку не работает) */
    public unlockByScript() {
        this.applyLockState(false);
        notifyQuestProgress();
        notifyProgressChanged();
    }

    public isLockedNow(): boolean {
        return this._isLocked;
    }

    public restoreLockState(isLocked: boolean) {
        this.applyLockState(isLocked);
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

}