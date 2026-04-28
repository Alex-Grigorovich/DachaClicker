import { Color, Label, Node, Sprite, tween, Tween, Vec3 } from 'cc';

const DENY_RED = new Color(255, 75, 75, 255);

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

type TintPair = { target: Sprite | Label; original: Color };

function collectTintPairs(root: Node): TintPair[] {
    const out: TintPair[] = [];
    for (const s of root.getComponentsInChildren(Sprite)) {
        out.push({ target: s, original: s.color.clone() });
    }
    for (const l of root.getComponentsInChildren(Label)) {
        out.push({ target: l, original: l.color.clone() });
    }
    return out;
}

/** Кратко подсветить все Sprite/Label в поддереве красным и вернуть цвета. */
export function flashSubtreeRed(root: Node | null, holdSec = 0.14): void {
    if (!root?.isValid) {
        return;
    }
    const pairs = collectTintPairs(root);
    for (const p of pairs) {
        Tween.stopAllByTarget(p.target);
        p.target.color = DENY_RED;
    }
    tween(root)
        .delay(Math.max(0.05, holdSec))
        .call(() => {
            if (!root.isValid) {
                return;
            }
            for (const p of pairs) {
                if (p.target?.isValid) {
                    p.target.color = p.original;
                }
            }
        })
        .start();
}

export function shakeAndFlashRed(root: Node | null): void {
    shakeNodeHorizontal(root);
    flashSubtreeRed(root);
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
): void {
    if (!parent?.isValid || !names.length) {
        return;
    }
    const seen = new Set<string>();
    for (const nm of names) {
        const n = findDeepChildByName(parent, nm);
        if (n && !seen.has(n.uuid)) {
            seen.add(n.uuid);
            flashSubtreeRed(n);
        }
    }
    if (seen.size === 0 && fallbackToParent) {
        flashSubtreeRed(parent);
    }
}
