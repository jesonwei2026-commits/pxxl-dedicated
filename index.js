const http = require('http');
const https = require('https');
const port = process.env.PORT || 3000;

function fetch(url) {
  return new Promise((resolve) => {
    https.get(url, {timeout: 10000}, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({status: res.statusCode, body: data.substring(0, 200)}));
    }).on('error', e => resolve({status: 'ERR', body: e.message.substring(0, 200)}))
      .on('timeout', () => resolve({status: 'TIMEOUT', body: ''}));
  });
}

http.createServer(async (req, res) => {
  res.writeHead(200, {'Content-Type': 'application/json'});
  if (req.url === '/ip') {
    const r = await fetch('https://api.ipify.org');
    res.end(JSON.stringify({egress_ip: r.body.trim(), status: r.status}));
  } else if (req.url === '/cf') {
    const r = await fetch('https://claude.ai/login');
    res.end(JSON.stringify({claude_status: r.status, hint: r.body.substring(0, 100)}));
  } else {
    res.end(JSON.stringify({ok: 'Pxxl Node OK'}));
  }
}).listen(port, () => console.log('Listening on ' + port));
