import { _decorator, Component, director, EditBox, Label, Node, resources, RichText, TTFFont } from 'cc';
import './ProgressManager';
const { ccclass, property } = _decorator;

@ccclass('FontLoader')
export class FontLoader extends Component {
    @property(RichText) richText: RichText = null;

    @property({ type: EditBox, tooltip: 'Если задан — применить шрифт только к этому EditBox' })
    editBox: EditBox = null;

    @property({ type: Node, tooltip: 'Если задано — применить шрифт ко всем EditBox внутри этого узла (например, корень UI)' })
    editBoxRoot: Node = null;

    @property({
        tooltip:
            'Путь к TTFFont в assets/resources/ без расширения (например fonts/Caveat). Пустая строка — не грузить шрифт, остаётся шрифт по умолчанию.',
    })
    fontResourcePath: string = 'fonts/Caveat';

    private _loadedFont: TTFFont | null = null;

    start() {
        const path = (this.fontResourcePath ?? '').trim();
        if (!path) {
            return;
        }
        this.loadCustomFont(path);
    }

    loadCustomFont(url: string) {
        const path = (url ?? '').trim();
        if (!path) {
            return;
        }
        resources.load(path, TTFFont, (err, fontAsset) => {
            if (err) {
                if (this.isValid) {
                    console.warn('[FontLoader] Шрифт не найден по пути resources/' + path + ', используется шрифт по умолчанию.', err?.message ?? err);
                }
                return;
            }
            if (!this.isValid) {
                return;
            }
            console.log('[FontLoader] Шрифт загружен:', fontAsset.name);
            this._loadedFont = fontAsset;
            
            if (this.richText) {
                this.richText.font = fontAsset;
                this.richText.string = this.richText.string; // триггерим обновление
                // Увеличиваем line height программно если нужно
                // this.richText.lineHeight = 50;
            }

            // EditBox часто пересоздаёт внутренние Label на старте.
            // Поэтому применяем шрифт сразу и повторяем на следующий кадр.
            this.applyFontToEditBoxes(fontAsset);
            this.scheduleOnce(() => this.applyFontToEditBoxes(fontAsset), 0);
        });
    }

    onEnable() {
        if (this._loadedFont) {
            this.applyFontToEditBoxes(this._loadedFont);
            this.scheduleOnce(() => this.applyFontToEditBoxes(this._loadedFont!), 0);
        }
    }

    private applyFontToEditBoxes(font: TTFFont) {
        if (this.editBox) {
            this.applyFontToSingleEditBox(this.editBox, font);
            return;
        }

        const root = this.editBoxRoot ?? director.getScene();
        if (!root) return;

        const editBoxes = this.findAllEditBoxes(root);
        for (const eb of editBoxes) this.applyFontToSingleEditBox(eb, font);
    }

    private applyFontToSingleEditBox(eb: EditBox, font: TTFFont) {
        const labels = eb.node.getComponentsInChildren(Label);
        for (const l of labels) l.font = font;
    }

    private findAllEditBoxes(root: Node): EditBox[] {
        const out: EditBox[] = [];
        const stack: Node[] = [root];
        while (stack.length) {
            const n = stack.pop()!;
            const eb = n.getComponent(EditBox);
            if (eb) out.push(eb);
            for (const c of n.children) stack.push(c);
        }
        return out;
    }

}