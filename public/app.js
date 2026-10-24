(function () {
  var $ = function (id) { return document.getElementById(id); };
  var state = { addr: null, pending: null, lookup: null, services: [], gc: null };
  var STATES = [['', 'Select'], ['CT', 'CT'], ['NY', 'NY'], ['NJ', 'NJ'], ['OTHER', 'Other']];
  var AREA_STATES = ['CT', 'NY', 'NJ'];
  var OUTSIDE = 'That address is outside our area. We only serve Connecticut, New York and New Jersey.';
  // top to bottom; the second value says whether the service gets a notes box (gutter cleaning goes to its own pricing questions)
  var SERVICES = [['Gutter Installation', true], ['Gutter Repair', true], ['Dryer Vent Cleaning', true], ['Roof Washing', true], ['Roof Repair', true], ['Power Washing', true], ['Gutter Cleaning', false]];
  var STEPS = ['step1', 'stepSvc', 'step2', 'step3'];

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

  // the services list: a checkbox for each, and a notes box that opens under every one except gutter cleaning
  function buildServices() {
    var list = $('svcList');
    list.innerHTML = '';
    SERVICES.forEach(function (s, i) {
      var item = document.createElement('div');
      item.className = 'svcitem';
      var label = document.createElement('label');
      label.className = 'opt';
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.name = 'svc';
      cb.value = s[0];
      cb.id = 'svc' + i;
      label.appendChild(cb);
      label.appendChild(document.createTextNode(' ' + s[0]));
      item.appendChild(label);
      if (s[1]) {
        var box = document.createElement('div');
        box.className = 'svcnote hidden';
        var nl = document.createElement('label');
        nl.setAttribute('for', 'notes' + i);
        nl.textContent = 'Notes (notes only, no pricing)';
        var ta = document.createElement('textarea');
        ta.id = 'notes' + i;
        ta.maxLength = 600;
        box.appendChild(nl);
        box.appendChild(ta);
        item.appendChild(box);
        cb.addEventListener('change', function () {
          box.classList.toggle('hidden', !cb.checked);
          item.classList.toggle('on', cb.checked);
          if (cb.checked) ta.focus();
        });
      } else {
        var hint = document.createElement('div');
        hint.className = 'svchint';
        hint.textContent = 'Pricing questions come next.';
        item.appendChild(hint);
        cb.addEventListener('change', function () { item.classList.toggle('on', cb.checked); });
      }
      list.appendChild(item);
    });
  }
  buildServices();

  function readAddr() {
    return { street: $('street').value.trim(), city: $('city').value.trim(), state: $('state').value, zip: $('zip').value.replace(/\D/g, '').slice(0, 5) };
  }

  // address done (found on the map, or typed and continued anyway): on to the services
  function goToServices(d, a) {
    state.addr = a;
    state.lookup = d;
    $('svcAddr').textContent = d.address + (d.found === false ? ' (not found on the map)' : '');
    show('notfound', false);
    setMsg('msgSvc', '');
    showStep('stepSvc');
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
      goToServices(d, a);
    }).catch(function () {
      setMsg('msg1', 'Could not reach the lookup service. Check your connection and try again.');
    }).then(function () {
      $('lookup').disabled = false;
      $('lookup').textContent = 'Look up address';
    });
  }

  function continueAnyway() {
    if (state.pending) goToServices(state.pending.d, state.pending.a);
  }

  function recheck() {
    show('notfound', false);
    $('street').focus();
  }

  // services chosen: gutter cleaning goes to its pricing questions, anything else goes straight to the end page
  function svcContinue() {
    setMsg('msgSvc', '');
    var picked = [];
    SERVICES.forEach(function (s, i) {
      if ($('svc' + i).checked) picked.push({ name: s[0], notes: s[1] ? $('notes' + i).value.trim() : '' });
    });
    if (!picked.length) { setMsg('msgSvc', 'Pick at least one service.'); return; }
    state.services = picked;
    var hasGC = picked.some(function (p) { return p.name === 'Gutter Cleaning'; });
    if (hasGC) {
      var d = state.lookup || {};
      $('foundAddr').textContent = d.address || '';
      $('foundArea').textContent = d.area || '';
      $('sqft').value = d.sqft ? d.sqft : '';
      $('sqftHint').textContent = d.sqft
        ? 'Filled in from ' + d.sqftSource + '. Change it if the homeowner says it is different.'
        : (d.found === false ? 'We could not find this address on the map, so enter the square footage.' : 'We could not find the size automatically. Enter the square footage.');
      setMsg('msg2', '');
      showStep('step2');
      $('sqft').focus();
    } else {
      state.gc = null;
      showEnd(null);
    }
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
    var gc = { sqft: sqft, gutterGuards: guards, stories: stories, roofType: roof, solar: solar, lastCleaned: lastCleaned, access: access };
    var body = { street: state.addr.street, city: state.addr.city, state: state.addr.state, zip: state.addr.zip };
    Object.keys(gc).forEach(function (k) { body[k] = gc[k]; });
    $('quote').disabled = true;
    postJson('/api/quote', body).then(function (d) {
      if (!d.ok) { setMsg('msg2', d.message || 'Could not price that.'); return; }
      state.gc = gc;
      showEnd(d);
    }).catch(function () {
      setMsg('msg2', 'Could not reach the server. Try again.');
    }).then(function () { $('quote').disabled = false; });
  }

  // the end page: the price when gutter cleaning was picked, the list of services with notes, and the next step
  function showEnd(d) {
    show('priceBlock', !!d);
    if (d) {
      $('price').textContent = fmtMoney(d.price);
      $('resultLine').textContent = fmtNum(d.sqft) + ' sq ft, ' + d.area;
      var ul = $('flags');
      ul.innerHTML = '';
      (d.flags || []).forEach(function (f) { var li = document.createElement('li'); li.textContent = f; ul.appendChild(li); });
    }
    var sum = $('summary');
    sum.innerHTML = '';
    state.services.forEach(function (s) {
      var li = document.createElement('li');
      li.textContent = s.name;
      if (s.notes) { var sm = document.createElement('small'); sm.textContent = s.notes; li.appendChild(sm); }
      sum.appendChild(li);
    });
    Array.prototype.forEach.call(document.querySelectorAll('input[name=estimate]'), function (r) { r.checked = false; r.disabled = false; });
    show('cardbox', false);
    setMsg('msg3', '');
    $('msg3').classList.remove('ok');
    $('send').disabled = false;
    $('send').textContent = 'Submit';
    state.submissionId = newSubmissionId();
    showStep('step3');
  }

  // the credit card text is for the CSR to read, and only when the estimate is approved
  function updateCardBox() {
    var chosen = (document.querySelector('input[name=estimate]:checked') || {}).value;
    show('cardbox', chosen === 'Estimate Approved');
  }

  function newSubmissionId() {
    return 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // Sends the finished quote to the Leads sheet (through the server) and locks the page so it can't go twice.
  function submitLead() {
    if (!state.addr) return;
    var estimate = (document.querySelector('input[name=estimate]:checked') || {}).value || '';
    if (!estimate) { setMsg('msg3', 'Choose Estimate Approved or Send Estimate first.'); return; }
    var body = { street: state.addr.street, city: state.addr.city, state: state.addr.state, zip: state.addr.zip, services: state.services };
    if (state.gc) Object.keys(state.gc).forEach(function (k) { body[k] = state.gc[k]; });
    body.firstName = $('firstName').value.trim();
    body.lastName = $('lastName').value.trim();
    body.phone = $('phone').value.trim();
    body.email = $('email').value.trim();
    body.nextStep = estimate;
    body.submissionId = state.submissionId;
    var btn = $('send');
    btn.disabled = true;
    btn.textContent = 'Submitting...';
    setMsg('msg3', '');
    postJson('/api/submit-lead', body).then(function (d) {
      if (!d.ok) { setMsg('msg3', d.message || 'Could not submit. Try again.'); btn.disabled = false; btn.textContent = 'Submit'; return; }
      btn.textContent = 'Submitted';
      Array.prototype.forEach.call(document.querySelectorAll('input[name=estimate]'), function (r) { r.disabled = true; });
      setMsg('msg3', 'Submitted. The lead is now on the Leads sheet.');
      $('msg3').classList.add('ok');
    }).catch(function () {
      setMsg('msg3', 'Could not reach the server. Try again.');
      btn.disabled = false;
      btn.textContent = 'Submit';
    });
  }

  function formatPhone() {
    var digits = $('phone').value.replace(/\D/g, '');
    if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.slice(1);
    if (digits.length === 10) $('phone').value = '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
  }

  function again() {
    ['firstName', 'lastName', 'phone', 'email', 'street', 'city', 'state', 'zip', 'sqft', 'stories', 'roof', 'lastCleaned'].forEach(function (id) { $(id).value = ''; });
    show('notfound', false);
    Array.prototype.forEach.call(document.querySelectorAll('input[name=guards], input[name=access], input[name=solar], input[name=estimate]'), function (r) { r.checked = false; });
    buildServices();
    state.addr = null; state.pending = null; state.lookup = null; state.services = []; state.gc = null;
    showStep('step1');
    $('street').focus();
  }

  $('phone').addEventListener('blur', formatPhone);
  $('lookup').addEventListener('click', lookup);
  $('zip').addEventListener('keydown', function (e) { if (e.key === 'Enter') lookup(); });
  ['street', 'city', 'zip', 'state'].forEach(function (id) { $(id).addEventListener('input', function () { show('notfound', false); setMsg('msg1', ''); }); });
  $('continueAnyway').addEventListener('click', continueAnyway);
  $('recheck').addEventListener('click', recheck);
  $('svcContinue').addEventListener('click', svcContinue);
  $('svcBack').addEventListener('click', function () { showStep('step1'); });
  $('gcBack').addEventListener('click', function () { setMsg('msgSvc', ''); showStep('stepSvc'); });
  $('quote').addEventListener('click', getPrice);
  $('sqft').addEventListener('keydown', function (e) { if (e.key === 'Enter') getPrice(); });
  Array.prototype.forEach.call(document.querySelectorAll('input[name=estimate]'), function (r) { r.addEventListener('change', updateCardBox); });
  $('send').addEventListener('click', submitLead);
  $('again').addEventListener('click', again);
})();
