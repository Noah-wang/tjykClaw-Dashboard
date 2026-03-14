const { execSync } = require('child_process');

function getMacFromIp(ip) {
  try {
    const isLocalhost = ip === '127.0.0.1' || ip === '::1' || ip.includes('localhost');
    if (isLocalhost) return 'local';
    const output = execSync(`arp -an`).toString();
    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes(`(${ip})`)) {
        const match = line.match(/\b(?:[0-9a-fA-F]{1,2}[:-]){5}[0-9a-fA-F]{1,2}\b/);
        if (match) return match[0].replace(/-/g, ':').toLowerCase();
      }
    }
  } catch (e) {
    // ignore
  }
  return ip.replace(/[^a-zA-Z0-9]/g, '_');
}

console.log(getMacFromIp('127.0.0.1'));
console.log(getMacFromIp('192.168.1.1')); // Assuming your router is 192.168.1.1
