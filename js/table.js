// ============================================================
// BobPong - Table Model (cup formations with screen positions)
// ============================================================

import { CONFIG } from './config.js';
import { worldToScreen, screenToWorld, lerp } from './projection.js';

// Generate a triangle cup formation.
// t = depth on table (0=near, 1=far)
// Returns cups with both world coords (for physics) and screen coords (for rendering)
function generateFormation(t, direction) {
    const cups = [];
    const rows = CONFIG.CUP_ROWS;

    // Cup size and spacing interpolated by depth
    const cupSize = lerp(CONFIG.CUP_SIZE_NEAR, CONFIG.CUP_SIZE_FAR, t);
    const spacing = lerp(CONFIG.CUP_SPACING_NEAR, CONFIG.CUP_SPACING_FAR, t);
    const rowSpacing = spacing * (CONFIG.CUP_ROW_SPACING_RATIO || 0.55);

    // World Y for this formation
    const worldY = t * CONFIG.TABLE_LENGTH;

    // Screen position of the center at this depth
    const centerScreen = worldToScreen(CONFIG.TABLE_WIDTH / 2, worldY, 0);

    let rowOffset = 0;
    for (const count of rows) {
        const rowWidth = (count - 1) * spacing;
        const startX = centerScreen.x - rowWidth / 2;
        const rowY = centerScreen.y + direction * rowOffset;

        for (let i = 0; i < count; i++) {
            const sx = startX + i * spacing;
            const sy = rowY;

            // The cup opening center is above the base position
            const openingY = sy - cupSize * 0.52;
            // Derive world coords from the OPENING position for accurate collision
            const world = screenToWorld(sx, openingY);

            cups.push({
                wx: world.x,
                wy: world.y,
                sx,
                sy,
                size: cupSize,
                active: true,
            });
        }
        rowOffset += rowSpacing;
    }
    return cups;
}

export function createNearFormation() {
    return generateFormation(CONFIG.NEAR_CUP_T, -1); // rows go upward (toward far end)
}

export function createFarFormation() {
    return generateFormation(CONFIG.FAR_CUP_T, 1); // rows go downward (toward near end)
}

export function getActiveCupCount(cups) {
    return cups.filter(c => c.active).length;
}

export function shouldRerack(cups) {
    const count = getActiveCupCount(cups);
    return CONFIG.RERACK_THRESHOLDS.includes(count);
}

export function rerack(cups) {
    const count = getActiveCupCount(cups);
    if (count <= 0) return cups;

    // Determine if near or far side based on average screen Y
    const activeCups = cups.filter(c => c.active);
    const avgSY = activeCups.reduce((s, c) => s + c.sy, 0) / activeCups.length;
    const midScreenY = (CONFIG.TABLE_Y + CONFIG.SURFACE_NEAR_Y + CONFIG.TABLE_Y + CONFIG.SURFACE_FAR_Y) / 2;
    const isNearSide = avgSY > midScreenY;

    const t = isNearSide ? CONFIG.NEAR_CUP_T : CONFIG.FAR_CUP_T;
    const dir = isNearSide ? -1 : 1;
    const cupSize = lerp(CONFIG.CUP_SIZE_NEAR, CONFIG.CUP_SIZE_FAR, t);
    const spacing = lerp(CONFIG.CUP_SPACING_NEAR, CONFIG.CUP_SPACING_FAR, t);
    const rowSpacing = spacing * (CONFIG.CUP_ROW_SPACING_RATIO || 0.55);
    const worldY = t * CONFIG.TABLE_LENGTH;
    const centerScreen = worldToScreen(CONFIG.TABLE_WIDTH / 2, worldY, 0);

    let rowDefs;
    switch (count) {
        case 6: rowDefs = [3, 2, 1]; break;
        case 3: rowDefs = [2, 1]; break;
        case 2: rowDefs = [2]; break;
        case 1: rowDefs = [1]; break;
        default: return cups;
    }

    const newCups = [];
    let rowOffset = 0;
    for (const rowCount of rowDefs) {
        const rowWidth = (rowCount - 1) * spacing;
        const startX = centerScreen.x - rowWidth / 2;
        const rowY = centerScreen.y + dir * rowOffset;

        for (let i = 0; i < rowCount; i++) {
            const sx = startX + i * spacing;
            const sy = rowY;
            const openingY = sy - cupSize * 0.52;
            const world = screenToWorld(sx, openingY);
            newCups.push({
                wx: world.x,
                wy: world.y,
                sx,
                sy,
                size: cupSize,
                active: true,
            });
        }
        rowOffset += rowSpacing;
    }
    return newCups;
}
