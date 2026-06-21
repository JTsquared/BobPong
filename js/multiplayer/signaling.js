// ============================================================
// BobPong - Signaling Client (WebSocket)
// ============================================================

export class SignalingClient {
    constructor(serverUrl) {
        this.serverUrl = serverUrl;
        this.ws = null;
        this.onCreated = null;      // (roomCode) => {}
        this.onJoined = null;       // (roomCode) => {}
        this.onPeerJoined = null;   // () => {}
        this.onSignal = null;       // (data) => {}
        this.onError = null;        // (message) => {}
        this.onDisconnected = null; // () => {}
        this.onMatchFound = null;   // (roomCode, role) => {}
    }

    connect() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(this.serverUrl);

            this.ws.onopen = () => resolve();
            this.ws.onerror = (e) => reject(e);

            this.ws.onmessage = (event) => {
                const msg = JSON.parse(event.data);
                switch (msg.type) {
                    case 'created':
                        if (this.onCreated) this.onCreated(msg.room);
                        break;
                    case 'joined':
                        if (this.onJoined) this.onJoined(msg.room);
                        break;
                    case 'peer_joined':
                        if (this.onPeerJoined) this.onPeerJoined();
                        break;
                    case 'match_found':
                        if (this.onMatchFound) this.onMatchFound(msg.room, msg.role);
                        break;
                    case 'signal':
                        if (this.onSignal) this.onSignal(msg.data);
                        break;
                    case 'error':
                        if (this.onError) this.onError(msg.message);
                        break;
                    case 'peer_disconnected':
                        if (this.onDisconnected) this.onDisconnected();
                        break;
                }
            };

            this.ws.onclose = () => {
                if (this.onDisconnected) this.onDisconnected();
            };
        });
    }

    createRoom() {
        this.ws.send(JSON.stringify({ type: 'create' }));
    }

    joinRoom(roomCode) {
        this.ws.send(JSON.stringify({ type: 'join', room: roomCode }));
    }

    findMatch() {
        this.ws.send(JSON.stringify({ type: 'find_match' }));
    }

    cancelMatch() {
        this.ws.send(JSON.stringify({ type: 'cancel_match' }));
    }

    sendSignal(data) {
        this.ws.send(JSON.stringify({ type: 'signal', data }));
    }

    close() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}
