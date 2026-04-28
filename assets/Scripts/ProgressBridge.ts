/** Тонкий мост для автосохранения без циклических импортов между игровыми скриптами и ProgressManager. */

let progressPersistenceDisabled = false;

/** `true`, когда `ProgressManager.disableSaving` / `disableProgressSaving` — не читать сейв из других модулей. */
export function setProgressPersistenceDisabled(disabled: boolean) {
    progressPersistenceDisabled = disabled;
}

export function isProgressPersistenceDisabled(): boolean {
    return progressPersistenceDisabled;
}

let progressChangedNotifier: (() => void) | null = null;

export function setProgressChangedNotifier(fn: (() => void) | null): void {
    progressChangedNotifier = fn;
}

export function notifyProgressChanged(): void {
    progressChangedNotifier?.();
}
