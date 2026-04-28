import { sys } from 'cc';
import { PlantCultureKey } from './PlantFieldState';

/**
 * Стратегия версий сейва:
 * - Ключ localStorage (`PROGRESS_STORAGE_KEY`) не меняем без явной необходимости — старые игроки сохраняют прогресс.
 * - `PROGRESS_SAVE_VERSION` — текущая актуальная версия формата; при изменении схемы увеличить на 1 и добавить шаг в MIGRATIONS.
 * - Чтение: распарсить JSON → нормализация дефолтами → цикл миграций с `version` до актуальной.
 * - Поля, которых не было в старой версии, заполняются из `createDefaultProgressSave()`.
 * - Сейв с версией новее клиента: предупреждение в лог, читаем совместимые поля, при записи версия снова станет актуальной (лишнее из JSON не сохраняем, если не в типе).
 */
export const PROGRESS_SAVE_VERSION = 2;

/** Не переименовывать: уже лежит у игроков. */
export const PROGRESS_STORAGE_KEY = 'farm_clicker_progress_v1';

export type SavedUpgradeLevels = Record<string, number>;

/**
 * План следующих миграций формата (не влияет на runtime-логику, используется как контракт команды).
 * Обновлять вместе с изменениями схемы до повышения версии.
 */
export interface ProgressSavePlannedMigration {
    toVersion: number;
    goal: string;
    newFields?: string[];
    notes?: string;
}

export const PROGRESS_SAVE_MIGRATION_PLAN: ProgressSavePlannedMigration[] = [
    {
        toVersion: 3,
        goal: 'Стабильные id для ячеек/слотов вместо fallback только по имени.',
        newFields: ['fieldCells[].slotId', 'cellLocks[].slotId'],
        notes: 'Сначала добавить slotId в сцену и runtime-коллектор, затем включить миграцию v2->v3.',
    },
    {
        toVersion: 4,
        goal: 'Сейв UI состояния апгрейд-панели и служебных флагов при необходимости.',
        newFields: ['ui.upgradeListState'],
        notes: 'Опционально, только если понадобится продуктово.',
    },
];

export interface SavedMoneyState {
    balance: number;
    totalEarned: number;
}

export interface SavedFieldCellState {
    uuid: string;
    name: string;
    culture: PlantCultureKey;
}

export interface SavedCellLockState {
    uuid: string;
    name: string;
    locked: boolean;
}

export interface SavedQuestState {
    activeIndex: number;
    totalClicks: number;
}

export interface ProgressSaveData {
    version: number;
    savedAt: number;
    money: SavedMoneyState;
    fieldCells: SavedFieldCellState[];
    unlockedCultures: string[];
    cellLocks: SavedCellLockState[];
    quests: SavedQuestState;
    /** Уровни апгрейдов: id из BALANCE_DATA → купленный уровень (0 = не куплен, 1 = первая ступень и т.д.). */
    upgrades: SavedUpgradeLevels;
}

export function createDefaultProgressSave(): ProgressSaveData {
    return {
        version: PROGRESS_SAVE_VERSION,
        savedAt: Date.now(),
        money: {
            balance: 0,
            totalEarned: 0,
        },
        fieldCells: [],
        unlockedCultures: [],
        cellLocks: [],
        quests: {
            activeIndex: 0,
            totalClicks: 0,
        },
        upgrades: {},
    };
}

function clampNonNegativeInt(n: number): number {
    if (!Number.isFinite(n)) {
        return 0;
    }
    return Math.max(0, Math.floor(n));
}

function normalizeUpgradeLevels(raw: unknown): SavedUpgradeLevels {
    if (!raw || typeof raw !== 'object') {
        return {};
    }
    if (Array.isArray(raw)) {
        const out: SavedUpgradeLevels = {};
        for (const item of raw) {
            if (item && typeof item === 'object' && 'id' in item) {
                const id = String((item as { id: unknown }).id);
                const lv = 'level' in item ? (item as { level: unknown }).level : 0;
                if (id) {
                    out[id] = clampNonNegativeInt(Number(lv));
                }
            }
        }
        return out;
    }
    const out: SavedUpgradeLevels = {};
    const rec = raw as Record<string, unknown>;
    for (const k in rec) {
        if (!Object.prototype.hasOwnProperty.call(rec, k)) {
            continue;
        }
        const v = rec[k];
        if (typeof v === 'number') {
            out[k] = clampNonNegativeInt(v);
        }
    }
    return out;
}

function mergePartialWithDefaults(parsed: Partial<ProgressSaveData> & { version?: number }): ProgressSaveData {
    const base = createDefaultProgressSave();
    return {
        ...base,
        ...parsed,
        version:
            typeof parsed.version === 'number' && Number.isFinite(parsed.version) && parsed.version >= 1
                ? Math.floor(parsed.version)
                : 1,
        savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : base.savedAt,
        money: {
            ...base.money,
            ...(parsed.money ?? {}),
        },
        quests: {
            ...base.quests,
            ...(parsed.quests ?? {}),
        },
        fieldCells: Array.isArray(parsed.fieldCells) ? parsed.fieldCells : [],
        unlockedCultures: Array.isArray(parsed.unlockedCultures) ? parsed.unlockedCultures : [],
        cellLocks: Array.isArray(parsed.cellLocks) ? parsed.cellLocks : [],
        upgrades: normalizeUpgradeLevels(parsed.upgrades),
    };
}

type MigrationStep = (data: ProgressSaveData) => ProgressSaveData;

/** Миграция с версии N на N+1. Индекс = N. */
const MIGRATIONS: MigrationStep[] = [
    // 1 → 2: добавлены уровни апгрейдов
    data => ({
        ...data,
        version: 2,
        upgrades: normalizeUpgradeLevels(data.upgrades),
    }),
];

/**
 * Служебная проверка: для каждой версии между 1 и текущей должен существовать шаг миграции.
 * Если шага нет, чтение продолжится через fallback-код в migrateProgressSaveToLatest.
 */
function hasFullMigrationCoverage(): boolean {
    return MIGRATIONS.length >= Math.max(0, PROGRESS_SAVE_VERSION - 1);
}

export function migrateProgressSaveToLatest(data: ProgressSaveData): ProgressSaveData {
    let current = { ...data };

    if (current.version > PROGRESS_SAVE_VERSION) {
        console.warn(
            `[ProgressSave] Сейв v${current.version} новее клиента v${PROGRESS_SAVE_VERSION}; лишние поля при записи не сохранятся.`,
        );
        current.version = PROGRESS_SAVE_VERSION;
    }

    while (current.version < PROGRESS_SAVE_VERSION) {
        const step = MIGRATIONS[current.version - 1];
        if (!step) {
            console.warn(`[ProgressSave] Нет миграции с v${current.version} — сброс к дефолтам по недостающим полям.`);
            current = {
                ...createDefaultProgressSave(),
                ...current,
                version: PROGRESS_SAVE_VERSION,
                money: { ...createDefaultProgressSave().money, ...current.money },
                quests: { ...createDefaultProgressSave().quests, ...current.quests },
                upgrades: normalizeUpgradeLevels(current.upgrades),
            };
            break;
        }
        current = step(current);
    }

    return current;
}

export function readProgressSave(): ProgressSaveData | null {
    const raw = sys.localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (!raw) {
        return null;
    }

    try {
        if (!hasFullMigrationCoverage()) {
            console.warn(
                `[ProgressSave] Цепочка MIGRATIONS неполная для версии v${PROGRESS_SAVE_VERSION}; возможен fallback при чтении старых сейвов.`,
            );
        }
        const parsed = JSON.parse(raw) as Partial<ProgressSaveData> & { version?: number };
        const merged = mergePartialWithDefaults(parsed);
        return migrateProgressSaveToLatest(merged);
    } catch (err) {
        console.warn('[ProgressSave] Не удалось прочитать сейв', err);
        return null;
    }
}

export function writeProgressSave(save: ProgressSaveData): void {
    sys.localStorage.setItem(
        PROGRESS_STORAGE_KEY,
        JSON.stringify({
            ...save,
            version: PROGRESS_SAVE_VERSION,
            savedAt: Date.now(),
        }),
    );
}
