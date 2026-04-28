/** Тонкий мост без циклических импортов между квестами и игровыми скриптами. */

let questClickNotifier: (() => void) | null = null;
let questProgressNotifier: (() => void) | null = null;

export function setQuestClickNotifier(fn: (() => void) | null): void {
    questClickNotifier = fn;
}

export function setQuestProgressNotifier(fn: (() => void) | null): void {
    questProgressNotifier = fn;
}

/** Один успешный клик по овощу (после начисления денег). */
export function notifyQuestClick(): void {
    questClickNotifier?.();
}

/** Любое изменение прогресса: посадка, разблокировка культуры, деньги и т.д. */
export function notifyQuestProgress(): void {
    questProgressNotifier?.();
}
