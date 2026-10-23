// Checks the price rules against the owner's sheet (every $249 became $269) and the rules agreed in chat.
const assert = require('assert');
const { classify, quote } = require('../src/pricing');

const li = { kind: 'longIslandNJ', label: 'Long Island' };
const ct = { kind: 'connecticutWestchester', label: 'Connecticut', surchargeCounty: null };
const ctHartford = { kind: 'connecticutWestchester', label: 'Connecticut', surchargeCounty: 'Hartford' };
const p = (loc, sq, a) => quote(loc, sq, a).price;

// Long Island / NJ bands
[[1500, 269], [2000, 269], [2001, 269], [2500, 269], [2501, 294], [3000, 294], [3001, 344], [3500, 344], [3501, 383], [4000, 383], [4001, 439], [4500, 439], [4501, 484], [5000, 484], [5001, 534], [5500, 534], [5501, 579], [6000, 579]]
  .forEach(([sq, want]) => assert.strictEqual(p(li, sq), want, `LI/NJ ${sq}`));
// Connecticut / Westchester bands, and the +$50 counties
[[2000, 269], [2500, 299], [3000, 344], [3500, 394], [4000, 439], [4500, 489], [5000, 544], [5500, 594], [6000, 629]]
  .forEach(([sq, want]) => { assert.strictEqual(p(ct, sq), want, `CT ${sq}`); assert.strictEqual(p(ctHartford, sq), want + 50, `CT Hartford ${sq}`); });
// over 6,000: +$100 per 1,000 sq ft started
assert.strictEqual(p(li, 6001), 679);
assert.strictEqual(p(li, 7000), 679);
assert.strictEqual(p(li, 7200), 779);
assert.strictEqual(p(ct, 7200), 829);
// NYC boroughs: base up to 2,500 sq ft, +$95 per 1,000 sq ft started
const nyc = (b) => ({ kind: 'nyc', label: b, borough: b });
assert.strictEqual(p(nyc('Queens'), 2500), 399);
assert.strictEqual(p(nyc('Queens'), 2501), 494);
assert.strictEqual(p(nyc('Queens'), 3500), 494);
assert.strictEqual(p(nyc('Queens'), 3501), 589);
assert.strictEqual(p(nyc('Brooklyn'), 2000), 479);
assert.strictEqual(p(nyc('Manhattan'), 3000), 574);
assert.strictEqual(p(nyc('Staten Island'), 2500), 479);
assert.strictEqual(p(nyc('Bronx'), 4600), 479 + 3 * 95);
// Hamptons: base price by area, no per-1,000 add-on, flagged above 2,500
const h = (area) => ({ kind: 'hamptons', label: area, area });
assert.strictEqual(p(h('Riverhead / Westhampton'), 2000), 269);
assert.strictEqual(p(h('Southampton'), 2500), 349);
assert.strictEqual(p(h('East Hampton'), 2000), 399);
assert.strictEqual(p(h('Montauk'), 2000), 449);
assert.strictEqual(quote(h('Montauk'), 3000).flags.length, 1);
assert.strictEqual(quote(h('Montauk'), 2500).flags.length, 0);
// add-ons: gutter guards (yes) and 3+ stories
const g = (loc, sq) => quote(loc, sq, { gutterGuards: 'yes' }).price - quote(loc, sq, {}).price;
assert.strictEqual(g(li, 2000), 50);
assert.strictEqual(g(li, 2499), 50);
assert.strictEqual(g(li, 2500), 100);
assert.strictEqual(g(li, 4500), 100);
assert.strictEqual(g(li, 4501), 150);
assert.strictEqual(g(nyc('Queens'), 5000), 150);
assert.strictEqual(quote(li, 3000, { gutterGuards: 'no' }).price, p(li, 3000));
const s3 = (loc, sq) => quote(loc, sq, { stories: '3' }).price - quote(loc, sq, {}).price;
assert.strictEqual(s3(li, 2000), 50);
assert.strictEqual(s3(li, 2500), 100);
assert.strictEqual(s3(li, 6000), 100);
assert.strictEqual(quote(li, 2000, { stories: '1' }).price, p(li, 2000));
assert.strictEqual(quote(li, 2000, { stories: '2' }).price, p(li, 2000));
assert.strictEqual(quote(li, 2000, { gutterGuards: 'yes', stories: '3' }).price, 269 + 50 + 50);
// bad input and out of area
assert.ok(quote(li, 'abc').error);
assert.ok(quote(li, 100).error);
assert.ok(quote({ kind: 'out' }, 2000).error);

// classification
assert.strictEqual(classify({ state: 'NJ', county: 'Bergen County' }).kind, 'longIslandNJ');
assert.strictEqual(classify({ state: 'NY', county: 'Nassau County', zip: '11530' }).kind, 'longIslandNJ');
assert.strictEqual(classify({ state: 'NY', county: 'Suffolk County', zip: '11946' }).area, 'Southampton');
assert.strictEqual(classify({ state: 'NY', county: 'Suffolk County', zip: '11701' }).kind, 'longIslandNJ');
assert.strictEqual(classify({ state: 'NY', county: 'Suffolk County', zip: '11954' }).area, 'Montauk');
assert.strictEqual(classify({ state: 'NY', county: 'Kings County' }).borough, 'Brooklyn');
assert.strictEqual(classify({ state: 'NY', county: 'New York County' }).borough, 'Manhattan');
assert.strictEqual(classify({ state: 'NY', county: 'Richmond County' }).borough, 'Staten Island');
assert.strictEqual(classify({ state: 'NY', county: 'Westchester County' }).kind, 'connecticutWestchester');
assert.strictEqual(classify({ state: 'CT', town: 'Plainville town', city: 'Plainville' }).surchargeCounty, 'Hartford');
assert.strictEqual(classify({ state: 'CT', town: 'Waterford town', city: 'Waterford' }).surchargeCounty, 'New London');
assert.strictEqual(classify({ state: 'CT', town: 'Haddam town', city: 'Haddam' }).surchargeCounty, 'Middlesex');
assert.strictEqual(classify({ state: 'CT', town: 'Greenwich town', city: 'Greenwich' }).surchargeCounty, null);
assert.strictEqual(classify({ state: 'PA', county: 'Pike County' }).kind, 'out');
assert.strictEqual(classify({ state: 'NY', county: 'Rockland County' }).kind, 'out');

console.log('all pricing checks passed');
