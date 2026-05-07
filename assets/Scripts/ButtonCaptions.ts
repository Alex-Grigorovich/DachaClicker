import { _decorator, Color, Component, director, Label, Node, Overflow, Sprite, UITransform, Vec3 } from 'cc';
import { loadSharedTtf } from './FontLoader';
import { LocalizationManager } from './LocalizationManager';

const { ccclass, property } = _decorator;

/** Если в сцене уже есть дочерний узел подписи с другим именем. */
const FALLBACK_CAPTION_CHILD: Readonly<Record<string, string>> = {
    ButtonTasks: 'CaptionTask',
    ButtonsVegetables: 'CaptionVegetables',
    ButtonsUpgrade: 'CaptionUpgrade',
};

/** В таком порядке ищем «тело» кнопки (цветной квадрат), не корень с большим UITransform. */
const VISUAL_CHILD_NAMES: readonly string[] = [
    'IconButtonGreen',
    'ButtonSmallWhite',
    'CheckboxStarFill',
    'IconArrow',
    'icons8-lightning-48',
    'icons8-gift-48',
    'icons8-money-50',
    'icons8-refresh-64',
];

const DEFAULT_BUTTON_CAPTIONS: ReadonlyArray<{ nodeName: string; captionKey: string; fallback: string }> = [
    { nodeName: 'ButtonTasks', captionKey: 'button.tasks', fallback: 'Задания' },
    { nodeName: 'ButtonsVegetables', captionKey: 'button.vegetables', fallback: 'Список продуктов' },
    { nodeName: 'ButtonsUpgrade', captionKey: 'button.upgrade', fallback: 'Улучшить' },
];

/**
 * Создаёт/обновляет подписи под активными боковыми кнопками.
 * Повесьте компонент на `Canvas/UI/Container` или оставьте `searchRoot` пустым (поиск по всей сцене).
 */
@ccclass('ButtonCaptions')
export class ButtonCaptions extends Component {
    @property({ type: Node, tooltip: 'Корень поиска (пусто — вся сцена).' })
    searchRoot: Node | null = null;

    @property({ tooltip: 'Путь resources к TTFFont без расширения.' })
    fontResourcePath = 'fonts/Caveat';

    @property({ tooltip: 'Размер шрифта подписи' })
    fontSize = 30;

    /** Подпись `CaptionVegetables` у `ButtonsVegetables`; 0 — использовать fontSize. */
    @property({ tooltip: 'Размер шрифта для CaptionVegetables (кнопка овощей); 0 = как у fontSize' })
    fontSizeVegetables = 20;

    @property({ tooltip: 'Отступ между нижней границей квадратной иконки и верхней кромкой текста (px), в локальных pt кнопки.' })
    offsetBelow = 0;

    /**
     * Сдвигает подпись вверх к видимому спрайту: нижний край UITransform часто ниже графики (прозрачный край текстуры),
     * у Label есть внутренний зазор над строкой — без этого текст «висит» ниже, чем в макете.
     */
    @property({ tooltip: 'Подтянуть подпись ближе к иконке (px вверх в локальных координатах кнопки)' })
    tightenTowardIconPx = 18;

    private _started = false;
    private _pairs: Array<{ button: Node; label: Label; captionKey: string; fallback: string }> = [];
    private _unbindLocale: (() => void) | null = null;

    private readonly _tmpWorld = new Vec3();
    private readonly _tmpLocal = new Vec3();

    start() {
        void LocalizationManager.init();
        this._unbindLocale = LocalizationManager.onChange(() => this.refreshCaptionTexts());
        this.bootstrap();
        this.scheduleOnce(() => this.bootstrap(), 0);
    }

    onDestroy() {
        this._unbindLocale?.();
        this._unbindLocale = null;
    }

    private bootstrap() {
        if (this._started) {
            return;
        }

        const base = this.searchRoot?.isValid ? this.searchRoot : director.getScene();
        if (!base) {
            return;
        }

        type Pair = { button: Node; label: Label; captionKey: string; fallback: string };
        const pairs: Pair[] = [];

        for (const { nodeName, captionKey, fallback } of DEFAULT_BUTTON_CAPTIONS) {
            const button = this.findDeep(base, nodeName);
            if (!button?.isValid) {
                console.warn(`[ButtonCaptions] Нода не найдена: ${nodeName}`);
                continue;
            }
            const label = this.ensureCaptionLabel(button, nodeName);
            const captionFontSize =
                nodeName === 'ButtonsVegetables' && this.fontSizeVegetables > 0
                    ? this.fontSizeVegetables
                    : this.fontSize;
            label.fontSize = captionFontSize;
            label.lineHeight = captionFontSize;
            label.color = Color.WHITE.clone();
            label.enableOutline = true;
            label.outlineColor = Color.BLACK.clone();
            label.outlineWidth = 2;
            label.overflow = Overflow.RESIZE_HEIGHT;
            label.enableWrapText = true;
            label.spacingY = 0;
            label.horizontalAlign = Label.HorizontalAlign.CENTER;
            label.verticalAlign = Label.VerticalAlign.TOP;
            pairs.push({ button, label, captionKey, fallback });
        }

        if (pairs.length === 0) {
            return;
        }

        this._started = true;
        this._pairs = pairs;
        this.refreshCaptionTexts();

        const finish = () => {
            this.layoutPairs(pairs);
            /** После изменения layout / Widget возможна смена размеров — пересобрать с задержкой. */
            this.scheduleOnce(() => this.layoutPairs(pairs), 0.12);
            this.scheduleOnce(() => this.layoutPairs(pairs), 0.45);
        };

        const path = (this.fontResourcePath ?? '').trim();
        if (!path) {
            finish();
            return;
        }

        loadSharedTtf(path, font => {
            if (font) {
                for (const { label } of pairs) {
                    if (label.isValid) {
                        label.font = font;
                    }
                }
            }
            finish();
        });
    }

    private layoutPairs(pairs: Array<{ button: Node; label: Label }>) {
        for (const { button, label } of pairs) {
            if (!button.isValid || !label.isValid) {
                continue;
            }
            const cap = label.node;
            let capUi = cap.getComponent(UITransform);
            if (!capUi) {
                capUi = cap.addComponent(UITransform);
            }
            capUi.anchorX = 0.5;
            capUi.anchorY = 1;
            const p = this.computeCaptionLocalPosition(button);
            cap.setPosition(p.x, p.y, p.z);
        }
    }

    private refreshCaptionTexts() {
        for (const p of this._pairs) {
            if (!p.label?.isValid) {
                continue;
            }
            const translated = LocalizationManager.tryT(p.captionKey) ?? p.fallback;
            p.label.string = translated;
        }
    }

    /**
     * Позиция верхней кромки надписи (`anchor Y = 1`) в локальных координатах корня кнопки.
     * Используем мировой бокс видимого спрайта → convert в локаль родителя, чтобы порядок с scale/виджетами не ломал Y.
     */
    private computeCaptionLocalPosition(button: Node): Readonly<{ x: number; y: number; z: number }> {
        const btnUi = button.getComponent(UITransform);
        const pull = this.tightenTowardIconPx;
        if (!btnUi) {
            return { x: 0, y: -this.offsetBelow + pull, z: 0 };
        }
        const anchor = this.resolveVisualAnchor(button);
        const vizUi = anchor.getComponent(UITransform);
        if (!vizUi || anchor === button) {
            const h = btnUi.height;
            return { x: 0, y: -h * 0.5 - this.offsetBelow + pull, z: 0 };
        }

        const box = vizUi.getBoundingBoxToWorld();
        const wx = box.x + box.width * 0.5;
        const wy = box.y;
        this._tmpWorld.set(wx, wy, anchor.worldPosition.z);
        btnUi.convertToNodeSpaceAR(this._tmpWorld, this._tmpLocal);

        return {
            x: this._tmpLocal.x,
            y: this._tmpLocal.y - this.offsetBelow + pull,
            z: this._tmpLocal.z,
        };
    }

    /** Первый подходящий дочерний «визуал» или сама кнопка. */
    private resolveVisualAnchor(button: Node): Node {
        const skipCaption = (n: Node) => /^Caption/i.test(n.name);
        for (const name of VISUAL_CHILD_NAMES) {
            const n = button.getChildByName(name);
            if (n?.isValid && !skipCaption(n) && (n.getComponent(Sprite) || n.getComponent(UITransform))) {
                return n;
            }
        }
        for (const c of button.children) {
            if (!c?.isValid || skipCaption(c)) {
                continue;
            }
            if (c.getComponent(Sprite) && c.getComponent(UITransform)) {
                return c;
            }
        }
        return button;
    }

    /** Предпочитает узел Caption, затем имя fallback для этой кнопки; иначе создаёт Caption. */
    private ensureCaptionLabel(button: Node, nodeName: string): Label {
        const prefer = FALLBACK_CAPTION_CHILD[nodeName] ?? '';

        let cap = button.getChildByName('Caption');
        if (!cap?.isValid && prefer) {
            cap = button.getChildByName(prefer);
        }
        if (!cap?.isValid) {
            cap = new Node('Caption');
            cap.layer = button.layer;
            button.addChild(cap);
        }

        if (!cap.getComponent(UITransform)) {
            cap.addComponent(UITransform);
        }

        return cap.getComponent(Label) ?? cap.addComponent(Label);
    }

    private findDeep(root: Node | null, name: string): Node | null {
        if (!root?.isValid) {
            return null;
        }
        if (root.name === name) {
            return root;
        }
        for (const c of root.children) {
            const f = this.findDeep(c, name);
            if (f) {
                return f;
            }
        }
        return null;
    }
}
