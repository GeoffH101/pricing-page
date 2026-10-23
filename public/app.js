(function () {
  var $ = function (id) { return document.getElementById(id); };
  var state = { addr: null, pending: null };
  var STATES = [['', 'Select'], ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'], ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['DC', 'District of Columbia'], ['FL', 'Florida'], ['GA', 'Georgia'], ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'], ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'], ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'], ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'], ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'], ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'], ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'], ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming']];
  var AREA_STATES = ['CT', 'NY', 'NJ'];
  var OUTSIDE = 'That address is outside our area. We only serve Connecticut, New York and New Jersey.';

  function show(id, on) { $(id).classList.toggle('hidden', !on); }
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
    o.textContent = s[0] ? s[0] + ' - ' + s[1] : s[1];
    $('state').appendChild(o);
  });

  function readAddr() {
    return { street: $('street').value.trim(), city: $('city').value.trim(), state: $('state').value, zip: $('zip').value.replace(/\D/g, '').slice(0, 5) };
  }

  // Moves to the questions for an address (found on the map, or typed and continued anyway).
  function goToQuestions(d, a) {
    state.addr = a;
    $('foundAddr').textContent = d.address;
    $('foundArea').textContent = d.area;
    $('sqft').value = d.sqft ? d.sqft : '';
    $('sqftHint').textContent = d.sqft
      ? 'Filled in from ' + d.sqftSource + '. Change it if the homeowner says it is different.'
      : (d.found === false ? 'We could not find this address on the map, so enter the square footage.' : 'We could not find the size automatically. Enter the square footage.');
    show('notfound', false);
    show('step1', false);
    show('step2', true);
    show('step3', false);
    setMsg('msg2', '');
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
    $('quote').disabled = true;
    postJson('/api/quote', { street: state.addr.street, city: state.addr.city, state: state.addr.state, zip: state.addr.zip, sqft: sqft, gutterGuards: guards, stories: stories, roofType: roof, solar: solar, lastCleaned: lastCleaned }).then(function (d) {
      if (!d.ok) { setMsg('msg2', d.message || 'Could not price that.'); return; }
      $('price').textContent = fmtMoney(d.price);
      $('resultLine').textContent = fmtNum(d.sqft) + ' sq ft, ' + d.area;
      var ul = $('flags');
      ul.innerHTML = '';
      (d.flags || []).forEach(function (f) { var li = document.createElement('li'); li.textContent = f; ul.appendChild(li); });
      state.payload = { street: state.addr.street, city: state.addr.city, state: state.addr.state, zip: state.addr.zip, sqft: sqft, gutterGuards: guards, stories: stories, roofType: roof, solar: solar, lastCleaned: lastCleaned, access: access };
      setMsg('msg3', '');
      show('step2', false);
      show('step3', true);
    }).catch(function () {
      setMsg('msg2', 'Could not reach the server. Try again.');
    }).then(function () { $('quote').disabled = false; });
  }

  function safeName(s) { return String(s || '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

  // Builds the quote as a PDF on the server, then hands it to the phone's share sheet
  // (Mail, Messages, ...). Where there is no share sheet it downloads the file and opens
  // an email to the customer for the rep to attach it to.
  function sendQuote() {
    if (!state.payload) return;
    var estimate = (document.querySelector('input[name=estimate]:checked') || {}).value || '';
    var body = {};
    Object.keys(state.payload).forEach(function (k) { body[k] = state.payload[k]; });
    body.firstName = $('firstName').value.trim();
    body.lastName = $('lastName').value.trim();
    body.phone = $('phone').value.trim();
    body.email = $('email').value.trim();
    body.nextStep = estimate;
    var btn = $('send');
    btn.disabled = true;
    setMsg('msg3', 'Building the quote file...');
    fetch('/api/quote-pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).then(function (r) {
      if (!r.ok) throw new Error('pdf');
      return r.blob();
    }).then(function (blob) {
      var name = 'Gutter-Quote-' + (safeName(body.lastName) || 'Customer') + '.pdf';
      var file = new File([blob], name, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        return navigator.share({ files: [file], title: 'Gutter cleaning quote', text: 'Your gutter cleaning quote' }).then(function () {
          setMsg('msg3', 'Quote ready to send.');
        }, function (err) {
          setMsg('msg3', err && err.name === 'AbortError' ? 'Not sent. Tap Send quote to try again.' : 'Could not open the share menu. Tap Send quote to try again.');
        });
      }
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
      if (body.email) {
        setMsg('msg3', 'Saved ' + name + '. Attach it to the email that opens.');
        var nl = String.fromCharCode(10);
        var mail = 'mailto:' + encodeURIComponent(body.email) + '?subject=' + encodeURIComponent('Your gutter cleaning quote') + '&body=' + encodeURIComponent('Hi' + (body.firstName ? ' ' + body.firstName : '') + ',' + nl + nl + 'Your gutter cleaning quote is attached.' + nl);
        setTimeout(function () { window.location.href = mail; }, 700);
      } else {
        setMsg('msg3', 'Saved ' + name + '. Attach it to an email to the customer.');
      }
    }).catch(function () {
      setMsg('msg3', 'Could not build the quote file. Try again.');
    }).then(function () { btn.disabled = false; });
  }

  function formatPhone() {
    var digits = $('phone').value.replace(/\D/g, '');
    if (digits.length === 11 && digits.charAt(0) === '1') digits = digits.slice(1);
    if (digits.length === 10) $('phone').value = '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6);
  }

  function again() {
    $('firstName').value = '';
    $('lastName').value = '';
    $('phone').value = '';
    $('email').value = '';
    $('street').value = '';
    $('city').value = '';
    $('state').value = '';
    $('zip').value = '';
    show('notfound', false);
    $('sqft').value = '';
    $('stories').value = '';
    $('roof').value = '';
    $('lastCleaned').value = '';
    Array.prototype.forEach.call(document.querySelectorAll('input[name=guards], input[name=access], input[name=solar], input[name=estimate]'), function (r) { r.checked = false; });
    show('step3', false);
    show('step2', false);
    show('step1', true);
    $('street').focus();
  }

  $('phone').addEventListener('blur', formatPhone);
  $('lookup').addEventListener('click', lookup);
  $('zip').addEventListener('keydown', function (e) { if (e.key === 'Enter') lookup(); });
  ['street', 'city', 'zip', 'state'].forEach(function (id) { $(id).addEventListener('input', function () { show('notfound', false); setMsg('msg1', ''); }); });
  $('continueAnyway').addEventListener('click', continueAnyway);
  $('recheck').addEventListener('click', recheck);
  $('quote').addEventListener('click', getPrice);
  $('sqft').addEventListener('keydown', function (e) { if (e.key === 'Enter') getPrice(); });
  $('send').addEventListener('click', sendQuote);
  $('again').addEventListener('click', again);
})();
