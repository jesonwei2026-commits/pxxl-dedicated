// VLESS + WebSocket proxy server for PaaS
const http = require('http');
const https = require('https');
const net = require('net');
const crypto = require('crypto');
let WebSocket;
try { WebSocket = require('ws'); } catch (e) { console.error('ws module not found'); process.exit(1); }
const PORT = process.env.PORT || 3000;
const UUID = (process.env.UUID || crypto.randomUUID()).replace(/-/g, '');
const WS_PATH = '/' + (process.env.WS_PATH || UUID.substring(0, 8));
console.log('WS Path:', WS_PATH);
function parseVlessHeader(buffer) {
  if (buffer.length < 18) return null;
  const version = buffer[0];
  const uuid = buffer.slice(1, 17).toString('hex');
  const addonLen = buffer[17];
  if (uuid !== UUID) { console.log('UUID mismatch'); return null; }
  let offset = 18 + addonLen;
  if (buffer.length < offset + 1) return null;
  const command = buffer[offset]; offset += 1;
  if (buffer.length < offset + 2) return null;
  const port = buffer.readUInt16BE(offset); offset += 2;
  if (buffer.length < offset + 1) return null;
  const addrType = buffer[offset]; offset += 1;
  let address;
  if (addrType === 1) {
    if (buffer.length < offset + 4) return null;
    address = `${buffer[offset]}.${buffer[offset+1]}.${buffer[offset+2]}.${buffer[offset+3]}`; offset += 4;
  } else if (addrType === 2) {
    if (buffer.length < offset + 1) return null;
    const domainLen = buffer[offset]; offset += 1;
    if (buffer.length < offset + domainLen) return null;
    address = buffer.slice(offset, offset + domainLen).toString(); offset += domainLen;
  } else if (addrType === 3) {
    if (buffer.length < offset + 16) return null;
    const parts = [];
    for (let i = 0; i < 8; i++) parts.push(buffer.readUInt16BE(offset + i * 2).toString(16));
    address = parts.join(':'); offset += 16;
  } else return null;
  return { version, command, port, address, dataOffset: offset };
}
const server = http.createServer((req, res) => {
  if (req.url === '/generate_204') { res.writeHead(204); res.end(); }
  else if (req.url === '/ip') {
    https.get('https://api.ipify.org', (r) => {
      let data = ''; r.on('data', c => data += c);
      r.on('end', () => { res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify({egress_ip: data.trim()})); });
    }).on('error', () => { res.writeHead(500); res.end('{}'); });
  } else { res.writeHead(200, {'Content-Type': 'text/html'}); res.end('<h1>VLESS+WS Running</h1>'); }
});
const wss = new WebSocket.Server({ server, path: WS_PATH });
wss.on('connection', (ws) => {
  let remoteSocket = null; let headerParsed = false;
  ws.on('message', (data) => {
    const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
    if (!headerParsed) {
      const header = parseVlessHeader(buffer);
      if (!header || header.command !== 1) { ws.close(); return; }
      ws.send(Buffer.from([header.version, 0]));
      remoteSocket = net.connect(header.port, header.address, () => {
        const remaining = buffer.slice(header.dataOffset);
        if (remaining.length > 0) remoteSocket.write(remaining);
      });
      remoteSocket.on('data', (chunk) => { if (ws.readyState === WebSocket.OPEN) ws.send(chunk); });
      remoteSocket.on('close', () => ws.close());
      remoteSocket.on('error', () => ws.close());
      headerParsed = true;
    } else { if (remoteSocket && !remoteSocket.destroyed) remoteSocket.write(buffer); }
  });
  ws.on('close', () => { if (remoteSocket) remoteSocket.destroy(); });
  ws.on('error', () => { if (remoteSocket) remoteSocket.destroy(); });
});
server.listen(PORT, () => console.log(`Listening on ${PORT}, WS path: ${WS_PATH}`));
