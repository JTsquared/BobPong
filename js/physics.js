// ============================================================
// BobPong - Physics (collision detection, trajectory helpers)
// ============================================================

import { CONFIG } from './config.js';

// Cup height in world units (ball must descend into this zone)
const CUP_HEIGHT = 80;
// Deflection zone: if ball is near a cup but not going IN, it bounces off
const DEFLECT_RADIUS = CONFIG.CUP_RADIUS * 1.3;

export function checkCupCollision(ball, cups) {
    // Must be descending and in the cup height zone
    if (ball.vz > 0) return null;
    if (ball.z > CUP_HEIGHT) return null;
    if (ball.z < -CONFIG.BALL_RADIUS) return null;

    for (let i = 0; i < cups.length; i++) {
        const cup = cups[i];
        if (!cup.active) continue;

        const dx = ball.x - cup.wx;
        const dy = ball.y - cup.wy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        // Ball lands INSIDE the cup opening
        if (dist < CONFIG.CUP_RADIUS) {
            if (dist < CONFIG.CUP_RADIUS * CONFIG.RIM_INNER_RATIO) {
                return { index: i, type: 'clean' };
            }
            if (Math.random() < CONFIG.RIM_BOUNCE_OUT_CHANCE) {
                return { index: i, type: 'rimOut' };
            }
            return { index: i, type: 'rimIn' };
        }

        // Ball hits the outside of the cup — deflect off it
        if (dist < DEFLECT_RADIUS && ball.z < CUP_HEIGHT * 0.7) {
            return { index: i, type: 'deflect', dx, dy, dist };
        }
    }
    return null;
}

export function computeIdealThrow(startX, startY, targetX, targetY) {
    const dx = targetX - startX;
    const dy = targetY - startY;
    const angle2D = Math.atan2(dx, dy);

    const dist = Math.sqrt(dx * dx + dy * dy);
    const elevAngle = CONFIG.FIXED_ELEVATION_ANGLE;
    const sin2e = Math.sin(2 * elevAngle);

    const requiredSpeed = Math.sqrt(Math.abs(dist * CONFIG.GRAVITY / sin2e));
    const power = Math.min(Math.max(requiredSpeed / CONFIG.MAX_THROW_SPEED, 0.2), 0.95);

    return { angle: angle2D, power };
}
