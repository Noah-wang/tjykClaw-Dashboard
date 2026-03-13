import WebSocket from 'ws';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

const DEFAULT_STATE = { settings: { gatewayPort: 18789, gatewayToken: '' } };

async function readJson(filePath, fallback) {
    try {
        const raw = await fs.readFile(filePath, 'utf8');
        return JSON.parse(raw);
    } catch {
        return fallback;
    }
}

let connectResolve;
const connectPromise = new Promise(r => connectResolve = r);

let idCounter = 1;
const pending = new Map();

(async () => {
    const state = await readJson(path.join(os.homedir(), '.tjykclaw-dashboard-bridge', 'state.json'), DEFAULT_STATE);
    const ws = new WebSocket(`ws://127.0.0.1:${state.settings.gatewayPort}/ws`);

    ws.on('open', () => {
        console.log("WS opened.");
    });

    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        // console.log("Incoming:", msg);
        if (msg.event === 'connect.challenge') {
            ws.send(JSON.stringify({
                type: 'req',
                id: 'auth-1',
                method: 'connect',
                params: {
                    minProtocol: 3,
                    maxProtocol: 3,
                    client: { id: "test-client" },
                    auth: { token: state.settings.gatewayToken }
                }
            }));
        }
        else if (msg.type === 'res') {
            if (msg.id === 'auth-1') {
                console.log("Auth success");
                connectResolve();
            } else if (pending.has(msg.id)) {
                pending.get(msg.id)(msg.payload);
                pending.delete(msg.id);
            }
        }
    });

    await connectPromise;

    console.log("Requesting chat.history");
    const id = String(idCounter++);
    ws.send(JSON.stringify({
        type: 'req',
        id,
        method: 'chat.history',
        params: { sessionKey: 'agent:main:main' }
    }));

    const result = await new Promise(r => pending.set(id, r));
    console.log("chat.history returned:");
    console.log(JSON.stringify(result, null, 2));

    process.exit(0);
})();
