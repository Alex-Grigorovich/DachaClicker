import { director, Node, Scene, Tween } from 'cc';
import { SlotMenuHandler } from './SlotMenuHandler';

/** Взаимоисключающие полноэкранные/модальные панели UI (одновременно открыта только одна). */
export enum ExclusiveUIPanelId {
    VegetableList = 'VegetableList',
    VegetableListUnlocked = 'VegetableListUnlocked',
    UpgradeList = 'UpgradeList',
    Tasks = 'Tasks',
}

function findDeep(root: Node | null, name: string): Node | null {
    if (!root?.isValid) {
        return null;
    }
    if (root.name === name) {
        return root;
    }
    for (const c of root.children) {
        const f = findDeep(c, name);
        if (f) {
            return f;
        }
    }
    return null;
}

function forceHidePanel(node: Node | null | undefined): void {
    if (!node?.isValid || !node.active) {
        return;
    }
    Tween.stopAllByTarget(node);
    node.active = false;
    node.setScale(1, 1, 1);
}

/**
 * Закрывает все перечисленные панели, кроме открываемой сейчас.
 * Вызывать в начале открытия каждой из них (до активации/анимации).
 */
export function closeOtherExclusivePanels(keepOpen: ExclusiveUIPanelId, scene?: Scene | null): void {
    const s = scene ?? director.getScene();
    if (!s) {
        return;
    }

    if (keepOpen !== ExclusiveUIPanelId.VegetableList) {
        const n = findDeep(s, ExclusiveUIPanelId.VegetableList);
        if (n?.active) {
            forceHidePanel(n);
            const slots = s.getComponentsInChildren(SlotMenuHandler);
            for (let i = 0; i < slots.length; i++) {
                slots[i].notifyMenuClosed();
            }
        }
    }

    if (keepOpen !== ExclusiveUIPanelId.VegetableListUnlocked) {
        forceHidePanel(findDeep(s, ExclusiveUIPanelId.VegetableListUnlocked));
    }

    if (keepOpen !== ExclusiveUIPanelId.UpgradeList) {
        forceHidePanel(findDeep(s, ExclusiveUIPanelId.UpgradeList));
    }

    if (keepOpen !== ExclusiveUIPanelId.Tasks) {
        forceHidePanel(findDeep(s, ExclusiveUIPanelId.Tasks));
    }
}
