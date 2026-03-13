import WebSocket from 'ws';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

const DEFAULT_STATE = { settings: { gatewayPort: 18789, gatewayToken: '' } };

async function readJson(filePath, fallback) {
    try { return JSON.parse(await fs.readFile(filePath, 'utf8')); } catch { return fallback; }
}

(async () => {
    const state = await readJson(path.join(os.homedir(), '.tjykclaw-dashboard-bridge', 'state.json'), DEFAULT_STATE);
    const ws = new WebSocket(`ws://127.0.0.1:3210/ws`, { headers: { Origin: "http://192.168.1.99:3210" } });

    ws.on('open', () => console.log('OPENED'));
    ws.on('error', (err) => console.log('ERROR', err));
    ws.on('close', () => console.log('CLOSED'));

    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        if (msg.event === 'connect.challenge') {
            ws.send(JSON.stringify({
                type: 'req', id: 'auth-1', method: 'connect',
                params: {
                    minProtocol: 3, maxProtocol: 3,
                    client: { id: "test-client", displayName: "Test", version: "0.1", platform: "web", mode: "webchat" },
                    auth: { token: state.settings.gatewayToken }
                }
            }));
        } else if (msg.type === 'res' && msg.id === 'auth-1') {
            console.log('AUTH', msg.ok);
            ws.send(JSON.stringify({
                type: 'req', id: 'hist-1', method: 'chat.history',
                params: { sessionKey: 'agent:main:main' }
            }));
        } else if (msg.type === 'res' && msg.id === 'hist-1') {
            console.log("HISTORY RESPONSE PURE DUMP:");
            console.log(JSON.stringify(msg, null, 2));
            process.exit(0);
        } else {
            console.log("OTHER MSG", msg);
        }
    });

})();
