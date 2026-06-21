// ============================================================
// BobPong - Game State Machine
// ============================================================

import { CONFIG } from './config.js';
import { screenToWorld, worldToScreen } from './projection.js';
import { Ball } from './ball.js';
import { Player } from './player.js';
import { AI } from './ai.js';
import { Animation } from './animation.js';
import { checkCupCollision } from './physics.js';
import {
    createNearFormation, createFarFormation,
    getActiveCupCount, shouldRerack, rerack
} from './table.js';
import { OnlineMultiplayer } from './multiplayer/online.js';
import { getPowerZones } from './intoxication.js';
import {
    createGameStartMessage, createBallStateMessage,
    createCupHitMessage, createTurnChangeMessage,
    createGameOverMessage, createRerackMessage, createThrowMessage
} from './multiplayer/state-sync.js';

// Mirror a cup index left-to-right within its row.
// CUP_ROWS = [4, 3, 2, 1] → indices 0-3, 4-6, 7-8, 9
// Mirroring reverses position within each row (left↔right).
function mirrorCupIndex(index) {
    let offset = 0;
    for (const count of CONFIG.CUP_ROWS) {
        if (index < offset + count) {
            const posInRow = index - offset;
            return offset + (count - 1 - posInRow);
        }
        offset += count;
    }
    return index; // fallback
}

// Game states
const STATE = {
    MENU: 'menu',
    MODE_SELECT: 'mode_select',
    ONLINE_LOBBY: 'online_lobby',
    PLAYING: 'playing',
    RESULT: 'result',
    TEST_MODE: 'test_mode',
};

// Play sub-states
const PLAY_STATE = {
    AIMING: 'aiming',
    CHARGING: 'charging',
    THROW_ANIM: 'throw_anim',
    THROWING: 'throwing',
    RESOLVING: 'resolving',
    TURN_SWITCH: 'turn_switch',
    AI_THINKING: 'ai_thinking',
};

export class Game {
    constructor(renderer, input, sprites) {
        this.renderer = renderer;
        this.input = input;
        this.sprites = sprites;

        this.state = STATE.MENU;
        this.playState = PLAY_STATE.AIMING;
        this.gameMode = 'single'; // 'single', 'local', 'online'

        this.ball = new Ball();
        this.players = [new Player(0), new Player(1)];
        this.currentPlayer = 0; // 0 or 1
        this.ai = new AI('medium');

        this.nearCups = createNearFormation();
        this.farCups = createFarFormation();

        this.splash = new Animation(8, 12, false);
        this.power = 0;
        this.aimAngle = 0;
        this.turnSwitchTimer = 0;
        this.winner = null;

        // Crosshair position (screen coordinates) — starts over far cups
        this.crosshairX = CONFIG.CANVAS_WIDTH / 2;
        this.crosshairY = 0; // set in startGame/resetCrosshair

        // Track cups already hit during a single throw
        this.hitCupsThisThrow = new Set();

        // Track which cups belong to which player for current perspective
        // Player 0 always throws toward far cups
        // Player 1 always throws toward near cups
        this.flipped = false; // true when player 1 is throwing (perspective flipped)

        // Menu hover
        this.hoveredButton = -1;

        // Throw animation
        this.throwAnimFrame = 0;
        this.throwAnimTimer = 0;
        this.throwAnimPlayerX = 0;   // player X when throw started

        // Result
        this.resultMessage = '';

        // Test mode
        this.testFrames = [];      // recorded ball states [{x,y,z,vx,vy,vz}, ...]
        this.testFrameIndex = 0;
        this.testPlaying = false;  // auto-play toggle
        this.testHitFrame = -1;    // frame where a cup was hit (-1 = none)
        this.testHitType = '';

        // Debug overlay (toggle with T key)
        this.debugOverlay = false;
        this._debugKeyWasDown = false;

        // Online multiplayer
        this.online = null;
        this.onlineLobbyState = 'choose'; // 'choose', 'hosting', 'joining', 'connecting', 'connected'
        this.roomCodeInput = '';
        this.onlineStatusMessage = '';
        this.signalingUrl = 'wss://blazegames.store/bobpong-ws/';
    }

    getCurrentZones() {
        // Your cups remaining determines your intoxication
        return getPowerZones(this.getMyCupCount());
    }

    getTargetCups() {
        // In online mode, both players see the same table and throw toward
        // the far cups (top of screen), so always target farCups.
        if (this.gameMode === 'online') return this.farCups;
        // Single/local: Player 0 targets far, Player 1 targets near
        if (this.currentPlayer === 0) return this.farCups;
        return this.nearCups;
    }

    getTargetSide() {
        if (this.gameMode === 'online') return 'far';
        return this.currentPlayer === 0 ? 'far' : 'near';
    }

    getOwnCups() {
        if (this.currentPlayer === 0) return this.nearCups;
        return this.farCups;
    }

    update(dt) {
        switch (this.state) {
            case STATE.MENU:
                this.updateMenu(dt);
                break;
            case STATE.MODE_SELECT:
                this.updateModeSelect(dt);
                break;
            case STATE.ONLINE_LOBBY:
                this.updateOnlineLobby(dt);
                break;
            case STATE.PLAYING:
                this.updatePlaying(dt);
                break;
            case STATE.TEST_MODE:
                this.updateTestMode(dt);
                break;
            case STATE.RESULT:
                this.updateResult(dt);
                break;
        }
    }

    draw() {
        this.renderer.clear();

        switch (this.state) {
            case STATE.MENU:
                this.drawMenu();
                break;
            case STATE.MODE_SELECT:
                this.drawModeSelect();
                break;
            case STATE.ONLINE_LOBBY:
                this.drawOnlineLobby();
                break;
            case STATE.PLAYING:
                this.drawPlaying();
                break;
            case STATE.TEST_MODE:
                this.drawTestMode();
                break;
            case STATE.RESULT:
                this.drawResult();
                break;
        }
    }

    // ---- MENU ----
    updateMenu(dt) {
        const click = this.input.consumeClick();
        if (click) {
            const btn = this.getMenuButton(click.x, click.y);
            if (btn === 0) {
                this.state = STATE.MODE_SELECT;
            }
        }
    }

    drawMenu() {
        const ctx = this.renderer.ctx;

        // Background
        this.renderer.drawBackground();
        this.renderer.drawBob();
        this.renderer.drawTable();
        this.drawCupsForDisplay();

        // Overlay
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

        // Title
        ctx.font = 'bold 72px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = CONFIG.COLOR_TITLE;
        ctx.shadowColor = '#FF8800';
        ctx.shadowBlur = 20;
        ctx.fillText('BOBPONG', CONFIG.CANVAS_WIDTH / 2, 280);
        ctx.shadowBlur = 0;

        // Subtitle
        ctx.font = '18px monospace';
        ctx.fillStyle = '#AAAAAA';
        ctx.fillText('A Beer Pong Game', CONFIG.CANVAS_WIDTH / 2, 320);

        // Play button
        this.drawButton(CONFIG.CANVAS_WIDTH / 2, 450, 240, 60, 'PLAY');

        // Controls hint
        ctx.font = '14px monospace';
        ctx.fillStyle = '#666666';
        ctx.fillText('Click + drag to aim | Space to throw | Arrows to move', CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT - 40);
    }

    getMenuButton(x, y) {
        if (x >= CONFIG.CANVAS_WIDTH / 2 - 120 && x <= CONFIG.CANVAS_WIDTH / 2 + 120 &&
            y >= 420 && y <= 480) {
            return 0;
        }
        return -1;
    }

    // ---- MODE SELECT ----
    updateModeSelect(dt) {
        if (this.input.isKeyDown('Escape')) {
            this.state = STATE.MENU;
            return;
        }

        const click = this.input.consumeClick();
        if (click) {
            const btn = this.getModeButton(click.x, click.y);
            if (btn === 3) {
                this.startTestMode();
                return;
            }
            if (btn >= 0) {
                const modes = ['single', 'local', 'online'];
                this.gameMode = modes[btn];
                if (this.gameMode === 'online') {
                    this.state = STATE.ONLINE_LOBBY;
                    this.onlineLobbyState = 'choose';
                    this.roomCodeInput = '';
                    this.onlineStatusMessage = '';
                } else {
                    this.startGame();
                }
            }
        }
    }

    drawModeSelect() {
        const ctx = this.renderer.ctx;

        // Background
        this.renderer.drawBackground();
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

        // Title
        ctx.font = 'bold 48px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = CONFIG.COLOR_TITLE;
        ctx.fillText('SELECT MODE', CONFIG.CANVAS_WIDTH / 2, 200);

        // Buttons
        this.drawButton(CONFIG.CANVAS_WIDTH / 2, 300, 300, 55, 'SINGLE PLAYER');
        this.drawButton(CONFIG.CANVAS_WIDTH / 2, 385, 300, 55, 'LOCAL 2-PLAYER');
        this.drawButton(CONFIG.CANVAS_WIDTH / 2, 470, 300, 55, 'ONLINE');
        this.drawButton(CONFIG.CANVAS_WIDTH / 2, 555, 300, 55, 'TEST MODE');

        // Back hint
        ctx.font = '14px monospace';
        ctx.fillStyle = '#666666';
        ctx.fillText('Press ESC to go back', CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT - 40);
    }

    getModeButton(x, y) {
        const cx = CONFIG.CANVAS_WIDTH / 2;
        const hw = 150;
        if (x >= cx - hw && x <= cx + hw) {
            if (y >= 273 && y <= 328) return 0; // Single
            if (y >= 358 && y <= 413) return 1; // Local
            if (y >= 443 && y <= 498) return 2; // Online
            if (y >= 528 && y <= 583) return 3; // Test
        }
        return -1;
    }

    // ---- ONLINE LOBBY ----
    updateOnlineLobby(dt) {
        if (this.input.isKeyDown('Escape')) {
            if (this.onlineLobbyState === 'choose') {
                this.state = STATE.MODE_SELECT;
                return;
            } else if (this.onlineLobbyState === 'searching') {
                if (this.online) this.online.cancelMatch();
                this.online = null;
                this.onlineLobbyState = 'choose';
                this.onlineStatusMessage = '';
                return;
            }
        }

        if (this.onlineLobbyState === 'choose') {
            const click = this.input.consumeClick();
            if (click) {
                const cx = CONFIG.CANVAS_WIDTH / 2;
                // Find match button
                if (click.x >= cx - 120 && click.x <= cx + 120 && click.y >= 280 && click.y <= 340) {
                    this.onlineFindMatch();
                }
                // Create room button
                if (click.x >= cx - 120 && click.x <= cx + 120 && click.y >= 380 && click.y <= 440) {
                    this.onlineCreateRoom();
                }
                // Join room button
                if (click.x >= cx - 120 && click.x <= cx + 120 && click.y >= 480 && click.y <= 540) {
                    this.onlineLobbyState = 'joining';
                    this.roomCodeInput = '';
                    this._setupKeyboardInput();
                }
            }
        } else if (this.onlineLobbyState === 'joining') {
            // Room code is captured via _onKeyPress
        }
    }

    _setupKeyboardInput() {
        if (this._keyListener) return;
        this._keyListener = (e) => {
            if (this.state !== STATE.ONLINE_LOBBY || this.onlineLobbyState !== 'joining') return;
            if (e.key === 'Backspace') {
                this.roomCodeInput = this.roomCodeInput.slice(0, -1);
            } else if (e.key === 'Enter' && this.roomCodeInput.length === 4) {
                this.onlineJoinRoom(this.roomCodeInput);
            } else if (e.key === 'Escape') {
                this.onlineLobbyState = 'choose';
                this.roomCodeInput = '';
            } else if (e.key.length === 1 && this.roomCodeInput.length < 4) {
                this.roomCodeInput += e.key.toUpperCase();
            }
        };
        window.addEventListener('keydown', this._keyListener);
    }

    _removeKeyboardInput() {
        if (this._keyListener) {
            window.removeEventListener('keydown', this._keyListener);
            this._keyListener = null;
        }
    }

    async onlineCreateRoom() {
        this.onlineLobbyState = 'hosting';
        this.onlineStatusMessage = 'Connecting to server...';

        this.online = new OnlineMultiplayer(this.signalingUrl);

        this.online.onRoomCreated = (code) => {
            this.roomCodeInput = code;
            this.onlineStatusMessage = 'Waiting for opponent...';
        };

        this.online.onConnected = () => {
            this.onlineLobbyState = 'connected';
            this.onlineStatusMessage = 'Connected! Starting game...';
            setTimeout(() => {
                this._removeKeyboardInput();
                this.startGame();
                // Send game start to guest
                this.online.send(createGameStartMessage(this.nearCups, this.farCups, this.currentPlayer));
            }, 1000);
        };

        this.online.onMessage = (msg) => {
            this._handleOnlineMessage(msg);
        };

        this.online.onError = (msg) => {
            this.onlineStatusMessage = `Error: ${msg}`;
        };

        this.online.onDisconnected = () => {
            if (this.state === STATE.PLAYING) {
                this.resultMessage = 'OPPONENT DISCONNECTED';
                this.state = STATE.RESULT;
            }
        };

        try {
            await this.online.createRoom();
        } catch (e) {
            this.onlineStatusMessage = 'Could not connect to server';
            this.onlineLobbyState = 'choose';
        }
    }

    async onlineJoinRoom(code) {
        this.onlineLobbyState = 'connecting';
        this.onlineStatusMessage = 'Connecting...';

        this.online = new OnlineMultiplayer(this.signalingUrl);

        this.online.onConnected = () => {
            this.onlineLobbyState = 'connected';
            this.onlineStatusMessage = 'Connected! Starting game...';
        };

        this.online.onMessage = (msg) => {
            this._handleOnlineMessage(msg);
        };

        this.online.onError = (msg) => {
            this.onlineStatusMessage = `Error: ${msg}`;
            this.onlineLobbyState = 'joining';
        };

        this.online.onDisconnected = () => {
            if (this.state === STATE.PLAYING) {
                this.resultMessage = 'OPPONENT DISCONNECTED';
                this.state = STATE.RESULT;
            }
        };

        try {
            await this.online.joinRoom(code);
        } catch (e) {
            this.onlineStatusMessage = 'Could not connect to server';
            this.onlineLobbyState = 'choose';
        }
    }

    async onlineFindMatch() {
        this.onlineLobbyState = 'searching';
        this.onlineStatusMessage = 'Searching for opponent...';

        this.online = new OnlineMultiplayer(this.signalingUrl);

        this.online.onConnected = () => {
            this.onlineLobbyState = 'connected';
            this.onlineStatusMessage = 'Match found! Starting game...';
            setTimeout(() => {
                this._removeKeyboardInput();
                this.startGame();
                // Host sends game start to guest
                if (this.online.isHost) {
                    this.online.send(createGameStartMessage(this.nearCups, this.farCups, this.currentPlayer));
                }
            }, 1000);
        };

        this.online.onMessage = (msg) => {
            this._handleOnlineMessage(msg);
        };

        this.online.onError = (msg) => {
            this.onlineStatusMessage = `Error: ${msg}`;
            this.onlineLobbyState = 'choose';
        };

        this.online.onDisconnected = () => {
            if (this.state === STATE.PLAYING) {
                this.resultMessage = 'OPPONENT DISCONNECTED';
                this.state = STATE.RESULT;
            } else if (this.onlineLobbyState === 'searching') {
                this.onlineStatusMessage = 'Disconnected from server';
                this.onlineLobbyState = 'choose';
            }
        };

        try {
            await this.online.findMatch();
        } catch (e) {
            this.onlineStatusMessage = 'Could not connect to server';
            this.onlineLobbyState = 'choose';
        }
    }

    _handleOnlineMessage(msg) {
        switch (msg.type) {
            case 'game_start':
                this._removeKeyboardInput();
                this.startGame();
                this.currentPlayer = msg.data.currentPlayer;
                break;
            case 'ball_state':
                this.ball.x = msg.data.x;
                this.ball.y = msg.data.y;
                this.ball.z = msg.data.z;
                this.ball.vx = msg.data.vx;
                this.ball.vy = msg.data.vy;
                this.ball.vz = msg.data.vz;
                this.ball.active = msg.data.active;
                break;
            case 'cup_hit': {
                // In online mode, the thrower always hits farCups (side='far').
                // On the receiver's screen, those same cups are their nearCups,
                // so flip far→near. Mirror the index left↔right since the
                // opponent views the table from the other end.
                let hitSide = msg.data.side;
                let hitIndex = msg.data.index;
                if (this.gameMode === 'online') {
                    hitSide = hitSide === 'far' ? 'near' : 'far';
                    hitIndex = mirrorCupIndex(hitIndex);
                }
                const hitCups = hitSide === 'near' ? this.nearCups : this.farCups;
                if (hitCups[hitIndex]) {
                    const hitCup = hitCups[hitIndex];
                    hitCup.active = false;
                    if (msg.data.hitType !== 'bonus') {
                        this.splash.start(hitCup.wx, hitCup.wy);
                        // Snap ball to the cup position so it visually lands correctly
                        this.ball.x = hitCup.wx;
                        this.ball.y = hitCup.wy;
                        this.ball.z = 0;
                    }
                }
                this.ball.active = false;
                this.playState = PLAY_STATE.RESOLVING;
                break;
            }
            case 'turn_change':
                this.currentPlayer = msg.data.currentPlayer;
                this.ball.reset();
                this.resetCrosshair();
                this.playState = PLAY_STATE.AIMING;
                break;
            case 'rerack':
                // Regenerate rerack locally using our own cup data
                if (msg.data.side === 'near') {
                    this.nearCups = rerack(this.nearCups);
                } else {
                    this.farCups = rerack(this.farCups);
                }
                break;
            case 'game_over':
                this.winner = msg.data.winner;
                this.resultMessage = msg.data.winner === 0 ? 'PLAYER 1 WINS!' : 'PLAYER 2 WINS!';
                this.state = STATE.RESULT;
                break;
            case 'throw_sync': {
                // Other player threw — animate the ball from far end toward
                // our near cups. Mirror their X (their right = our left) and
                // aim at the tip cup's Y depth so the arc lands correctly.
                const td = msg.data;
                const mirroredHandX = CONFIG.TABLE_WIDTH - td.handX;
                const mirroredTargetX = CONFIG.TABLE_WIDTH - td.targetX;
                // Find the tip of the near formation (highest wy = closest
                // to the far end, first cup the ball would reach)
                const activeNear = this.nearCups.filter(c => c.active);
                const tipCup = activeNear.reduce((best, c) =>
                    c.wy > best.wy ? c : best, activeNear[0]);
                const targetY = tipCup ? tipCup.wy : CONFIG.NEAR_CUP_T * CONFIG.TABLE_LENGTH;
                // Use zones that guarantee zero scatter — this is just a visual
                // animation; the actual hit result comes via cup_hit message.
                const noScatterZones = {
                    sweetMin: 0, sweetMax: 1,
                    perfectMin: 0, perfectMax: 1,
                };
                this.ball.launchAtTarget(
                    mirroredHandX,
                    CONFIG.TABLE_LENGTH - 50,     // start from far end (top of screen)
                    mirroredTargetX,
                    targetY,
                    td.power,
                    noScatterZones
                );
                this.playState = PLAY_STATE.THROWING;
                this.hitCupsThisThrow = new Set();
                break;
            }
            case 'miss':
                // Other player's ball missed — go to resolving
                this.ball.active = false;
                this.playState = PLAY_STATE.RESOLVING;
                break;
        }
    }

    drawOnlineLobby() {
        const ctx = this.renderer.ctx;

        ctx.fillStyle = CONFIG.COLOR_MENU_BG;
        ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

        ctx.font = 'bold 48px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = CONFIG.COLOR_TITLE;
        ctx.fillText('ONLINE', CONFIG.CANVAS_WIDTH / 2, 150);

        if (this.onlineLobbyState === 'choose') {
            this.drawButton(CONFIG.CANVAS_WIDTH / 2, 310, 240, 60, 'FIND MATCH');
            this.drawButton(CONFIG.CANVAS_WIDTH / 2, 410, 240, 60, 'CREATE ROOM');
            this.drawButton(CONFIG.CANVAS_WIDTH / 2, 510, 240, 60, 'JOIN ROOM');

            ctx.font = '14px monospace';
            ctx.fillStyle = '#666666';
            ctx.fillText('Press ESC to go back', CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT - 40);
        } else if (this.onlineLobbyState === 'searching') {
            ctx.font = '24px monospace';
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('SEARCHING FOR OPPONENT...', CONFIG.CANVAS_WIDTH / 2, 340);

            // Animated dots
            const dots = '.'.repeat(Math.floor(Date.now() / 500) % 4);
            ctx.font = '32px monospace';
            ctx.fillStyle = CONFIG.COLOR_TITLE;
            ctx.fillText(dots, CONFIG.CANVAS_WIDTH / 2, 390);

            ctx.font = '16px monospace';
            ctx.fillStyle = '#AAAAAA';
            ctx.fillText('Press ESC to cancel', CONFIG.CANVAS_WIDTH / 2, 450);
        } else if (this.onlineLobbyState === 'hosting') {
            ctx.font = '24px monospace';
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('ROOM CODE:', CONFIG.CANVAS_WIDTH / 2, 300);

            ctx.font = 'bold 64px monospace';
            ctx.fillStyle = CONFIG.COLOR_TITLE;
            ctx.fillText(this.roomCodeInput || '...', CONFIG.CANVAS_WIDTH / 2, 380);

            ctx.font = '18px monospace';
            ctx.fillStyle = '#AAAAAA';
            ctx.fillText('Share this code with your opponent', CONFIG.CANVAS_WIDTH / 2, 430);
        } else if (this.onlineLobbyState === 'joining') {
            ctx.font = '24px monospace';
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('ENTER ROOM CODE:', CONFIG.CANVAS_WIDTH / 2, 300);

            // Room code input display
            ctx.font = 'bold 64px monospace';
            ctx.fillStyle = CONFIG.COLOR_TITLE;
            const display = this.roomCodeInput.padEnd(4, '_');
            ctx.fillText(display, CONFIG.CANVAS_WIDTH / 2, 380);

            ctx.font = '16px monospace';
            ctx.fillStyle = '#AAAAAA';
            ctx.fillText('Type the 4-letter code and press Enter', CONFIG.CANVAS_WIDTH / 2, 430);
            ctx.fillText('Press ESC to go back', CONFIG.CANVAS_WIDTH / 2, 460);
        } else if (this.onlineLobbyState === 'connecting') {
            ctx.font = '24px monospace';
            ctx.fillStyle = '#FFFFFF';
            ctx.fillText('CONNECTING...', CONFIG.CANVAS_WIDTH / 2, 350);
        } else if (this.onlineLobbyState === 'connected') {
            ctx.font = '24px monospace';
            ctx.fillStyle = CONFIG.COLOR_POWER_SWEET;
            ctx.fillText('CONNECTED!', CONFIG.CANVAS_WIDTH / 2, 350);
        }

        // Status message
        if (this.onlineStatusMessage) {
            ctx.font = '16px monospace';
            ctx.fillStyle = '#FFAA00';
            ctx.fillText(this.onlineStatusMessage, CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT - 80);
        }
    }

    // ---- GAME START ----
    startGame() {
        this.state = STATE.PLAYING;
        this.playState = PLAY_STATE.AIMING;
        this.currentPlayer = 0;
        this.flipped = false;
        this.winner = null;

        this.players[0].reset();
        this.players[1].reset();
        this.ball.reset();
        this.resetCrosshair();

        this.nearCups = createNearFormation();
        this.farCups = createFarFormation();

        if (this.gameMode === 'single') {
            this.ai = new AI('medium');
        }
    }

    // ---- PLAYING ----
    updatePlaying(dt) {
        // ESC to return to menu
        if (this.input.isKeyDown('Escape')) {
            this.state = STATE.MENU;
            return;
        }

        // Toggle debug overlay with T
        const tDown = this.input.isKeyDown('KeyT');
        if (tDown && !this._debugKeyWasDown) {
            this.debugOverlay = !this.debugOverlay;
        }
        this._debugKeyWasDown = tDown;

        this.splash.update(dt);

        switch (this.playState) {
            case PLAY_STATE.AIMING:
                this.updateAiming(dt);
                break;
            case PLAY_STATE.CHARGING:
                this.updateCharging(dt);
                break;
            case PLAY_STATE.THROW_ANIM:
                this.updateThrowAnim(dt);
                break;
            case PLAY_STATE.THROWING:
                this.updateThrowing(dt);
                break;
            case PLAY_STATE.RESOLVING:
                this.updateResolving(dt);
                break;
            case PLAY_STATE.TURN_SWITCH:
                this.updateTurnSwitch(dt);
                break;
            case PLAY_STATE.AI_THINKING:
                this.updateAIThinking(dt);
                break;
        }
    }

    resetCrosshair() {
        // Default crosshair: centered on the far cup area
        const tableMinY = CONFIG.TABLE_Y + CONFIG.SURFACE_FAR_Y;
        const tableMaxY = CONFIG.TABLE_Y + CONFIG.SURFACE_NEAR_Y;
        const farCupY = tableMinY + (tableMaxY - tableMinY) * (1 - CONFIG.FAR_CUP_T);
        this.crosshairX = CONFIG.CANVAS_WIDTH / 2;
        this.crosshairY = farCupY;
    }

    isMyTurnOnline() {
        if (this.gameMode !== 'online') return true;
        if (!this.online) return true;
        return (this.online.isHost && this.currentPlayer === 0) ||
               (!this.online.isHost && this.currentPlayer === 1);
    }

    isGuestOnline() {
        return this.gameMode === 'online' && this.online && !this.online.isHost;
    }

    getMyCupCount() {
        // In online mode, both players see their own cups at the bottom (near)
        // and opponent's cups at the top (far)
        if (this.gameMode === 'online') {
            return getActiveCupCount(this.nearCups);
        }
        // Single/local: player 0's cups = near, player 1's cups = far
        if (this.currentPlayer === 0) return getActiveCupCount(this.nearCups);
        return getActiveCupCount(this.farCups);
    }

    getOpponentCupCount() {
        if (this.gameMode === 'online') {
            return getActiveCupCount(this.farCups);
        }
        if (this.currentPlayer === 0) return getActiveCupCount(this.farCups);
        return getActiveCupCount(this.nearCups);
    }

    updateAiming(dt) {
        // In online mode, only process input on your turn
        if (!this.isMyTurnOnline()) {
            // Consume any input so it doesn't queue up
            this.input.consumePanDelta();
            this.input.consumeChargeRelease();
            this.input.chargeStarted = false;
            return;
        }

        const player = this.players[this.currentPlayer];

        // Arrow key movement
        if (this.input.isKeyDown('ArrowLeft')) player.move(-1, dt);
        if (this.input.isKeyDown('ArrowRight')) player.move(1, dt);

        // Drag moves the crosshair on screen
        if (this.input.aiming) {
            const pan = this.input.consumePanDelta();
            this.crosshairX += pan.dx;
            this.crosshairY += pan.dy;

            // Clamp crosshair to the table surface area
            const minY = CONFIG.TABLE_Y + CONFIG.SURFACE_FAR_Y;
            const maxY = CONFIG.TABLE_Y + CONFIG.SURFACE_NEAR_Y;
            this.crosshairX = Math.max(CONFIG.TABLE_X + 20, Math.min(CONFIG.TABLE_X + CONFIG.TABLE_IMG_WIDTH - 20, this.crosshairX));
            this.crosshairY = Math.max(minY, Math.min(maxY, this.crosshairY));
        }

        // Compute aim angle: hand position → crosshair world position
        this.updateAimAngle();

        // Spacebar starts charging (check event flag so we don't miss quick taps)
        if (this.input.charging || this.input.chargeStarted) {
            this.input.chargeStarted = false;
            this.playState = PLAY_STATE.CHARGING;
        }
    }

    updateAimAngle() {
        const player = this.players[this.currentPlayer];
        const hand = player.getHandPosition();
        const target = screenToWorld(this.crosshairX, this.crosshairY);
        const dx = target.x - hand.x;
        const dy = target.y - hand.y;
        this.aimAngle = Math.atan2(dx, dy);
    }

    updateCharging(dt) {
        // Allow crosshair movement while charging
        if (this.input.aiming) {
            const pan = this.input.consumePanDelta();
            this.crosshairX += pan.dx;
            this.crosshairY += pan.dy;
            const minY = CONFIG.TABLE_Y + CONFIG.SURFACE_FAR_Y;
            const maxY = CONFIG.TABLE_Y + CONFIG.SURFACE_NEAR_Y;
            this.crosshairX = Math.max(CONFIG.TABLE_X + 20, Math.min(CONFIG.TABLE_X + CONFIG.TABLE_IMG_WIDTH - 20, this.crosshairX));
            this.crosshairY = Math.max(minY, Math.min(maxY, this.crosshairY));
        }

        this.updateAimAngle();

        // Show live power while holding
        this.power = this.input.getChargePower(CONFIG.MAX_CHARGE_TIME);

        // Check if spacebar was released
        const releasedPower = this.input.consumeChargeRelease();
        if (releasedPower !== null) {
            this.power = releasedPower;
            this.throwBall();
        }
    }

    throwBall() {
        const player = this.players[this.currentPlayer];
        // In online mode, the thrower always uses near-side hand position
        // (they see themselves at the bottom of the screen)
        const hand = this.isMyTurnOnline()
            ? { x: player.x, y: 50 }
            : player.getHandPosition();
        const target = screenToWorld(this.crosshairX, this.crosshairY);

        // Save throw params for after animation completes
        this._pendingThrow = {
            hand,
            target,
            power: this.power,
        };

        // Start throw animation
        this.throwAnimFrame = 0;
        this.throwAnimTimer = 0;
        this.throwAnimPlayerX = player.x;
        this.playState = PLAY_STATE.THROW_ANIM;
    }

    updateThrowAnim(dt) {
        this.throwAnimTimer += dt;
        const frameDuration = 1 / CONFIG.THROW_FPS;
        if (this.throwAnimTimer >= frameDuration) {
            this.throwAnimTimer -= frameDuration;
            this.throwAnimFrame++;
        }

        // When animation finishes, launch the ball
        if (this.throwAnimFrame >= CONFIG.THROW_FRAMES) {
            const t = this._pendingThrow;
            this.ball.launchAtTarget(t.hand.x, t.hand.y, t.target.x, t.target.y, t.power, this.getCurrentZones());
            this.playState = PLAY_STATE.THROWING;
            this.power = 0;
            this.hitCupsThisThrow = new Set();

            // In online mode, send throw params to the other player
            if (this.gameMode === 'online' && this.online) {
                this.online.send({
                    type: 'throw_sync',
                    data: {
                        handX: t.hand.x, handY: t.hand.y,
                        targetX: t.target.x, targetY: t.target.y,
                        power: t.power,
                    },
                });
            }
            this._pendingThrow = null;
        }
    }

    updateThrowing(dt) {
        this.ball.update(dt);

        // In online mode, the non-thrower still checks collisions visually
        // so the ball stops at the cups instead of flying through them.
        // Game state changes (cup removal, scoring) come from network messages.
        const iAmThrower = this.isMyTurnOnline();
        if (this.gameMode === 'online' && !iAmThrower) {
            // The opponent's ball always flies from far end toward near end
            // on our screen, so check collisions against nearCups (bottom).
            const viewerHit = checkCupCollision(this.ball, this.nearCups);
            if (viewerHit && (viewerHit.type === 'clean' || viewerHit.type === 'rimIn')) {
                const cup = this.nearCups[viewerHit.index];
                this.splash.start(cup.wx, cup.wy);
                this.ball.active = false;
            }
            if (this.ball.settled) {
                this.ball.active = false;
                // Wait for cup_hit or turn_change message from the thrower
            }
            return;
        }

        // Check cup collision (skip cups already hit this throw)
        const targetCups = this.getTargetCups();
        const hit = checkCupCollision(this.ball, targetCups);

        if (hit && !this.hitCupsThisThrow.has(hit.index)) {
            this.hitCupsThisThrow.add(hit.index);
            if (hit.type === 'clean' || hit.type === 'rimIn') {
                // Ball made it in!
                const cup = targetCups[hit.index];
                cup.active = false;
                this.splash.start(cup.wx, cup.wy);
                this.ball.active = false;

                // Bounce shot = 2 cups! Remove a random additional cup
                let bonusIndex = -1;
                if (this.ball.tableBounces > 0) {
                    const remaining = targetCups
                        .map((c, idx) => ({ c, idx }))
                        .filter(({ c, idx }) => c.active && idx !== hit.index);
                    if (remaining.length > 0) {
                        const pick = remaining[Math.floor(Math.random() * remaining.length)];
                        pick.c.active = false;
                        bonusIndex = pick.idx;
                    }
                }

                // Update cup count
                if (this.currentPlayer === 0) {
                    this.players[1].cupsRemaining = getActiveCupCount(this.farCups);
                } else {
                    this.players[0].cupsRemaining = getActiveCupCount(this.nearCups);
                }

                // Online sync: tell the other player which cups were hit
                if (this.gameMode === 'online' && this.online) {
                    const side = this.getTargetSide();
                    this.online.send(createCupHitMessage(hit.index, side, hit.type));
                    if (bonusIndex >= 0) {
                        this.online.send(createCupHitMessage(bonusIndex, side, 'bonus'));
                    }
                }

                this.playState = PLAY_STATE.RESOLVING;
            } else if (hit.type === 'rimOut') {
                this.ball.vy = -this.ball.vy * 0.6;
                this.ball.vz = 400 + Math.random() * 200;
                this.ball.vx += (Math.random() - 0.5) * 400;
                this.ball.z = Math.max(this.ball.z, 15);
            } else if (hit.type === 'deflect') {
                const nx = hit.dx / hit.dist;
                const ny = hit.dy / hit.dist;
                const speed = Math.sqrt(this.ball.vx * this.ball.vx + this.ball.vy * this.ball.vy);
                this.ball.vx = nx * speed * 0.5 + (Math.random() - 0.5) * 150;
                this.ball.vy = ny * speed * 0.5 + (Math.random() - 0.5) * 150;
                this.ball.vz = 300 + Math.random() * 200;
                this.ball.z = Math.max(this.ball.z, 15);
            }
        }

        // Ball settled or off table (miss)
        if (this.ball.settled) {
            this.ball.active = false;
            this.playState = PLAY_STATE.RESOLVING;

            // Tell the other player the ball missed
            if (this.gameMode === 'online' && this.online) {
                this.online.send({ type: 'miss' });
            }
        }
    }

    updateResolving(dt) {
        // Wait for splash animation to finish
        if (this.splash.active) return;

        // No rerack — cups stay where they are for the whole game

        // Check for win
        const farCount = getActiveCupCount(this.farCups);
        const nearCount = getActiveCupCount(this.nearCups);

        if (this.gameMode === 'online') {
            // In online mode, each player targets farCups (opponent's cups).
            // farCups === 0 means YOU won, nearCups === 0 means opponent won.
            if (farCount === 0) {
                this.winner = this.currentPlayer;
                this.resultMessage = 'YOU WIN!';
                this.state = STATE.RESULT;
                if (this.online) {
                    this.online.send(createGameOverMessage(this.currentPlayer));
                }
                return;
            }
            if (nearCount === 0) {
                this.winner = this.currentPlayer === 0 ? 1 : 0;
                this.resultMessage = 'YOU LOSE!';
                this.state = STATE.RESULT;
                return;
            }
        } else if (farCount === 0) {
            this.winner = 0;
            this.resultMessage = this.gameMode === 'single' ? 'YOU WIN!' : 'PLAYER 1 WINS!';
            this.state = STATE.RESULT;
            return;
        } else if (nearCount === 0) {
            this.winner = 1;
            this.resultMessage = this.gameMode === 'single' ? 'CPU WINS!' : 'PLAYER 2 WINS!';
            this.state = STATE.RESULT;
            return;
        }

        // Switch turns
        this.playState = PLAY_STATE.TURN_SWITCH;
        this.turnSwitchTimer = CONFIG.TURN_SWITCH_DELAY / 1000;
    }

    updateTurnSwitch(dt) {
        this.turnSwitchTimer -= dt;
        if (this.turnSwitchTimer <= 0) {
            this.currentPlayer = 1 - this.currentPlayer;
            this.ball.reset();

            // Online sync: send turn change
            if (this.gameMode === 'online' && this.online && this.online.isHost) {
                this.online.send(createTurnChangeMessage(this.currentPlayer));
            }

            // Reset crosshair for new turn
            this.resetCrosshair();

            if (this.gameMode === 'single' && this.currentPlayer === 1) {
                // AI's turn
                this.playState = PLAY_STATE.AI_THINKING;
                this.ai.startTurn(this.nearCups, this.players[1].x);
            } else {
                this.playState = PLAY_STATE.AIMING;
                this.flipped = this.currentPlayer === 1;
            }
        }
    }

    updateAIThinking(dt) {
        this.ai.update(dt);
        const throwParams = this.ai.consumeThrow();
        if (throwParams) {
            this.ball.launchAtTarget(
                throwParams.startX,
                throwParams.startY,
                throwParams.targetX,
                throwParams.targetY,
                throwParams.power
            );
            this.playState = PLAY_STATE.THROWING;
        }
    }

    drawPlaying() {
        // Draw scene: background → table → cups
        this.renderer.drawBackground();
        this.renderer.drawBob();
        this.renderer.drawTable();

        // Draw order: far cups (top) → near cups (bottom) → ball on top
        this.renderer.drawCups(this.farCups);
        this.renderer.drawSplash(this.splash);
        this.renderer.drawCups(this.nearCups);
        this.renderer.drawBallTrail(this.ball.trail);
        this.renderer.drawBall(this.ball);

        // Determine if it's this client's turn to throw
        const isMyTurn = this.gameMode !== 'online' ||
            (this.online && this.online.isHost && this.currentPlayer === 0) ||
            (this.online && !this.online.isHost && this.currentPlayer === 1);

        // Draw hand, crosshair, and power meter when it's our turn to aim/charge
        const curPlayer = this.players[this.currentPlayer];
        if ((this.playState === PLAY_STATE.AIMING || this.playState === PLAY_STATE.CHARGING) && isMyTurn) {
            this.renderer.drawHand(curPlayer.x, true);
            this.renderer.drawCrosshair(this.crosshairX, this.crosshairY);
        } else if (this.playState === PLAY_STATE.THROW_ANIM && isMyTurn) {
            this.renderer.drawThrowAnimation(this.throwAnimPlayerX, this.throwAnimFrame);
        }

        const zones = this.getCurrentZones();
        if (this.playState === PLAY_STATE.CHARGING && isMyTurn) {
            this.renderer.drawPowerMeter(this.power, true, zones);
        } else if (this.playState === PLAY_STATE.AIMING && isMyTurn) {
            this.renderer.drawPowerMeter(0, false, zones);
        }

        // Debug overlay: cup hit zones + ball world coords
        if (this.debugOverlay) {
            this.renderer.drawCupHitZones(this.farCups);
            this.renderer.drawCupHitZones(this.nearCups);

            const ctx = this.renderer.ctx;
            ctx.font = 'bold 14px monospace';
            ctx.fillStyle = '#FF8800';
            ctx.textAlign = 'left';
            ctx.fillText('DEBUG (T to toggle)', 80, 55);

            if (this.ball.active) {
                ctx.fillStyle = '#CCCCCC';
                ctx.font = '13px monospace';
                ctx.fillText(`ball pos: (${this.ball.x.toFixed(0)}, ${this.ball.y.toFixed(0)}, ${this.ball.z.toFixed(0)})`, 80, 75);
                ctx.fillText(`ball vel: (${this.ball.vx.toFixed(0)}, ${this.ball.vy.toFixed(0)}, ${this.ball.vz.toFixed(0)})`, 80, 92);
            }

            // Show cup world positions
            ctx.font = '10px monospace';
            ctx.fillStyle = 'rgba(255, 255, 0, 0.8)';
            for (const cup of this.nearCups) {
                if (!cup.active) continue;
                const s = worldToScreen(cup.wx, cup.wy, 0);
                ctx.fillText(`${cup.wx.toFixed(0)},${cup.wy.toFixed(0)}`, s.x - 15, s.y + cup.size * 0.3);
            }
            for (const cup of this.farCups) {
                if (!cup.active) continue;
                const s = worldToScreen(cup.wx, cup.wy, 0);
                ctx.fillText(`${cup.wx.toFixed(0)},${cup.wy.toFixed(0)}`, s.x - 15, s.y + cup.size * 0.3);
            }
        }

        // Score — always show "YOU" on left, opponent on right
        this.renderer.drawScore(
            this.getMyCupCount(),
            this.getOpponentCupCount(),
            this.currentPlayer,
            this.gameMode
        );

        // Turn indicator
        let turnText = '';
        if (this.playState === PLAY_STATE.AI_THINKING) {
            turnText = 'CPU IS THINKING...';
        } else if (isMyTurn) {
            turnText = 'YOUR TURN';
        } else {
            if (this.gameMode === 'single') {
                turnText = "CPU'S TURN";
            } else {
                turnText = "OPPONENT'S TURN";
            }
        }
        this.renderer.drawTurnIndicator(turnText);
    }

    // ---- RESULT ----
    updateResult(dt) {
        const click = this.input.consumeClick();
        if (click) {
            const cx = CONFIG.CANVAS_WIDTH / 2;
            // Rematch button
            if (click.x >= cx - 120 && click.x <= cx + 120 && click.y >= 450 && click.y <= 510) {
                this.startGame();
                return;
            }
            // Menu button
            if (click.x >= cx - 120 && click.x <= cx + 120 && click.y >= 540 && click.y <= 600) {
                this.state = STATE.MENU;
                return;
            }
        }
    }

    drawResult() {
        const ctx = this.renderer.ctx;

        // Background
        this.renderer.drawBackground();
        this.renderer.drawBob();
        this.renderer.drawTable();
        this.drawCupsForDisplay();

        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.fillRect(0, 0, CONFIG.CANVAS_WIDTH, CONFIG.CANVAS_HEIGHT);

        // Winner text
        ctx.font = 'bold 64px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = CONFIG.COLOR_TITLE;
        ctx.shadowColor = '#FF8800';
        ctx.shadowBlur = 20;
        ctx.fillText(this.resultMessage, CONFIG.CANVAS_WIDTH / 2, 350);
        ctx.shadowBlur = 0;

        // Buttons
        this.drawButton(CONFIG.CANVAS_WIDTH / 2, 480, 240, 60, 'REMATCH');
        this.drawButton(CONFIG.CANVAS_WIDTH / 2, 570, 240, 60, 'MENU');
    }

    // ---- TEST MODE ----
    startTestMode() {
        this.state = STATE.TEST_MODE;
        this.playState = PLAY_STATE.AIMING;
        this.currentPlayer = 0;
        this.winner = null;
        this.players[0].reset();
        this.players[1].reset();
        this.ball.reset();
        this.resetCrosshair();
        this.nearCups = createNearFormation();
        this.farCups = createFarFormation();
        this.testFrames = [];
        this.testFrameIndex = 0;
        this.testPlaying = false;
        this.testHitFrame = -1;
        this.testHitType = '';
    }

    recordTestThrow() {
        // Simulate the entire throw and record every frame
        const player = this.players[0];
        const hand = player.getHandPosition();
        const target = screenToWorld(this.crosshairX, this.crosshairY);

        // Create a temporary ball to simulate
        const simBall = new Ball();
        simBall.launchAtTarget(hand.x, hand.y, target.x, target.y, this.power);

        this.testFrames = [];
        this.testHitFrame = -1;
        this.testHitType = '';
        const hitCups = new Set(); // track cups already collided with

        const maxFrames = 300; // 5 seconds at 60fps
        for (let i = 0; i < maxFrames; i++) {
            // Record state before update
            this.testFrames.push({
                x: simBall.x, y: simBall.y, z: simBall.z,
                vx: simBall.vx, vy: simBall.vy, vz: simBall.vz,
                active: simBall.active,
            });

            // Check cup collision (skip cups we already hit)
            const hit = checkCupCollision(simBall, this.farCups);
            if (hit && !hitCups.has(hit.index)) {
                hitCups.add(hit.index);
                if (this.testHitFrame === -1) {
                    this.testHitFrame = i;
                    this.testHitType = hit.type;
                }
                if (hit.type === 'clean' || hit.type === 'rimIn') {
                    break;
                } else if (hit.type === 'rimOut') {
                    simBall.vy = -simBall.vy * 0.6;
                    simBall.vz = 400 + Math.random() * 200;
                    simBall.vx += (Math.random() - 0.5) * 400;
                    simBall.z = Math.max(simBall.z, 15);
                } else if (hit.type === 'deflect') {
                    const nx = hit.dx / hit.dist;
                    const ny = hit.dy / hit.dist;
                    const speed = Math.sqrt(simBall.vx * simBall.vx + simBall.vy * simBall.vy);
                    simBall.vx = nx * speed * 0.5 + (Math.random() - 0.5) * 150;
                    simBall.vy = ny * speed * 0.5 + (Math.random() - 0.5) * 150;
                    simBall.vz = 300 + Math.random() * 200;
                    simBall.z = Math.max(simBall.z, 15);
                }
            }

            simBall.update(CONFIG.PHYSICS_DT);

            if (simBall.settled || !simBall.active) break;
        }

        this.testFrameIndex = 0;
        this.testPlaying = false;
    }

    updateTestMode(dt) {
        if (this.input.isKeyDown('Escape')) {
            this.state = STATE.MENU;
            return;
        }

        if (this.playState === PLAY_STATE.AIMING) {
            // Same aiming as normal
            const player = this.players[0];
            if (this.input.isKeyDown('ArrowLeft')) player.move(-1, dt);
            if (this.input.isKeyDown('ArrowRight')) player.move(1, dt);

            if (this.input.aiming) {
                const pan = this.input.consumePanDelta();
                this.crosshairX += pan.dx;
                this.crosshairY += pan.dy;
                const minY = CONFIG.TABLE_Y + CONFIG.SURFACE_FAR_Y;
                const maxY = CONFIG.TABLE_Y + CONFIG.SURFACE_NEAR_Y;
                this.crosshairX = Math.max(CONFIG.TABLE_X + 20, Math.min(CONFIG.TABLE_X + CONFIG.TABLE_DRAW_WIDTH - 20, this.crosshairX));
                this.crosshairY = Math.max(minY, Math.min(maxY, this.crosshairY));
            }
            this.updateAimAngle();

            if (this.input.charging || this.input.chargeStarted) {
                this.input.chargeStarted = false;
                this.playState = PLAY_STATE.CHARGING;
            }
        } else if (this.playState === PLAY_STATE.CHARGING) {
            if (this.input.aiming) {
                const pan = this.input.consumePanDelta();
                this.crosshairX += pan.dx;
                this.crosshairY += pan.dy;
                const minY = CONFIG.TABLE_Y + CONFIG.SURFACE_FAR_Y;
                const maxY = CONFIG.TABLE_Y + CONFIG.SURFACE_NEAR_Y;
                this.crosshairX = Math.max(CONFIG.TABLE_X + 20, Math.min(CONFIG.TABLE_X + CONFIG.TABLE_DRAW_WIDTH - 20, this.crosshairX));
                this.crosshairY = Math.max(minY, Math.min(maxY, this.crosshairY));
            }
            this.updateAimAngle();
            this.power = this.input.getChargePower(CONFIG.MAX_CHARGE_TIME);

            const releasedPower = this.input.consumeChargeRelease();
            if (releasedPower !== null) {
                this.power = releasedPower;
                this.recordTestThrow();
                this.playState = PLAY_STATE.THROWING;
            }
        } else if (this.playState === PLAY_STATE.THROWING) {
            // Step controls: hold arrow to scrub, tap for single step
            // Throttle: step every 3 physics frames when held
            if (!this._stepThrottle) this._stepThrottle = 0;
            this._stepThrottle++;

            if (this.input.isKeyDown('ArrowRight') || this.input.isKeyDown('KeyD')) {
                if (this._stepThrottle % 3 === 0) {
                    this.testFrameIndex = Math.min(this.testFrameIndex + 1, this.testFrames.length - 1);
                }
            } else if (this.input.isKeyDown('ArrowLeft') || this.input.isKeyDown('KeyA')) {
                if (this._stepThrottle % 3 === 0) {
                    this.testFrameIndex = Math.max(this.testFrameIndex - 1, 0);
                }
            } else {
                this._stepThrottle = 0;
            }

            // Space toggles auto-play
            if (this.input.chargeStarted) {
                this.input.chargeStarted = false;
                this.testPlaying = !this.testPlaying;
            }
            // Consume charge release so it doesn't interfere
            this.input.consumeChargeRelease();

            if (this.testPlaying) {
                this.testFrameIndex = Math.min(this.testFrameIndex + 1, this.testFrames.length - 1);
                if (this.testFrameIndex >= this.testFrames.length - 1) {
                    this.testPlaying = false;
                }
            }

            // R to reset and throw again
            if (this.input.isKeyDown('KeyR')) {
                this.playState = PLAY_STATE.AIMING;
                this.ball.reset();
                this.resetCrosshair();
                // Restore cups
                this.farCups = createFarFormation();
            }

            // Set ball state from recorded frame
            if (this.testFrames.length > 0) {
                const frame = this.testFrames[this.testFrameIndex];
                this.ball.x = frame.x;
                this.ball.y = frame.y;
                this.ball.z = frame.z;
                this.ball.active = true;
            }
        }
    }

    drawTestMode() {
        // Draw scene same as playing
        this.renderer.drawBackground();
        this.renderer.drawBob();
        this.renderer.drawTable();

        // Far cups + their hit zones
        this.renderer.drawCups(this.farCups);
        this.renderer.drawCupHitZones(this.farCups);

        // Draw the full trajectory path and ball
        if (this.testFrames.length > 0) {
            const ctx = this.renderer.ctx;

            // Draw trajectory line
            ctx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (let i = 0; i < this.testFrames.length; i++) {
                const f = this.testFrames[i];
                const s = worldToScreen(f.x, f.y, f.z);
                if (i === 0) ctx.moveTo(s.x, s.y);
                else ctx.lineTo(s.x, s.y);
            }
            ctx.stroke();

            // Mark cup hit frame
            if (this.testHitFrame >= 0) {
                const hf = this.testFrames[this.testHitFrame];
                const hs = worldToScreen(hf.x, hf.y, hf.z);
                ctx.strokeStyle = this.testHitType === 'rimOut' ? '#FF4444' : '#44FF44';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(hs.x, hs.y, 12, 0, Math.PI * 2);
                ctx.stroke();
            }
        }

        // Near cups drawn BEFORE ball so ball appears on top when flying over them
        this.renderer.drawCups(this.nearCups);
        this.renderer.drawCupHitZones(this.nearCups);

        // Ball on top of everything
        if (this.testFrames.length > 0) {
            this.renderer.drawBall(this.ball);
        }

        // Crosshair when aiming
        if (this.playState === PLAY_STATE.AIMING || this.playState === PLAY_STATE.CHARGING) {
            this.renderer.drawCrosshair(this.crosshairX, this.crosshairY);
            this.renderer.drawHand(this.players[0].x, true);
        }

        // Power meter (test mode uses sober zones — 10 cups)
        const testZones = getPowerZones(10);
        if (this.playState === PLAY_STATE.CHARGING) {
            this.renderer.drawPowerMeter(this.power, true, testZones);
        } else if (this.playState === PLAY_STATE.AIMING) {
            this.renderer.drawPowerMeter(0, false, testZones);
        }

        // Test mode HUD
        const ctx = this.renderer.ctx;
        ctx.font = 'bold 20px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#FF8800';
        ctx.fillText('TEST MODE', CONFIG.CANVAS_WIDTH / 2, 30);

        if (this.playState === PLAY_STATE.THROWING && this.testFrames.length > 0) {
            const frame = this.testFrames[this.testFrameIndex];

            // Frame counter
            ctx.font = 'bold 18px monospace';
            ctx.fillStyle = '#FFFFFF';
            ctx.textAlign = 'left';
            ctx.fillText(`Frame: ${this.testFrameIndex + 1} / ${this.testFrames.length}`, 80, 55);

            // Ball info
            ctx.font = '14px monospace';
            ctx.fillStyle = '#CCCCCC';
            ctx.fillText(`pos: (${frame.x.toFixed(0)}, ${frame.y.toFixed(0)}, ${frame.z.toFixed(0)})`, 80, 80);
            ctx.fillText(`vel: (${frame.vx.toFixed(0)}, ${frame.vy.toFixed(0)}, ${frame.vz.toFixed(0)})`, 80, 100);
            ctx.fillText(`power: ${(this.power * 100).toFixed(0)}%  angle: ${(this.aimAngle * 180 / Math.PI).toFixed(1)}°`, 80, 120);

            if (this.testHitFrame >= 0) {
                ctx.fillStyle = this.testHitType === 'rimOut' ? '#FF4444' : '#44FF44';
                ctx.fillText(`Cup hit at frame ${this.testHitFrame + 1}: ${this.testHitType}`, 80, 145);
            }

            // Controls
            ctx.textAlign = 'right';
            ctx.fillStyle = '#888888';
            ctx.font = '13px monospace';
            ctx.fillText('← → Step | Space Play/Pause | R Reset', CONFIG.CANVAS_WIDTH - 30, 55);
            ctx.fillText(this.testPlaying ? '▶ PLAYING' : '⏸ PAUSED', CONFIG.CANVAS_WIDTH - 30, 80);
        } else if (this.playState === PLAY_STATE.AIMING) {
            ctx.font = '14px monospace';
            ctx.fillStyle = '#888888';
            ctx.textAlign = 'center';
            ctx.fillText('Drag to aim | Hold Space to charge | Release to throw', CONFIG.CANVAS_WIDTH / 2, CONFIG.CANVAS_HEIGHT - 20);
        }
    }

    // ---- HELPERS ----
    drawCupsForDisplay() {
        this.renderer.drawCups(this.farCups);
        this.renderer.drawCups(this.nearCups);
    }

    drawButton(cx, cy, w, h, text) {
        const ctx = this.renderer.ctx;
        const x = cx - w / 2;
        const y = cy - h / 2;

        // Check hover
        const mx = this.input.mouseX;
        const my = this.input.mouseY;
        const hovered = mx >= x && mx <= x + w && my >= y && my <= y + h;

        ctx.fillStyle = hovered ? CONFIG.COLOR_MENU_BUTTON_HOVER : CONFIG.COLOR_MENU_BUTTON;
        ctx.fillRect(x, y, w, h);

        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, w, h);

        ctx.font = 'bold 22px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = CONFIG.COLOR_MENU_TEXT;
        ctx.fillText(text, cx, cy);
        ctx.textBaseline = 'alphabetic';
    }
}
