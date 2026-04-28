/**
 * Строка для UI: малые суммы как есть, от 1 000 — `1k`, `2.5k`, далее `1.2m`.
 * Внутренняя экономика остаётся целыми числами.
 */
export function formatMoneyDisplay(value: number): string {
    const n = Math.max(0, Math.floor(Number(value) || 0));
    if (n < 1000) {
        return String(n);
    }
    if (n < 1_000_000) {
        const k = n / 1000;
        if (n % 1000 === 0) {
            return `${Math.round(k)}k`;
        }
        const rounded = Math.round(k * 10) / 10;
        const s = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
        return `${s}k`;
    }
    const m = n / 1_000_000;
    if (n % 1_000_000 === 0) {
        return `${Math.round(m)}m`;
    }
    const rounded = Math.round(m * 10) / 10;
    const s = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
    return `${s}m`;
}
