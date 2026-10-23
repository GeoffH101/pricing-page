(function () {
  var $ = function (id) { return document.getElementById(id); };
  var state = { address: '', area: '' };

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

  function lookup() {
    var addr = $('address').value.trim();
    setMsg('msg1', '');
    if (addr.length < 6) { setMsg('msg1', 'Enter a full street address, including the town or ZIP.'); return; }
    $('lookup').disabled = true;
    $('lookup').textContent = 'Looking up...';
    getJson('/api/lookup?address=' + encodeURIComponent(addr)).then(function (d) {
      if (!d.ok) { setMsg('msg1', d.message || 'Could not look up that address.'); return; }
      if (!d.serviceable) { setMsg('msg1', 'That address (' + d.address + ') is outside our pricing areas. Please check with the office.'); return; }
      state.address = d.address;
      state.area = d.area;
      $('foundAddr').textContent = d.address;
      $('foundArea').textContent = d.area;
      $('sqft').value = d.sqft ? d.sqft : '';
      $('sqftHint').textContent = d.sqft ? 'Filled in from ' + d.sqftSource + '. Change it if the homeowner says it is different.' : 'We could not find the size automatically. Enter the square footage.';
      show('step1', false);
      show('step2', true);
      show('step3', false);
      setMsg('msg2', '');
      $('sqft').focus();
    }).catch(function () {
      setMsg('msg1', 'Could not reach the lookup service. Check your connection and try again.');
    }).then(function () {
      $('lookup').disabled = false;
      $('lookup').textContent = 'Look up address';
    });
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
    postJson('/api/quote', { address: state.address, sqft: sqft, gutterGuards: guards, stories: stories, roofType: roof, solar: solar, lastCleaned: lastCleaned }).then(function (d) {
      if (!d.ok) { setMsg('msg2', d.message || 'Could not price that.'); return; }
      $('price').textContent = fmtMoney(d.price);
      $('resultLine').textContent = fmtNum(d.sqft) + ' sq ft, ' + d.area;
      var ul = $('flags');
      ul.innerHTML = '';
      (d.flags || []).forEach(function (f) { var li = document.createElement('li'); li.textContent = f; ul.appendChild(li); });
      state.payload = { address: state.address, sqft: sqft, gutterGuards: guards, stories: stories, roofType: roof, solar: solar, lastCleaned: lastCleaned, access: access };
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
    $('address').value = '';
    $('sqft').value = '';
    $('stories').value = '';
    $('roof').value = '';
    $('lastCleaned').value = '';
    Array.prototype.forEach.call(document.querySelectorAll('input[name=guards], input[name=access], input[name=solar], input[name=estimate]'), function (r) { r.checked = false; });
    show('step3', false);
    show('step2', false);
    show('step1', true);
    $('address').focus();
  }

  $('phone').addEventListener('blur', formatPhone);
  $('lookup').addEventListener('click', lookup);
  $('address').addEventListener('keydown', function (e) { if (e.key === 'Enter') lookup(); });
  $('quote').addEventListener('click', getPrice);
  $('sqft').addEventListener('keydown', function (e) { if (e.key === 'Enter') getPrice(); });
  $('send').addEventListener('click', sendQuote);
  $('again').addEventListener('click', again);
})();
