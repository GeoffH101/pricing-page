// Home square footage from free public property records:
//  - Connecticut: statewide CAMA / parcel layer (assessor living area)
//  - Westchester: county tax parcels
//  - Nassau / Suffolk: NYS tax parcel centroids
//  - NYC boroughs: city PLUTO data
// New Jersey has no free statewide source, so reps type it in there.
const CT_URL = 'https://services3.arcgis.com/3FL1kr7L4LvwA2Kb/arcgis/rest/services/Connecticut_CAMA_and_Parcel_Layer_2025/FeatureServer/0/query';
const NYS_URL = 'https://gisservices.its.ny.gov/arcgis/rest/services/NYS_Tax_Parcel_Centroid_Points/FeatureServer/0/query';
const WC_URL = 'https://giswww.westchestergov.com/arcgis/rest/services/DataHub_TaxParcels/MapServer/0/query';
const PLUTO = 'https://data.cityofnewyork.us/resource/64uk-42ks.json';

const ABBR = { STREET: 'ST', AVENUE: 'AVE', ROAD: 'RD', DRIVE: 'DR', LANE: 'LN', TERRACE: 'TER', TERR: 'TER', COURT: 'CT', PLACE: 'PL', BOULEVARD: 'BLVD', CIRCLE: 'CIR', TRAIL: 'TRL', HIGHWAY: 'HWY', PARKWAY: 'PKWY', NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W', MOUNT: 'MT', SAINT: 'ST', AVENU: 'AVE', AV: 'AVE', LNE: 'LN', WY: 'WAY', EXTENSION: 'EXT', ROUTE: 'RTE', TURNPIKE: 'TPKE', SQUARE: 'SQ', HILL: 'HL', HEIGHTS: 'HTS', PARK: 'PK', RIDGE: 'RDG', CROSSING: 'XING', COMMON: 'CMN', GREEN: 'GRN' };
const SUFFIX = new Set(['ST', 'AVE', 'RD', 'DR', 'LN', 'TER', 'CT', 'PL', 'BLVD', 'CIR', 'TRL', 'HWY', 'PKWY', 'WAY', 'EXT', 'TPKE', 'SQ', 'XING', 'CMN']);

function parseStreet(addr) {
  let s = String(addr || '').toUpperCase().replace(/\b(UNIT|APT|APARTMENT|STE|SUITE|FL|FLOOR|#)\b.*$/, '').replace(/[.,#]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/\b(\d+)(ST|ND|RD|TH)\b/g, '$1').replace(/\b(\d+) TH\b/g, '$1');
  const toks = s.split(' ');
  const house = toks.shift();
  const norm = toks.map((t) => ABBR[t] || t);
  const core = norm.filter((t, i) => !(i === norm.length - 1 && SUFFIX.has(t)));
  return { house, core: core.join(' '), full: norm.join(' ') };
}
const pre = (p) => p.core.split(' ')[0].slice(0, 3).toUpperCase();
const esc = (s) => String(s).replace(/'/g, "''");

async function jget(url, params) {
  const u = url + '?' + new URLSearchParams(params).toString();
  for (let i = 0; i < 2; i++) {
    try { const r = await fetch(u, { signal: AbortSignal.timeout(12000) }); if (r.ok) return await r.json(); } catch (e) { /* retry once */ }
  }
  return null;
}

async function ctLookup(p, zip, town) {
  const t = String(town || '').replace(/\s+town$/i, '');
  let feats = [];
  const like = `(UPPER(Location) LIKE '${esc(p.house)} ${esc(pre(p))}%' OR UPPER(Location_1) LIKE '${esc(p.house)} ${esc(pre(p))}%')`;
  for (const w of [`Property_Zip='${zip}' AND ${like}`, `Town_Name='${esc(t)}' AND ${like}`]) {
    const j = await jget(CT_URL, { where: w, outFields: 'Town_Name,Location,Location_1,Property_Zip,Living_Area', returnGeometry: 'false', resultRecordCount: '60', f: 'json' });
    if (j && j.features && j.features.length) { feats = j.features.map((f) => f.attributes); break; }
  }
  const scored = feats.filter((a) => { const st = parseStreet(a.Location || a.Location_1 || ''); return st.core === p.core || st.full === p.full; });
  const withArea = scored.filter((a) => Number(a.Living_Area) > 0);
  if (withArea.length) return { sqft: Math.round(Math.max(...withArea.map((a) => Number(a.Living_Area)))), source: 'Connecticut assessor records' };
  return null;
}

async function nysLookup(p, county, zip, city) {
  const isWC = county === 'Westchester';
  const like = `UPPER(PARCEL_ADDR) LIKE '${esc(p.house)} ${esc(pre(p))}%'`;
  const w = isWC ? like : `COUNTY_NAME='${county}' AND ${like}`;
  const j = await jget(isWC ? WC_URL : NYS_URL, { where: w, outFields: 'PARCEL_ADDR,CITYTOWN_NAME,LOC_ZIP,SQFT_LIVING', returnGeometry: 'false', resultRecordCount: '60', f: 'json' });
  const feats = ((j && j.features) || []).map((f) => f.attributes);
  let scored = feats.filter((a) => { const st = parseStreet(a.PARCEL_ADDR); return st.core === p.core || st.full === p.full; });
  if (scored.length > 1) {
    const c = String(city).toUpperCase();
    const sub = scored.filter((a) => String(a.CITYTOWN_NAME || '').toUpperCase().includes(c) || (a.LOC_ZIP && a.LOC_ZIP.slice(0, 5) === zip));
    if (sub.length) scored = sub;
  }
  const withArea = scored.filter((a) => Number(a.SQFT_LIVING) > 0);
  if (withArea.length && new Set(withArea.map((a) => a.SQFT_LIVING)).size === 1) return { sqft: Math.round(withArea[0].SQFT_LIVING), source: isWC ? 'Westchester County tax records' : 'New York State tax records' };
  return null;
}

async function plutoLookup(street, zip, borough) {
  const SUF2 = { ST: 'STREET', AVE: 'AVENUE', RD: 'ROAD', LN: 'LANE', DR: 'DRIVE', BLVD: 'BOULEVARD', PL: 'PLACE', CT: 'COURT', TER: 'TERRACE', PKWY: 'PARKWAY' };
  const s = String(street).toUpperCase().replace(/\b(UNIT|APT|#)\b.*$/, '').replace(/[.,#]/g, ' ').replace(/\s+/g, ' ').trim().replace(/\b(\d+)(ST|ND|RD|TH)\b/g, '$1');
  const toks = s.split(' ');
  const last = toks.length - 1;
  const rest = toks.map((t, i) => (i > 0 && i === last && SUF2[t] ? SUF2[t] : t)).slice(1).join(' ');
  const house = toks[0];
  const houses = [house];
  if (/^\d{3,6}$/.test(house)) houses.push(house.slice(0, -2) + '-' + house.slice(-2));
  else if (/^\d+-\d+$/.test(house)) houses.push(house.replace('-', ''));
  const suffixWords = new Set(['STREET', 'AVENUE', 'ROAD', 'LANE', 'DRIVE', 'BOULEVARD', 'PLACE', 'COURT', 'TERRACE', 'PARKWAY', 'WALK', 'WAY', 'LOOP', 'PATH']);
  const restWords = rest.split(' ');
  const restNoSuffix = suffixWords.has(restWords[restWords.length - 1]) ? restWords.slice(0, -1).join(' ') : rest;
  const addrClauses = houses.flatMap((h) => [`address='${esc(h + ' ' + rest)}'`, `address like '${esc(h + ' ' + restNoSuffix)} %'`]);
  // match on ZIP first; PLUTO's ZIP sometimes differs from the mailing ZIP, so then try the borough
  const scopes = [`zipcode='${zip}'`, ...(borough ? [`borough='${borough}'`] : [])];
  for (const where of scopes.flatMap((sc) => addrClauses.map((a) => `${a} AND ${sc}`))) {
    const j = await jget(PLUTO, { $select: 'address,zipcode,bldgarea,resarea,numbldgs', $limit: '5', $where: where });
    if (j && j.length) {
      const x = j[0];
      const area = Number(x.resarea) > 0 ? Number(x.resarea) : Number(x.bldgarea);
      if (area > 0) return { sqft: Math.round(area), source: 'NYC property records' };
    }
  }
  return null;
}

// geo: from src/geocode.js. Returns { sqft, source } or null.
async function lookupSqft(geo) {
  const p = parseStreet(geo.street);
  if (!p.house || !p.core) return null;
  if (geo.state === 'CT') return ctLookup(p, geo.zip, geo.town || geo.city);
  if (geo.state === 'NY') {
    const nyc = ['New York County', 'Kings County', 'Queens County', 'Bronx County', 'Richmond County'];
    if (nyc.includes(geo.county)) return plutoLookup(geo.street, geo.zip, { 'New York County': 'MN', 'Kings County': 'BK', 'Queens County': 'QN', 'Bronx County': 'BX', 'Richmond County': 'SI' }[geo.county]);
    if (geo.county === 'Westchester County') return nysLookup(p, 'Westchester', geo.zip, geo.city);
    if (geo.county === 'Nassau County') return nysLookup(p, 'Nassau', geo.zip, geo.city);
    if (geo.county === 'Suffolk County') return nysLookup(p, 'Suffolk', geo.zip, geo.city);
  }
  return null;
}

module.exports = { lookupSqft, parseStreet };
