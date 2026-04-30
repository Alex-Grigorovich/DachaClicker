import type { UIRenderer } from 'cc';
import { Button, Color, Label, Node, Sprite, tween, Tween, Vec3 } from 'cc';

const DENY_RED = new Color(255, 75, 75, 255);

/** Одна длительность красной deny-подсветки: Lock (`flashNamedNodesRed`), меню культур, апгрейды. */
export const DEFAULT_DENY_FLASH_SEC = 0.14;

type TintPair = { target: UIRenderer; original: Color };

type PendingFlash = {
    pairs: TintPair[];
    restore: () => void;
    timerHandle: ReturnType<typeof setTimeout> | null;
};

/** Активная вспышка на ноде — clearTimeout и сброс «не залипал красный» при повторных кликах. */
const pendingFlashByRootUuid = new Map<string, PendingFlash>();

export function shakeNodeHorizontal(node: Node | null, amplitude = 10): void {
    if (!node?.isValid) {
        return;
    }
    Tween.stopAllByTarget(node);
    const base = node.position.clone();
    const a = Math.max(2, amplitude);
    tween(node)
        .to(0.04, { position: new Vec3(base.x + a, base.y, base.z) })
        .to(0.04, { position: new Vec3(base.x - a, base.y, base.z) })
        .to(0.04, { position: new Vec3(base.x + a * 0.55, base.y, base.z) })
        .to(0.04, { position: new Vec3(base.x - a * 0.55, base.y, base.z) })
        .to(0.05, { position: base })
        .start();
}

function collectTintPairs(root: Node): TintPair[] {
    const out: TintPair[] = [];
    const stack: Node[] = [root];
    while (stack.length) {
        const n = stack.pop()!;
        const spr = n.getComponent(Sprite);
        if (spr) {
            out.push({ target: spr, original: spr.color.clone() });
        }
        const lbl = n.getComponent(Label);
        if (lbl) {
            out.push({ target: lbl, original: lbl.color.clone() });
        }
        for (let i = n.children.length - 1; i >= 0; i--) {
            stack.push(n.children[i]);
        }
    }
    return out;
}

/** На время вспышки отключаем COLOR/intermit у Button — иначе движок снова красит спрайт после restore. */
function snapshotButtons(root: Node): { btn: Button; transition: Button.Transition }[] {
    const out: { btn: Button; transition: Button.Transition }[] = [];
    const stack: Node[] = [root];
    while (stack.length) {
        const n = stack.pop()!;
        const b = n.getComponent(Button);
        if (b) {
            out.push({ btn: b, transition: b.transition });
            b.transition = Button.Transition.NONE;
        }
        for (let i = n.children.length - 1; i >= 0; i--) {
            stack.push(n.children[i]);
        }
    }
    return out;
}

function restoreButtons(snapshot: { btn: Button; transition: Button.Transition }[]): void {
    for (const { btn, transition } of snapshot) {
        if (btn?.isValid) {
            btn.transition = transition;
        }
    }
}

/**
 * Кратко подсветить все Sprite/Label в поддереве красным и вернуть цвета.
 * Перед новой вспышкой предыдущая отменяется (clearTimeout), цвета сбрасываются сразу.
 */
export function flashSubtreeRed(root: Node | null, holdSec = DEFAULT_DENY_FLASH_SEC): void {
    if (!root?.isValid) {
        return;
    }
    const uuid = root.uuid;

    const existing = pendingFlashByRootUuid.get(uuid);
    if (existing) {
        if (existing.timerHandle != null) {
            clearTimeout(existing.timerHandle);
        }
        existing.restore();
    }

    const pairs = collectTintPairs(root);
    const btnSnap = snapshotButtons(root);

    for (const p of pairs) {
        Tween.stopAllByTarget(p.target);
        p.target.color = DENY_RED.clone();
    }

    const delayMs = Math.round(Math.max(50, holdSec * 1000));

    const restore = () => {
        pendingFlashByRootUuid.delete(uuid);
        if (!root.isValid) {
            restoreButtons(btnSnap);
            return;
        }
        for (const p of pairs) {
            if (p.target?.isValid) {
                p.target.color = p.original.clone();
            }
            const mark = (p.target as unknown as { markForUpdateRenderData?: () => void }).markForUpdateRenderData;
            mark?.call(p.target);
        }
        restoreButtons(btnSnap);
    };

    const timerHandle = setTimeout(() => restore(), delayMs);
    pendingFlashByRootUuid.set(uuid, { pairs, restore, timerHandle });
}

export function shakeAndFlashRed(root: Node | null, holdSec = DEFAULT_DENY_FLASH_SEC): void {
    shakeNodeHorizontal(root);
    flashSubtreeRed(root, holdSec);
}

export function findDeepChildByName(root: Node | null, name: string): Node | null {
    if (!root?.isValid) {
        return null;
    }
    if (root.name === name) {
        return root;
    }
    for (const c of root.children) {
        const f = findDeepChildByName(c, name);
        if (f) {
            return f;
        }
    }
    return null;
}

/** Подсветка нод с именами из списка (поиск вглубь от parent). */
export function flashNamedNodesRed(
    parent: Node | null,
    names: readonly string[],
    fallbackToParent = false,
    holdSec = DEFAULT_DENY_FLASH_SEC,
): void {
    if (!parent?.isValid || !names.length) {
        return;
    }
    const seen = new Set<string>();
    for (const nm of names) {
        const n = findDeepChildByName(parent, nm);
        if (n && !seen.has(n.uuid)) {
            seen.add(n.uuid);
            flashSubtreeRed(n, holdSec);
        }
    }
    if (seen.size === 0 && fallbackToParent) {
        flashSubtreeRed(parent, holdSec);
    }
}
