// ============================================================
// BobPong - Main Entry Point & Game Loop
// ============================================================

import { CONFIG } from './config.js';
import { SpriteLoader } from './sprites.js';
import { Renderer } from './renderer.js';
import { Game } from './game.js';
import { InputManager } from './input.js';

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
canvas.width = CONFIG.CANVAS_WIDTH;
canvas.height = CONFIG.CANVAS_HEIGHT;

// Load sprites
const sprites = new SpriteLoader();
sprites.loadAll();

const input = new InputManager(canvas);
const renderer = new Renderer(ctx, sprites);
const game = new Game(renderer, input, sprites);

// Wait for sprites then start game loop
let lastTime = 0;
let accumulator = 0;
let waitingForAssets = true;

function gameLoop(timestamp) {
    if (waitingForAssets) {
        if (sprites.isReady()) {
            waitingForAssets = false;
            lastTime = timestamp;
        } else {
            // Show loading
            ctx.fillStyle = '#0d0d1a';
            ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);
            ctx.fillStyle = '#FFD700';
            ctx.font = 'bold 24px monospace';
            ctx.textAlign = 'center';
            ctx.fillText('Loading...', CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT / 2);
            requestAnimationFrame(gameLoop);
            return;
        }
    }

    const dt = Math.min((timestamp - lastTime) / 1000, 0.1);
    lastTime = timestamp;
    accumulator += dt;

    while (accumulator >= CONFIG.PHYSICS_DT) {
        game.update(CONFIG.PHYSICS_DT);
        accumulator -= CONFIG.PHYSICS_DT;
    }

    game.draw();
    requestAnimationFrame(gameLoop);
}

requestAnimationFrame(gameLoop);
