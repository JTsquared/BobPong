// ============================================================
// BobPong - Intoxication system
// Losing cups = drinking = harder to aim
// ============================================================

import { CONFIG } from './config.js';

// Returns the current power zone bounds based on how many of your cups remain.
// cupsRemaining: 10 (sober) down to 1 (wasted)
export function getPowerZones(cupsRemaining) {
    // Interpolate from sober (10 cups) to drunk (1 cup)
    // t=0 at 10 cups, t=1 at 1 cup
    const t = Math.max(0, Math.min(1, (10 - cupsRemaining) / 9));

    const sweetHalf = lerp(CONFIG.POWER_SWEET_HALF_SOBER, CONFIG.POWER_SWEET_HALF_DRUNK, t);
    const perfectHalf = lerp(CONFIG.POWER_PERFECT_HALF_SOBER, CONFIG.POWER_PERFECT_HALF_DRUNK, t);
    const center = CONFIG.POWER_CENTER;

    return {
        sweetMin: center - sweetHalf,
        sweetMax: center + sweetHalf,
        perfectMin: center - perfectHalf,
        perfectMax: center + perfectHalf,
        intoxication: t, // 0 = sober, 1 = wasted
    };
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}
