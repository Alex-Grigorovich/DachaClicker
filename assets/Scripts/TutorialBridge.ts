/**
 * Лёгкие уведомления для TutorialManager без циклических импортов.
 */
let _hooks: {
    onCarrotPlanted?: () => void;
    onCarrotHarvested?: () => void;
} = {};

export function registerTutorialHooks(hooks: Partial<typeof _hooks>): void {
    _hooks = { ..._hooks, ...hooks };
}

export function unregisterTutorialHooks(): void {
    _hooks = {};
}

export function notifyCarrotPlanted(): void {
    _hooks.onCarrotPlanted?.();
}

export function notifyCarrotHarvested(): void {
    _hooks.onCarrotHarvested?.();
}
