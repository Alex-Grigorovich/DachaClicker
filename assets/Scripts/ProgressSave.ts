import { director, sys } from 'cc';
import { PlantCultureKey } from './PlantFieldState';
import { YandexSDKManager } from './YandexSDKManager';

/**
 * Стратегия версий сейва:
 * - Ключ localStorage (`PROGRESS_STORAGE_KEY`) не меняем без явной необходимости — старые игроки сохраняют прогресс.
 * - `PROGRESS_SAVE_VERSION` — текущая актуальная версия формата; при изменении схемы увеличить на 1 и добавить шаг в MIGRATIONS.
 * - Чтение: распарсить JSON → нормализация дефолтами → цикл миграций с `version` до актуальной.
 * - Поля, которых не было в старой версии, заполняются из `createDefaultProgressSave()`.
 * - Сейв с версией новее клиента: предупреждение в лог, читаем совместимые поля, при записи версия снова станет актуальной (лишнее из JSON не сохраняем, если не в типе).
 */
export const PROGRESS_SAVE_VERSION = 5;

/** Legacy: тот же ключ, что в TutorialManager (только для миграции 4→5). */
const LEGACY_TUTORIAL_DONE_KEY = 'farm_clicker_tutorial_v1';

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
        goal: 'Добавить состояние пассивного дохода и квестовую метрику passive_earned.',
        newFields: ['quests.passiveEarned', 'passiveIncome'],
        notes: 'Нужно для пассивного дохода/автосбора и корректной квестовой статистики.',
    },
    {
        toVersion: 5,
        goal: 'Флаг завершения туториала в сейве (синхрон с отдельным localStorage).',
        newFields: ['tutorialCompleted'],
        notes: 'Миграция подтягивает значение из legacy-ключа localStorage.',
    },
];

export interface SavedMoneyState {
    balance: number;
    totalEarned: number;
}

export interface SavedFieldCellState {
    /** Стабильный id слота (приоритет при восстановлении). */
    slotId: number;
    uuid: string;
    name: string;
    culture: PlantCultureKey;
}

export interface SavedCellLockState {
    /** Стабильный id слота (приоритет при восстановлении). */
    slotId: number;
    uuid: string;
    name: string;
    locked: boolean;
}

export interface SavedQuestState {
    activeIndex: number;
    totalClicks: number;
    passiveEarned: number;
}

export interface SavedPassiveIncomeState {
    lastSessionTimestamp: number;
    autoCollectEnabled: boolean;
    autoCollectEfficiency: number;
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
    passiveIncome: SavedPassiveIncomeState;
    /** Прошёл ли игрок вводный туториал (дублирует legacy localStorage, см. TutorialManager). */
    tutorialCompleted: boolean;
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
            passiveEarned: 0,
        },
        upgrades: {},
        passiveIncome: {
            lastSessionTimestamp: Date.now(),
            autoCollectEnabled: false,
            autoCollectEfficiency: 1,
        },
        tutorialCompleted: false,
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
        passiveIncome: {
            ...base.passiveIncome,
            ...(parsed.passiveIncome ?? {}),
            autoCollectEnabled: !!(parsed.passiveIncome as SavedPassiveIncomeState | undefined)?.autoCollectEnabled,
            autoCollectEfficiency: Math.max(
                0,
                Number((parsed.passiveIncome as SavedPassiveIncomeState | undefined)?.autoCollectEfficiency ?? base.passiveIncome.autoCollectEfficiency) || 0,
            ),
            lastSessionTimestamp: clampNonNegativeInt(
                Number((parsed.passiveIncome as SavedPassiveIncomeState | undefined)?.lastSessionTimestamp ?? base.passiveIncome.lastSessionTimestamp),
            ),
        },
        fieldCells: Array.isArray(parsed.fieldCells) ? parsed.fieldCells : [],
        unlockedCultures: Array.isArray(parsed.unlockedCultures) ? parsed.unlockedCultures : [],
        cellLocks: Array.isArray(parsed.cellLocks) ? parsed.cellLocks : [],
        upgrades: normalizeUpgradeLevels(parsed.upgrades),
        tutorialCompleted:
            typeof parsed.tutorialCompleted === 'boolean' ? parsed.tutorialCompleted : base.tutorialCompleted,
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
    // 2 → 3: добавлены стабильные slotId для ячеек/замков
    data => {
        const readSlotId = (value: unknown): number => {
            const n = Math.floor(Number(value));
            return Number.isFinite(n) && n > 0 ? n : 0;
        };
        const parseSlotIdFromName = (name: unknown): number => {
            const s = String(name ?? '');
            const m = s.match(/(\d+)(?!.*\d)/);
            if (!m) {
                return 0;
            }
            return readSlotId(m[1]);
        };
        const withFieldSlotId = data.fieldCells.map((item, index) => {
            const existing = readSlotId((item as Partial<SavedFieldCellState>).slotId);
            const fromName = parseSlotIdFromName((item as Partial<SavedFieldCellState>).name);
            const slotId = existing || fromName || index + 1;
            return { ...item, slotId };
        });
        const withLockSlotId = data.cellLocks.map((item, index) => {
            const existing = readSlotId((item as Partial<SavedCellLockState>).slotId);
            const fromName = parseSlotIdFromName((item as Partial<SavedCellLockState>).name);
            const slotId = existing || fromName || index + 1;
            return { ...item, slotId };
        });
        return {
            ...data,
            version: 3,
            fieldCells: withFieldSlotId,
            cellLocks: withLockSlotId,
        };
    },
    // 3 -> 4: добавлены passiveIncome и passive_earned в quests
    data => ({
        ...data,
        version: 4,
        quests: {
            activeIndex: clampNonNegativeInt(data.quests?.activeIndex ?? 0),
            totalClicks: clampNonNegativeInt(data.quests?.totalClicks ?? 0),
            passiveEarned: clampNonNegativeInt((data.quests as SavedQuestState | undefined)?.passiveEarned ?? 0),
        },
        passiveIncome: {
            lastSessionTimestamp: clampNonNegativeInt(data.savedAt || Date.now()),
            autoCollectEnabled: false,
            autoCollectEfficiency: 1,
        },
    }),
    // 4 -> 5: tutorialCompleted; подтянуть из legacy localStorage один раз
    data => {
        let fromLegacy = false;
        try {
            fromLegacy = sys.localStorage.getItem(LEGACY_TUTORIAL_DONE_KEY) === '1';
        } catch {
            /* ignore */
        }
        return {
            ...data,
            version: 5,
            tutorialCompleted: fromLegacy,
        };
    },
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

export async function cloudWrite(snapshot: ProgressSaveData): Promise<void> {
    const sdk = YandexSDKManager.ensureInstance(director.getScene()) ?? YandexSDKManager.getInstance();
    if (!sdk) {
        throw new Error('YandexSDKManager instance not found');
    }
    await sdk.initialize();
    const player = sdk.getPlayer() as { setData?: (data: unknown, flush?: boolean) => Promise<void> } | null;
    if (!player?.setData) {
        throw new Error('Yandex player.setData unavailable');
    }
    const payload: ProgressSaveData = {
        ...snapshot,
        version: PROGRESS_SAVE_VERSION,
        savedAt: Date.now(),
    };
    await player.setData({ [PROGRESS_STORAGE_KEY]: payload }, true);
}

export async function cloudRead(): Promise<ProgressSaveData | null> {
    const sdk = YandexSDKManager.ensureInstance(director.getScene()) ?? YandexSDKManager.getInstance();
    if (!sdk) {
        return null;
    }
    await sdk.initialize();
    const player = sdk.getPlayer() as { getData?: (keys?: string[]) => Promise<Record<string, unknown>> } | null;
    if (!player?.getData) {
        return null;
    }
    const data = await player.getData([PROGRESS_STORAGE_KEY]);
    const raw = data?.[PROGRESS_STORAGE_KEY];
    if (!raw || typeof raw !== 'object') {
        return null;
    }
    const merged = mergePartialWithDefaults(raw as Partial<ProgressSaveData> & { version?: number });
    return migrateProgressSaveToLatest(merged);
}
