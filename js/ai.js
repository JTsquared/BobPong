// ============================================================
// BobPong - AI Opponent
// ============================================================

import { CONFIG } from './config.js';

export class AI {
    constructor(difficulty = 'medium') {
        this.difficulty = difficulty;
        this.noise = CONFIG.AI_DIFFICULTY[difficulty] || CONFIG.AI_DIFFICULTY.medium;
        this.thinking = false;
        this.thinkTimer = 0;
        this.throwReady = false;
        this.throwParams = null;
    }

    startTurn(targetCups, playerX) {
        this.thinking = true;
        this.throwReady = false;
        this.throwParams = null;

        const activeCups = targetCups.filter(c => c.active);
        if (activeCups.length === 0) return;

        // Pick a target cup — prefer front cups (closer = easier)
        const sorted = [...activeCups].sort((a, b) => a.wy - b.wy);
        const weights = sorted.map((_, i) => sorted.length - i);
        const totalWeight = weights.reduce((s, w) => s + w, 0);
        let r = Math.random() * totalWeight;
        let target = sorted[0];
        for (let i = 0; i < sorted.length; i++) {
            r -= weights[i];
            if (r <= 0) { target = sorted[i]; break; }
        }

        // AI throws from the far side toward the target cup
        const startX = playerX;
        const startY = CONFIG.TABLE_LENGTH - 50;

        // Add noise to the target position (inaccuracy)
        const noiseRange = 80; // world units of scatter
        const targetX = target.wx + (Math.random() - 0.5) * 2 * noiseRange * this.noise.angleNoise / 0.15;
        const targetY = target.wy + (Math.random() - 0.5) * 2 * noiseRange * this.noise.powerNoise / 0.15;

        // Power: 0.5–0.8 range, with noise
        const power = 0.6 + (Math.random() - 0.5) * 0.3;

        this.throwParams = { startX, startY, targetX, targetY, power };

        this.thinkTimer = CONFIG.AI_THINK_DELAY_MIN +
            Math.random() * (CONFIG.AI_THINK_DELAY_MAX - CONFIG.AI_THINK_DELAY_MIN);
    }

    update(dt) {
        if (!this.thinking) return;
        this.thinkTimer -= dt * 1000;
        if (this.thinkTimer <= 0) {
            this.thinking = false;
            this.throwReady = true;
        }
    }

    consumeThrow() {
        if (this.throwReady) {
            this.throwReady = false;
            return this.throwParams;
        }
        return null;
    }
}
