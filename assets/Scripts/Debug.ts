import { DEBUG } from 'cc/env';

export function dlog(...args: unknown[]): void {
    if (!DEBUG) {
        return;
    }
    console.log(...args);
}

export function dinfo(...args: unknown[]): void {
    if (!DEBUG) {
        return;
    }
    console.info(...args);
}

let _errorHooksInstalled = false;

export function installGlobalErrorHandlers(): void {
    if (!DEBUG || _errorHooksInstalled) {
        return;
    }
    if (typeof window === 'undefined') {
        return;
    }
    _errorHooksInstalled = true;

    window.addEventListener('error', event => {
        console.error('[GlobalError]', event.error ?? event.message ?? event.type);
    });
    window.addEventListener('unhandledrejection', event => {
        console.error('[UnhandledRejection]', event.reason);
    });
}
