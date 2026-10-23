// Pricing Page: a small public quoting tool (gutter cleaning only, for now).
// The price rules live in config/pricing.json and are applied here; the page
// only ever receives the finished price.
const path = require('path');
const express = require('express');
const { geocode } = require('./src/geocode');
const { lookupSqft } = require('./src/sqft');
const { classify, quote } = require('./src/pricing');
const { buildQuotePdf } = require('./src/pdf');

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

// Prices one quote request from the page's answers (the page never sends a price).
const pick = (v, list) => (list.includes(v) ? v : null);
async function priceFor(b) {
  const geo = await geocode(clean(b.address));
  if (!geo) return { ok: false, message: 'We could not find that address.' };
  const loc = classify(geo);
  const answers = {
    gutterGuards: pick(b.gutterGuards, ['yes', 'no']),
    stories: pick(String(b.stories), ['1', '2', '3']),
    roofType: pick(b.roofType, ['asphalt', 'slate', 'cedar', 'tile', 'metal', 'flat', 'other']),
    solar: pick(b.solar, ['yes', 'no']),
    lastCleaned: pick(b.lastCleaned, ['within_year', 'over_year', 'never', 'unsure']),
  };
  const q = quote(loc, b.sqft, answers);
  if (q.error) return { ok: false, message: q.error };
  return { ok: true, price: q.price, area: q.label, flags: q.flags, address: geo.matched, sqft: Math.round(Number(b.sqft)), answers };
}

app.post('/api/quote', rateLimit, async (req, res) => {
  try {
    const r = await priceFor(req.body || {});
    if (!r.ok) return res.json(r);
    return res.json({ ok: true, price: r.price, area: r.area, flags: r.flags, address: r.address, sqft: r.sqft });
  } catch (err) {
    console.error('quote failed:', err.message);
    return res.status(502).json({ ok: false, message: 'Something went wrong. Please try again.' });
  }
});

// A one-page PDF of the quote. Built on the spot and returned; nothing is saved.
const LABELS = {
  gutterGuards: { yes: 'Yes', no: 'No' },
  stories: { 1: '1', 2: '2', 3: '3 or more' },
  roofType: { asphalt: 'Asphalt shingle (regular)', slate: 'Slate', cedar: 'Cedar or wood shake', tile: 'Tile', metal: 'Metal', flat: 'Flat or rubber roof', other: 'Other' },
  solar: { yes: 'Yes', no: 'No' },
  lastCleaned: { within_year: 'Within the past year', over_year: 'Over a year ago', never: 'Never cleaned', unsure: 'Not sure' },
};
const ACCESS = ['Steep roof', 'Tall or tight access', 'Fences or landscaping in the way'];
app.post('/api/quote-pdf', rateLimit, async (req, res) => {
  const b = req.body || {};
  try {
    const r = await priceFor(b);
    if (!r.ok) return res.status(400).json(r);
    const a = r.answers;
    const access = (Array.isArray(b.access) ? b.access : []).filter((x) => ACCESS.includes(x));
    const details = {
      'Gutter guards': a.gutterGuards && LABELS.gutterGuards[a.gutterGuards],
      'Stories': a.stories && LABELS.stories[a.stories],
      'Roof': a.roofType && LABELS.roofType[a.roofType],
      'Solar panels': a.solar && LABELS.solar[a.solar],
      'Gutters last cleaned': a.lastCleaned && LABELS.lastCleaned[a.lastCleaned],
      'Hard to reach': access.join(', '),
    };
    const name = [clean(b.firstName), clean(b.lastName)].filter(Boolean).join(' ');
    const pdf = await buildQuotePdf({
      price: r.price, address: r.address, sqft: r.sqft, area: r.area,
      customer: { name, phone: clean(b.phone), email: clean(b.email) },
      answers: details,
      nextStep: ['Estimate Approved', 'Send Estimate'].includes(b.nextStep) ? b.nextStep : '',
    });
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="gutter-cleaning-quote.pdf"', 'Cache-Control': 'no-store' });
    return res.send(pdf);
  } catch (err) {
    console.error('pdf failed:', err.message);
    return res.status(502).json({ ok: false, message: 'Could not build the quote file. Please try again.' });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3100;
if (require.main === module) app.listen(PORT, () => console.log(`Pricing page listening on ${PORT}`));
module.exports = app;
