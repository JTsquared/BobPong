// ============================================================
// BobPong - WebRTC Signaling Server
// ============================================================
// Minimal relay server for WebRTC peer connection setup.
// Deploy to any Node.js host (Render, Railway, Fly.io, etc.)

const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const wss = new WebSocketServer({ port: PORT });

const MAX_ROOMS = 30;    // cap simultaneous games
const rooms = new Map(); // roomCode -> { host: ws, guest: ws }
const matchQueue = [];   // array of waiting WebSocket clients

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function cleanupRoom(code) {
    const room = rooms.get(code);
    if (room) {
        if (room.host) room.host.close();
        if (room.guest) room.guest.close();
        rooms.delete(code);
    }
}

// Auto-cleanup stale rooms every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [code, room] of rooms) {
        if (now - room.created > 10 * 60 * 1000) { // 10 min timeout
            console.log(`Cleaning up stale room: ${code}`);
            cleanupRoom(code);
        }
    }
}, 5 * 60 * 1000);

wss.on('connection', (ws) => {
    ws.roomCode = null;
    ws.role = null;

    ws.on('message', (data) => {
        let msg;
        try {
            msg = JSON.parse(data);
        } catch {
            return;
        }

        switch (msg.type) {
            case 'create': {
                if (rooms.size >= MAX_ROOMS) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Server is full. Please try again later.' }));
                    break;
                }
                let code;
                do {
                    code = generateRoomCode();
                } while (rooms.has(code));

                rooms.set(code, { host: ws, guest: null, created: Date.now() });
                ws.roomCode = code;
                ws.role = 'host';
                ws.send(JSON.stringify({ type: 'created', room: code }));
                console.log(`Room created: ${code}`);
                break;
            }

            case 'join': {
                const code = msg.room?.toUpperCase();
                const room = rooms.get(code);
                if (!room) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
                    return;
                }
                if (room.guest) {
                    ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
                    return;
                }
                room.guest = ws;
                ws.roomCode = code;
                ws.role = 'guest';

                ws.send(JSON.stringify({ type: 'joined', room: code }));
                room.host.send(JSON.stringify({ type: 'peer_joined' }));
                console.log(`Guest joined room: ${code}`);
                break;
            }

            case 'find_match': {
                // Add to matchmaking queue
                if (matchQueue.includes(ws)) break;
                matchQueue.push(ws);
                console.log(`Player queued for match (queue size: ${matchQueue.length})`);

                // Try to pair players (only if room cap not reached)
                while (matchQueue.length >= 2 && rooms.size < MAX_ROOMS) {
                    const host = matchQueue.shift();
                    const guest = matchQueue.shift();

                    // Verify both are still connected
                    if (host.readyState !== 1) {
                        if (guest.readyState === 1) matchQueue.unshift(guest);
                        continue;
                    }
                    if (guest.readyState !== 1) {
                        if (host.readyState === 1) matchQueue.unshift(host);
                        continue;
                    }

                    // Create a room for the pair
                    let code;
                    do {
                        code = generateRoomCode();
                    } while (rooms.has(code));

                    rooms.set(code, { host, guest, created: Date.now() });
                    host.roomCode = code;
                    host.role = 'host';
                    guest.roomCode = code;
                    guest.role = 'guest';

                    host.send(JSON.stringify({ type: 'match_found', room: code, role: 'host' }));
                    guest.send(JSON.stringify({ type: 'match_found', room: code, role: 'guest' }));
                    console.log(`Match made: ${code}`);
                }
                break;
            }

            case 'cancel_match': {
                const idx = matchQueue.indexOf(ws);
                if (idx !== -1) {
                    matchQueue.splice(idx, 1);
                    console.log(`Player left queue (queue size: ${matchQueue.length})`);
                }
                break;
            }

            case 'signal': {
                // Relay signaling data (SDP offers/answers, ICE candidates) to the other peer
                const room = rooms.get(ws.roomCode);
                if (!room) return;

                const target = ws.role === 'host' ? room.guest : room.host;
                if (target && target.readyState === 1) {
                    target.send(JSON.stringify({ type: 'signal', data: msg.data }));
                }
                break;
            }
        }
    });

    ws.on('close', () => {
        // Remove from match queue if present
        const qIdx = matchQueue.indexOf(ws);
        if (qIdx !== -1) matchQueue.splice(qIdx, 1);

        if (ws.roomCode) {
            const room = rooms.get(ws.roomCode);
            if (room) {
                const other = ws.role === 'host' ? room.guest : room.host;
                if (other && other.readyState === 1) {
                    other.send(JSON.stringify({ type: 'peer_disconnected' }));
                }
                cleanupRoom(ws.roomCode);
            }
        }
    });
});

console.log(`BobPong signaling server running on port ${PORT}`);
