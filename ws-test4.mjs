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

(async () => {
    const state = await readJson(path.join(os.homedir(), '.tjykclaw-dashboard-bridge', 'state.json'), DEFAULT_STATE);
    const ws = new WebSocket(`ws://127.0.0.1:3210/ws`, {
        headers: {
            Origin: "http://192.168.1.99:3210" // Fake origin that would normally be rejected
        }
    });
    
    ws.on('open', () => {
        console.log("WS opened.");
    });
    
    ws.on('message', (data) => {
        const msg = JSON.parse(data.toString());
        // console.log("Incoming:", JSON.stringify(msg, null, 2));
        if (msg.event === 'connect.challenge') {
            ws.send(JSON.stringify({
                type: 'req', 
                id: 'auth-1', 
                method: 'connect', 
                params: {
                    minProtocol: 3, 
                    maxProtocol: 3, 
                    client: { 
                      id: "openclaw-control-ui",
                      displayName: "天玑云科Claw",
                      version: "0.1.0",
                      platform: "web",
                      mode: "webchat"
                    },
                    auth: { token: state.settings.gatewayToken }
                }
            }));
        }
        else if (msg.type === 'res' && msg.id === 'auth-1') {
            if (msg.ok === false) {
                console.log("AUTH FAILED!", msg.error);
                process.exit(1);
            }
            ws.send(JSON.stringify({
                type: 'req',
                id: 'hist-1',
                method: 'chat.history',
                params: { sessionKey: 'agent:main:main' }
            }));
        } else if (msg.type === 'res' && msg.id === 'hist-1') {
            console.log("EXIT (hist-1 received)!");
            process.exit(0);
        }
    });

})();
