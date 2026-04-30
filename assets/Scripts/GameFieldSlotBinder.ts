import { _decorator, Component } from 'cc';
import { SlotMenuHandler } from './SlotMenuHandler';

const { ccclass, property } = _decorator;

/**
 * Повесь на GameField: находит дочерние Cell1…Cell6 и при необходимости добавляет SlotMenuHandler.
 * Клики по слотам должны быть на этих ячейках, а не на самом GameField (убери SlotMenuHandler с GameField).
 */
@ccclass('GameFieldSlotBinder')
export class GameFieldSlotBinder extends Component {
    @property({ tooltip: 'Сколько ячеек искать (имена Cell1, Cell2, …)' })
    cellCount = 6;

    @property({ tooltip: 'Префикс имени ячейки' })
    cellNamePrefix = 'Cell';

    onLoad() {
        this.ensureHandlersOnCells();
    }

    private ensureHandlersOnCells() {
        const root = this.node;
        if (!root?.isValid) {
            return;
        }
        const n = Math.max(1, Math.floor(this.cellCount));
        for (let i = 1; i <= n; i++) {
            const name = `${this.cellNamePrefix}${i}`;
            const cell = root.getChildByName(name);
            if (!cell?.isValid) {
                console.warn(`[GameFieldSlotBinder] Не найдена ячейка ${name} под ${root.name}`);
                continue;
            }
            if (cell.getComponent(SlotMenuHandler)) {
                continue;
            }
            cell.addComponent(SlotMenuHandler);
            console.log(`[GameFieldSlotBinder] Добавлен SlotMenuHandler на ${cell.name}`);
        }

        if (root.getComponent(SlotMenuHandler)) {
            console.warn(
                '[GameFieldSlotBinder] На GameField всё ещё висит SlotMenuHandler — убери его, оставь только на Cell1…Cell6.',
            );
        }
    }
}
