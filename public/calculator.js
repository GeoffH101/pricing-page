(function () {
  var $ = function (id) { return document.getElementById(id); };
  var state = { addr: null, pending: null, lookup: null };
  var STATES = [['', 'Select'], ['CT', 'CT'], ['NY', 'NY'], ['NJ', 'NJ'], ['OTHER', 'Other']];
  var AREA_STATES = ['CT', 'NY', 'NJ'];
  var OUTSIDE = 'That address is outside our area. We only serve Connecticut, New York and New Jersey.';
  var STEPS = ['step1', 'step2', 'step3'];

  function show(id, on) { $(id).classList.toggle('hidden', !on); }
  function showStep(id) { STEPS.forEach(function (s) { show(s, s === id); }); window.scrollTo(0, 0); }
  function setMsg(id, text) { $(id).textContent = text || ''; }
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

  // address done (found on the map, or typed and continued anyway): on to the gutter questions
  function goToQuestions(d, a) {
    state.addr = a;
    state.lookup = d;
    show('notfound', false);
    $('foundAddr').textContent = d.address + (d.found === false ? ' (not found on the map)' : '');
    $('foundArea').textContent = d.area || '';
    $('sqft').value = d.sqft ? d.sqft : '';
    $('sqftHint').textContent = d.sqft
      ? 'Filled in from ' + d.sqftSource + '. Change it if the homeowner says it is different.'
      : (d.found === false ? 'We could not find this address on the map, so enter the square footage.' : 'We could not find the size automatically. Enter the square footage.');
    setMsg('msg2', '');
    showStep('step2');
    $('sqft').focus();
  }

  function lookup() {
    var a = readAddr();
    setMsg('msg1', '');
    show('notfound', false);
    if (!a.street || !a.city || !a.state || a.zip.length !== 5) { setMsg('msg1', 'Fill in the address, city, state and 5-digit ZIP code.'); return; }
    if (AREA_STATES.indexOf(a.state) < 0) { setMsg('msg1', OUTSIDE); return; }
    $('lookup').disabled = true;
    $('lookup').textContent = 'Looking up...';
    var qs = 'street=' + encodeURIComponent(a.street) + '&city=' + encodeURIComponent(a.city) + '&state=' + encodeURIComponent(a.state) + '&zip=' + encodeURIComponent(a.zip);
    getJson('/api/lookup?' + qs).then(function (d) {
      if (!d.ok) { setMsg('msg1', d.message || 'Could not look up that address.'); return; }
      if (d.found === false) { state.pending = { d: d, a: a }; show('notfound', true); return; }
      goToQuestions(d, a);
    }).catch(function () {
      setMsg('msg1', 'Could not reach the lookup service. Check your connection and try again.');
    }).then(function () {
      $('lookup').disabled = false;
      $('lookup').textContent = 'Look up address';
    });
  }

  function continueAnyway() {
    if (state.pending) goToQuestions(state.pending.d, state.pending.a);
  }

  function recheck() {
    show('notfound', false);
    $('street').focus();
  }

  function getPrice() {
    setMsg('msg2', '');
    var sqft = Number($('sqft').value);
    if (!sqft || sqft < 300) { setMsg('msg2', 'Enter the home square footage.'); return; }
    var guards = (document.querySelector('input[name=guards]:checked') || {}).value || '';
    var stories = $('stories').value;
    var access = Array.prototype.map.call(document.querySelectorAll('input[name=access]:checked'), function (c) { return c.value; });
    var roof = $('roof').value;
    var solar = (document.querySelector('input[name=solar]:checked') || {}).value || '';
    var lastCleaned = $('lastCleaned').value;
    var body = { street: state.addr.street, city: state.addr.city, state: state.addr.state, zip: state.addr.zip, sqft: sqft, gutterGuards: guards, stories: stories, roofType: roof, solar: solar, lastCleaned: lastCleaned, access: access };
    $('quote').disabled = true;
    postJson('/api/quote', body).then(function (d) {
      if (!d.ok) { setMsg('msg2', d.message || 'Could not price that.'); return; }
      $('price').textContent = fmtMoney(d.price);
      $('resultLine').textContent = fmtNum(d.sqft) + ' sq ft, ' + d.area;
      var ul = $('flags');
      ul.innerHTML = '';
      (d.flags || []).forEach(function (f) { var li = document.createElement('li'); li.textContent = f; ul.appendChild(li); });
      showStep('step3');
    }).catch(function () {
      setMsg('msg2', 'Could not reach the server. Try again.');
    }).then(function () { $('quote').disabled = false; });
  }

  function again() {
    ['street', 'city', 'state', 'zip', 'sqft', 'stories', 'roof', 'lastCleaned'].forEach(function (id) { $(id).value = ''; });
    show('notfound', false);
    Array.prototype.forEach.call(document.querySelectorAll('input[name=guards], input[name=access], input[name=solar]'), function (r) { r.checked = false; });
    state.addr = null; state.pending = null; state.lookup = null;
    showStep('step1');
    $('street').focus();
  }

  $('lookup').addEventListener('click', lookup);
  $('zip').addEventListener('keydown', function (e) { if (e.key === 'Enter') lookup(); });
  ['street', 'city', 'zip', 'state'].forEach(function (id) { $(id).addEventListener('input', function () { show('notfound', false); setMsg('msg1', ''); }); });
  $('continueAnyway').addEventListener('click', continueAnyway);
  $('recheck').addEventListener('click', recheck);
  $('gcBack').addEventListener('click', function () { showStep('step1'); });
  $('quote').addEventListener('click', getPrice);
  $('sqft').addEventListener('keydown', function (e) { if (e.key === 'Enter') getPrice(); });
  $('endBack').addEventListener('click', function () { showStep('step2'); });
  $('again').addEventListener('click', again);
})();
