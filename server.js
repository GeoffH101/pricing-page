// Pricing Page: a small public quoting tool (gutter cleaning only, for now).
// The price rules live in config/pricing.json and are applied here; the page
// only ever receives the finished price.
const path = require('path');
const express = require('express');
const { geocode } = require('./src/geocode');
const { lookupSqft } = require('./src/sqft');
const { classify, quote } = require('./src/pricing');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '10kb' }));

// keep the page out of search engines (it is a link-only resource)
app.use((req, res, next) => { res.set('X-Robots-Tag', 'noindex, nofollow'); next(); });
app.get('/robots.txt', (req, res) => res.type('text/plain').send('User-agent: *\nDisallow: /\n'));

// light per-IP rate limit, since the public lookups call free government services
const hits = new Map();
function rateLimit(req, res, next) {
  const now = Date.now();
  const list = (hits.get(req.ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  hits.set(req.ip, list);
  if (list.length > 80) return res.status(429).json({ ok: false, message: 'Too many requests. Please wait a few minutes and try again.' });
  return next();
}
setInterval(() => { const now = Date.now(); hits.forEach((v, k) => { if (!v.some((t) => now - t < 10 * 60 * 1000)) hits.delete(k); }); }, 10 * 60 * 1000).unref();

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 200);

app.get('/api/lookup', rateLimit, async (req, res) => {
  const address = clean(req.query.address);
  if (address.length < 6) return res.json({ ok: false, message: 'Enter a full street address, including the town or ZIP.' });
  try {
    const geo = await geocode(address);
    if (!geo) return res.json({ ok: false, message: 'We could not find that address. Check the spelling and include the town or ZIP.' });
    const loc = classify(geo);
    let found = null;
    if (loc.kind !== 'out') { try { found = await lookupSqft(geo); } catch (e) { found = null; } }
    return res.json({ ok: true, address: geo.matched, area: loc.label, serviceable: loc.kind !== 'out', sqft: found ? found.sqft : null, sqftSource: found ? found.source : null });
  } catch (err) {
    console.error('lookup failed:', err.message);
    return res.status(502).json({ ok: false, message: 'The address lookup is not responding. Please try again in a moment.' });
  }
});

app.post('/api/quote', rateLimit, async (req, res) => {
  const b = req.body || {};
  const address = clean(b.address);
  try {
    const geo = await geocode(address);
    if (!geo) return res.json({ ok: false, message: 'We could not find that address.' });
    const loc = classify(geo);
    const pick = (v, list) => (list.includes(v) ? v : null);
    const q = quote(loc, b.sqft, {
      gutterGuards: pick(b.gutterGuards, ['yes', 'no']),
      stories: pick(String(b.stories), ['1', '2', '3']),
      roofType: pick(b.roofType, ['asphalt', 'slate', 'cedar', 'tile', 'metal', 'flat', 'other']),
      solar: pick(b.solar, ['yes', 'no']),
      lastCleaned: pick(b.lastCleaned, ['within_year', 'over_year', 'never', 'unsure']),
    });
    if (q.error) return res.json({ ok: false, message: q.error });
    return res.json({ ok: true, price: q.price, area: q.label, flags: q.flags, address: geo.matched, sqft: Math.round(Number(b.sqft)) });
  } catch (err) {
    console.error('quote failed:', err.message);
    return res.status(502).json({ ok: false, message: 'Something went wrong. Please try again.' });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3100;
if (require.main === module) app.listen(PORT, () => console.log(`Pricing page listening on ${PORT}`));
module.exports = app;
