import { execSync } from 'child_process';

function getMacFromIp(ip) {
    try {
        const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip.includes('localhost');
        if (isLocalhost) return 'local';
        const output = execSync(`arp -an`).toString();
        const lines = output.split('\n');
        for (const line of lines) {
            if (line.includes(`(${ip})`) || line.includes(` ${ip} `)) {
                const match = line.match(/\b(?:[0-9a-fA-F]{1,2}[:-]){5}[0-9a-fA-F]{1,2}\b/);
                if (match) {
                    return match[0].replace(/-/g, ':').split(':').map(x => x.length === 1 ? '0' + x : x).join(':');
                }
            }
        }
    } catch (e) {
        // ignore
    }
    return ip.replace(/[^a-zA-Z0-9]/g, '_');
}

console.log('127.0.0.1:', getMacFromIp('127.0.0.1'));
console.log('192.168.1.1:', getMacFromIp('192.168.1.1'));
