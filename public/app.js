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
      state.summary = 'Gutter cleaning: ' + fmtMoney(d.price) + '\n' + d.address + '\n' + fmtNum(d.sqft) + ' sq ft'
        + (guards ? '\nGutter guards: ' + (guards === 'yes' ? 'Yes' : 'No') : '')
        + (stories ? '\nStories: ' + (stories === '3' ? '3 or more' : stories) : '')
        + (roof ? '\nRoof: ' + $('roof').options[$('roof').selectedIndex].text : '')
        + (solar ? '\nSolar panels: ' + (solar === 'yes' ? 'Yes' : 'No') : '')
        + (lastCleaned ? '\nLast cleaned: ' + $('lastCleaned').options[$('lastCleaned').selectedIndex].text : '')
        + (access.length ? '\nHard to reach: ' + access.join(', ') : '')
        + ((d.flags || []).length ? '\nNote: ' + d.flags.join(' ') : '');
      setMsg('msg3', '');
      show('step2', false);
      show('step3', true);
    }).catch(function () {
      setMsg('msg2', 'Could not reach the server. Try again.');
    }).then(function () { $('quote').disabled = false; });
  }

  function copy() {
    var chosen = (document.querySelector('input[name=estimate]:checked') || {}).value;
    var text = (state.summary || '') + (chosen ? '\nNext step: ' + chosen : '');
    function done() { setMsg('msg3', 'Copied.'); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () { setMsg('msg3', 'Could not copy. Select and copy the price manually.'); });
    else { var ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); done(); } catch (e) { setMsg('msg3', 'Could not copy.'); } document.body.removeChild(ta); }
  }

  function again() {
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

  $('lookup').addEventListener('click', lookup);
  $('address').addEventListener('keydown', function (e) { if (e.key === 'Enter') lookup(); });
  $('quote').addEventListener('click', getPrice);
  $('sqft').addEventListener('keydown', function (e) { if (e.key === 'Enter') getPrice(); });
  $('copy').addEventListener('click', copy);
  $('again').addEventListener('click', again);
})();
