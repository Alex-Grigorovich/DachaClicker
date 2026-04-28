/**
 * Уровни апгрейдов по id из BALANCE_DATA (до появления UpgradeManager).
 * ProgressManager читает/пишет снимок в ProgressSave.
 * Покупка уровня: `upgradeProgressSetLevel` (дергает автосейв); полный сброс из сейва: `upgradeProgressReplaceAll` (без уведомления).
 */

import { notifyProgressChanged } from './ProgressBridge';

const _levels: Record<string, number> = {};

function clampNonNegativeInt(n: number): number {
    if (!Number.isFinite(n)) {
        return 0;
    }
    return Math.max(0, Math.floor(n));
}

export function upgradeProgressGetLevel(upgradeId: string): number {
    return _levels[upgradeId] ?? 0;
}

export function upgradeProgressSetLevel(upgradeId: string, level: number): void {
    const v = clampNonNegativeInt(level);
    if ((_levels[upgradeId] ?? 0) === v) {
        return;
    }
    _levels[upgradeId] = v;
    notifyProgressChanged();
}

export function upgradeProgressReplaceAll(levels: Record<string, number> | null | undefined): void {
    for (const k of Object.keys(_levels)) {
        delete _levels[k];
    }
    if (!levels) {
        return;
    }
    for (const [id, lv] of Object.entries(levels)) {
        if (!id) {
            continue;
        }
        _levels[id] = clampNonNegativeInt(lv);
    }
}

export function upgradeProgressGetSnapshot(): Record<string, number> {
    return { ..._levels };
}
