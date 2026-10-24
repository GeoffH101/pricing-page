// Stands in for the Apps Script web app (PricingPage.gs) so the submit route can be tested without Google.
// Like the real one, POST /exec answers with a redirect, and the JSON answer comes from the redirected address.
const http = require('http');
const seen = [];
const server = http.createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/exec') {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let data = null;
      try { data = JSON.parse(body); } catch (e) { /* ignore */ }
      const ok = data && data.key === 'testkey';
      const dup = ok && seen.some((x) => x.id === data.id);
      if (ok && !dup) seen.push(data);
      res.writeHead(302, { Location: '/result?ok=' + (ok ? 1 : 0) + '&added=' + (dup ? 0 : 1) });
      res.end();
    });
  } else if (req.url.startsWith('/result')) {
    const q = new URL(req.url, 'http://x').searchParams;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(q.get('ok') === '1' ? { ok: true, added: q.get('added') === '1' } : { ok: false, error: 'not allowed' }));
  } else if (req.url === '/seen') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(seen));
  } else { res.writeHead(404); res.end(); }
});
server.listen(process.env.MOCK_PORT || 3141, () => console.log('mock leads sheet listening'));
