// ============================================================
// BobPong - Projection: maps world coords to screen pixels
// based on the table image's baked-in perspective
// ============================================================

import { CONFIG } from './config.js';

function lerp(a, b, t) {
    return a + (b - a) * t;
}

// Convert world coords (physics space) to screen pixels (canvas space).
// The table image already has perspective, so we just interpolate
// positions within its trapezoidal surface area.
//
// World space: x=[0, TABLE_WIDTH], y=[0, TABLE_LENGTH], z=height above table
// t = y / TABLE_LENGTH: 0 = near edge, 1 = far edge

export function worldToScreen(wx, wy, wz = 0) {
    const t = Math.max(0, Math.min(1, wy / CONFIG.TABLE_LENGTH));

    // Interpolate the left/right edges of the table surface at depth t
    const leftX = lerp(CONFIG.SURFACE_NEAR_LEFT, CONFIG.SURFACE_FAR_LEFT, t);
    const rightX = lerp(CONFIG.SURFACE_NEAR_RIGHT, CONFIG.SURFACE_FAR_RIGHT, t);
    const surfaceWidth = rightX - leftX;

    // Map world X [0, TABLE_WIDTH] to the surface row at this depth
    const xFrac = wx / CONFIG.TABLE_WIDTH;
    const imgX = leftX + xFrac * surfaceWidth;

    // Map depth to image Y
    const imgY = lerp(CONFIG.SURFACE_NEAR_Y, CONFIG.SURFACE_FAR_Y, t);

    // Convert image coords to canvas coords
    const screenX = CONFIG.TABLE_X + imgX;
    const screenY = CONFIG.TABLE_Y + imgY;

    // Scale factor for sizing objects (cups, ball) — near=1, far scales down
    const scale = lerp(1.0, CONFIG.CUP_SIZE_FAR / CONFIG.CUP_SIZE_NEAR, t);

    // Z offset: height above table moves the object upward on screen
    const zOffset = wz * scale * 0.4;

    return {
        x: screenX,
        y: screenY - zOffset,
        scale,
    };
}

// Inverse: screen pixel → world coords on the table surface (z=0)
export function screenToWorld(sx, sy) {
    // Convert canvas coords to image coords
    const imgX = sx - CONFIG.TABLE_X;
    const imgY = sy - CONFIG.TABLE_Y;

    // Solve for t from imgY
    // imgY = lerp(SURFACE_NEAR_Y, SURFACE_FAR_Y, t)
    // imgY = SURFACE_NEAR_Y + (SURFACE_FAR_Y - SURFACE_NEAR_Y) * t
    const t = (imgY - CONFIG.SURFACE_NEAR_Y) / (CONFIG.SURFACE_FAR_Y - CONFIG.SURFACE_NEAR_Y);
    const tClamped = Math.max(0, Math.min(1, t));

    // Get the surface edges at this depth
    const leftX = lerp(CONFIG.SURFACE_NEAR_LEFT, CONFIG.SURFACE_FAR_LEFT, tClamped);
    const rightX = lerp(CONFIG.SURFACE_NEAR_RIGHT, CONFIG.SURFACE_FAR_RIGHT, tClamped);
    const surfaceWidth = rightX - leftX;

    // Map image X to world X
    const xFrac = (imgX - leftX) / surfaceWidth;
    const wx = xFrac * CONFIG.TABLE_WIDTH;
    const wy = tClamped * CONFIG.TABLE_LENGTH;

    return { x: wx, y: wy };
}

export { lerp };
