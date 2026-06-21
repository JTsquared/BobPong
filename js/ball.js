// ============================================================
// BobPong - Ball State
// ============================================================

import { CONFIG } from './config.js';

export class Ball {
    constructor() {
        this.reset();
        this.trail = [];
    }

    reset() {
        this.x = CONFIG.TABLE_WIDTH / 2;
        this.y = 50;
        this.z = CONFIG.PLAYER_HAND_Z;
        this.vx = 0;
        this.vy = 0;
        this.vz = 0;
        this.active = false;
        this.settled = false;
        this.trail = [];
        this.tableBounces = 0; // tracks how many times the ball bounced off the table
    }

    // Launch the ball so it lands at (targetX, targetY) on the table.
    // Power scales a fixed arc height — more power = higher/faster arc to the same spot.
    // Less power = lower/slower arc.
    launchAtTarget(startX, startY, targetX, targetY, power, zones) {
        this.x = startX;
        this.y = startY;
        this.z = CONFIG.PLAYER_HAND_Z;

        // Accuracy based on dynamic power zones (shrink as you get drunker)
        // zones: { sweetMin, sweetMax, perfectMin, perfectMax }
        // If no zones passed, use defaults (for AI, test mode, etc.)
        const z = zones || {
            sweetMin: CONFIG.POWER_CENTER - CONFIG.POWER_SWEET_HALF_SOBER,
            sweetMax: CONFIG.POWER_CENTER + CONFIG.POWER_SWEET_HALF_SOBER,
            perfectMin: CONFIG.POWER_CENTER - CONFIG.POWER_PERFECT_HALF_SOBER,
            perfectMax: CONFIG.POWER_CENTER + CONFIG.POWER_PERFECT_HALF_SOBER,
        };

        const baseDist = Math.sqrt((targetX - startX) ** 2 + (targetY - startY) ** 2);
        const maxScatter = baseDist * 0.18;

        let scatter;
        if (power >= z.perfectMin && power <= z.perfectMax) {
            scatter = 0;
        } else if (power >= z.sweetMin && power <= z.sweetMax) {
            scatter = maxScatter * 0.15;
        } else {
            const distOutside = power < z.sweetMin
                ? z.sweetMin - power
                : power - z.sweetMax;
            scatter = maxScatter * (0.3 + Math.min(distOutside / 0.3, 1.0) * 0.7);
        }

        const scatterX = (Math.random() - 0.5) * 2 * scatter;
        const scatterY = (Math.random() - 0.5) * 2 * scatter;

        const dx = (targetX + scatterX) - startX;
        const dy = (targetY + scatterY) - startY;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Arc height scales with power: min 150, max 600 world units
        const arcHeight = 150 + power * 450;

        // Time of flight from projectile motion:
        // Peak height h = vz^2 / (2g), total flight time T = 2*vz/g (symmetric arc)
        // But we start at z=HAND_Z and land at z=0, so it's not symmetric.
        // Use: h_peak = HAND_Z + arcHeight
        // vz = sqrt(2 * g * (HAND_Z + arcHeight))  (velocity needed to reach peak from z=0)
        // Adjust: ball starts at HAND_Z, so vz = sqrt(2 * g * arcHeight)
        const g = CONFIG.GRAVITY;
        this.vz = Math.sqrt(2 * g * arcHeight);

        // Total flight time: time to rise from HAND_Z to peak, then fall to z=0
        // Rise: HAND_Z + arcHeight from start → peak is at z = HAND_Z + arcHeight
        // From z=HAND_Z with vz upward: time to peak = vz / g
        // Fall from peak (z = HAND_Z + arcHeight) to z=0: t_fall = sqrt(2*(HAND_Z+arcHeight)/g)
        const timeToPeak = this.vz / g;
        const peakZ = CONFIG.PLAYER_HAND_Z + this.vz * timeToPeak - 0.5 * g * timeToPeak * timeToPeak;
        const timeFall = Math.sqrt(2 * peakZ / g);
        const totalTime = timeToPeak + timeFall;

        // Horizontal velocity to cover the distance in that time
        const horizSpeed = dist / totalTime;

        // Direction in XY plane
        const angle = Math.atan2(dx, dy);
        this.vx = horizSpeed * Math.sin(angle);
        this.vy = horizSpeed * Math.cos(angle);

        this.active = true;
        this.settled = false;
        this.trail = [];
        this.tableBounces = 0;
    }

    update(dt) {
        if (!this.active || this.settled) return;

        // Store trail point
        this.trail.push({ x: this.x, y: this.y, z: this.z });
        if (this.trail.length > CONFIG.TRAIL_LENGTH) {
            this.trail.shift();
        }

        // Apply gravity
        this.vz -= CONFIG.GRAVITY * dt;

        // Integrate position
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.z += this.vz * dt;

        // Bounce off table surface
        if (this.z <= 0) {
            this.z = 0;
            this.tableBounces++;
            this.vz = -this.vz * CONFIG.BOUNCE_RESTITUTION;
            this.vx *= CONFIG.BOUNCE_FRICTION;
            this.vy *= CONFIG.BOUNCE_FRICTION;

            if (Math.abs(this.vz) < CONFIG.BOUNCE_SETTLE_THRESHOLD) {
                this.settled = true;
                this.vz = 0;
            }
        }

        // Off the table?
        if (this.y > CONFIG.TABLE_LENGTH + 200 || this.y < -200 ||
            this.x < -200 || this.x > CONFIG.TABLE_WIDTH + 200) {
            this.settled = true;
        }
    }
}
