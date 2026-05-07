import { Color, Label, Node, sys, tween, UIOpacity, UITransform, Vec3 } from 'cc';

const QUALITY_KEY = 'farm_clicker_quality_v1';

type PooledFx = {
    node: Node;
    opacity: UIOpacity;
};

export class FxPool {
    private static _pool: PooledFx[] = [];
    private static _active = 0;

    public static getActiveCount(): number {
        return this._active;
    }

    public static spawnHarvestSpark(parent: Node, worldPos: Vec3, color = new Color(255, 217, 61, 255), amount = 8): void {
        if (!parent?.isValid) {
            return;
        }
        const limit = this.getLimitByQuality();
        if (this._active >= limit) {
            return;
        }
        const spawnCount = Math.max(1, Math.min(amount, limit - this._active));
        for (let i = 0; i < spawnCount; i++) {
            const fx = this.take(parent);
            if (!fx) {
                return;
            }
            this._active += 1;
            fx.node.layer = parent.layer;
            parent.addChild(fx.node);

            const parentUi = parent.getComponent(UITransform);
            if (parentUi) {
                fx.node.setPosition(parentUi.convertToNodeSpaceAR(worldPos));
            } else {
                fx.node.worldPosition = worldPos.clone();
            }
            fx.opacity.opacity = 255;

            const label = fx.node.getComponent(Label);
            if (label) {
                label.color = color.clone();
            }

            const driftX = Math.random() * 70 - 35;
            const driftY = 30 + Math.random() * 45;
            tween(fx.node)
                .parallel(
                    tween(fx.node).by(0.38, { position: new Vec3(driftX, driftY, 0) }, { easing: 'quadOut' }),
                    tween(fx.opacity).to(0.38, { opacity: 0 }, { easing: 'quadIn' }),
                )
                .call(() => this.recycle(fx))
                .start();
        }
    }

    private static take(parent: Node): PooledFx | null {
        const fromPool = this._pool.pop();
        if (fromPool) {
            return fromPool;
        }

        const node = new Node('FxSpark');
        node.layer = parent.layer;
        const tr = node.addComponent(UITransform);
        tr.setContentSize(28, 28);

        const label = node.addComponent(Label);
        label.string = '*';
        label.fontSize = 20;
        label.lineHeight = 20;
        label.enableOutline = true;
        label.outlineWidth = 2;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;

        const opacity = node.addComponent(UIOpacity);
        opacity.opacity = 255;

        return { node, opacity };
    }

    private static recycle(fx: PooledFx): void {
        this._active = Math.max(0, this._active - 1);
        if (!fx.node.isValid) {
            return;
        }
        fx.node.removeFromParent();
        fx.node.setPosition(0, 0, 0);
        this._pool.push(fx);
    }

    private static getLimitByQuality(): number {
        const quality = sys.localStorage.getItem(QUALITY_KEY);
        return quality === 'low' ? 25 : 50;
    }
}
