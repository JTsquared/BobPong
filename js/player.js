// ============================================================
// BobPong - Player Model
// ============================================================

import { CONFIG } from './config.js';

export class Player {
    constructor(side) {
        this.side = side; // 0 = near, 1 = far
        this.x = CONFIG.PLAYER_START_X;
        this.cupsRemaining = 10;
    }

    move(direction, dt) {
        this.x += direction * CONFIG.PLAYER_MOVE_SPEED * dt;
        this.x = Math.max(CONFIG.PLAYER_MIN_X, Math.min(CONFIG.PLAYER_MAX_X, this.x));
    }

    getHandPosition() {
        if (this.side === 0) {
            return { x: this.x, y: 50 };
        }
        return { x: this.x, y: CONFIG.TABLE_LENGTH - 50 };
    }

    reset() {
        this.x = CONFIG.PLAYER_START_X;
        this.cupsRemaining = 10;
    }
}
