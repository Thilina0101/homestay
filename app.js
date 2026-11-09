/* Homestay booking manager: the app. Business rules live in core.js; texts in i18n.js. */
(function () {
  'use strict';
  const H = window.HS, t = I18N.t;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  /* ---------------------------------------------------------------- storage */
  function load() { try { return JSON.parse(localStorage.getItem(H.DB_KEY)); } catch { return null; } }
  let db = H.migrate(load());
  function save() {
    try { localStorage.setItem(H.DB_KEY, JSON.stringify(db)); }
    catch { toast(t('storageFull'), 8000); }
  }
  window.addEventListener('storage', (e) => { if (e.key === H.DB_KEY) { db = H.migrate(load()); applyLang(); renderAll(); } });

  /** Run a rule from core.js: save + redraw when it works, show the reason when it doesn't. */
  function act(fn, okMsg) {
    try {
      const r = fn();
      save(); renderAll();
      if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg);
      return r ?? true;
    } catch (e) {
      if (e instanceof H.StayError) { toast('⚠ ' + e.message, 5500); return null; }
      throw e;
    }
  }

  /* ---------------------------------------------------------------- UI helpers */
  let toastTimer;
  function toast(text, ms = 2800) {
    const el = $('toast'); el.textContent = text; el.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }
  let modalStack = [];
  function openModal(html, onRefresh) {
    $('mBody').innerHTML = html; $('modal').hidden = false;
    modalStack = onRefresh ? [onRefresh] : [];
    I18N.apply($('mBody'));
    const f = $('mBody').querySelector('input:not([type=hidden]):not([type=checkbox]):not([type=date]), textarea'); if (f && !onRefresh) setTimeout(() => f.focus(), 30);
  }
  function closeModal() { $('modal').hidden = true; $('mBody').innerHTML = ''; modalStack = []; }
  $('mClose').onclick = closeModal;
  $('modal').addEventListener('mousedown', (e) => { if (e.target === $('modal')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('modal').hidden) closeModal(); });

  const todayStr = () => H.dateStr(Date.now());
  const loc = () => I18N.locale();
  const fmtDate = (d, o = { day: 'numeric', month: 'short' }) => (d ? new Date(d + 'T12:00:00').toLocaleDateString(loc(), o) : '');
  const fmtLong = (d) => fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const money = (n) => {
    const v = Number(n) || 0;
    return db.settings.currency + v.toLocaleString(loc(), { minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 });
  };
  const guest = (id) => db.guests.find((g) => g.id === id) || { name: '?', phone: '', nationality: '' };
  const room = (id) => db.rooms.find((r) => r.id === id) || { name: '?', type: '' };
  const booking = (id) => db.bookings.find((b) => b.id === id);
  const stLabel = (s) => t('s_' + s);
  const badge = (b) => `<span class="badge s-${b.status}">${esc(stLabel(b.status))}</span>`;
  function download(name, text, type) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }
  function openLink(href) { const a = document.createElement('a'); a.href = href; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); }
  function qr(el, text, size = 180) {
    if (!el) return;
    if (!window.QRCode) { el.innerHTML = `<p class="muted">${esc(t('qrOffline'))}</p>`; return; }
    try { new QRCode(el, { text, width: size, height: size, correctLevel: QRCode.CorrectLevel.M }); } catch { /* ignore */ }
  }

  /* ---------------------------------------------------------------- language & header */
  function applyLang() {
    I18N.setLang(db.settings.language); I18N.apply();
    document.title = db.settings.name;
    $('bkSearch').placeholder = t('bookingSearchPh');
  }
  function renderHeader() {
    $('propName').textContent = db.settings.name;
    $('clock').textContent = new Date().toLocaleDateString(loc(), { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    $('lockBtn').hidden = !db.settings.pin;
  }
  let tab = 'today';
  try { tab = sessionStorage.getItem('hs_tab') || 'today'; } catch { /* private mode */ }
  function showTab(name) {
    tab = name;
    try { sessionStorage.setItem('hs_tab', name); } catch { /* ignore */ }
    document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === name));
    document.querySelectorAll('.tab').forEach((s) => s.classList.toggle('on', s.id === 'tab-' + name));
    renderAll();
  }
  $('tabs').onclick = (e) => { const b = e.target.closest('button[data-tab]'); if (b) showTab(b.dataset.tab); };
  $('newBooking').onclick = () => bookingForm({});

  /* ================================================================ TODAY */
  function bRow(b, buttons = '') {
    const g = guest(b.guestId), tt = H.totals(b);
    return `<div class="brow" data-act="open" data-id="${b.id}">
      <span class="rname">${esc(room(b.roomId).name)}</span>
      <div class="binfo"><b>${esc(g.name)}</b><small>${esc(fmtDate(b.checkIn))} → ${esc(fmtDate(b.checkOut))} · ${tt.nights} ${esc(t('nightsShort'))} · ${b.adults + b.children} 👤${tt.balance > 0.009 ? ` · <span class="due">${esc(t('due'))} ${esc(money(tt.balance))}</span>` : ''}</small></div>
      ${buttons}</div>`;
  }
  function renderToday() {
    const d = H.today(db);
    const card = (n, label, cls = '') => `<div class="card ${cls}"><b>${n}</b><span>${esc(label)}</span></div>`;
    $('tdStats').innerHTML = card(d.occupancy + '%', t('occTonight', { a: d.roomsSold, n: d.roomsTotal })) + card(d.arrivals.length, t('arrivals'))
      + card(d.departures.length, t('departures')) + card(d.inHouse.length, t('inHouse')) + card(d.dirty.length, t('toClean'), d.dirty.length ? 'warn' : '');
    const alerts = [];
    if (d.tm30.length) alerts.push(`<div class="alert">🛂 <b>${esc(t('tm30Due', { n: d.tm30.length }))}</b> ${d.tm30.map((b) => `<button class="link" data-act="open" data-id="${b.id}">${esc(guest(b.guestId).name)} (${esc(room(b.roomId).name)})</button>`).join(', ')}<small>${esc(t('tm30Help'))}</small></div>`);
    if (d.expiredHolds.length) alerts.push(`<div class="alert">⏰ <b>${esc(t('holdsExpired', { n: d.expiredHolds.length }))}</b> ${d.expiredHolds.map((b) => `<button class="link" data-act="open" data-id="${b.id}">${esc(guest(b.guestId).name)} · ${esc(room(b.roomId).name)} · ${esc(fmtDate(b.checkIn))}</button>`).join(', ')}</div>`);
    if (d.lateArrivals.length) alerts.push(`<div class="alert">❓ <b>${esc(t('notArrived', { n: d.lateArrivals.length }))}</b> ${d.lateArrivals.map((b) => `<button class="link" data-act="open" data-id="${b.id}">${esc(guest(b.guestId).name)} · ${esc(room(b.roomId).name)}</button>`).join(', ')}</div>`);
    $('tdAlerts').innerHTML = alerts.join('');
    $('tdArrivals').innerHTML = d.arrivals.map((b) => bRow(b, `<button class="btn small primary" data-act="checkin" data-id="${b.id}">${esc(t('checkInBtn'))}</button>`)).join('') || `<p class="muted">${esc(t('none'))}</p>`;
    $('tdDepartures').innerHTML = d.departures.map((b) => bRow(b, `<button class="btn small primary" data-act="checkout" data-id="${b.id}">${esc(t('checkOutBtn'))}</button>`)).join('') || `<p class="muted">${esc(t('none'))}</p>`;
    $('tdInHouse').innerHTML = d.inHouse.map((b) => bRow(b)).join('') || `<p class="muted">${esc(t('none'))}</p>`;
    const occ = new Map(d.inHouse.map((b) => [b.roomId, b]));
    $('tdRooms').innerHTML = db.rooms.filter((r) => r.active).map((r) => {
      const b = occ.get(r.id);
      return `<div class="hk ${r.housekeeping}"><b>${esc(r.name)}</b><small>${esc(r.type)}</small>
        <small>${b ? '🛏 ' + esc(guest(b.guestId).name) : esc(t('vacant'))}</small>
        <button class="btn small ${r.housekeeping === 'dirty' ? 'primary' : 'ghost'}" data-act="hk" data-id="${r.id}">${r.housekeeping === 'dirty' ? '🧹 ' + esc(t('markClean')) : '✓ ' + esc(t('clean'))}</button></div>`;
    }).join('');
  }

  /* ================================================================ CALENDAR */
  let calFrom = H.addDays(todayStr(), -1);
  const CAL_DAYS = () => (window.innerWidth < 700 ? 7 : 14);
  function renderCalendar() {
    $('calFrom').value = calFrom;
    const days = CAL_DAYS();
    const c = H.chart(db, calFrom, days);
    const td = todayStr();
    const we = db.settings.weekendNights || [];
    const head = `<div class="ch-room ch-head"></div>` + c.dates.map((d) => `<div class="ch-head${d === td ? ' today' : ''}${we.includes(H.weekday(d)) ? ' we' : ''}">
      <small>${esc(fmtDate(d, { weekday: 'short' }))}</small><b>${new Date(d + 'T12:00:00').getDate()}</b></div>`).join('');
    const rows = c.rows.map(({ room: r, bookings }) => {
      const cells = c.dates.map((d, i) => `<button class="ch-cell${d === td ? ' today' : ''}${we.includes(H.weekday(d)) ? ' we' : ''}${d < td ? ' past' : ''}" style="grid-column:${i + 2}" data-act="calBook" data-room="${r.id}" data-date="${d}" ${d < td || !r.active ? 'disabled' : ''} title="${esc(r.name)} · ${esc(fmtDate(d))}"></button>`).join('');
      const bars = bookings.map(({ b, start, span, cutLeft, cutRight }) => `<button class="ch-bar s-${b.status}${cutLeft ? ' cl' : ''}${cutRight ? ' cr' : ''}" style="grid-column:${start + 2} / span ${span}" data-act="open" data-id="${b.id}" title="${esc(guest(b.guestId).name)} · ${esc(fmtDate(b.checkIn))} → ${esc(fmtDate(b.checkOut))}">
        <span>${esc(guest(b.guestId).name)}</span>${H.totals(b).balance > 0.009 && b.status !== 'hold' ? '<i>●</i>' : ''}</button>`).join('');
      return `<div class="ch-row" style="grid-template-columns: var(--roomcol) repeat(${days}, minmax(var(--daycol), 1fr))"><div class="ch-room"><b>${esc(r.name)}</b><small>${esc(r.type)} · ${r.capacity}👤</small></div>${cells}${bars}</div>`;
    }).join('');
    $('chart').innerHTML = `<div class="ch-row ch-headrow" style="grid-template-columns: var(--roomcol) repeat(${days}, minmax(var(--daycol), 1fr))">${head}</div>${rows}`;
  }
  $('calFrom').onchange = () => { calFrom = $('calFrom').value || todayStr(); renderCalendar(); };
  $('calPrev').onclick = () => { calFrom = H.addDays(calFrom, -7); renderCalendar(); };
  $('calNext').onclick = () => { calFrom = H.addDays(calFrom, 7); renderCalendar(); };
  $('calToday').onclick = () => { calFrom = H.addDays(todayStr(), -1); renderCalendar(); };

  /* ================================================================ BOOKINGS LIST */
  function renderBookings() {
    const q = $('bkSearch').value.trim().toLowerCase(), f = $('bkFilter').value, td = todayStr();
    let list = db.bookings.slice();
    if (f === 'upcoming') list = list.filter((b) => H.LIVE.includes(b.status) && b.checkOut >= td);
    else if (f === 'hold') list = list.filter((b) => b.status === 'hold');
    else if (f === 'balance') list = list.filter((b) => !['cancelled', 'noshow'].includes(b.status) && H.totals(b).balance > 0.009);
    else if (f === 'cancelled') list = list.filter((b) => b.status === 'cancelled' || b.status === 'noshow');
    if (q) list = list.filter((b) => b.ref.toLowerCase().includes(q) || guest(b.guestId).name.toLowerCase().includes(q) || (b.otaRef || '').toLowerCase().includes(q) || room(b.roomId).name.toLowerCase() === q);
    list.sort((a, b) => (f === 'upcoming' ? a.checkIn.localeCompare(b.checkIn) : b.checkIn.localeCompare(a.checkIn)));
    $('bkTable').querySelector('tbody').innerHTML = list.slice(0, 300).map((b) => {
      const tt = H.totals(b);
      return `<tr data-act="open" data-id="${b.id}"><td>${esc(b.ref)}</td><td><b>${esc(guest(b.guestId).name)}</b></td><td>${esc(room(b.roomId).name)}</td>
        <td>${esc(fmtDate(b.checkIn))} → ${esc(fmtDate(b.checkOut))} <small>${tt.nights} ${esc(t('nightsShort'))}</small></td><td>${esc(t('src_' + b.source))}</td><td>${badge(b)}</td>
        <td class="num">${esc(money(tt.total))}</td><td class="num${tt.balance > 0.009 ? ' due' : ''}">${esc(money(tt.balance))}</td></tr>`;
    }).join('') || `<tr><td colspan="8" class="muted">${esc(t('none'))}</td></tr>`;
  }
  $('bkSearch').oninput = renderBookings; $('bkFilter').onchange = renderBookings;

  /* ================================================================ BOOKING FORM (new / edit) */
  function bookingForm(preset = {}) {
    const edit = preset.id ? booking(preset.id) : null;
    const st = {
      guestId: edit ? edit.guestId : preset.guestId || null,
      checkIn: edit ? edit.checkIn : preset.checkIn || todayStr(),
      checkOut: edit ? edit.checkOut : preset.checkOut || H.addDays(preset.checkIn || todayStr(), 1),
      roomId: edit ? edit.roomId : preset.roomId || null,
    };
    const srcOpts = H.SOURCES.map((s) => `<option value="${s}">${esc(t('src_' + s))}</option>`).join('');
    openModal(`<h2>${edit ? '✎ ' + esc(edit.ref) : '＋ ' + esc(t('newBooking'))}</h2>
      <div id="bfGuest"></div>
      <div class="grid4">
        <label><span>${esc(t('checkInDate'))}</span><input type="date" id="bfIn" value="${st.checkIn}"></label>
        <label><span>${esc(t('checkOutDate'))}</span><input type="date" id="bfOut" value="${st.checkOut}"></label>
        <label><span>${esc(t('adults'))}</span><input type="number" id="bfAdults" min="1" max="20" value="${edit ? edit.adults : preset.adults || 2}"></label>
        <label><span>${esc(t('children'))}</span><input type="number" id="bfKids" min="0" max="20" value="${edit ? edit.children : 0}"></label>
      </div>
      <p class="muted" id="bfNights"></p>
      <div id="bfRooms" class="roompick"></div>
      <div class="grid2">
        <label><span>${esc(t('rateOverride'))}</span><input type="number" id="bfRate" min="0" step="1" placeholder="${esc(t('rateAuto'))}" value="${edit && edit.rateOverride ? edit.nights[0]?.rate ?? '' : ''}"></label>
        <label><span>${esc(t('source'))}</span><select id="bfSource">${srcOpts}</select></label>
        <label><span>${esc(t('otaRef'))}</span><input id="bfOta" maxlength="40" value="${esc(edit?.otaRef)}"></label>
        ${edit ? '' : `<label><span>${esc(t('status'))}</span><select id="bfStatus"><option value="confirmed">${esc(t('s_confirmed'))}</option><option value="hold">${esc(t('holdOpt', { h: db.settings.holdHours }))}</option></select></label>`}
      </div>
      <label><span>${esc(t('notes'))}</span><textarea id="bfNotes" rows="2" maxlength="1000" placeholder="${esc(t('notesPh'))}">${esc(edit?.notes)}</textarea></label>
      <div class="totline" id="bfTotal"></div>
      <button class="btn primary big" id="bfSave">${esc(edit ? t('save') : t('createBooking'))}</button>`);
    $('bfSource').value = edit ? edit.source : preset.source || 'walkin';

    const drawGuest = () => {
      const box = $('bfGuest');
      if (st.guestId) {
        const g = guest(st.guestId);
        box.innerHTML = `<div class="pcard"><div><b>${esc(g.name)}</b><small>${esc(g.phone || '–')} · ${esc(g.nationality || '')}</small></div>${edit ? '' : '<button class="btn small ghost" id="bfChange">✕</button>'}</div>`;
        if (!edit) $('bfChange').onclick = () => { st.guestId = null; drawGuest(); };
        return;
      }
      box.innerHTML = `<label><span>${esc(t('guest'))}</span><input id="bfSearch" autocomplete="off" placeholder="${esc(t('guestSearchPh'))}"></label><div id="bfRes" class="results"></div>`;
      $('bfSearch').oninput = () => {
        const q = $('bfSearch').value.trim();
        $('bfRes').innerHTML = q ? H.searchGuests(db, q, 6).map((g) => `<button class="row" data-pick="${g.id}"><b>${esc(g.name)}</b><small>${esc(g.phone || '–')} · ${esc(g.nationality || '')} · ${H.guestHistory(db, g.id).length} ${esc(t('stays'))}</small></button>`).join('')
          + `<button class="row add" data-new="1">＋ ${esc(t('newGuestNamed', { name: q }))}</button>` : '';
      };
      $('bfRes').onclick = (e) => {
        const b = e.target.closest('button'); if (!b) return;
        if (b.dataset.pick) { st.guestId = b.dataset.pick; drawGuest(); return; }
        const snap = { ...collect(), guestId: null };
        guestForm({ name: $('bfSearch').value.trim() }, (g) => bookingForm({ ...snap, guestId: g.id }));
      };
      setTimeout(() => $('bfSearch')?.focus(), 30);
    };
    const collect = () => ({ checkIn: $('bfIn').value, checkOut: $('bfOut').value, roomId: st.roomId, adults: $('bfAdults').value, source: $('bfSource').value });
    const drawRooms = () => {
      st.checkIn = $('bfIn').value; st.checkOut = $('bfOut').value;
      const ok = H.validDate(st.checkIn) && H.validDate(st.checkOut) && st.checkOut > st.checkIn;
      const people = (Number($('bfAdults').value) || 1) + (Number($('bfKids').value) || 0);
      if (!ok) { $('bfNights').textContent = t('e_dates'); $('bfRooms').innerHTML = ''; $('bfTotal').innerHTML = ''; return; }
      const n = H.nightsBetween(st.checkIn, st.checkOut);
      $('bfNights').textContent = `${fmtLong(st.checkIn)} → ${fmtLong(st.checkOut)} · ${n} ${t(n === 1 ? 'night' : 'nights')}`;
      const free = new Set(H.availableRooms(db, st.checkIn, st.checkOut, 1, edit?.id).map((r) => r.id));
      const rate = $('bfRate').value;
      $('bfRooms').innerHTML = db.rooms.filter((r) => r.active).map((r) => {
        const avail = free.has(r.id), fits = r.capacity + 1 >= people;
        const price = H.nightRates(db, r.id, st.checkIn, st.checkOut, rate === '' ? undefined : rate).reduce((s, x) => s + x.rate, 0);
        return `<button type="button" class="rp${r.id === st.roomId ? ' on' : ''}" data-room="${r.id}" ${avail ? '' : 'disabled'}>
          <b>${esc(r.name)}</b><small>${esc(r.type)} · ${r.capacity}👤${fits ? '' : ' ⚠'}</small><span>${avail ? esc(money(price)) : esc(t('booked'))}</span></button>`;
      }).join('');
      if (st.roomId && !free.has(st.roomId)) st.roomId = null;
      if (st.roomId) {
        const nights = H.nightRates(db, st.roomId, st.checkIn, st.checkOut, rate === '' ? undefined : rate);
        const sum = nights.reduce((s, x) => s + x.rate, 0);
        $('bfTotal').innerHTML = `${esc(room(st.roomId).name)}: ${nights.length} × ${[...new Set(nights.map((x) => money(x.rate)))].map(esc).join(' / ')} = <b>${esc(money(sum))}</b>${edit && (edit.extras.length || edit.discount) ? ` <small>(${esc(t('plusExtras'))})</small>` : ''}`;
      } else $('bfTotal').innerHTML = `<span class="muted">${esc(t('chooseRoom'))}</span>`;
    };
    $('bfRooms').onclick = (e) => { const b = e.target.closest('[data-room]'); if (b && !b.disabled) { st.roomId = b.dataset.room; drawRooms(); } };
    ['bfIn', 'bfOut', 'bfAdults', 'bfKids', 'bfRate'].forEach((id) => { $(id).oninput = drawRooms; });
    $('bfIn').onchange = () => { if ($('bfOut').value <= $('bfIn').value) $('bfOut').value = H.addDays($('bfIn').value, 1); drawRooms(); };
    $('bfSave').onclick = () => {
      if (!st.guestId) { toast('⚠ ' + t('chooseGuest'), 4000); return; }
      if (!st.roomId) { toast('⚠ ' + t('chooseRoom'), 4000); return; }
      const data = { guestId: st.guestId, roomId: st.roomId, checkIn: $('bfIn').value, checkOut: $('bfOut').value, adults: $('bfAdults').value, children: $('bfKids').value,
        rate: $('bfRate').value, source: $('bfSource').value, otaRef: $('bfOta').value, notes: $('bfNotes').value };
      if (edit) {
        if (!edit.rateOverride && data.rate === '') delete data.rate;
        const r = act(() => H.updateBooking(db, edit.id, data), t('saved'));
        if (r) openBooking(edit.id);
      } else {
        data.status = $('bfStatus').value;
        const r = act(() => H.createBooking(db, data), (b) => t('bookingCreated', { ref: b.ref }));
        if (r) openBooking(r.id, true);
      }
    };
    drawGuest(); drawRooms();
  }

  /* ================================================================ BOOKING DETAIL */
  function openBooking(id, justCreated = false) {
    const b = booking(id); if (!b) return closeModal();
    const g = guest(b.guestId), r = room(b.roomId), tt = H.totals(b);
    const live = H.LIVE.includes(b.status), td = todayStr();
    const foreign = H.isForeign(db, g);
    const extraOpts = db.settings.extras.map((x) => `<option value="${x.id}">${esc(x.name)} · ${esc(money(x.price))} ${esc(t('per_' + x.per))}</option>`).join('');
    const rateSummary = (() => {
      const groups = {};
      for (const n of b.nights) groups[n.rate] = (groups[n.rate] || 0) + 1;
      return Object.entries(groups).map(([rate, c]) => `${c} × ${money(Number(rate))}`).join(' + ');
    })();
    openModal(`<div class="bhead"><h2>${esc(b.ref)} · ${esc(g.name)}</h2>${badge(b)}</div>
      ${justCreated ? `<div class="note ok">✓ ${esc(t('bookingCreated', { ref: b.ref }))}</div>` : ''}
      <p class="muted">${esc(g.phone || t('noPhone'))}${g.email ? ' · ' + esc(g.email) : ''}${g.nationality ? ' · ' + esc(g.nationality) : ''}
        · <button class="link" data-act="guest" data-id="${g.id}">${esc(t('guestFile'))}</button></p>
      <div class="staybox">
        <div><small>${esc(t('room'))}</small><b>${esc(r.name)}</b><small>${esc(r.type)}</small></div>
        <div><small>${esc(t('checkInDate'))}</small><b>${esc(fmtLong(b.checkIn))}</b><small>${esc(t('from'))} ${esc(db.settings.checkInTime)}</small></div>
        <div><small>${esc(t('checkOutDate'))}</small><b>${esc(fmtLong(b.checkOut))}</b><small>${esc(t('by'))} ${esc(db.settings.checkOutTime)}</small></div>
        <div><small>${esc(t('guests'))}</small><b>${b.adults} + ${b.children}</b><small>${esc(t('src_' + b.source))}${b.otaRef ? ' · ' + esc(b.otaRef) : ''}</small></div>
      </div>
      ${b.holdUntil ? `<div class="note warn">⏰ ${esc(t('holdUntil', { time: new Date(b.holdUntil).toLocaleString(loc(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }))}</div>` : ''}
      ${b.notes ? `<p class="pre note">${esc(b.notes)}</p>` : ''}
      ${b.cancelReason ? `<p class="muted">${esc(t('cancelReason'))}: ${esc(b.cancelReason)}</p>` : ''}
      ${db.settings.tm30 && foreign && b.status !== 'cancelled' ? `<label class="check tm30"><input type="checkbox" data-act="tm30" data-id="${b.id}" ${b.tm30 ? 'checked' : ''}> 🛂 ${esc(t('tm30Done'))}</label>` : ''}

      <div class="actions">
        ${b.status === 'hold' ? `<button class="btn" data-act="confirm" data-id="${b.id}">✓ ${esc(t('confirmBtn'))}</button>` : ''}
        ${(b.status === 'confirmed' || b.status === 'hold') && b.checkIn <= td ? `<button class="btn primary" data-act="checkin" data-id="${b.id}">🔑 ${esc(t('checkInBtn'))}</button>` : ''}
        ${b.status === 'in' ? `<button class="btn primary" data-act="checkout" data-id="${b.id}">🛫 ${esc(t('checkOutBtn'))}</button>` : ''}
        ${live ? `<button class="btn" data-act="edit" data-id="${b.id}">✎ ${esc(t('changeBtn'))}</button>` : ''}
        <button class="btn" data-act="invoice" data-id="${b.id}">🖨 ${esc(b.status === 'out' || tt.balance <= 0 ? t('receipt') : t('invoice'))}</button>
        ${b.status === 'confirmed' || b.status === 'hold' ? `<button class="btn ghost" data-act="noshow" data-id="${b.id}">${esc(t('noShowBtn'))}</button><button class="btn danger" data-act="cancel" data-id="${b.id}">✕ ${esc(t('cancelBtn'))}</button>` : ''}
        ${b.status === 'cancelled' || b.status === 'noshow' ? `<button class="btn" data-act="reinstate" data-id="${b.id}">↺ ${esc(t('reinstateBtn'))}</button>` : ''}
      </div>
      <div class="actions msgs">
        <span class="muted">💬</span>
        <button class="btn small" data-act="msg" data-kind="confirm" data-id="${b.id}">${esc(t('msgConfirm'))}</button>
        <button class="btn small" data-act="msg" data-kind="arrival" data-id="${b.id}">${esc(t('msgArrival'))}</button>
        <button class="btn small" data-act="msg" data-kind="thanks" data-id="${b.id}">${esc(t('msgThanks'))}</button>
      </div>

      <h3>${esc(t('charges'))}</h3>
      <table class="table lines">
        <tr><td>${esc(t('roomNights', { room: r.name }))}<small>${esc(rateSummary)}</small></td><td class="num">${esc(money(tt.room))}</td><td></td></tr>
        ${b.extras.map((x) => `<tr><td>${esc(x.name)}<small>${x.qty} × ${esc(money(x.price))}</small></td><td class="num">${esc(money(x.price * x.qty))}</td><td><button class="btn small ghost" data-act="rmExtra" data-id="${b.id}" data-line="${x.id}">✕</button></td></tr>`).join('')}
        ${tt.discount ? `<tr><td>${esc(t('discount'))}</td><td class="num">−${esc(money(tt.discount))}</td><td><button class="btn small ghost" data-act="rmDiscount" data-id="${b.id}">✕</button></td></tr>` : ''}
        <tr class="tot"><td>${esc(t('total'))}</td><td class="num">${esc(money(tt.total))}</td><td></td></tr>
      </table>
      ${b.status !== 'cancelled' && b.status !== 'noshow' ? `<div class="addrow">
        <select id="exSel">${extraOpts}<option value="custom">${esc(t('otherExtra'))}</option></select>
        <input id="exName" placeholder="${esc(t('extraName'))}" hidden maxlength="80"><input id="exPrice" type="number" min="0" placeholder="${esc(t('price'))}" hidden>
        <input id="exQty" type="number" min="1" placeholder="${esc(t('qtyAuto'))}">
        <button class="btn small" data-act="addExtra" data-id="${b.id}">＋ ${esc(t('add'))}</button>
        <button class="btn small ghost" data-act="discount" data-id="${b.id}">％ ${esc(t('discount'))}</button>
      </div>` : ''}

      <h3>${esc(t('payments'))}</h3>
      <div class="list">${b.payments.map((p) => `<div class="prow"><span>${esc(new Date(p.at).toLocaleDateString(loc(), { day: 'numeric', month: 'short' }))}</span><b>${esc(t('m_' + p.method))}</b><small>${esc(p.note)}</small><span class="num${p.amount < 0 ? ' due' : ''}">${esc(money(p.amount))}</span><button class="btn small ghost" data-act="rmPay" data-id="${b.id}" data-pay="${p.id}">✕</button></div>`).join('') || `<p class="muted">${esc(t('noPayments'))}</p>`}</div>
      <div class="totline big">${esc(t('paid'))} <b>${esc(money(tt.paid))}</b> · ${esc(t('balance'))} <b class="${tt.balance > 0.009 ? 'due' : 'okc'}">${esc(money(tt.balance))}</b></div>
      ${b.status !== 'cancelled' || tt.paid > 0 ? `<div class="addrow">
        <input id="payAmt" type="number" step="any" value="${tt.balance > 0 ? tt.balance : ''}" placeholder="${esc(t('amount'))}">
        <select id="payMethod">${H.METHODS.map((m) => `<option value="${m}">${esc(t('m_' + m))}</option>`).join('')}</select>
        <input id="payNote" maxlength="120" placeholder="${esc(t('payNotePh'))}">
        <button class="btn small primary" data-act="pay" data-id="${b.id}">＋ ${esc(t('addPayment'))}</button>
      </div><div id="ppBox" class="ppbox" hidden></div>` : ''}`, () => openBooking(id));

    const sel = $('exSel');
    if (sel) sel.onchange = () => { const c = sel.value === 'custom'; $('exName').hidden = !c; $('exPrice').hidden = !c; };
    const pm = $('payMethod');
    if (pm) {
      const drawPP = () => {
        const box = $('ppBox'), amt = Number($('payAmt').value);
        box.hidden = pm.value !== 'promptpay';
        if (box.hidden) return;
        box.innerHTML = '';
        if (!db.settings.promptpayId) { box.innerHTML = `<p class="muted">${esc(t('setPromptpay'))}</p>`; return; }
        try {
          const payload = H.promptPayPayload(db.settings.promptpayId, amt > 0 ? amt : undefined);
          box.innerHTML = `<div id="ppQr"></div><p>${esc(t('scanToPay', { v: money(amt || 0) }))}</p>`;
          qr($('ppQr'), payload);
        } catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
      };
      pm.onchange = drawPP; $('payAmt').oninput = drawPP;
    }
  }
  const refresh = () => { if (modalStack[0] && !$('modal').hidden) modalStack[0](); };

  /* ---------------------------------------------------------------- check-out with money due */
  function checkoutFlow(id) {
    const b = booking(id), tt = H.totals(b);
    if (tt.balance > 0.009) {
      openBooking(id);
      toast('⚠ ' + t('e_balance', { amount: money(tt.balance) }) + ' — ' + t('payFirst'), 6000);
      if (confirm(t('checkoutAnyway', { amount: money(tt.balance) }))) {
        if (act(() => H.checkOut(db, id, Date.now(), true), t('checkedOut'))) openBooking(id);
      }
      return;
    }
    if (act(() => H.checkOut(db, id), t('checkedOut'))) {
      openBooking(id);
      if (guest(b.guestId).phone) setTimeout(() => toast('💬 ' + t('sendThanksHint'), 5000), 300);
    }
  }

  /* ---------------------------------------------------------------- messages */
  const TPL = { confirm: ['confirmMsg', 'confirmDefault'], arrival: ['arrivalMsg', 'arrivalDefault'], thanks: ['thanksMsg', 'thanksDefault'] };
  const template = (kind) => db.settings[TPL[kind][0]] || t(TPL[kind][1]);
  function msgVars(b) {
    const g = guest(b.guestId), r = room(b.roomId), tt = H.totals(b), s = db.settings;
    return {
      name: g.name, ref: b.ref, room: `${r.name}${r.type ? ' (' + r.type + ')' : ''}`, checkin: fmtLong(b.checkIn), checkout: fmtLong(b.checkOut), nights: tt.nights,
      guests: b.adults + b.children, total: money(tt.total), paid: money(tt.paid), balance: tt.balance > 0.009 ? money(tt.balance) : '',
      property: s.name, phone: s.phone, address: s.address, map: s.mapLink, wifi: s.wifi, checkintime: s.checkInTime, checkouttime: s.checkOutTime,
      rules: s.houseRules, review: s.reviewLink, bank: s.bankInfo, promptpay: s.promptpayId,
    };
  }
  function messageDialog(b, kind) {
    const g = guest(b.guestId);
    const text = H.fillMessage(template(kind), msgVars(b));
    openModal(`<h2>💬 ${esc(t('msg' + kind[0].toUpperCase() + kind.slice(1)))}</h2>
      <label><span>${esc(t('phone'))}</span><input id="msPhone" value="${esc(g.phone)}"></label>
      <label><span>${esc(t('message'))}</span><textarea id="msText" rows="12">${esc(text)}</textarea></label>
      <div class="sendrow">
        <button class="btn wa" data-ch="whatsapp">WhatsApp</button><button class="btn line" data-ch="line">LINE</button>
        <button class="btn" data-ch="sms">SMS</button>${g.email ? `<button class="btn" data-ch="email">✉ Email</button>` : ''}<button class="btn ghost" data-ch="copy">📋 ${esc(t('copy'))}</button>
      </div><p class="muted">${esc(t('lineHelp'))}</p>
      <button class="btn ghost" data-act="open" data-id="${b.id}">← ${esc(b.ref)}</button>`);
    $('mBody').querySelector('.sendrow').onclick = async (e) => {
      const x = e.target.closest('[data-ch]'); if (!x) return;
      const phone = $('msPhone').value.trim(), body = $('msText').value.trim();
      if (x.dataset.ch === 'copy') { try { await navigator.clipboard.writeText(body); toast(t('copied')); } catch { $('msText').select(); } return; }
      if (x.dataset.ch === 'email') { openLink(`mailto:${encodeURIComponent(g.email)}?subject=${encodeURIComponent(db.settings.name + ' · ' + b.ref)}&body=${encodeURIComponent(body)}`); return; }
      if (x.dataset.ch !== 'line' && phone.replace(/\D/g, '').length < 8) { toast('⚠ ' + t('e_noPhone'), 4000); return; }
      openLink(H.messageLinks(phone, body, db.settings.countryCode)[x.dataset.ch]);
    };
  }

  /* ---------------------------------------------------------------- invoice / receipt */
  function printInvoice(b) {
    const g = guest(b.guestId), r = room(b.roomId), tt = H.totals(b), s = db.settings;
    const isReceipt = b.status === 'out' || tt.balance <= 0.009;
    $('print').innerHTML = `<div class="ihead"><div><h1>${esc(s.name)}</h1><div>${esc(s.address)}</div><div>${esc(s.phone)}${s.email ? ' · ' + esc(s.email) : ''}</div></div>
        <div class="iright"><h2>${esc(isReceipt ? t('receipt') : t('invoice'))}</h2><div>${esc(b.ref)}</div><div>${esc(new Date().toLocaleDateString(loc()))}</div></div></div>
      <div class="iguest"><b>${esc(g.name)}</b>${g.phone ? '<br>' + esc(g.phone) : ''}${g.email ? '<br>' + esc(g.email) : ''}</div>
      <p>${esc(t('room'))} ${esc(r.name)}${r.type ? ' · ' + esc(r.type) : ''} · ${esc(fmtLong(b.checkIn))} → ${esc(fmtLong(b.checkOut))} · ${tt.nights} ${esc(t(tt.nights === 1 ? 'night' : 'nights'))} · ${b.adults + b.children} ${esc(t('guests'))}</p>
      <table><tr><th>${esc(t('item'))}</th><th class="num">${esc(t('qty'))}</th><th class="num">${esc(t('price'))}</th><th class="num">${esc(t('amount'))}</th></tr>
        ${Object.entries(b.nights.reduce((m, n) => { m[n.rate] = (m[n.rate] || 0) + 1; return m; }, {})).map(([rate, c]) => `<tr><td>${esc(t('roomNights', { room: r.name }))}</td><td class="num">${c}</td><td class="num">${esc(money(Number(rate)))}</td><td class="num">${esc(money(c * Number(rate)))}</td></tr>`).join('')}
        ${b.extras.map((x) => `<tr><td>${esc(x.name)}</td><td class="num">${x.qty}</td><td class="num">${esc(money(x.price))}</td><td class="num">${esc(money(x.qty * x.price))}</td></tr>`).join('')}
        ${tt.discount ? `<tr><td colspan="3">${esc(t('discount'))}</td><td class="num">−${esc(money(tt.discount))}</td></tr>` : ''}
        <tr class="tot"><td colspan="3">${esc(t('total'))}</td><td class="num">${esc(money(tt.total))}</td></tr>
        ${b.payments.map((p) => `<tr><td colspan="3">${esc(t('paidOn', { method: t('m_' + p.method), date: new Date(p.at).toLocaleDateString(loc()) }))}</td><td class="num">−${esc(money(p.amount))}</td></tr>`).join('')}
        <tr class="tot"><td colspan="3">${esc(t('balance'))}</td><td class="num">${esc(money(Math.max(0, tt.balance)))}</td></tr></table>
      ${!isReceipt && tt.balance > 0 ? `<div class="ipay">${s.promptpayId ? `<div id="iQr"></div>` : ''}<div>${s.promptpayId ? esc(t('payPromptpay', { id: s.promptpayId })) + '<br>' : ''}${s.bankInfo ? esc(s.bankInfo) : ''}</div></div>` : ''}
      <p class="ithanks">${esc(t('invoiceThanks'))}</p>`;
    if (!isReceipt && tt.balance > 0 && s.promptpayId) { try { qr($('iQr'), H.promptPayPayload(s.promptpayId, tt.balance), 140); } catch { /* bad id: shown in settings */ } }
    setTimeout(() => window.print(), 150);
  }

  /* ================================================================ GUESTS */
  function renderGuests() {
    const q = $('gSearch').value.trim();
    const list = q ? H.searchGuests(db, q, 300) : db.guests.slice(-300).reverse();
    $('gTable').querySelector('tbody').innerHTML = list.map((g) => {
      const h = H.guestHistory(db, g.id).filter((b) => b.status !== 'cancelled' && b.status !== 'noshow');
      return `<tr data-act="guest" data-id="${g.id}"><td><b>${esc(g.name)}</b>${h.length > 1 ? ' <span class="badge s-in">★</span>' : ''}</td><td>${esc(g.phone)}</td><td>${esc(g.nationality)}</td><td>${h.length}</td><td>${h[0] ? esc(fmtLong(h[0].checkIn)) : ''}</td></tr>`;
    }).join('') || `<tr><td colspan="5" class="muted">${esc(t('none'))}</td></tr>`;
  }
  $('gSearch').oninput = renderGuests;
  $('gNew').onclick = () => guestForm({}, (g) => openGuest(g.id));
  function guestForm(g = {}, onSaved) {
    openModal(`<h2>${g.id ? '✎ ' + esc(g.name) : '＋ ' + esc(t('newGuest'))}</h2>
      <form id="gfForm">
        <label><span>${esc(t('name'))} *</span><input id="gfName" maxlength="100" value="${esc(g.name)}" required></label>
        <div class="grid2">
          <label><span>${esc(t('phone'))}</span><input id="gfPhone" inputmode="tel" maxlength="20" value="${esc(g.phone)}" placeholder="${esc(t('phonePh'))}"></label>
          <label><span>${esc(t('email'))}</span><input id="gfEmail" type="email" maxlength="120" value="${esc(g.email)}"></label>
          <label><span>${esc(t('nationality'))}</span><input id="gfNat" maxlength="40" list="natList" value="${esc(g.nationality)}"></label>
          <label><span>${esc(t('idNo'))}</span><input id="gfId" maxlength="40" value="${esc(g.idNo)}"></label>
        </div>
        <datalist id="natList">${['Thai', 'Chinese', 'Malaysian', 'Singaporean', 'Japanese', 'Korean', 'Indian', 'Sri Lankan', 'Lao', 'Myanmar', 'Cambodian', 'Vietnamese', 'Russian', 'German', 'French', 'British', 'American', 'Australian', 'Dutch', 'Israeli'].map((n) => `<option value="${n}">`).join('')}</datalist>
        <label><span>${esc(t('notes'))}</span><textarea id="gfNotes" rows="2" maxlength="1000" placeholder="${esc(t('guestNotesPh'))}">${esc(g.notes)}</textarea></label>
        <button class="btn primary big">${esc(t('save'))}</button>
      </form>`);
    $('gfForm').onsubmit = (e) => {
      e.preventDefault();
      const r = act(() => H.saveGuest(db, { id: g.id, name: $('gfName').value, phone: $('gfPhone').value, email: $('gfEmail').value, nationality: $('gfNat').value, idNo: $('gfId').value, notes: $('gfNotes').value }), t('saved'));
      if (r && onSaved) onSaved(r);
    };
  }
  function openGuest(id) {
    const g = db.guests.find((x) => x.id === id); if (!g) return;
    const h = H.guestHistory(db, id);
    const spent = h.filter((b) => b.status === 'out' || b.status === 'in').reduce((s, b) => s + H.totals(b).total, 0);
    openModal(`<h2>👤 ${esc(g.name)}</h2>
      <p class="muted">${esc(g.phone || t('noPhone'))}${g.email ? ' · ' + esc(g.email) : ''}${g.nationality ? ' · ' + esc(g.nationality) : ''}${g.idNo ? ' · ' + esc(t('idNo')) + ' ' + esc(g.idNo) : ''}</p>
      ${g.notes ? `<p class="pre note">${esc(g.notes)}</p>` : ''}
      <p>${esc(t('guestSummary', { n: h.filter((b) => b.status === 'out').length, v: money(spent) }))}</p>
      <div class="btnrow"><button class="btn primary" data-act="bookFor" data-id="${g.id}">＋ ${esc(t('newBooking'))}</button><button class="btn" data-act="editGuest" data-id="${g.id}">✎ ${esc(t('editBtn'))}</button></div>
      <h3>${esc(t('stays'))}</h3>
      <div class="list">${h.map((b) => `<div class="brow" data-act="open" data-id="${b.id}"><span class="rname">${esc(room(b.roomId).name)}</span><div class="binfo"><b>${esc(fmtLong(b.checkIn))} → ${esc(fmtDate(b.checkOut))}</b><small>${esc(b.ref)} · ${esc(money(H.totals(b).total))}</small></div>${badge(b)}</div>`).join('') || `<p class="muted">${esc(t('none'))}</p>`}</div>`);
  }

  /* ================================================================ REPORTS */
  const monthStart = (d) => d.slice(0, 8) + '01';
  const monthEnd = (d) => { const x = new Date(d.slice(0, 7) + '-01T12:00:00'); x.setMonth(x.getMonth() + 1); x.setDate(0); return H.dateStr(x); };
  let rpFrom = monthStart(todayStr()), rpTo = monthEnd(todayStr());
  function renderReports() {
    $('rpFrom').value = rpFrom; $('rpTo').value = rpTo;
    const r = H.report(db, rpFrom, rpTo);
    const card = (v, label, cls = '') => `<div class="card ${cls}"><b>${v}</b><span>${esc(label)}</span></div>`;
    $('rpCards').innerHTML = card(r.occupancy + '%', t('rOcc', { n: r.nightsSold, a: r.roomsAvail })) + card(esc(money(r.roomRevenue)), t('rRoomRev'))
      + card(esc(money(r.adr)), t('rAdr')) + card(esc(money(r.revpar)), t('rRevpar')) + card(esc(money(r.extras)), t('rExtras'))
      + card(esc(money(r.received)), t('rReceived')) + card(r.bookings, t('rBookings')) + card(r.avgStay, t('rAvgStay'))
      + card(r.cancelled + ' / ' + r.noshow, t('rCancelNoshow')) + card(r.foreign + ' / ' + r.guests, t('rForeign'));
    const table = (obj, label) => {
      const rows = Object.entries(obj).sort((a, b) => b[1] - a[1]);
      const tot = rows.reduce((s, x) => s + x[1], 0) || 1;
      return rows.map(([k, v]) => `<tr><td>${esc(label(k))}</td><td class="num">${esc(money(v))}</td><td class="num">${Math.round(v / tot * 100)}%</td></tr>`).join('') || `<tr><td class="muted">–</td></tr>`;
    };
    $('rpSource').innerHTML = table(r.bySource, (k) => t('src_' + k));
    $('rpRoom').innerHTML = table(r.byRoom, (k) => room(k).name);
    const nRooms = db.rooms.filter((x) => x.active).length || 1;
    const days = Array.from({ length: Math.min(r.days, 62) }, (_, i) => H.addDays(rpFrom, i));
    $('rpDays').innerHTML = days.map((d) => `<div class="dbar" title="${esc(fmtDate(d))}: ${r.byDate[d] || 0}/${nRooms}"><i style="height:${(r.byDate[d] || 0) / nRooms * 100}%"></i><small>${new Date(d + 'T12:00:00').getDate()}</small></div>`).join('');
    $('rpOut').innerHTML = r.outstanding.map((o) => { const b = booking(o.id); return bRow(b); }).join('') || `<p class="muted">${esc(t('none'))}</p>`;
  }
  document.querySelectorAll('[data-range]').forEach((b) => {
    b.onclick = () => {
      const td = todayStr();
      if (b.dataset.range === 'month') { rpFrom = monthStart(td); rpTo = monthEnd(td); }
      if (b.dataset.range === 'last') { const lm = H.addDays(monthStart(td), -1); rpFrom = monthStart(lm); rpTo = lm; }
      if (b.dataset.range === 'next30') { rpFrom = td; rpTo = H.addDays(td, 29); }
      renderReports();
    };
  });
  $('rpFrom').onchange = () => { rpFrom = $('rpFrom').value || todayStr(); if (rpFrom > rpTo) rpTo = rpFrom; renderReports(); };
  $('rpTo').onchange = () => { rpTo = $('rpTo').value || todayStr(); if (rpTo < rpFrom) rpFrom = rpTo; renderReports(); };
  $('rpCsv').onclick = () => download(`bookings-${rpFrom}_${rpTo}.csv`, H.bookingsCsv(db, rpFrom, rpTo), 'text/csv;charset=utf-8');

  /* ================================================================ SETTINGS */
  const TPL_KEYS = { sConfirm: 'confirm', sArrival: 'arrival', sThanks: 'thanks' };
  function renderSettings() {
    const s = db.settings;
    if (!$('setForm').contains(document.activeElement)) {
      $('sName').value = s.name; $('sAddress').value = s.address; $('sPhone').value = s.phone; $('sEmail').value = s.email; $('sMap').value = s.mapLink;
      $('sLang').innerHTML = I18N.LANGS.map((l) => `<option value="${l}">${I18N.LANG_NAMES[l]}</option>`).join(''); $('sLang').value = s.language;
      $('sCur').value = s.currency; $('sCin').value = s.checkInTime; $('sCout').value = s.checkOutTime; $('sCC').value = s.countryCode; $('sHold').value = s.holdHours;
      $('sWeekend').innerHTML = [1, 2, 3, 4, 5, 6, 0].map((n) => `<label class="chip"><input type="checkbox" value="${n}" ${s.weekendNights.includes(n) ? 'checked' : ''}> ${esc(t('dow' + n))}</label>`).join('');
      $('sPP').value = s.promptpayId; $('sBank').value = s.bankInfo; $('sWifi').value = s.wifi; $('sRules').value = s.houseRules; $('sReview').value = s.reviewLink;
      $('sTm30').checked = s.tm30; $('sHome').value = s.homeNationality; $('sPin').value = s.pin;
      for (const [el, kind] of Object.entries(TPL_KEYS)) $(el).value = template(kind);
    }
    $('roomTable').innerHTML = `<tr><th>${esc(t('room'))}</th><th>${esc(t('roomType'))}</th><th>👤</th><th class="num">${esc(t('price'))}</th><th class="num">${esc(t('weekend'))}</th><th></th></tr>`
      + db.rooms.map((r) => `<tr class="${r.active ? '' : 'off'}"><td><b>${esc(r.name)}</b></td><td>${esc(r.type)}</td><td>${r.capacity}</td><td class="num">${esc(money(r.price))}</td><td class="num">${esc(money(r.weekendPrice))}</td>
        <td><button class="btn small" data-act="editRoom" data-id="${r.id}">✎</button></td></tr>`).join('');
    $('extrasList').innerHTML = s.extras.map((x, i) => `<div class="exrow" data-i="${i}">
      <input class="exN" value="${esc(x.name)}" maxlength="80"><input class="exP" type="number" min="0" value="${x.price}">
      <select class="exPer">${['once', 'night', 'person-night'].map((p) => `<option value="${p}" ${x.per === p ? 'selected' : ''}>${esc(t('per_' + p))}</option>`).join('')}</select>
      <button class="btn small ghost" data-act="rmExtraDef" data-i="${i}">✕</button></div>`).join('');
    let kb = 0; try { kb = Math.round((localStorage.getItem(H.DB_KEY) || '').length / 1024); } catch { /* ignore */ }
    $('dataInfo').textContent = t('dataInfo', { g: db.guests.length, b: db.bookings.length, kb });
  }
  $('extrasList').addEventListener('change', (e) => {
    const row = e.target.closest('.exrow'); if (!row) return;
    const x = db.settings.extras[Number(row.dataset.i)];
    x.name = row.querySelector('.exN').value.trim() || x.name;
    x.price = Math.max(0, Number(row.querySelector('.exP').value) || 0);
    x.per = row.querySelector('.exPer').value;
    save(); toast(t('saved'));
  });
  $('extraAdd').onclick = () => { db.settings.extras.push({ id: H.uid(), name: t('newExtra'), price: 0, per: 'once' }); save(); renderSettings(); };
  $('setForm').onsubmit = (e) => {
    e.preventDefault();
    const pin = $('sPin').value.trim();
    if (pin && !/^\d{4,8}$/.test(pin)) { toast('⚠ ' + t('e_pin'), 4000); return; }
    const pp = $('sPP').value.replace(/\D/g, '');
    if (pp) { try { H.promptPayPayload(pp); } catch (err) { toast('⚠ ' + err.message, 5000); return; } }
    const wk = [...document.querySelectorAll('#sWeekend input:checked')].map((x) => Number(x.value));
    const tpl = (el) => { const v = $(el).value.trim(); return v === t(TPL[TPL_KEYS[el]][1]).trim() ? '' : v; };   // default text follows the language
    Object.assign(db.settings, {
      name: $('sName').value.trim() || 'Homestay', address: $('sAddress').value.trim(), phone: $('sPhone').value.trim(), email: $('sEmail').value.trim(), mapLink: $('sMap').value.trim(),
      language: $('sLang').value, currency: $('sCur').value.trim() || '฿', checkInTime: $('sCin').value || '14:00', checkOutTime: $('sCout').value || '11:00',
      countryCode: $('sCC').value.replace(/\D/g, '') || '66', holdHours: Math.min(336, Math.max(1, Math.round(Number($('sHold').value) || 24))), weekendNights: wk,
      promptpayId: pp, bankInfo: $('sBank').value.trim(), wifi: $('sWifi').value.trim(), houseRules: $('sRules').value.trim(), reviewLink: $('sReview').value.trim(),
      tm30: $('sTm30').checked, homeNationality: $('sHome').value.trim(), pin,
      confirmMsg: tpl('sConfirm'), arrivalMsg: tpl('sArrival'), thanksMsg: tpl('sThanks'),
    });
    if (pin) try { sessionStorage.setItem('hs_unlocked', '1'); } catch { /* ignore */ }
    save(); document.activeElement.blur(); applyLang(); renderAll(); toast(t('saved'));
  };
  $('sLang').onchange = () => { db.settings.language = $('sLang').value; save(); applyLang(); document.activeElement.blur(); renderAll(); };

  function roomForm(r) {
    r = r || { name: '', type: '', capacity: 2, price: 800, weekendPrice: 1000, active: true, notes: '' };
    openModal(`<h2>${r.id ? '✎ ' + esc(r.name) : esc(t('addRoom'))}</h2>
      <form id="rfForm">
        <div class="grid2">
          <label><span>${esc(t('roomName'))} *</span><input id="rfName" maxlength="40" value="${esc(r.name)}" required placeholder="101"></label>
          <label><span>${esc(t('roomType'))}</span><input id="rfType" maxlength="60" value="${esc(r.type)}" placeholder="${esc(t('roomTypePh'))}"></label>
          <label><span>${esc(t('capacity'))}</span><input id="rfCap" type="number" min="1" max="20" value="${r.capacity}"></label>
          <label><span>${esc(t('price'))} / ${esc(t('night'))}</span><input id="rfPrice" type="number" min="0" value="${r.price}"></label>
          <label><span>${esc(t('weekend'))} / ${esc(t('night'))}</span><input id="rfWk" type="number" min="0" value="${r.weekendPrice}"></label>
        </div>
        <label><span>${esc(t('notes'))}</span><input id="rfNotes" maxlength="300" value="${esc(r.notes)}"></label>
        <label class="check"><input type="checkbox" id="rfActive" ${r.active ? 'checked' : ''}> ${esc(t('roomOpen'))}</label>
        <div class="btnrow"><button class="btn primary big">${esc(t('save'))}</button>${r.id ? `<button type="button" class="btn danger" id="rfDel">${esc(t('removeRoom'))}</button>` : ''}</div>
      </form>`);
    $('rfForm').onsubmit = (e) => {
      e.preventDefault();
      if (act(() => H.saveRoom(db, { id: r.id, name: $('rfName').value, type: $('rfType').value, capacity: $('rfCap').value, price: $('rfPrice').value, weekendPrice: $('rfWk').value, notes: $('rfNotes').value, active: $('rfActive').checked }), t('saved'))) closeModal();
    };
    if (r.id) $('rfDel').onclick = () => {
      if (!confirm(t('confirmRemoveRoom', { name: r.name }))) return;
      const res = act(() => H.removeRoom(db, r.id));
      if (res) { toast(res === 'closed' ? t('roomClosed') : t('deleted'), 5000); closeModal(); }
    };
  }
  $('roomAdd').onclick = () => roomForm(null);

  $('bkExport').onclick = () => download(`homestay-backup-${todayStr()}.json`, H.exportData(db), 'application/json');
  $('bkImport').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    try {
      const next = H.importData(await f.text());
      if (!confirm(t('confirmRestore', { g: next.guests.length, b: next.bookings.length }))) return;
      db = next; save(); applyLang(); renderAll(); toast(t('restored'));
    } catch (err) { toast('⚠ ' + err.message, 5000); }
  };
  $('bkErase').onclick = () => {
    const word = t('eraseWord');
    if (prompt(t('confirmErase', { word })) !== word) return;
    db = H.defaultsDb(); db.settings.language = I18N.lang; save(); applyLang(); renderAll(); toast(t('erased'));
  };

  /* ================================================================ click actions */
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
    if (b.matches('input[type=checkbox]') && b.dataset.act !== 'tm30') return;
    const id = b.dataset.id;
    switch (b.dataset.act) {
      case 'open': openBooking(id); break;
      case 'guest': openGuest(id); break;
      case 'editGuest': guestForm(guest(id), (g) => openGuest(g.id)); break;
      case 'bookFor': bookingForm({ guestId: id }); break;
      case 'calBook': bookingForm({ roomId: b.dataset.room, checkIn: b.dataset.date, checkOut: H.addDays(b.dataset.date, 1) }); break;
      case 'edit': bookingForm({ id }); break;
      case 'confirm': if (act(() => H.confirmBooking(db, id), t('confirmed'))) refresh(); break;
      case 'checkin': {
        const bk = booking(id);
        if (act(() => H.checkIn(db, id), t('checkedIn', { room: room(bk.roomId).name }))) {
          if (room(bk.roomId).housekeeping === 'dirty') setTimeout(() => toast('⚠ ' + t('roomNotClean', { room: room(bk.roomId).name }), 5000), 400);
          if (!$('modal').hidden) refresh();
        }
        break;
      }
      case 'checkout': checkoutFlow(id); break;
      case 'cancel': { const why = prompt(t('cancelWhy')); if (why !== null && act(() => H.cancelBooking(db, id, why), t('cancelled'))) refresh(); break; }
      case 'noshow': if (confirm(t('confirmNoShow')) && act(() => H.markNoShow(db, id))) refresh(); break;
      case 'reinstate': if (act(() => H.reinstate(db, id), t('saved'))) refresh(); break;
      case 'tm30': act(() => H.setTm30(db, id, b.checked)); break;
      case 'invoice': printInvoice(booking(id)); break;
      case 'msg': messageDialog(booking(id), b.dataset.kind); break;
      case 'addExtra': {
        const sel = $('exSel').value, qty = $('exQty').value;
        const input = sel === 'custom' ? { name: $('exName').value, price: $('exPrice').value, qty: qty || 1 } : { extraId: sel, ...(qty ? { qty } : {}) };
        if (act(() => H.addExtra(db, id, input))) refresh();
        break;
      }
      case 'rmExtra': if (act(() => H.removeExtra(db, id, b.dataset.line))) refresh(); break;
      case 'discount': { const v = prompt(t('discountAsk', { c: db.settings.currency })); if (v !== null && act(() => H.setDiscount(db, id, v))) refresh(); break; }
      case 'rmDiscount': if (act(() => H.setDiscount(db, id, 0))) refresh(); break;
      case 'pay': if (act(() => H.addPayment(db, id, { amount: $('payAmt').value, method: $('payMethod').value, note: $('payNote').value }), t('paymentAdded'))) refresh(); break;
      case 'rmPay': if (confirm(t('confirmRmPay')) && act(() => H.removePayment(db, id, b.dataset.pay))) refresh(); break;
      case 'hk': { const r = room(id); act(() => H.setHousekeeping(db, id, r.housekeeping === 'dirty' ? 'clean' : 'dirty')); break; }
      case 'editRoom': roomForm(room(id)); break;
      case 'rmExtraDef': db.settings.extras.splice(Number(b.dataset.i), 1); save(); renderSettings(); break;
    }
  });

  /* ================================================================ lock */
  function lockScreen() {
    if (!db.settings.pin) return;
    try { sessionStorage.removeItem('hs_unlocked'); } catch { /* ignore */ }
    $('lockName').textContent = db.settings.name; $('lockErr').textContent = ''; $('lockPin').value = '';
    $('lock').hidden = false; setTimeout(() => $('lockPin').focus(), 30);
  }
  $('lockBtn').onclick = lockScreen;
  $('lockForm').onsubmit = (e) => {
    e.preventDefault();
    if ($('lockPin').value === db.settings.pin) { $('lock').hidden = true; try { sessionStorage.setItem('hs_unlocked', '1'); } catch { /* ignore */ } }
    else { $('lockErr').textContent = t('wrongPin'); $('lockPin').value = ''; }
  };

  /* ================================================================ start */
  function renderAll() {
    renderHeader();
    if (tab === 'today') renderToday();
    if (tab === 'calendar') renderCalendar();
    if (tab === 'bookings') renderBookings();
    if (tab === 'guests') renderGuests();
    if (tab === 'reports') renderReports();
    if (tab === 'settings') renderSettings();
  }
  applyLang();
  showTab(tab);
  let unlocked = false; try { unlocked = sessionStorage.getItem('hs_unlocked') === '1'; } catch { /* ignore */ }
  if (db.settings.pin && !unlocked) lockScreen();
  window.addEventListener('resize', () => { if (tab === 'calendar') renderCalendar(); });
  setInterval(() => { if ($('modal').hidden && !document.activeElement?.matches('input,textarea,select')) renderAll(); else renderHeader(); }, 60000);
  window.__app = { get db() { return db; }, showTab, H };
})();
