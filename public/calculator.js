(function () {
  var $ = function (id) { return document.getElementById(id); };
  var STATES = [['', 'Select'], ['CT', 'CT'], ['NY', 'NY'], ['NJ', 'NJ'], ['OTHER', 'Other']];
  var AREA_STATES = ['CT', 'NY', 'NJ'];
  var OUTSIDE = 'That address is outside our area. We only serve Connecticut, New York and New Jersey.';
  var lookedUp = '';   // the address the square footage was last looked up for
  var lookupSeq = 0;

  function show(id, on) { $(id).classList.toggle('hidden', !on); }
  function setMsg(text) { $('msg').textContent = text || ''; }
  function fmtMoney(n) { return '$' + Number(n).toLocaleString('en-US'); }
  function fmtNum(n) { return Number(n).toLocaleString('en-US'); }

  function getJson(url) {
    return fetch(url).then(function (r) { return r.json(); });
  }
  function postJson(url, body) {
    return fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) { return r.json(); });
  }

  STATES.forEach(function (s) {
    var o = document.createElement('option');
    o.value = s[0];
    o.textContent = s[1];
    $('state').appendChild(o);
  });

  function readAddr() {
    return { street: $('street').value.trim(), city: $('city').value.trim(), state: $('state').value, zip: $('zip').value.replace(/\D/g, '').slice(0, 5) };
  }
  function addrKey(a) { return [a.street, a.city, a.state, a.zip].join('|').toLowerCase(); }
  function addrComplete(a) { return a.street && a.city && AREA_STATES.indexOf(a.state) >= 0 && a.zip.length === 5; }
  function hideResult() { show('result', false); }

  // Looks the address up (map match, area, square footage) as soon as it is filled in; the price still works if this fails.
  function lookup() {
    var a = readAddr();
    if (!addrComplete(a) || addrKey(a) === lookedUp) return;
    lookedUp = addrKey(a);
    var seq = ++lookupSeq;
    $('sqftHint').textContent = 'Looking up the address...';
    var qs = 'street=' + encodeURIComponent(a.street) + '&city=' + encodeURIComponent(a.city) + '&state=' + encodeURIComponent(a.state) + '&zip=' + encodeURIComponent(a.zip);
    getJson('/api/lookup?' + qs).then(function (d) {
      if (seq !== lookupSeq) return;
      if (!d.ok) { show('found', false); $('sqftHint').textContent = d.message || 'Could not look up that address.'; return; }
      $('foundAddr').textContent = d.address + (d.found === false ? ' (not found on the map)' : '');
      $('foundArea').textContent = d.area || '';
      show('found', true);
      if (d.sqft) {
        $('sqft').value = d.sqft;
        $('sqftHint').textContent = 'Filled in from ' + d.sqftSource + '. Change it if the homeowner says it is different.';
      } else {
        $('sqftHint').textContent = d.found === false
          ? 'We could not find this address on the map, so enter the square footage.'
          : 'We could not find the size automatically. Enter the square footage.';
      }
    }).catch(function () {
      if (seq !== lookupSeq) return;
      lookedUp = '';
      $('sqftHint').textContent = 'Could not look up the address. Enter the square footage.';
    });
  }

  function getPrice() {
    setMsg('');
    var a = readAddr();
    if (!a.street || !a.city || !a.state || a.zip.length !== 5) { setMsg('Fill in the address, city, state and 5-digit ZIP code.'); return; }
    if (AREA_STATES.indexOf(a.state) < 0) { setMsg(OUTSIDE); return; }
    var sqft = Number($('sqft').value);
    if (!sqft || sqft < 300) { setMsg('Enter the home square footage.'); return; }
    var body = {
      street: a.street, city: a.city, state: a.state, zip: a.zip, sqft: sqft,
      gutterGuards: (document.querySelector('input[name=guards]:checked') || {}).value || '',
      stories: $('stories').value,
      roofType: $('roof').value,
      solar: (document.querySelector('input[name=solar]:checked') || {}).value || '',
      lastCleaned: $('lastCleaned').value,
      access: []
    };
    $('quote').disabled = true;
    postJson('/api/quote', body).then(function (d) {
      if (!d.ok) { setMsg(d.message || 'Could not price that.'); return; }
      $('price').textContent = fmtMoney(d.price);
      $('resultLine').textContent = fmtNum(d.sqft) + ' sq ft, ' + d.area;
      var ul = $('flags');
      ul.innerHTML = '';
      (d.flags || []).forEach(function (f) { var li = document.createElement('li'); li.textContent = f; ul.appendChild(li); });
      show('result', true);
      $('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }).catch(function () {
      setMsg('Could not reach the server. Try again.');
    }).then(function () { $('quote').disabled = false; });
  }

  function again() {
    ['street', 'city', 'state', 'zip', 'sqft', 'stories', 'roof', 'lastCleaned'].forEach(function (id) { $(id).value = ''; });
    Array.prototype.forEach.call(document.querySelectorAll('input[name=guards], input[name=solar]'), function (r) { r.checked = false; });
    lookedUp = ''; lookupSeq++;
    show('found', false);
    hideResult();
    setMsg('');
    $('sqftHint').textContent = 'Filled in automatically when the address is found.';
    window.scrollTo(0, 0);
    $('street').focus();
  }

  // any change after a price is shown makes that price out of date, so it is cleared
  Array.prototype.forEach.call(document.querySelectorAll('#form input, #form select'), function (el) {
    el.addEventListener('input', function () { hideResult(); setMsg(''); });
    el.addEventListener('change', hideResult);
  });
  ['street', 'city', 'state', 'zip'].forEach(function (id) { $(id).addEventListener('change', lookup); $(id).addEventListener('blur', lookup); });
  $('zip').addEventListener('keydown', function (e) { if (e.key === 'Enter') { lookup(); } });
  $('quote').addEventListener('click', function () { lookup(); getPrice(); });
  $('sqft').addEventListener('keydown', function (e) { if (e.key === 'Enter') getPrice(); });
  $('again').addEventListener('click', again);
})();
