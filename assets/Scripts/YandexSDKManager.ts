import { _decorator, Component, Node, sys } from 'cc';
import { MoneyManager } from './MoneyManager';

const { ccclass, property } = _decorator;

type YaSdkLike = {
    getPlayer: (opts?: { scopes?: boolean }) => Promise<any>;
    getPayments?: (opts?: { signed?: boolean }) => Promise<any>;
    adv?: {
        showFullscreenAdv?: (args?: { callbacks?: Record<string, (...args: any[]) => void> }) => void;
        showRewardedVideo?: (args?: { callbacks?: Record<string, (...args: any[]) => void> }) => void;
    };
    leaderboard?: {
        setLeaderboardScore?: (name: string, score: number) => Promise<void>;
        getLeaderboardEntries?: (
            name: string,
            opts?: { quantityTop?: number; includeUser?: boolean; quantityAround?: number },
        ) => Promise<any>;
    };
    features?: {
        LoadingAPI?: {
            ready?: () => void;
        };
        GameplayAPI?: {
            start?: () => void;
            stop?: () => void;
        };
    };
};

type YaGamesLike = {
    init?: () => Promise<YaSdkLike>;
};

type LeaderboardEntry = {
    rank: number;
    score: number;
    name: string;
};

declare global {
    interface Window {
        YaGames?: YaGamesLike;
    }
}

@ccclass('YandexSDKManager')
export class YandexSDKManager extends Component {
    @property({ tooltip: 'Интервал между fullscreen-рекламами (сек)' })
    fullscreenCooldownSec = 240;

    @property({ tooltip: 'Длительность награды «двойной урожай» за rewarded (сек)' })
    rewardedDoubleHarvestSec = 120;

    private static _instance: YandexSDKManager | null = null;

    private _ysdk: YaSdkLike | null = null;
    private _player: any | null = null;
    private _payments: any | null = null;
    private _initPromise: Promise<void> | null = null;
    private _isReady = false;
    private _onReadyListeners = new Set<() => void>();
    private _lastFullscreenAt = 0;
    private _rewardButtonsBound = false;
    private _boundRewardNodes: Node[] = [];

    public static getInstance(): YandexSDKManager | null {
        return YandexSDKManager._instance;
    }

    public static ensureInstance(sceneRoot: Node | null): YandexSDKManager | null {
        if (YandexSDKManager._instance?.isValid) {
            return YandexSDKManager._instance;
        }
        if (!sceneRoot?.isValid) {
            return null;
        }
        const found = this.findComponentDeep(sceneRoot);
        if (found) {
            this._instance = found;
            return found;
        }
        const ui = this.findNodeDeep(sceneRoot, 'UI');
        if (!ui?.isValid) {
            return null;
        }
        return ui.addComponent(YandexSDKManager);
    }

    onLoad() {
        if (YandexSDKManager._instance && YandexSDKManager._instance !== this) {
            this.destroy();
            return;
        }
        YandexSDKManager._instance = this;
    }

    start() {
        void this.initialize();
        this.bindRewardedButtons();
    }

    onDestroy() {
        if (YandexSDKManager._instance === this) {
            YandexSDKManager._instance = null;
        }
        for (const n of this._boundRewardNodes) {
            if (!n?.isValid) {
                continue;
            }
            n.off(Node.EventType.TOUCH_END, this.onRewardedButtonTap, this);
            n.off(Node.EventType.MOUSE_UP, this.onRewardedButtonTap, this);
        }
        this._boundRewardNodes = [];
    }

    public initialize(): Promise<void> {
        if (this._initPromise) {
            return this._initPromise;
        }
        this._initPromise = this.initializeInternal();
        return this._initPromise;
    }

    private async initializeInternal(): Promise<void> {
        if (this._isReady) {
            return;
        }
        if (!sys.isBrowser || typeof window === 'undefined' || !window.YaGames?.init) {
            return;
        }
        try {
            const ysdk = await window.YaGames.init();
            this._ysdk = ysdk;
            try {
                this._player = await ysdk.getPlayer?.({ scopes: true });
            } catch {
                this._player = null;
            }
            try {
                this._payments = await ysdk.getPayments?.({ signed: true });
            } catch {
                this._payments = null;
            }
            ysdk.features?.LoadingAPI?.ready?.();
            ysdk.features?.GameplayAPI?.start?.();
            this._isReady = true;
            for (const cb of this._onReadyListeners) {
                cb();
            }
        } catch (err) {
            console.warn('[YandexSDKManager] init failed, fallback to local mode', err);
        }
    }

    public onReady(cb: () => void): void {
        if (this._isReady) {
            cb();
            return;
        }
        this._onReadyListeners.add(cb);
    }

    public isReady(): boolean {
        return this._isReady;
    }

    public getYsdk(): YaSdkLike | null {
        return this._ysdk;
    }

    public getPlayer(): any | null {
        return this._player;
    }

    public async showFullscreenAd(force = false): Promise<boolean> {
        await this.initialize();
        if (!this._ysdk?.adv?.showFullscreenAdv) {
            return false;
        }
        const now = Date.now();
        const cooldownMs = Math.max(0, this.fullscreenCooldownSec * 1000);
        if (!force && now - this._lastFullscreenAt < cooldownMs) {
            return false;
        }
        return await new Promise<boolean>(resolve => {
            this._ysdk?.adv?.showFullscreenAdv?.({
                callbacks: {
                    onOpen: () => {
                        this._ysdk?.features?.GameplayAPI?.stop?.();
                    },
                    onClose: () => {
                        this._lastFullscreenAt = Date.now();
                        this._ysdk?.features?.GameplayAPI?.start?.();
                        resolve(true);
                    },
                    onError: () => {
                        this._ysdk?.features?.GameplayAPI?.start?.();
                        resolve(false);
                    },
                },
            });
        });
    }

    public async showRewardedVideo(reward: () => void): Promise<boolean> {
        await this.initialize();
        if (!this._ysdk?.adv?.showRewardedVideo) {
            return false;
        }
        return await new Promise<boolean>(resolve => {
            let rewarded = false;
            this._ysdk?.adv?.showRewardedVideo?.({
                callbacks: {
                    onOpen: () => this._ysdk?.features?.GameplayAPI?.stop?.(),
                    onRewarded: () => {
                        rewarded = true;
                        reward();
                    },
                    onClose: () => {
                        this._ysdk?.features?.GameplayAPI?.start?.();
                        resolve(rewarded);
                    },
                    onError: () => {
                        this._ysdk?.features?.GameplayAPI?.start?.();
                        resolve(false);
                    },
                },
            });
        });
    }

    public async submitScore(name: string, score: number): Promise<void> {
        await this.initialize();
        if (!this._ysdk?.leaderboard?.setLeaderboardScore) {
            return;
        }
        await this._ysdk.leaderboard.setLeaderboardScore(name, Math.max(0, Math.floor(score)));
    }

    public async getLeaderboard(name: string): Promise<LeaderboardEntry[]> {
        await this.initialize();
        if (!this._ysdk?.leaderboard?.getLeaderboardEntries) {
            return [];
        }
        const raw = await this._ysdk.leaderboard.getLeaderboardEntries(name, {
            includeUser: true,
            quantityAround: 3,
            quantityTop: 10,
        });
        const entries = Array.isArray(raw?.entries) ? raw.entries : [];
        return entries.map((e: any) => ({
            rank: Number(e?.rank) || 0,
            score: Number(e?.score) || 0,
            name: String(e?.player?.publicName ?? e?.player?.scopePermissions?.public_name ?? 'Player'),
        }));
    }

    public async unlockAchievement(id: string): Promise<void> {
        await this.initialize();
        const playerAny = this._player as any;
        if (playerAny?.setStats) {
            try {
                await playerAny.setStats({ [id]: 1 });
            } catch {
                // ignore if stat API unavailable
            }
        }
    }

    private bindRewardedButtons() {
        if (this._rewardButtonsBound) {
            return;
        }
        const scene = this.node.scene;
        if (!scene) {
            return;
        }
        const names = ['ButtonX2', 'ButtonsShop-002'];
        for (const nm of names) {
            const target = this.findNodeDeepByName(scene, nm);
            if (!target?.isValid) {
                continue;
            }
            target.on(Node.EventType.TOUCH_END, this.onRewardedButtonTap, this);
            target.on(Node.EventType.MOUSE_UP, this.onRewardedButtonTap, this);
            this._boundRewardNodes.push(target);
        }
        this._rewardButtonsBound = true;
    }

    private onRewardedButtonTap = () => {
        void this.showRewardedVideo(() => {
            const mm = MoneyManager.getInstance();
            if (!mm) {
                return;
            }
            mm.activateDoubleHarvest(this.rewardedDoubleHarvestSec);
            mm.addMoney(25);
        });
    };

    private findNodeDeepByName(root: Node, name: string): Node | null {
        if (root.name === name) {
            return root;
        }
        for (const child of root.children) {
            const found = this.findNodeDeepByName(child, name);
            if (found) {
                return found;
            }
        }
        return null;
    }

    private static findComponentDeep(root: Node): YandexSDKManager | null {
        const self = root.getComponent(YandexSDKManager);
        if (self) {
            return self;
        }
        for (const child of root.children) {
            const found = this.findComponentDeep(child);
            if (found) {
                return found;
            }
        }
        return null;
    }

    private static findNodeDeep(root: Node, name: string): Node | null {
        if (root.name === name) {
            return root;
        }
        for (const child of root.children) {
            const found = this.findNodeDeep(child, name);
            if (found) {
                return found;
            }
        }
        return null;
    }
}
