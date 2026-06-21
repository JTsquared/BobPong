// ============================================================
// BobPong - Input Manager
// ============================================================

export class InputManager {
    constructor(canvas) {
        this.canvas = canvas;
        this.mouseX = 0;
        this.mouseY = 0;
        this.aiming = false;
        this.charging = false;
        this.chargeStartTime = 0;
        this.chargeReleased = false;  // set true on spacebar release
        this.chargeStarted = false;  // set true on spacebar press (consumed by game)
        this.finalPower = 0;         // power at moment of release
        this.keys = {};
        this.mouseClicked = false;
        this.clickX = 0;
        this.clickY = 0;

        // Camera pan: accumulate mouse movement while right-click held
        this.panAccumX = 0;
        this.panAccumY = 0;

        this._setupListeners();
    }

    _setupListeners() {
        const canvas = this.canvas;

        // Disable context menu for right-click
        canvas.addEventListener('contextmenu', (e) => e.preventDefault());

        // Track if mouse down started as a drag vs a click
        this._mouseDownPos = null;
        this._isDragging = false;
        const DRAG_THRESHOLD = 5; // pixels before it counts as a drag

        canvas.addEventListener('mousedown', (e) => {
            // Both left-click and right-click can pan the camera
            if (e.button === 0 || e.button === 2) {
                this._mouseDownPos = { x: e.clientX, y: e.clientY };
                this._isDragging = false;
                this.panAccumX = 0;
                this.panAccumY = 0;

                if (e.button === 2) {
                    // Right-click always goes straight to aiming
                    this.aiming = true;
                }
            }
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) {
                if (!this._isDragging && this._mouseDownPos) {
                    // It was a click, not a drag — register as UI click
                    const rect = canvas.getBoundingClientRect();
                    this.mouseClicked = true;
                    this.clickX = e.clientX - rect.left;
                    this.clickY = e.clientY - rect.top;
                }
                this.aiming = false;
                this._isDragging = false;
                this._mouseDownPos = null;
            }
            if (e.button === 2) {
                this.aiming = false;
                this._isDragging = false;
                this._mouseDownPos = null;
            }
        });

        window.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            this.mouseX = e.clientX - rect.left;
            this.mouseY = e.clientY - rect.top;

            if (this._mouseDownPos) {
                const movedX = Math.abs(e.clientX - this._mouseDownPos.x);
                const movedY = Math.abs(e.clientY - this._mouseDownPos.y);

                if (!this._isDragging && (movedX > DRAG_THRESHOLD || movedY > DRAG_THRESHOLD)) {
                    // Crossed drag threshold — start panning
                    this._isDragging = true;
                    this.aiming = true;
                }

                if (this.aiming) {
                    this.panAccumX += e.movementX;
                    this.panAccumY += e.movementY;
                }
            }
        });

        // Keyboard
        window.addEventListener('keydown', (e) => {
            this.keys[e.code] = true;

            if (e.code === 'Space') {
                e.preventDefault();
                if (!this.charging) {
                    this.charging = true;
                    this.chargeStarted = true;
                    this.chargeReleased = false;
                    this.chargeStartTime = performance.now();
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            this.keys[e.code] = false;

            if (e.code === 'Space') {
                e.preventDefault();
                if (this.charging) {
                    // Capture the power at moment of release
                    const elapsed = performance.now() - this.chargeStartTime;
                    this.finalPower = Math.min(elapsed / 2000, 1.0); // MAX_CHARGE_TIME=2000
                    this.charging = false;
                    this.chargeReleased = true;
                }
            }
        });
    }

    getChargePower(maxChargeTime) {
        if (!this.charging) return 0;
        const elapsed = performance.now() - this.chargeStartTime;
        return Math.min(elapsed / maxChargeTime, 1.0);
    }

    // Consume the accumulated pan delta (call once per frame)
    consumePanDelta() {
        const dx = this.panAccumX;
        const dy = this.panAccumY;
        this.panAccumX = 0;
        this.panAccumY = 0;
        return { dx, dy };
    }

    // Consume charge release event
    consumeChargeRelease() {
        if (this.chargeReleased) {
            this.chargeReleased = false;
            return this.finalPower;
        }
        return null;
    }

    consumeClick() {
        if (this.mouseClicked) {
            this.mouseClicked = false;
            return { x: this.clickX, y: this.clickY };
        }
        return null;
    }

    isKeyDown(code) {
        return !!this.keys[code];
    }
}
