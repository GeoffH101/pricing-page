// Gutter cleaning price rules. Everything numeric lives in config/pricing.json;
// this file only applies it. The browser never sees the rules, only the result.
const cfg = require('../config/pricing.json');

const NYC_COUNTIES = { 'New York County': 'Manhattan', 'Kings County': 'Brooklyn', 'Queens County': 'Queens', 'Bronx County': 'Bronx', 'Richmond County': 'Staten Island' };

const stripSuffix = (s) => String(s || '').replace(/\s+(town|city|borough|village)$/i, '').trim();

// Which price list applies to an address. `geo` comes from src/geocode.js.
function classify(geo) {
  const { state, county, zip } = geo;
  const town = stripSuffix(geo.town);
  if (state === 'NJ') return { kind: 'longIslandNJ', label: 'New Jersey' };
  if (state === 'CT') {
    const names = Object.entries(cfg.connecticut.surchargeCounties);
    const hit = names.find(([, towns]) => towns.some((t) => t.toLowerCase() === town.toLowerCase() || t.toLowerCase() === String(geo.city || '').toLowerCase()));
    return { kind: 'connecticutWestchester', label: 'Connecticut', surchargeCounty: hit ? hit[0] : null };
  }
  if (state === 'NY') {
    if (NYC_COUNTIES[county]) return { kind: 'nyc', label: NYC_COUNTIES[county], borough: NYC_COUNTIES[county] };
    if (county === 'Westchester County') return { kind: 'connecticutWestchester', label: 'Westchester', surchargeCounty: null };
    if (county === 'Nassau County') return { kind: 'longIslandNJ', label: 'Long Island' };
    if (county === 'Suffolk County') {
      const area = Object.entries(cfg.hamptons.areas).find(([, a]) => a.zips.includes(zip));
      if (area) return { kind: 'hamptons', label: `East End - ${area[0]}`, area: area[0] };
      return { kind: 'longIslandNJ', label: 'Long Island' };
    }
  }
  return { kind: 'out', label: 'Outside the service area' };
}

function bandIndex(sqft) {
  const i = cfg.bandMaxSqft.findIndex((max) => sqft <= max);
  return i;
}

// price from a band table, with the over-6,000 sq ft rule
function tablePrice(table, sqft) {
  const i = bandIndex(sqft);
  if (i >= 0) return table[i];
  const top = cfg.bandMaxSqft[cfg.bandMaxSqft.length - 1];
  const o = cfg.over6000;
  const blocks = o.roundUpToNextBlock ? Math.ceil((sqft - top) / o.blockSqft) : (sqft - top) / o.blockSqft;
  return table[table.length - 1] + blocks * o.addPerBlock;
}

function extraBlocks(sqft, baseUpTo, blockSqft, roundUp) {
  if (sqft <= baseUpTo) return 0;
  return roundUp ? Math.ceil((sqft - baseUpTo) / blockSqft) : (sqft - baseUpTo) / blockSqft;
}

// -> { price, label, flags: [...] } or { error }
function quote(loc, sqft, answers = {}) {
  const sq = Number(sqft);
  if (!Number.isFinite(sq) || sq < 300 || sq > 30000) return { error: 'Enter the home\'s square footage (between 300 and 30,000).' };
  if (loc.kind === 'out') return { error: 'This address is outside our pricing areas. Please check with the office.' };
  const flags = [];
  let price;
  if (loc.kind === 'longIslandNJ') price = tablePrice(cfg.tables.longIslandNJ, sq);
  else if (loc.kind === 'connecticutWestchester') {
    price = tablePrice(cfg.tables.connecticutWestchester, sq);
    if (loc.surchargeCounty) price += cfg.connecticut.surcharge;
  } else if (loc.kind === 'nyc') {
    const n = cfg.nyc;
    price = n.base[loc.borough] + extraBlocks(sq, n.baseUpToSqft, n.blockSqft, n.roundUpToNextBlock) * n.addPerBlock;
  } else if (loc.kind === 'hamptons') {
    const h = cfg.hamptons;
    price = h.areas[loc.area].base;
    if (sq > h.baseUpToSqft) flags.push('This home is over 2,500 sq ft. Confirm the price with the office.');
  }
  const adj = cfg.adjustments;
  if (answers.gutterGuards && adj.gutterGuards[answers.gutterGuards]) price += adj.gutterGuards[answers.gutterGuards];
  if (answers.stories && adj.stories[answers.stories]) price += adj.stories[answers.stories];
  return { price, label: loc.label, flags };
}

module.exports = { classify, quote, tablePrice, NYC_COUNTIES };
