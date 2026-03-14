import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';

const STATE_FILE = path.join(os.homedir(), '.tjykclaw-dashboard-bridge', 'state.json');

async function test() {
    let state = {};
    try {
        state = JSON.parse(await fs.readFile(STATE_FILE, 'utf8'));
    } catch {}

    const args = [
        'gateway', 'run', '--bind', 'lan',
        '--allow-unconfigured', '--auth', 'token',
        '--token', state.settings?.gatewayToken || 'test',
        '--port', String(state.settings?.gatewayPort || 18789)
    ];

    console.log("running:", 'openclaw', args.join(' '));

    const p = spawn('openclaw', args, { env: process.env, shell: true });
    p.stdout.on('data', d => console.log('OUT:', d.toString()));
    p.stderr.on('data', d => console.log('ERR:', d.toString()));
    p.on('close', c => console.log('CODE:', c));
}
test();
