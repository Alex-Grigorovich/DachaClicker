import { Node } from 'cc';

/** Ключ культуры в данных поля (совпадает с ключами меню). */
export type PlantCultureKey = 'carrot' | 'cabbage' | 'tomato' | 'chili' | 'unknown' | '';

/**
 * Состояние посадок по ячейкам: не опираться только на наличие дочернего префаба в Content.
 * Ключ слота — uuid корневой ноды ячейки (как в SlotMenuHandler / QuestManager.fieldCells).
 */
export class PlantFieldState {
    private static _instance: PlantFieldState | null = null;

    public static getInstance(): PlantFieldState {
        if (!PlantFieldState._instance) {
            PlantFieldState._instance = new PlantFieldState();
        }
        return PlantFieldState._instance;
    }

    private readonly _cultureByCellUuid = new Map<string, PlantCultureKey>();

    /**
     * Полная инициализация по списку ячеек: сброс карты и разбор текущего Content (если в сцене уже есть посадки).
     */
    public registerFieldCells(cells: (Node | null | undefined)[], contentName = 'Content'): void {
        this._cultureByCellUuid.clear();
        for (const cell of cells) {
            if (!cell?.isValid) {
                continue;
            }
            this._cultureByCellUuid.set(cell.uuid, this.readCultureFromCellContent(cell, contentName));
        }
    }

    /** Убедиться, что ячейка есть в карте (например, слот вне fieldCells). */
    public ensureCellTracked(cell: Node | null | undefined, contentName = 'Content'): void {
        if (!cell?.isValid || this._cultureByCellUuid.has(cell.uuid)) {
            return;
        }
        this._cultureByCellUuid.set(cell.uuid, this.readCultureFromCellContent(cell, contentName));
    }

    public setCellCulture(cell: Node | null | undefined, key: PlantCultureKey): void {
        if (!cell?.isValid) {
            return;
        }
        this.ensureCellTracked(cell);
        this._cultureByCellUuid.set(cell.uuid, key);
    }

    public clearCell(cell: Node | null | undefined): void {
        if (!cell?.isValid || !this._cultureByCellUuid.has(cell.uuid)) {
            return;
        }
        this._cultureByCellUuid.set(cell.uuid, '');
    }

    public getCellCulture(cell: Node | null | undefined, contentName = 'Content'): PlantCultureKey {
        if (!cell?.isValid) {
            return '';
        }
        if (this._cultureByCellUuid.has(cell.uuid)) {
            return this._cultureByCellUuid.get(cell.uuid)!;
        }
        return this.readCultureFromCellContent(cell, contentName);
    }

    public isOccupied(cell: Node | null | undefined, contentName = 'Content'): boolean {
        if (!cell?.isValid) {
            return false;
        }
        if (this._cultureByCellUuid.has(cell.uuid)) {
            const k = this._cultureByCellUuid.get(cell.uuid)!;
            return k !== '';
        }
        const content = cell.getChildByName(contentName);
        return !!(content && content.children.length > 0);
    }

    public countPlanted(): number {
        let n = 0;
        for (const v of this._cultureByCellUuid.values()) {
            if (v) {
                n++;
            }
        }
        return n;
    }

    public countByCulture(key: PlantCultureKey): number {
        if (!key) {
            return 0;
        }
        let n = 0;
        for (const v of this._cultureByCellUuid.values()) {
            if (v === key) {
                n++;
            }
        }
        return n;
    }

    private readCultureFromCellContent(cell: Node, contentName: string): PlantCultureKey {
        const content = cell.getChildByName(contentName);
        if (!content || content.children.length === 0) {
            return '';
        }
        return this.inferCultureFromPlantedRoot(content.children[0]);
    }

    private inferCultureFromPlantedRoot(root: Node): PlantCultureKey {
        const n = root.name;
        if (n.includes('Carrot')) {
            return 'carrot';
        }
        if (n.includes('Cabbage')) {
            return 'cabbage';
        }
        if (n.includes('Tomato')) {
            return 'tomato';
        }
        if (n.includes('Chili') || n.includes('Pepper')) {
            return 'chili';
        }
        return 'unknown';
    }
}
