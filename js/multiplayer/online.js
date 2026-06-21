// ============================================================
// BobPong - Online Multiplayer (WebSocket relay)
// Uses the signaling server as the game data relay.
// Simpler and more reliable than WebRTC for a turn-based game.
// ============================================================

import { SignalingClient } from './signaling.js';

export class OnlineMultiplayer {
    constructor(signalingUrl) {
        this.signalingUrl = signalingUrl;
        this.signaling = null;
        this.isHost = false;
        this.connected = false;
        this.roomCode = null;

        // Callbacks
        this.onConnected = null;
        this.onMessage = null;
        this.onDisconnected = null;
        this.onRoomCreated = null;
        this.onError = null;
    }

    async createRoom() {
        this.isHost = true;
        this.signaling = new SignalingClient(this.signalingUrl);

        this.signaling.onCreated = (code) => {
            this.roomCode = code;
            console.log('[Online] Room created:', code);
            if (this.onRoomCreated) this.onRoomCreated(code);
        };

        this.signaling.onPeerJoined = () => {
            console.log('[Online] Peer joined — connected!');
            this.connected = true;
            if (this.onConnected) this.onConnected();
        };

        // Game messages come through as 'signal' type from the relay
        this.signaling.onSignal = (data) => {
            if (data.type === 'game' && this.onMessage) {
                this.onMessage(data.payload);
            }
        };

        this.signaling.onDisconnected = () => {
            this.connected = false;
            if (this.onDisconnected) this.onDisconnected();
        };

        await this.signaling.connect();
        this.signaling.createRoom();
    }

    async joinRoom(roomCode) {
        this.isHost = false;
        this.signaling = new SignalingClient(this.signalingUrl);

        this.signaling.onJoined = (code) => {
            this.roomCode = code;
            console.log('[Online] Joined room:', code, '— connected!');
            this.connected = true;
            if (this.onConnected) this.onConnected();
        };

        this.signaling.onSignal = (data) => {
            if (data.type === 'game' && this.onMessage) {
                this.onMessage(data.payload);
            }
        };

        this.signaling.onError = (msg) => {
            console.error('[Online] Error:', msg);
            if (this.onError) this.onError(msg);
        };

        this.signaling.onDisconnected = () => {
            this.connected = false;
            if (this.onDisconnected) this.onDisconnected();
        };

        await this.signaling.connect();
        this.signaling.joinRoom(roomCode);
    }

    async findMatch() {
        this.signaling = new SignalingClient(this.signalingUrl);

        this.signaling.onMatchFound = (code, role) => {
            this.roomCode = code;
            this.isHost = role === 'host';
            this.connected = true;
            console.log('[Online] Match found:', code, 'as', role);
            if (this.onConnected) this.onConnected();
        };

        this.signaling.onSignal = (data) => {
            if (data.type === 'game' && this.onMessage) {
                this.onMessage(data.payload);
            }
        };

        this.signaling.onError = (msg) => {
            console.error('[Online] Error:', msg);
            if (this.onError) this.onError(msg);
        };

        this.signaling.onDisconnected = () => {
            this.connected = false;
            if (this.onDisconnected) this.onDisconnected();
        };

        await this.signaling.connect();
        this.signaling.findMatch();
    }

    cancelMatch() {
        if (this.signaling) {
            this.signaling.cancelMatch();
            this.signaling.close();
            this.signaling = null;
        }
    }

    send(msg) {
        if (this.signaling && this.connected) {
            // Wrap game messages and send through the signaling relay
            this.signaling.sendSignal({ type: 'game', payload: msg });
        }
    }

    close() {
        if (this.signaling) this.signaling.close();
        this.connected = false;
    }
}
