import { _decorator, Component, Node, view, Widget, UITransform, Layout } from 'cc';

const { ccclass, property } = _decorator;

type LayoutTier = 'narrow' | 'mid' | 'wide';

@ccclass('ResponsiveSides')
export class ResponsiveSides extends Component {
    @property(Node)
    buttonsLeft: Node = null!;

    @property(Node)
    buttonsRight: Node = null!;

    @property(Node)
    gameField: Node = null!;

    @property({ type: Node, tooltip: 'Пусто — ищем ButtonsVegetables под buttonsLeft' })
    buttonsVegetables: Node | null = null;

    @property({ type: Node, tooltip: 'Пусто — ищем ButtonsUpgrade под buttonsLeft' })
    buttonsUpgrade: Node | null = null;

    /** Порог «узкий портрет»: width/height ниже — narrow */
    @property
    ratioNarrowMax = 0.65;

    /** Порог «широкий ландшафт»: width/height выше — wide */
    @property
    ratioWideMin = 1.4;

    @property({
        tooltip: 'Множитель ширины UITransform игрового поля в узком портрете (от базового размера в onLoad)',
    })
    fieldWidthMulNarrow = 0.94;

    @property
    fieldWidthMulMid = 1.0;

    @property
    fieldWidthMulWide = 1.0;

    @property({
        tooltip: 'Доп. равномерный scale всего gameField в узком режиме (поверх ширины, 1 = не трогать)',
    })
    fieldScaleNarrow = 0.9;

    @property
    fieldScaleMid = 0.96;

    @property
    fieldScaleWide = 1.0;

    private _fieldBaseW = 0;
    private _fieldBaseH = 0;
    private _fieldBaseScale = 1;
    private _vegBaseScale = 1;
    private _upgBaseScale = 1;
    private _lastTier: LayoutTier | '' = '';

    onLoad() {
        this.resolveNamedButtons();
        if (this.buttonsVegetables?.isValid) {
            this._vegBaseScale = Math.abs(this.buttonsVegetables.scale.x) || 1;
        }
        if (this.buttonsUpgrade?.isValid) {
            this._upgBaseScale = Math.abs(this.buttonsUpgrade.scale.x) || 1;
        }
        const ui = this.gameField?.getComponent(UITransform);
        if (this.gameField?.isValid) {
            this._fieldBaseScale = Math.abs(this.gameField.scale.x) || 1;
        }
        if (ui) {
            this._fieldBaseW = ui.contentSize.width;
            this._fieldBaseH = ui.contentSize.height;
        }
        this.adaptLayout();
        view.on('canvas-resize', this.adaptLayout, this);
    }

    onDestroy() {
        view.off('canvas-resize', this.adaptLayout, this);
    }

    adaptLayout() {
        const frame = view.getFrameSize();
        if (frame.width <= 0 || frame.height <= 0) {
            return;
        }

        const ratio = frame.width / frame.height;

        let tier: LayoutTier;
        if (ratio < this.ratioNarrowMax) {
            tier = 'narrow';
        } else if (ratio > this.ratioWideMin) {
            tier = 'wide';
        } else {
            tier = 'mid';
        }

        if (tier === this._lastTier) {
            return;
        }
        this._lastTier = tier;

        this.applySideColumns(tier);
        this.applyActionButtons(tier);
        this.applyGameField(tier);
    }

    private resolveNamedButtons() {
        if (!this.buttonsVegetables?.isValid && this.buttonsLeft?.isValid) {
            this.buttonsVegetables = this.findChildByName(this.buttonsLeft, 'ButtonsVegetables');
        }
        if (!this.buttonsUpgrade?.isValid && this.buttonsLeft?.isValid) {
            this.buttonsUpgrade = this.findChildByName(this.buttonsLeft, 'ButtonsUpgrade');
        }
    }

    private findChildByName(root: Node, name: string): Node | null {
        if (root.name === name) {
            return root;
        }
        for (const c of root.children) {
            const f = this.findChildByName(c, name);
            if (f) {
                return f;
            }
        }
        return null;
    }

    private applySideColumns(tier: LayoutTier) {
        const sideNarrow = { side: 8, top: 12 };
        const sideMid = { side: 35, top: 25 };
        const sideWide = { side: 45, top: 30 };
        const p = tier === 'narrow' ? sideNarrow : tier === 'wide' ? sideWide : sideMid;

        const lw = this.buttonsLeft?.getComponent(Widget);
        if (lw) {
            lw.isAlignLeft = true;
            lw.left = p.side;
            lw.isAlignTop = true;
            lw.top = p.top;
            lw.updateAlignment();
        }

        const rw = this.buttonsRight?.getComponent(Widget);
        if (rw) {
            rw.isAlignRight = true;
            rw.right = p.side;
            rw.isAlignTop = true;
            rw.top = p.top;
            rw.updateAlignment();
        }

        const spacing = tier === 'narrow' ? 8 : tier === 'wide' ? 20 : 14;
        for (const col of [this.buttonsLeft, this.buttonsRight]) {
            if (!col?.isValid) {
                continue;
            }
            const layout = col.getComponent(Layout);
            if (layout) {
                layout.spacingX = spacing;
                layout.spacingY = spacing;
                layout.updateLayout();
            }
        }
    }

    /**
     * Кнопки открытия списков на колонке слева: поджимаем горизонтальные отступы виджета и слегка масштабируем на узком экране.
     */
    private applyActionButtons(tier: LayoutTier) {
        const presets = {
            narrow: { veg: { left: 2, right: 2, scale: 0.92 }, upg: { left: 2, right: 2, scale: 0.92 } },
            mid: { veg: { left: 0, right: 0, scale: 1.0 }, upg: { left: 4, right: 4, scale: 1.0 } },
            wide: { veg: { left: 0, right: 0, scale: 1.0 }, upg: { left: 8, right: 8, scale: 1.0 } },
        } as const;

        const pr = presets[tier];
        this.applyActionButtonNode(this.buttonsVegetables, pr.veg, this._vegBaseScale);
        this.applyActionButtonNode(this.buttonsUpgrade, pr.upg, this._upgBaseScale);
    }

    private applyActionButtonNode(
        node: Node | null,
        p: { left: number; right: number; scale: number },
        baseScale: number,
    ) {
        if (!node?.isValid) {
            return;
        }
        const w = node.getComponent(Widget);
        if (w) {
            if (w.isAlignLeft) {
                w.left = p.left;
            }
            if (w.isAlignRight) {
                w.right = p.right;
            }
            w.updateAlignment();
        }
        const s = baseScale * p.scale;
        node.setScale(s, s, node.scale.z);
    }

    private applyGameField(tier: LayoutTier) {
        if (!this.gameField?.isValid) {
            return;
        }
        const ui = this.gameField.getComponent(UITransform);
        if (ui && this._fieldBaseW > 0 && this._fieldBaseH > 0) {
            const mul =
                tier === 'narrow'
                    ? this.fieldWidthMulNarrow
                    : tier === 'wide'
                        ? this.fieldWidthMulWide
                        : this.fieldWidthMulMid;
            ui.setContentSize(this._fieldBaseW * mul, this._fieldBaseH);
        }
        const fs =
            tier === 'narrow'
                ? this.fieldScaleNarrow
                : tier === 'wide'
                    ? this.fieldScaleWide
                    : this.fieldScaleMid;
        const z = this.gameField.scale.z;
        const s = this._fieldBaseScale * fs;
        this.gameField.setScale(s, s, z);
    }
}
