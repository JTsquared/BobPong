// ============================================================
// BobPong - Renderer (sprite-based with real assets)
// ============================================================

import { CONFIG } from './config.js';
import { worldToScreen } from './projection.js';

export class Renderer {
    constructor(ctx, sprites) {
        this.ctx = ctx;
        this.sprites = sprites;
    }

    clear() {
        this.ctx.clearRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
    }

    drawBackground(spriteName = 'background') {
        const bg = this.sprites.get(spriteName);
        if (bg) {
            this.ctx.drawImage(bg, 0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
        } else {
            this.ctx.fillStyle = '#1a1a2e';
            this.ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
        }
    }

    drawBob(useAlt = false) {
        const spriteName = useAlt ? 'bobAlt' : 'bob';
        const bob = this.sprites.get(spriteName);
        if (!bob) return;

        const w = useAlt ? CONFIG.BOB_ALT_WIDTH : CONFIG.BOB_WIDTH;
        const h = useAlt ? CONFIG.BOB_ALT_HEIGHT : CONFIG.BOB_HEIGHT;
        const offsetY = useAlt ? (CONFIG.BOB_ALT_OFFSET_Y || 0) : (CONFIG.BOB_OFFSET_Y || 0);

        const x = CONFIG.TABLE_X + CONFIG.TABLE_DRAW_WIDTH / 2 - w / 2;
        const y = CONFIG.TABLE_Y + offsetY;
        this.ctx.drawImage(bob, x, y, w, h);
    }

    drawTable() {
        const table = this.sprites.get('table');
        if (!table) return;

        // Crop fraction of the source image (cut legs off bottom)
        const srcH = CONFIG.TABLE_IMG_HEIGHT * CONFIG.TABLE_CROP_FRAC;
        const dstH = CONFIG.TABLE_DRAW_HEIGHT * CONFIG.TABLE_CROP_FRAC;

        this.ctx.drawImage(
            table,
            0, 0,                                  // source x, y
            CONFIG.TABLE_IMG_WIDTH, srcH,          // source w, h (cropped)
            CONFIG.TABLE_X, CONFIG.TABLE_Y,        // dest x, y
            CONFIG.TABLE_DRAW_WIDTH, dstH          // dest w, h (scaled up)
        );
    }

    drawCups(cups) {
        const ctx = this.ctx;
        const cupImg = this.sprites.get('cup');

        // Sort by Y so farther cups (higher world Y) draw first
        const sorted = [...cups].filter(c => c.active).sort((a, b) => b.wy - a.wy);

        for (const cup of sorted) {
            const size = cup.size;
            const x = cup.sx - size / 2;
            const y = cup.sy - size * 0.7; // offset up so cup base sits on the surface

            if (cupImg) {
                ctx.drawImage(cupImg, x, y, size, size);
            } else {
                // Fallback
                ctx.fillStyle = '#CC2222';
                ctx.beginPath();
                ctx.ellipse(cup.sx, cup.sy, size / 2, size / 3, 0, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    drawCupHitZones(cups) {
        const ctx = this.ctx;
        for (const cup of cups) {
            if (!cup.active) continue;
            // Draw an oval at the cup's screen position matching the cup opening
            // The opening is roughly the top 35% of the cup image, horizontally ~60% of cup width
            const rx = cup.size * 0.30;  // horizontal radius
            const ry = cup.size * 0.15;  // vertical radius (flattened by perspective)
            // The opening center is at the top of the cup image
            const cy = cup.sy - cup.size * 0.52;

            ctx.strokeStyle = 'rgba(0, 255, 0, 0.6)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(cup.sx, cy, rx, ry, 0, 0, Math.PI * 2);
            ctx.stroke();

            // Center dot
            ctx.fillStyle = 'rgba(0, 255, 0, 0.8)';
            ctx.beginPath();
            ctx.arc(cup.sx, cy, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawBall(ball) {
        if (!ball || !ball.active) return;
        const ctx = this.ctx;

        // Ball shadow on table surface
        const shadowScreen = worldToScreen(ball.x, ball.y, 0);
        ctx.fillStyle = CONFIG.COLOR_BALL_SHADOW;
        const sr = CONFIG.BALL_RADIUS * shadowScreen.scale;
        ctx.beginPath();
        ctx.ellipse(shadowScreen.x, shadowScreen.y, sr, sr * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();

        // Ball
        const ballScreen = worldToScreen(ball.x, ball.y, ball.z);
        const r = CONFIG.BALL_RADIUS * ballScreen.scale;

        const gradient = ctx.createRadialGradient(
            ballScreen.x - r * 0.3, ballScreen.y - r * 0.3, r * 0.1,
            ballScreen.x, ballScreen.y, r
        );
        gradient.addColorStop(0, '#FFFFFF');
        gradient.addColorStop(1, '#CCCCCC');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(ballScreen.x, ballScreen.y, r, 0, Math.PI * 2);
        ctx.fill();
    }

    drawBallTrail(trail) {
        if (!trail || trail.length < 2) return;
        const ctx = this.ctx;

        for (let i = 0; i < trail.length; i++) {
            const point = trail[i];
            const screen = worldToScreen(point.x, point.y, point.z);
            const alpha = (i / trail.length) * CONFIG.TRAIL_ALPHA_START;
            const r = CONFIG.BALL_RADIUS * screen.scale * 0.5;

            ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
            ctx.beginPath();
            ctx.arc(screen.x, screen.y, r, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawHand(playerX, holdingBall) {
        // Use frame 0 of the throw spritesheet as the idle hand
        this.drawThrowAnimation(playerX, 0);
    }

    drawThrowAnimation(playerX, frameIndex) {
        const sheet = this.sprites.get('throwSheet');
        if (!sheet) return;

        const screen = worldToScreen(playerX, 50, CONFIG.PLAYER_HAND_Z);
        const col = frameIndex % CONFIG.THROW_COLS;
        const row = Math.floor(frameIndex / CONFIG.THROW_COLS);
        const sx = col * CONFIG.THROW_FRAME_W;
        const sy = row * CONFIG.THROW_FRAME_H;
        const cropFrac = CONFIG.THROW_CROP_BOTTOM || 1;
        const srcH = CONFIG.THROW_FRAME_H * cropFrac;
        const w = CONFIG.THROW_DRAW_W;
        const h = CONFIG.THROW_DRAW_H;

        // Anchor bottom of sprite to bottom of canvas
        this.ctx.drawImage(
            sheet,
            sx, sy, CONFIG.THROW_FRAME_W, srcH,
            screen.x - w * 0.35, CONFIG.CANVAS_HEIGHT - h,
            w, h
        );
    }

    drawSplash(animation) {
        if (!animation || !animation.active) return;
        const ctx = this.ctx;
        const screen = worldToScreen(animation.x, animation.y, 0);
        const progress = animation.currentFrame / (animation.frameCount - 1);

        ctx.save();
        ctx.globalAlpha = 1 - progress * 0.8;

        const radius = 4 + progress * 20 * screen.scale;
        ctx.fillStyle = 'rgba(200, 220, 255, 0.6)';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, radius, 0, Math.PI * 2);
        ctx.fill();

        // Droplets
        const dropCount = 6 + Math.floor(progress * 4);
        const dropDist = 8 + progress * 25 * screen.scale;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        for (let d = 0; d < dropCount; d++) {
            const angle = (d / dropCount) * Math.PI * 2;
            const dx = screen.x + Math.cos(angle) * dropDist;
            const dy = screen.y + Math.sin(angle) * dropDist * 0.5;
            const ds = 2 - progress * 1.5;
            if (ds > 0.3) {
                ctx.beginPath();
                ctx.arc(dx, dy, ds, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.restore();
    }

    drawCrosshair(screenX, screenY) {
        const ctx = this.ctx;
        ctx.strokeStyle = CONFIG.COLOR_CROSSHAIR;
        ctx.lineWidth = 2;

        ctx.beginPath();
        ctx.arc(screenX, screenY, 12, 0, Math.PI * 2);
        ctx.stroke();

        const len = 18;
        ctx.beginPath();
        ctx.moveTo(screenX - len, screenY);
        ctx.lineTo(screenX + len, screenY);
        ctx.moveTo(screenX, screenY - len);
        ctx.lineTo(screenX, screenY + len);
        ctx.stroke();

        ctx.fillStyle = CONFIG.COLOR_CROSSHAIR;
        ctx.beginPath();
        ctx.arc(screenX, screenY, 2, 0, Math.PI * 2);
        ctx.fill();
    }

    drawPowerMeter(power, charging, zones) {
        const ctx = this.ctx;
        const x = 30;
        const y = 250;
        const w = 20;
        const h = 400;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(x - 2, y - 2, w + 4, h + 4);

        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        // Outer sweet zone (dark green)
        const sweetTop = y + h * (1 - zones.sweetMax);
        const sweetBot = y + h * (1 - zones.sweetMin);
        ctx.fillStyle = 'rgba(0, 160, 80, 0.35)';
        ctx.fillRect(x, sweetTop, w, sweetBot - sweetTop);

        // Inner perfect zone (bright green, smaller)
        const perfTop = y + h * (1 - zones.perfectMax);
        const perfBot = y + h * (1 - zones.perfectMin);
        ctx.fillStyle = 'rgba(0, 255, 120, 0.5)';
        ctx.fillRect(x, perfTop, w, perfBot - perfTop);

        if (power > 0) {
            const fillH = h * power;
            const fillY = y + h - fillH;

            let color;
            if (power >= zones.perfectMin && power <= zones.perfectMax) {
                color = '#00FF88'; // bright green — perfect
            } else if (power >= zones.sweetMin && power <= zones.sweetMax) {
                color = '#22AA55'; // dark green — good
            } else if (power < 0.5) {
                color = CONFIG.COLOR_POWER_LOW;
            } else if (power < 0.8) {
                color = CONFIG.COLOR_POWER_MID;
            } else {
                color = CONFIG.COLOR_POWER_HIGH;
            }

            ctx.fillStyle = color;
            ctx.fillRect(x, fillY, w, fillH);
        }

        ctx.fillStyle = CONFIG.COLOR_HUD_TEXT;
        ctx.font = '11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('POWER', x + w / 2, y + h + 16);

        if (charging) {
            ctx.fillText(Math.round(power * 100) + '%', x + w / 2, y - 8);
        }

        // Intoxication indicator
        if (zones.intoxication > 0.05) {
            const drunkPct = Math.round(zones.intoxication * 100);
            ctx.font = '10px monospace';
            ctx.fillStyle = `rgba(255, ${Math.round(180 - zones.intoxication * 150)}, 0, 0.9)`;
            ctx.fillText(`🍺 ${drunkPct}%`, x + w / 2, y + h + 32);
        }
    }

    drawScore(player1Cups, player2Cups, currentPlayer, gameMode) {
        const ctx = this.ctx;
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'left';

        ctx.fillStyle = currentPlayer === 0 ? '#FFD700' : '#FFFFFF';
        ctx.fillText(`YOU: ${player1Cups} cups`, 30, 30);

        ctx.fillStyle = currentPlayer === 1 ? '#FFD700' : '#FFFFFF';
        const p2Label = gameMode === 'single' ? 'CPU' : 'P2';
        ctx.textAlign = 'right';
        ctx.fillText(`${p2Label}: ${player2Cups} cups`, CONFIG.CANVAS_WIDTH - 30, 30);
    }

    drawTurnIndicator(text) {
        const ctx = this.ctx;
        ctx.font = 'bold 24px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FFD700';
        ctx.fillText(text, CONFIG.CANVAS_WIDTH / 2, 55);
    }
}
