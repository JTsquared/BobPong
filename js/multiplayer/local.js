// ============================================================
// BobPong - Local Multiplayer (hot-seat)
// ============================================================

// Local multiplayer is handled directly by the Game state machine.
// Player 0 and Player 1 alternate turns using the same controls.
// This module provides helper utilities for the local mode.

export class LocalMultiplayer {
    constructor() {
        this.active = false;
    }

    start() {
        this.active = true;
    }

    stop() {
        this.active = false;
    }

    getTurnMessage(currentPlayer) {
        return currentPlayer === 0 ? "PLAYER 1'S TURN" : "PLAYER 2'S TURN";
    }
}
