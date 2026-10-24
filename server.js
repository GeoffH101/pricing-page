// Pricing Page: a small public quoting tool (gutter cleaning only, for now).
// The price rules live in config/pricing.json and are applied here; the page
// only ever receives the finished price.
const path = require('path');
const express = require('express');
const { geocode } = require('./src/geocode');
const { lookupSqft } = require('./src/sqft');
const { classify, classifyFallback, quote } = require('./src/pricing');

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

const AREA_STATES = ['CT', 'NY', 'NJ'];
const OUTSIDE = 'That address is outside our area. We only serve Connecticut, New York and New Jersey.';

// Address, City, State and ZIP arrive as separate fields.
function readAddress(src) {
  const street = clean(src.street);
  const city = clean(src.city);
  const state = clean(src.state).toUpperCase();
  const zip = clean(src.zip).replace(/\D/g, '').slice(0, 5);
  return { street, city, state, zip, oneLine: `${street}, ${city}, ${state} ${zip}` };
}

app.get('/api/lookup', rateLimit, async (req, res) => {
  const a = readAddress(req.query);
  if (!a.street || !a.city || !a.state || a.zip.length !== 5) return res.json({ ok: false, message: 'Fill in the address, city, state and 5-digit ZIP code.' });
  if (!AREA_STATES.includes(a.state)) return res.json({ ok: false, outside: true, message: OUTSIDE });
  try {
    const geo = await geocode(a.oneLine);
    if (!geo) {
      // can't find it on the map: price from the state, city and ZIP, and let the rep continue
      const loc = classifyFallback(a);
      if (loc.kind === 'out') return res.json({ ok: false, outside: true, message: OUTSIDE });
      if (loc.kind === 'noPrice') return res.json({ ok: false, message: 'We could not find that address, and we do not have pricing for this area. Please check with the office.' });
      return res.json({ ok: true, found: false, address: a.oneLine, area: loc.label, serviceable: true, sqft: null, sqftSource: null });
    }
    const loc = classify(geo);
    if (loc.kind === 'out') return res.json({ ok: false, outside: true, message: OUTSIDE });
    let found = null;
    if (loc.kind !== 'noPrice') { try { found = await lookupSqft(geo); } catch (e) { found = null; } }
    return res.json({ ok: true, found: true, address: geo.matched, area: loc.label, serviceable: true, sqft: found ? found.sqft : null, sqftSource: found ? found.source : null });
  } catch (err) {
    console.error('lookup failed:', err.message);
    return res.status(502).json({ ok: false, message: 'The address lookup is not responding. Please try again in a moment.' });
  }
});

// Prices one quote request from the page's answers (the page never sends a price).
const pick = (v, list) => (list.includes(v) ? v : null);
async function priceFor(b) {
  const a = readAddress(b);
  if (!AREA_STATES.includes(a.state)) return { ok: false, message: OUTSIDE };
  if (a.zip.length !== 5 || !a.street || !a.city) return { ok: false, message: 'Fill in the address, city, state and 5-digit ZIP code.' };
  const geo = await geocode(a.oneLine);
  const loc = geo ? classify(geo) : classifyFallback(a);
  const addressText = geo ? geo.matched : a.oneLine;
  const answers = {
    gutterGuards: pick(b.gutterGuards, ['yes', 'no']),
    stories: pick(String(b.stories), ['1', '2', '3']),
    roofType: pick(b.roofType, ['asphalt', 'slate', 'cedar', 'tile', 'metal', 'flat', 'other']),
    solar: pick(b.solar, ['yes', 'no']),
    lastCleaned: pick(b.lastCleaned, ['within_year', 'over_year', 'never', 'unsure']),
  };
  const q = quote(loc, b.sqft, answers);
  if (q.error) return { ok: false, message: q.error };
  return { ok: true, price: q.price, area: q.label, flags: q.flags, address: addressText, sqft: Math.round(Number(b.sqft)), answers };
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
const SERVICES = ['Gutter Installation', 'Gutter Repair', 'Dryer Vent Cleaning', 'Roof Washing', 'Roof Repair', 'Power Washing', 'Gutter Cleaning'];
const cleanNotes = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, 600);

// Where finished quotes go: the Leads tab of the Spotless Leads sheet, through a small web app
// (PricingPage.gs). Both values are private settings on Railway.
const LEADS_WEBAPP_URL = process.env.LEADS_WEBAPP_URL || '';
const LEADS_KEY = process.env.LEADS_KEY || '';

// The text that goes in the lead's Message column.
function buildMessage({ services, price, sqft, area, details, nextStep }) {
  const lines = ['Services requested:'];
  services.forEach((s) => {
    lines.push('- ' + s.name);
    if (s.notes) lines.push('   Notes: ' + s.notes);
  });
  if (price != null) {
    lines.push('');
    lines.push('Gutter cleaning: $' + Number(price).toLocaleString('en-US') + ' (' + Number(sqft).toLocaleString('en-US') + ' sq ft' + (area ? ', ' + area : '') + ')');
    Object.keys(details).filter((k) => details[k]).forEach((k) => lines.push(k + ': ' + details[k]));
  }
  lines.push('');
  lines.push('Next step: ' + nextStep);
  return lines.join('\n');
}

app.post('/api/submit-lead', rateLimit, async (req, res) => {
  const b = req.body || {};
  try {
    if (!LEADS_WEBAPP_URL || !LEADS_KEY) return res.status(503).json({ ok: false, message: 'Submitting is not set up yet. Please tell the office.' });
    const a = readAddress(b);
    if (!AREA_STATES.includes(a.state)) return res.status(400).json({ ok: false, message: OUTSIDE });
    if (a.zip.length !== 5 || !a.street || !a.city) return res.status(400).json({ ok: false, message: 'Fill in the address, city, state and 5-digit ZIP code.' });
    const nextStep = ['Estimate Approved', 'Send Estimate'].includes(b.nextStep) ? b.nextStep : '';
    if (!nextStep) return res.status(400).json({ ok: false, message: 'Choose Estimate Approved or Send Estimate first.' });
    const services = (Array.isArray(b.services) ? b.services : [])
      .map((x) => ({ name: String((x && x.name) || ''), notes: x && x.name !== 'Gutter Cleaning' ? cleanNotes(x.notes) : '' }))
      .filter((x, i, all) => SERVICES.includes(x.name) && all.findIndex((y) => y.name === x.name) === i);
    if (!services.length) return res.status(400).json({ ok: false, message: 'Pick at least one service.' });
    services.sort((x, y) => SERVICES.indexOf(x.name) - SERVICES.indexOf(y.name));

    let price = null, sqft = null, area = '', details = {}, addressText = a.oneLine;
    if (services.some((x) => x.name === 'Gutter Cleaning')) {
      const r = await priceFor(b); // the price is always worked out here, never taken from the page
      if (!r.ok) return res.status(400).json(r);
      const an = r.answers;
      const access = (Array.isArray(b.access) ? b.access : []).filter((x) => ACCESS.includes(x));
      price = r.price; sqft = r.sqft; area = r.area; addressText = r.address;
      details = {
        'Gutter guards': an.gutterGuards && LABELS.gutterGuards[an.gutterGuards],
        'Stories': an.stories && LABELS.stories[an.stories],
        'Roof': an.roofType && LABELS.roofType[an.roofType],
        'Solar panels': an.solar && LABELS.solar[an.solar],
        'Gutters last cleaned': an.lastCleaned && LABELS.lastCleaned[an.lastCleaned],
        'Hard to reach': access.join(', '),
      };
    } else {
      try { const geo = await geocode(a.oneLine); if (geo) addressText = geo.matched; } catch (e) { /* keep the typed address */ }
    }
    const payload = {
      key: LEADS_KEY,
      id: clean(b.submissionId).replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || String(Date.now()),
      approved: nextStep === 'Estimate Approved',
      name: [clean(b.firstName), clean(b.lastName)].filter(Boolean).join(' '),
      phone: clean(b.phone),
      email: clean(b.email),
      address: addressText,
      message: buildMessage({ services, price, sqft, area, details, nextStep }),
    };
    const r = await fetch(LEADS_WEBAPP_URL, {
      method: 'POST', redirect: 'follow', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(30000),
    });
    const text = await r.text();
    let out = null;
    try { out = JSON.parse(text); } catch (e) { out = null; }
    if (!r.ok || !out || !out.ok) {
      console.error('leads sheet rejected the lead:', r.status, String(text).slice(0, 200));
      return res.status(502).json({ ok: false, message: 'Could not save the lead to the sheet. Please try again, or tell the office.' });
    }
    return res.json({ ok: true, added: out.added !== false });
  } catch (err) {
    console.error('submit failed:', err.message);
    return res.status(502).json({ ok: false, message: 'Could not save the lead to the sheet. Please try again, or tell the office.' });
  }
});

app.get('/health', (req, res) => res.json({ ok: true }));
app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3100;
if (require.main === module) app.listen(PORT, () => console.log(`Pricing page listening on ${PORT}`));
module.exports = app;
