// Address -> standardized address, county and town, using the free US Census geocoder (no key).
const CACHE = new Map();
const TTL_MS = 6 * 60 * 60 * 1000;

async function fallbackGeocode(raw) {
  const r = await fetch('https://nominatim.openstreetmap.org/search?' + new URLSearchParams({ q: raw, format: 'jsonv2', addressdetails: '1', countrycodes: 'us', limit: '1' }).toString(), {
    headers: { 'User-Agent': 'pricing-page/1.0 (gutter cleaning quote tool)' }, signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) return null;
  const hit = (await r.json())[0];
  if (!hit || !hit.address) return null;
  const a = hit.address;
  const state = String(a['ISO3166-2-lvl4'] || '').replace(/^US-/, '');
  if (!state) return null;
  const zipFromInput = (String(raw).match(/\b\d{5}\b/) || [])[0];
  const city = a.city || a.town || a.village || a.hamlet || a.suburb || '';
  return {
    matched: String(raw).replace(/\s+/g, ' ').trim(),
    street: String(raw).split(',')[0].trim(),
    city,
    state,
    zip: zipFromInput || a.postcode || '',
    county: a.county || '',
    town: a.town || a.city || a.village || '',
  };
}

async function geocode(raw) {
  const key = String(raw || '').trim().toLowerCase();
  if (!key) return null;
  const hit = CACHE.get(key);
  if (hit && Date.now() - hit.at < TTL_MS) return hit.value;
  const url = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?' + new URLSearchParams({
    address: raw, benchmark: 'Public_AR_Current', vintage: 'Current_Current', format: 'json',
  }).toString();
  let json = null;
  for (let i = 0; i < 2 && !json; i++) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (r.ok) json = await r.json();
    } catch (e) { /* retry once */ }
  }
  const m = json && ((json.result || {}).addressMatches || [])[0];
  let value = null;
  if (!m) {
    // the Census file misses some addresses (many Queens hyphenated numbers); fall back to OpenStreetMap
    try { value = await fallbackGeocode(raw); } catch (e) { value = null; }
    if (!json && !value) throw new Error('geocoder unavailable');
  }
  if (m) {
    const c = m.addressComponents || {};
    const g = m.geographies || {};
    const parts = String(m.matchedAddress || '').split(', ');
    value = {
      matched: m.matchedAddress,
      street: parts[0],
      city: c.city || '',
      state: c.state || '',
      zip: c.zip || '',
      county: ((g.Counties || [])[0] || {}).NAME || '',
      town: ((g['County Subdivisions'] || [])[0] || {}).NAME || '',
    };
  }
  CACHE.set(key, { at: Date.now(), value });
  return value;
}

module.exports = { geocode };
