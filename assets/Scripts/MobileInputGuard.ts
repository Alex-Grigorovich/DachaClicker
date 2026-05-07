import { _decorator, Component, sys } from 'cc';

const { ccclass } = _decorator;

@ccclass('MobileInputGuard')
export class MobileInputGuard extends Component {
    private _touchMoveHandler: ((e: Event) => void) | null = null;
    private _gestureHandler: ((e: Event) => void) | null = null;

    onLoad() {
        if (!sys.isBrowser || typeof document === 'undefined') {
            return;
        }

        this._touchMoveHandler = (e: Event) => {
            e.preventDefault();
        };
        document.addEventListener('touchmove', this._touchMoveHandler, { passive: false });

        this._gestureHandler = (e: Event) => {
            e.preventDefault();
        };
        document.addEventListener('gesturestart', this._gestureHandler, { passive: false } as EventListenerOptions);

        this.applyViewportMeta();
    }

    onDestroy() {
        if (typeof document === 'undefined') {
            return;
        }
        if (this._touchMoveHandler) {
            document.removeEventListener('touchmove', this._touchMoveHandler);
            this._touchMoveHandler = null;
        }
        if (this._gestureHandler) {
            document.removeEventListener('gesturestart', this._gestureHandler);
            this._gestureHandler = null;
        }
    }

    private applyViewportMeta() {
        if (typeof document === 'undefined') {
            return;
        }

        const desired = 'width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no,viewport-fit=cover';
        let viewport = document.querySelector('meta[name="viewport"]') as HTMLMetaElement | null;
        if (!viewport) {
            viewport = document.createElement('meta');
            viewport.setAttribute('name', 'viewport');
            document.head?.appendChild(viewport);
        }
        viewport.setAttribute('content', desired);
    }
}
