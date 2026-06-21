// ============================================================
// BobPong - State Sync Protocol for Online Multiplayer
// ============================================================

// Message types:
// Host → Guest:
//   { type: 'game_start', data: { cups, currentPlayer } }
//   { type: 'ball_state', data: { x, y, z, vx, vy, vz, trail } }
//   { type: 'cup_hit', data: { index, side, hitType } }
//   { type: 'turn_change', data: { currentPlayer } }
//   { type: 'game_over', data: { winner } }
//   { type: 'rerack', data: { side, cups } }
//
// Guest → Host:
//   { type: 'throw', data: { angle, power, posX } }

export function createGameStartMessage(nearCups, farCups, currentPlayer) {
    return {
        type: 'game_start',
        data: {
            nearCups: nearCups.map(c => ({ x: c.x, y: c.y, active: c.active })),
            farCups: farCups.map(c => ({ x: c.x, y: c.y, active: c.active })),
            currentPlayer,
        },
    };
}

export function createBallStateMessage(ball) {
    return {
        type: 'ball_state',
        data: {
            x: ball.x,
            y: ball.y,
            z: ball.z,
            vx: ball.vx,
            vy: ball.vy,
            vz: ball.vz,
            active: ball.active,
        },
    };
}

export function createCupHitMessage(index, side, hitType) {
    return {
        type: 'cup_hit',
        data: { index, side, hitType },
    };
}

export function createTurnChangeMessage(currentPlayer) {
    return {
        type: 'turn_change',
        data: { currentPlayer },
    };
}

export function createGameOverMessage(winner) {
    return {
        type: 'game_over',
        data: { winner },
    };
}

export function createRerackMessage(side, cups) {
    return {
        type: 'rerack',
        data: {
            side,
            cups: cups.map(c => ({ x: c.x, y: c.y, active: c.active })),
        },
    };
}

export function createThrowMessage(angle, power, posX) {
    return {
        type: 'throw',
        data: { angle, power, posX },
    };
}
