import { spawn } from 'node:child_process';
function run(cmd) {
    return new Promise(r => {
        let stdout = ''; let stderr = '';
        const child = spawn(cmd, { shell: true });
        child.stdout.on('data', chunk => stdout += chunk);
        child.stderr.on('data', chunk => stderr += chunk);
        child.on('close', code => r({ stdout, stderr, code }));
    });
}
(async () => {
    console.log("Checking bridge PID...");
    const ps = await run('ps aux | grep "node real-device-bridge.mjs" | grep -v grep');
    console.log(ps.stdout);

    console.log("Sending chat message via HTTP...");
    const curl = await run(`curl -s -X POST http://127.0.0.1:3210/api/chat/send-with-media -H "Content-Type: application/json" -d '{"sessionKey":"agent:main:main","message":"reply with exactly the word ping", "idempotencyKey":"test-rpc-1"}'`);
    console.log("SEND RESULT:", curl.stdout);

    await new Promise(r => setTimeout(r, 4000));

    console.log("Testing gateway.log...");
    const log = await run('tail -n 10 ~/.openclaw/logs/gateway.log');
    console.log(log.stdout);
})();
