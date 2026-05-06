/** Тонкий мост без циклических импортов между квестами и игровыми скриптами. */

let questClickNotifier: (() => void) | null = null;
let questProgressNotifier: (() => void) | null = null;
let questPassiveEarnedNotifier: ((amount: number) => void) | null = null;

export function setQuestClickNotifier(fn: (() => void) | null): void {
    questClickNotifier = fn;
}

export function setQuestProgressNotifier(fn: (() => void) | null): void {
    questProgressNotifier = fn;
}

export function setQuestPassiveEarnedNotifier(fn: ((amount: number) => void) | null): void {
    questPassiveEarnedNotifier = fn;
}

/** Один успешный клик по овощу (после начисления денег). */
export function notifyQuestClick(): void {
    questClickNotifier?.();
}

/** Любое изменение прогресса: посадка, разблокировка культуры, деньги и т.д. */
export function notifyQuestProgress(): void {
    questProgressNotifier?.();
}

/** Начислен пассивный доход (агрегировано за тик). */
export function notifyQuestPassiveEarned(amount: number): void {
    const value = Math.max(0, Math.floor(Number(amount) || 0));
    if (value <= 0) {
        return;
    }
    questPassiveEarnedNotifier?.(value);
}
