import { _decorator, Component, director, EditBox, Label, Node, ProgressBar, resources, RichText, TTFFont } from 'cc';
import { EDITOR_NOT_IN_PREVIEW } from 'cc/env';
import { ButtonCaptions } from './ButtonCaptions';
import { AnalyticsManager } from './AnalyticsManager';
import { DebugPanel } from './DebugPanel';
import { installGlobalErrorHandlers } from './Debug';
import { LevelProgressController } from './LevelProgressController';
import { MobileInputGuard } from './MobileInputGuard';
import { MobileTouchTargets } from './MobileTouchTargets';
import { PerformanceManager } from './PerformanceManager';
import { SafeAreaLayout } from './SafeAreaLayout';
import { TutorialManager } from './TutorialManager';
import { UpgradeListToggle } from './UpgradeListToggle';
import { VegetableUnlockListToggle } from './VegetableUnlockListToggle';
import { AchievementsManager } from './AchievementsManager';
import { LocalizationManager } from './LocalizationManager';
import { YandexSDKManager } from './YandexSDKManager';
import './ProgressManager';

const { ccclass, property } = _decorator;

/** Загружает один TTF из `resources/` и задаёт его на метку */
export function loadTtfFontForLabel(fontPath: string, label: Label | null | undefined, onDone?: () => void): void {
    const raw = fontPath.trim();
    if (!raw || !label?.isValid) {
        onDone?.();
        return;
    }
    resources.load(raw, TTFFont, (err, fontAsset) => {
        if (!err && fontAsset && label.isValid) {
            label.font = fontAsset;
        }
        if (err && label?.isValid) {
            console.warn('[FontLoader] Не удалось загрузить шрифт:', raw, err);
        }
        onDone?.();
    });
}

/** Одна общая загрузка шрифта для набора меток */
export function loadSharedTtf(fontPath: string, onLoaded: (font: TTFFont | null, err?: unknown) => void): void {
    const raw = fontPath.trim();
    if (!raw) {
        onLoaded(null);
        return;
    }
    resources.load(raw, TTFFont, (err, font) => {
        if (err) {
            console.warn('[FontLoader] Не удалось загрузить шрифт:', raw, err);
            onLoaded(null, err);
            return;
        }
        onLoaded(font ?? null);
    });
}

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
    fontResourcePath = 'fonts/Caveat';

    private _loadedFont: TTFFont | null = null;

    onLoad() {
        installGlobalErrorHandlers();
        void LocalizationManager.init();
        this.ensureTutorialManager();
        this.ensureButtonCaptions();
        this.ensureLevelProgressController();
        this.ensurePanelToggles();
        this.ensureRuntimeMobileAdapters();
    }

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
                    console.warn(
                        '[FontLoader] Шрифт не найден по пути resources/' + path + ', используется шрифт по умолчанию.',
                        err?.message ?? err,
                    );
                }
                return;
            }
            if (!this.isValid) {
                return;
            }
            this._loadedFont = fontAsset;

            if (this.richText) {
                this.richText.font = fontAsset;
                this.richText.string = this.richText.string;
            }

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
        if (!root) {
            return;
        }

        const editBoxes = this.findAllEditBoxes(root);
        for (const eb of editBoxes) {
            this.applyFontToSingleEditBox(eb, font);
        }
    }

    private applyFontToSingleEditBox(eb: EditBox, font: TTFFont) {
        const labels = eb.node.getComponentsInChildren(Label);
        for (const l of labels) {
            l.font = font;
        }
    }

    private findAllEditBoxes(root: Node): EditBox[] {
        const out: EditBox[] = [];
        const stack: Node[] = [root];
        while (stack.length) {
            const n = stack.pop()!;
            const eb = n.getComponent(EditBox);
            if (eb) {
                out.push(eb);
            }
            for (const c of n.children) {
                stack.push(c);
            }
        }
        return out;
    }

    private ensureTutorialManager() {
        if (EDITOR_NOT_IN_PREVIEW) {
            return;
        }
        const scene = director.getScene();
        const ui = scene?.getChildByName('Canvas')?.getChildByName('UI');
        if (!ui?.isValid || ui.getComponent(TutorialManager)) {
            return;
        }
        ui.addComponent(TutorialManager);
    }

    private ensureButtonCaptions() {
        if (EDITOR_NOT_IN_PREVIEW) {
            return;
        }
        const scene = director.getScene();
        const container = scene?.getChildByName('Canvas')?.getChildByName('UI')?.getChildByName('Container');
        if (!container?.isValid || container.getComponent(ButtonCaptions)) {
            return;
        }
        container.addComponent(ButtonCaptions);
    }

    private ensureLevelProgressController() {
        const start = director.getScene();
        if (!start) {
            return;
        }
        const progressNode = this.findNodeDeepByName(start, 'ProgressBar');
        if (!progressNode?.isValid) {
            return;
        }
        let controller = progressNode.getComponent(LevelProgressController);
        if (!controller) {
            controller = progressNode.addComponent(LevelProgressController);
        }
        if (!controller.progressBar) {
            controller.progressBar =
                progressNode.getComponent(ProgressBar) ?? progressNode.getComponentInChildren(ProgressBar);
        }
        if (!controller.levelText) {
            const levelNode =
                this.findNodeDeepByName(start, 'LevelText') ?? this.findNodeDeepByName(start, 'LevelText-001');
            if (levelNode?.isValid) {
                controller.levelText = levelNode.getComponent(Label) ?? levelNode.getComponentInChildren(Label);
            }
        }
        controller.refreshNow();
    }

    /**
     * После удаления старых адаптеров toggle-компоненты могли остаться на неактивных панелях,
     * из-за чего их onLoad/start не выполнялся. Держим рабочие экземпляры на активной ноде.
     */
    private ensurePanelToggles() {
        const scene = director.getScene();
        if (!scene) {
            return;
        }

        const unlockPanel = this.findNodeDeepByName(scene, 'VegetableListUnlocked');
        const upgradePanel = this.findNodeDeepByName(scene, 'UpgradeList');

        const inactiveUnlockToggle = unlockPanel?.getComponent(VegetableUnlockListToggle);
        if (inactiveUnlockToggle && inactiveUnlockToggle.node !== this.node) {
            inactiveUnlockToggle.enabled = false;
        }

        const inactiveUpgradeToggle = upgradePanel?.getComponent(UpgradeListToggle);
        if (inactiveUpgradeToggle && inactiveUpgradeToggle.node !== this.node) {
            inactiveUpgradeToggle.enabled = false;
        }

        if (!this.node.getComponent(VegetableUnlockListToggle)) {
            this.node.addComponent(VegetableUnlockListToggle);
        }
        if (!this.node.getComponent(UpgradeListToggle)) {
            this.node.addComponent(UpgradeListToggle);
        }
    }

    private ensureRuntimeMobileAdapters() {
        if (EDITOR_NOT_IN_PREVIEW) {
            return;
        }
        const scene = director.getScene();
        const ui = scene?.getChildByName('Canvas')?.getChildByName('UI');
        if (!ui?.isValid) {
            return;
        }

        if (!ui.getComponent(SafeAreaLayout)) {
            ui.addComponent(SafeAreaLayout);
        }
        if (!ui.getComponent(MobileInputGuard)) {
            ui.addComponent(MobileInputGuard);
        }
        if (!ui.getComponent(MobileTouchTargets)) {
            ui.addComponent(MobileTouchTargets);
        }
        if (!ui.getComponent(PerformanceManager)) {
            ui.addComponent(PerformanceManager);
        }
        if (!ui.getComponent(YandexSDKManager)) {
            ui.addComponent(YandexSDKManager);
        }
        if (!ui.getComponent(AchievementsManager)) {
            ui.addComponent(AchievementsManager);
        }
        if (!ui.getComponent(AnalyticsManager)) {
            ui.addComponent(AnalyticsManager);
        }
        if (!ui.getComponent(DebugPanel)) {
            ui.addComponent(DebugPanel);
        }
    }

    private findNodeDeepByName(root: Node, name: string): Node | null {
        if (root.name === name) {
            return root;
        }
        for (const c of root.children) {
            const f = this.findNodeDeepByName(c, name);
            if (f) {
                return f;
            }
        }
        return null;
    }
}
