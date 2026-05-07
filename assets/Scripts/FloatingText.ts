import { Color, Label, Node, resources, tween, TTFFont, UIOpacity, UITransform, Vec3 } from 'cc';

const FLOAT_DURATION_SEC = 0.6;
const FONT_PATH = 'fonts/Caveat';

export class FloatingText {
    private static _sharedFont: TTFFont | null = null;
    private static _isLoadingFont = false;

    public static spawn(parent: Node, worldPos: Vec3, text: string, color: Color): void {
        if (!parent?.isValid) {
            return;
        }

        const node = new Node('FloatingText');
        node.layer = parent.layer;
        parent.addChild(node);

        const tr = node.addComponent(UITransform);
        tr.setContentSize(220, 44);

        const label = node.addComponent(Label);
        label.string = text;
        label.fontSize = 22;
        label.lineHeight = 24;
        label.color = color.clone();
        label.enableOutline = true;
        label.outlineWidth = 2;
        label.horizontalAlign = Label.HorizontalAlign.CENTER;
        label.verticalAlign = Label.VerticalAlign.CENTER;

        const op = node.addComponent(UIOpacity);
        op.opacity = 255;

        const parentUi = parent.getComponent(UITransform);
        if (parentUi) {
            const local = parentUi.convertToNodeSpaceAR(worldPos);
            node.setPosition(local);
        } else {
            node.worldPosition = worldPos.clone();
        }

        this.applySharedFontIfReady(label);
        this.ensureSharedFontLoaded();

        const randomX = Math.round(Math.random() * 20 - 10);
        tween(node)
            .parallel(
                tween(node).by(FLOAT_DURATION_SEC, { position: new Vec3(randomX, 60, 0) }, { easing: 'quadOut' }),
                tween(op).to(FLOAT_DURATION_SEC, { opacity: 0 }, { easing: 'quadIn' }),
            )
            .call(() => {
                if (node.isValid) {
                    node.destroy();
                }
            })
            .start();
    }

    private static applySharedFontIfReady(label: Label): void {
        if (this._sharedFont && label?.isValid) {
            label.font = this._sharedFont;
        }
    }

    private static ensureSharedFontLoaded(): void {
        if (this._sharedFont || this._isLoadingFont) {
            return;
        }
        this._isLoadingFont = true;
        resources.load(FONT_PATH, TTFFont, (err, font) => {
            this._isLoadingFont = false;
            if (!err && font) {
                this._sharedFont = font;
            }
        });
    }
}
