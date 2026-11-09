/* Homestay / guest house booking manager: business rules shared by the app (index.html) and the tests.
 * No user interface code here: everything works on a plain "db" object saved in this browser.
 */
(function (root) {
  'use strict';
  const DB_KEY = 'homestay_v1';
  const DAY = 86400000;
  const STATUS = ['hold', 'confirmed', 'in', 'out', 'cancelled', 'noshow'];
  const LIVE = ['hold', 'confirmed', 'in'];            // these block the room
  const SOURCES = ['walkin', 'phone', 'line', 'whatsapp', 'facebook', 'booking', 'agoda', 'airbnb', 'website', 'other'];
  const METHODS = ['cash', 'transfer', 'promptpay', 'card', 'ota'];

  /* ---------------------------------------------------------------- messages (translated by i18n.js when loaded) */
  const EN = {
    e_roomName: 'Room name is required', e_roomUsed: 'Room name {name} is already used', e_price: 'Enter a valid price', e_capacity: 'Capacity must be 1 to 20',
    e_room: 'Room not found', e_guestName: 'Guest name is required', e_phone: 'Phone number looks wrong', e_email: 'Email looks wrong', e_guest: 'Guest not found',
    e_dates: 'Check-out must be after check-in', e_date: 'Choose valid dates', e_long: 'A booking can be at most {n} nights', e_past: 'Check-in date has already passed',
    e_taken: 'Room {room} is already booked {from} → {to} ({who})', e_inactive: 'Room {room} is closed', e_tooMany: 'Room {room} sleeps at most {n}',
    e_booking: 'Booking not found', e_state: 'Not possible: the booking is {s}', e_early: 'Check-in is on {date}', e_balance: 'Balance still due: {amount}',
    e_amount: 'Enter an amount', e_payment: 'Payment not found', e_extra: 'Extra not found', e_discount: 'Discount can\'t be more than the total',
    e_promptpay: 'PromptPay ID must be a 10-digit mobile number or a 13-digit ID', e_backup: 'This is not a homestay backup file', e_qty: 'Quantity must be 1 or more',
  };
  function msg(key, vars) {
    if (root.I18N) return root.I18N.t(key, vars);
    return (EN[key] || key).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined ? vars[k] : m));
  }
  class StayError extends Error {}
  const fail = (key, vars) => { throw new StayError(msg(key, vars)); };

  /* ---------------------------------------------------------------- helpers */
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const dateStr = (t) => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const validDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(new Date(s + 'T12:00:00'));
  const addDays = (date, n) => dateStr(new Date(date + 'T12:00:00').getTime() + n * DAY);
  const nightsBetween = (a, b) => Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / DAY);
  const weekday = (date) => new Date(date + 'T12:00:00').getDay();
  let seq = 0;
  const uid = () => Date.now().toString(36) + (seq++).toString(36) + Math.random().toString(36).slice(2, 6);
  const clean = (s, max = 200) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
  const money = (n) => Math.round(Number(n) * 100) / 100;
  const findBy = (arr, id, key) => { const x = arr.find((v) => v.id === id); if (!x) fail(key); return x; };
  const num = (v, key, min = 0) => { const n = Number(v); if (!isFinite(n) || n < min) fail(key); return money(n); };

  /* ---------------------------------------------------------------- database */
  function defaultsDb() {
    return {
      v: 1,
      settings: {
        name: 'My Homestay', address: '', phone: '', email: '', mapLink: '', language: 'th', currency: '฿', countryCode: '66',
        checkInTime: '14:00', checkOutTime: '11:00', weekendNights: [5, 6], maxNights: 60, holdHours: 24,
        promptpayId: '', bankInfo: '', wifi: '', houseRules: '', homeNationality: 'Thai', tm30: true, pin: '',
        confirmMsg: '', arrivalMsg: '', thanksMsg: '', reviewLink: '',
        extras: [
          { id: 'x1', name: 'Breakfast', price: 120, per: 'person-night' },
          { id: 'x2', name: 'Extra bed', price: 300, per: 'night' },
          { id: 'x3', name: 'Motorbike rental', price: 250, per: 'night' },
          { id: 'x4', name: 'Airport pickup', price: 500, per: 'once' },
        ],
      },
      rooms: [
        { id: 'r1', name: '101', type: 'Garden Double', capacity: 2, price: 800, weekendPrice: 1000, active: true, housekeeping: 'clean', notes: '' },
        { id: 'r2', name: '102', type: 'Garden Twin', capacity: 2, price: 800, weekendPrice: 1000, active: true, housekeeping: 'clean', notes: '' },
        { id: 'r3', name: '201', type: 'Family Room', capacity: 4, price: 1500, weekendPrice: 1800, active: true, housekeeping: 'clean', notes: '' },
        { id: 'r4', name: 'Bungalow', type: 'River Bungalow', capacity: 3, price: 1800, weekendPrice: 2200, active: true, housekeeping: 'clean', notes: '' },
      ],
      guests: [], bookings: [],
      counters: { booking: 0 },
    };
  }
  function migrate(db) {
    const d = defaultsDb();
    if (!db || typeof db !== 'object') return d;
    db.settings = { ...d.settings, ...(db.settings || {}) };
    if (!Array.isArray(db.settings.extras)) db.settings.extras = d.settings.extras;
    for (const k of ['rooms', 'guests', 'bookings']) if (!Array.isArray(db[k])) db[k] = k === 'rooms' ? d.rooms : [];
    db.counters = { ...d.counters, ...(db.counters || {}) };
    db.v = 1;
    return db;
  }

  /* ---------------------------------------------------------------- rooms */
  function saveRoom(db, input) {
    const name = clean(input.name, 40);
    if (!name) fail('e_roomName');
    const dup = db.rooms.find((r) => r.name.toLowerCase() === name.toLowerCase() && r.id !== input.id && r.active);
    if (dup) fail('e_roomUsed', { name });
    const capacity = Math.round(Number(input.capacity));
    if (!(capacity >= 1 && capacity <= 20)) fail('e_capacity');
    const price = num(input.price, 'e_price');
    const weekendPrice = input.weekendPrice === '' || input.weekendPrice === undefined || input.weekendPrice === null ? price : num(input.weekendPrice, 'e_price');
    const old = input.id ? db.rooms.find((r) => r.id === input.id) : null;
    const room = { id: old ? old.id : uid(), name, type: clean(input.type, 60), capacity, price, weekendPrice, active: input.active !== false,
      housekeeping: old ? old.housekeeping : 'clean', notes: clean(input.notes, 300) };
    if (old) Object.assign(old, room); else db.rooms.push(room);
    return old || room;
  }
  /** Rooms with bookings are closed instead of deleted, so history keeps their name. */
  function removeRoom(db, id) {
    const r = findBy(db.rooms, id, 'e_room');
    if (db.bookings.some((b) => b.roomId === id)) { r.active = false; return 'closed'; }
    db.rooms = db.rooms.filter((x) => x.id !== id);
    return 'deleted';
  }
  function setHousekeeping(db, roomId, status) {
    const r = findBy(db.rooms, roomId, 'e_room');
    r.housekeeping = status === 'dirty' ? 'dirty' : 'clean';
    return r;
  }

  /* ---------------------------------------------------------------- guests */
  function saveGuest(db, input, now = Date.now()) {
    const name = clean(input.name, 100);
    if (!name) fail('e_guestName');
    const phone = String(input.phone || '').replace(/[^\d+]/g, '');
    if (phone && (phone.replace(/\D/g, '').length < 8 || phone.replace(/\D/g, '').length > 15)) fail('e_phone');
    const email = clean(input.email, 120);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('e_email');
    const old = input.id ? findBy(db.guests, input.id, 'e_guest') : null;
    const g = { id: old ? old.id : uid(), name, phone, email, nationality: clean(input.nationality, 40), idNo: clean(input.idNo, 40),
      notes: String(input.notes || '').trim().slice(0, 1000), createdAt: old ? old.createdAt : now };
    if (old) Object.assign(old, g); else db.guests.push(g);
    return old || g;
  }
  function searchGuests(db, q, limit = 30) {
    q = clean(q).toLowerCase();
    if (!q) return db.guests.slice(-limit).reverse();
    const digits = q.replace(/\D/g, '');
    return db.guests.filter((g) => g.name.toLowerCase().includes(q) || g.email.toLowerCase().includes(q) || g.idNo.toLowerCase().includes(q)
      || (digits.length >= 3 && g.phone.replace(/\D/g, '').includes(digits))).slice(0, limit);
  }
  function guestHistory(db, guestId) {
    return db.bookings.filter((b) => b.guestId === guestId).sort((a, b) => b.checkIn.localeCompare(a.checkIn));
  }
  function isForeign(db, guest) {
    const n = String(guest?.nationality || '').trim().toLowerCase();
    const home = String(db.settings.homeNationality || '').trim().toLowerCase();
    return !!n && !!home && n !== home && !(home === 'thai' && ['th', 'ไทย', 'thailand'].includes(n));
  }

  /* ---------------------------------------------------------------- prices & availability */
  /** Price of each night: weekend nights (Fri, Sat by default) use the weekend price. */
  function nightRates(db, roomId, checkIn, checkOut, override) {
    const r = findBy(db.rooms, roomId, 'e_room');
    const out = [];
    for (let d = checkIn; d < checkOut; d = addDays(d, 1)) {
      const rate = override !== undefined && override !== null && override !== '' ? Number(override)
        : (db.settings.weekendNights || []).includes(weekday(d)) ? r.weekendPrice : r.price;
      out.push({ date: d, rate: money(rate) });
    }
    return out;
  }
  const overlaps = (b, from, to) => LIVE.includes(b.status) && b.checkIn < to && from < b.checkOut;
  function conflict(db, roomId, from, to, ignoreId) {
    return db.bookings.find((b) => b.roomId === roomId && b.id !== ignoreId && overlaps(b, from, to)) || null;
  }
  function availableRooms(db, from, to, people = 1, ignoreId) {
    return db.rooms.filter((r) => r.active && r.capacity >= people && !conflict(db, r.id, from, to, ignoreId));
  }
  function checkStay(db, { roomId, checkIn, checkOut, adults, children, ignoreId, allowPast }, now) {
    if (!validDate(checkIn) || !validDate(checkOut)) fail('e_date');
    if (checkOut <= checkIn) fail('e_dates');
    const n = nightsBetween(checkIn, checkOut);
    if (n > (db.settings.maxNights || 60)) fail('e_long', { n: db.settings.maxNights || 60 });
    if (!allowPast && checkIn < dateStr(now)) fail('e_past');
    const room = findBy(db.rooms, roomId, 'e_room');
    if (!room.active) fail('e_inactive', { room: room.name });
    const people = (Number(adults) || 1) + (Number(children) || 0);
    if (people > room.capacity + 2 || (Number(adults) || 1) > room.capacity + 1) fail('e_tooMany', { room: room.name, n: room.capacity });
    const c = conflict(db, roomId, checkIn, checkOut, ignoreId);
    if (c) fail('e_taken', { room: room.name, from: c.checkIn, to: c.checkOut, who: (db.guests.find((g) => g.id === c.guestId) || {}).name || c.ref });
    return room;
  }

  /* ---------------------------------------------------------------- bookings */
  function createBooking(db, input, now = Date.now()) {
    findBy(db.guests, input.guestId, 'e_guest');
    checkStay(db, input, now);
    const status = input.status === 'hold' ? 'hold' : 'confirmed';
    const b = {
      id: uid(), ref: `B${pad(++db.counters.booking, 4)}`, guestId: input.guestId, roomId: input.roomId,
      checkIn: input.checkIn, checkOut: input.checkOut, adults: Math.max(1, Math.round(Number(input.adults) || 1)), children: Math.max(0, Math.round(Number(input.children) || 0)),
      source: SOURCES.includes(input.source) ? input.source : 'walkin', status,
      holdUntil: status === 'hold' ? now + (db.settings.holdHours || 24) * 3600000 : null,
      nights: nightRates(db, input.roomId, input.checkIn, input.checkOut, input.rate), rateOverride: input.rate !== undefined && input.rate !== '' && input.rate !== null,
      extras: [], discount: 0, payments: [], notes: String(input.notes || '').trim().slice(0, 1000), otaRef: clean(input.otaRef, 40),
      tm30: false, createdAt: now, checkedInAt: null, checkedOutAt: null, cancelReason: '',
    };
    db.bookings.push(b);
    return b;
  }
  /** Change room, dates, guests count or price. Prices are recalculated unless a fixed nightly rate is given. */
  function updateBooking(db, id, input, now = Date.now()) {
    const b = findBy(db.bookings, id, 'e_booking');
    if (!LIVE.includes(b.status)) fail('e_state', { s: msg('s_' + b.status) });
    const next = { roomId: input.roomId || b.roomId, checkIn: input.checkIn || b.checkIn, checkOut: input.checkOut || b.checkOut,
      adults: input.adults ?? b.adults, children: input.children ?? b.children };
    if (b.status === 'in' && next.checkIn !== b.checkIn) fail('e_state', { s: msg('s_in') });
    checkStay(db, { ...next, ignoreId: b.id, allowPast: true }, now);
    if (b.status !== 'in' && next.checkIn !== b.checkIn && next.checkIn < dateStr(now)) fail('e_past');
    const rateChanged = input.rate !== undefined;
    const keepRate = !rateChanged && b.rateOverride ? b.nights[0]?.rate : rateChanged && input.rate !== '' && input.rate !== null ? input.rate : undefined;
    Object.assign(b, next, { adults: Math.max(1, Math.round(Number(next.adults) || 1)), children: Math.max(0, Math.round(Number(next.children) || 0)) });
    b.nights = nightRates(db, b.roomId, b.checkIn, b.checkOut, keepRate);
    b.rateOverride = keepRate !== undefined;
    for (const k of ['source', 'notes', 'otaRef']) if (input[k] !== undefined) b[k] = k === 'source' ? (SOURCES.includes(input.source) ? input.source : b.source) : k === 'notes' ? String(input.notes).trim().slice(0, 1000) : clean(input[k], 40);
    return b;
  }
  function extraLine(db, extraId, b, qty) {
    const e = db.settings.extras.find((x) => x.id === extraId);
    if (!e) fail('e_extra');
    const n = b.nights.length, people = b.adults + b.children;
    const units = e.per === 'night' ? n : e.per === 'person-night' ? n * people : 1;
    return { id: uid(), extraId: e.id, name: e.name, price: e.price, qty: qty ?? units };
  }
  function addExtra(db, bookingId, input) {
    const b = findBy(db.bookings, bookingId, 'e_booking');
    if (b.status === 'cancelled' || b.status === 'noshow') fail('e_state', { s: msg('s_' + b.status) });
    let line;
    if (input.extraId) line = extraLine(db, input.extraId, b, input.qty !== undefined ? Math.round(Number(input.qty)) : undefined);
    else {
      const name = clean(input.name, 80); if (!name) fail('e_extra');
      line = { id: uid(), extraId: null, name, price: num(input.price, 'e_price'), qty: Math.round(Number(input.qty ?? 1)) };
    }
    if (!(line.qty >= 1)) fail('e_qty');
    b.extras.push(line);
    return line;
  }
  function removeExtra(db, bookingId, lineId) {
    const b = findBy(db.bookings, bookingId, 'e_booking');
    if (!b.extras.some((x) => x.id === lineId)) fail('e_extra');
    b.extras = b.extras.filter((x) => x.id !== lineId);
    return b;
  }
  function totals(b) {
    const room = money(b.nights.reduce((s, n) => s + n.rate, 0));
    const extras = money(b.extras.reduce((s, x) => s + x.price * x.qty, 0));
    const total = money(room + extras - (b.discount || 0));
    const paid = money(b.payments.reduce((s, p) => s + p.amount, 0));
    return { nights: b.nights.length, room, extras, discount: b.discount || 0, total, paid, balance: money(total - paid) };
  }
  function setDiscount(db, bookingId, amount) {
    const b = findBy(db.bookings, bookingId, 'e_booking');
    const d = num(amount || 0, 'e_amount');
    const t = totals({ ...b, discount: 0 });
    if (d > t.total) fail('e_discount');
    b.discount = d;
    return b;
  }
  function addPayment(db, bookingId, { amount, method, note }, now = Date.now()) {
    const b = findBy(db.bookings, bookingId, 'e_booking');
    const a = Number(amount);
    if (!isFinite(a) || a === 0) fail('e_amount');                 // negative = refund
    const p = { id: uid(), at: now, amount: money(a), method: METHODS.includes(method) ? method : 'cash', note: clean(note, 120) };
    b.payments.push(p);
    if (b.status === 'hold' && a > 0) { b.status = 'confirmed'; b.holdUntil = null; }   // a deposit confirms a held room
    return p;
  }
  function removePayment(db, bookingId, paymentId) {
    const b = findBy(db.bookings, bookingId, 'e_booking');
    if (!b.payments.some((p) => p.id === paymentId)) fail('e_payment');
    b.payments = b.payments.filter((p) => p.id !== paymentId);
    return b;
  }
  function confirmBooking(db, id) {
    const b = findBy(db.bookings, id, 'e_booking');
    if (b.status !== 'hold') fail('e_state', { s: msg('s_' + b.status) });
    b.status = 'confirmed'; b.holdUntil = null;
    return b;
  }
  function checkIn(db, id, now = Date.now()) {
    const b = findBy(db.bookings, id, 'e_booking');
    if (b.status !== 'confirmed' && b.status !== 'hold') fail('e_state', { s: msg('s_' + b.status) });
    const today = dateStr(now);
    if (b.checkIn > today) fail('e_early', { date: b.checkIn });
    if (b.checkOut <= today) fail('e_state', { s: msg('late') });
    b.status = 'in'; b.checkedInAt = now; b.holdUntil = null;
    return b;
  }
  /** Check-out: the room becomes "needs cleaning". With money still due it refuses unless force is set. */
  function checkOut(db, id, now = Date.now(), force = false) {
    const b = findBy(db.bookings, id, 'e_booking');
    if (b.status !== 'in') fail('e_state', { s: msg('s_' + b.status) });
    const t = totals(b);
    if (t.balance > 0.009 && !force) fail('e_balance', { amount: t.balance });
    const today = dateStr(now);
    if (today < b.checkOut) {                                 // leaving early: drop the unused nights
      const keep = Math.max(1, nightsBetween(b.checkIn, today));
      b.nights = b.nights.slice(0, keep);
      b.checkOut = addDays(b.checkIn, keep);
    }
    b.status = 'out'; b.checkedOutAt = now;
    const r = db.rooms.find((x) => x.id === b.roomId); if (r) r.housekeeping = 'dirty';
    return b;
  }
  function cancelBooking(db, id, reason = '') {
    const b = findBy(db.bookings, id, 'e_booking');
    if (b.status !== 'hold' && b.status !== 'confirmed') fail('e_state', { s: msg('s_' + b.status) });
    b.status = 'cancelled'; b.cancelReason = clean(reason, 200); b.holdUntil = null;
    return b;
  }
  function markNoShow(db, id) {
    const b = findBy(db.bookings, id, 'e_booking');
    if (b.status !== 'confirmed' && b.status !== 'hold') fail('e_state', { s: msg('s_' + b.status) });
    b.status = 'noshow';
    return b;
  }
  /** Undo a cancel/no-show if the room is still free. */
  function reinstate(db, id, now = Date.now()) {
    const b = findBy(db.bookings, id, 'e_booking');
    if (b.status !== 'cancelled' && b.status !== 'noshow') fail('e_state', { s: msg('s_' + b.status) });
    checkStay(db, { ...b, ignoreId: b.id, allowPast: true }, now);
    b.status = 'confirmed'; b.cancelReason = '';
    return b;
  }
  function setTm30(db, id, done) { const b = findBy(db.bookings, id, 'e_booking'); b.tm30 = !!done; return b; }

  /* ---------------------------------------------------------------- daily views */
  function today(db, now = Date.now()) {
    const d = dateStr(now);
    const live = db.bookings.filter((b) => b.status !== 'cancelled' && b.status !== 'noshow');
    const arrivals = live.filter((b) => b.checkIn === d && (b.status === 'confirmed' || b.status === 'hold'));
    const lateArrivals = live.filter((b) => b.checkIn < d && b.checkOut > d && (b.status === 'confirmed' || b.status === 'hold'));
    const departures = live.filter((b) => b.status === 'in' && b.checkOut <= d);
    const inHouse = live.filter((b) => b.status === 'in');
    const active = db.rooms.filter((r) => r.active);
    const occupied = new Set(live.filter((b) => b.checkIn <= d && b.checkOut > d && LIVE.includes(b.status)).map((b) => b.roomId));
    const expiredHolds = db.bookings.filter((b) => b.status === 'hold' && b.holdUntil && b.holdUntil < now);
    const tm30 = db.settings.tm30 ? inHouse.filter((b) => !b.tm30 && isForeign(db, db.guests.find((g) => g.id === b.guestId))) : [];
    const dirty = active.filter((r) => r.housekeeping === 'dirty');
    return { date: d, arrivals, lateArrivals, departures, inHouse, expiredHolds, tm30, dirty,
      roomsTotal: active.length, roomsSold: [...occupied].filter((id) => active.some((r) => r.id === id)).length,
      occupancy: active.length ? Math.round(occupied.size / active.length * 100) : 0 };
  }
  /** Booking chart: for each room, which booking covers each date. */
  function chart(db, from, days = 14) {
    const dates = Array.from({ length: days }, (_, i) => addDays(from, i));
    const to = addDays(from, days);
    const rooms = db.rooms.filter((r) => r.active || db.bookings.some((b) => b.roomId === r.id && overlaps(b, from, to)));
    return {
      dates,
      rows: rooms.map((r) => ({
        room: r,
        bookings: db.bookings.filter((b) => b.roomId === r.id && b.status !== 'cancelled' && b.checkIn < to && from < b.checkOut)
          .map((b) => ({ b, start: Math.max(0, nightsBetween(from, b.checkIn)), span: Math.min(days, nightsBetween(from, b.checkOut)) - Math.max(0, nightsBetween(from, b.checkIn)),
            cutLeft: b.checkIn < from, cutRight: b.checkOut > to })),
      })),
    };
  }

  /* ---------------------------------------------------------------- reports */
  function report(db, from, to) {
    // `to` is the last night included
    const days = nightsBetween(from, to) + 1;
    const sold = db.bookings.filter((b) => ['confirmed', 'in', 'out', 'hold'].includes(b.status));
    let nightsSold = 0, roomRevenue = 0;
    const bySource = {}, byRoom = {}, byDate = {};
    for (const b of sold) {
      for (const n of b.nights) {
        if (n.date < from || n.date > to) continue;
        nightsSold++; roomRevenue += n.rate;
        bySource[b.source] = (bySource[b.source] || 0) + n.rate;
        byRoom[b.roomId] = (byRoom[b.roomId] || 0) + n.rate;
        byDate[n.date] = (byDate[n.date] || 0) + 1;
      }
    }
    const inRange = sold.filter((b) => b.checkIn >= from && b.checkIn <= to);
    const extras = inRange.reduce((s, b) => s + totals(b).extras, 0);
    const discounts = inRange.reduce((s, b) => s + (b.discount || 0), 0);
    const roomsAvail = db.rooms.filter((r) => r.active).length * days;
    const payments = {};
    let received = 0;
    for (const b of db.bookings) for (const p of b.payments) {
      const d = dateStr(p.at);
      if (d >= from && d <= to) { payments[p.method] = (payments[p.method] || 0) + p.amount; received += p.amount; }
    }
    const all = db.bookings.filter((b) => b.checkIn >= from && b.checkIn <= to);
    const guestsIn = new Set(inRange.map((b) => b.guestId));
    const outstanding = db.bookings.filter((b) => b.status === 'out' && totals(b).balance > 0.009);
    return {
      from, to, days, nightsSold, roomsAvail,
      occupancy: roomsAvail ? Math.round(nightsSold / roomsAvail * 100) : 0,
      roomRevenue: money(roomRevenue), adr: nightsSold ? money(roomRevenue / nightsSold) : 0, revpar: roomsAvail ? money(roomRevenue / roomsAvail) : 0,
      extras: money(extras), discounts: money(discounts), received: money(received), payments,
      bookings: inRange.length, cancelled: all.filter((b) => b.status === 'cancelled').length, noshow: all.filter((b) => b.status === 'noshow').length,
      avgStay: inRange.length ? Math.round(inRange.reduce((s, b) => s + b.nights.length, 0) / inRange.length * 10) / 10 : 0,
      guests: guestsIn.size, foreign: [...guestsIn].filter((id) => isForeign(db, db.guests.find((g) => g.id === id))).length,
      bySource, byRoom, byDate, outstanding: outstanding.map((b) => ({ id: b.id, ref: b.ref, balance: totals(b).balance })),
    };
  }
  const csvCell = (x) => { const s = x === null || x === undefined ? '' : String(x); return /[",\n]/.test(s) || /^[=+\-@]/.test(s) ? `"${s.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : s; };
  function bookingsCsv(db, from, to) {
    const rows = [['ref', 'status', 'guest', 'phone', 'nationality', 'room', 'check_in', 'check_out', 'nights', 'adults', 'children', 'source', 'room_total', 'extras', 'discount', 'total', 'paid', 'balance', 'ota_ref']];
    for (const b of db.bookings.filter((x) => x.checkIn >= from && x.checkIn <= to).sort((a, c) => a.checkIn.localeCompare(c.checkIn))) {
      const g = db.guests.find((x) => x.id === b.guestId) || {}, r = db.rooms.find((x) => x.id === b.roomId) || {}, t = totals(b);
      rows.push([b.ref, b.status, g.name, g.phone, g.nationality, r.name, b.checkIn, b.checkOut, t.nights, b.adults, b.children, b.source, t.room, t.extras, t.discount, t.total, t.paid, t.balance, b.otaRef]);
    }
    return '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n');
  }

  /* ---------------------------------------------------------------- messages & PromptPay */
  function intlPhone(phone, cc = '66') {
    const raw = String(phone || '').trim();
    const d = raw.replace(/\D/g, '');
    cc = String(cc || '').replace(/\D/g, '');
    if (!d) return '';
    if (raw.startsWith('+')) return d;
    if (d.startsWith('00')) return d.slice(2);
    if (d.startsWith('0')) return cc + d.slice(1);
    if (cc && d.startsWith(cc) && d.length > 9) return d;
    return cc + d;
  }
  function fillMessage(template, vars) {
    const fill = (line) => line.replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined && vars[k] !== null ? String(vars[k]) : ''));
    return String(template || '').split('\n')
      .map((line) => ({ line, out: fill(line).replace(/[ \t]{2,}/g, ' ').trimEnd() }))
      .filter((x) => x.out.trim() || !x.line.trim())
      .map((x) => x.out).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function messageLinks(phone, text, cc) {
    const intl = intlPhone(phone, cc), body = encodeURIComponent(text);
    const local = String(phone || '').replace(/[^\d+]/g, '');
    return { whatsapp: `https://wa.me/${intl}?text=${body}`, line: `https://line.me/R/msg/text/?${body}`, sms: `sms:${local}?body=${body}` };
  }
  function crc16(str) {
    let crc = 0xffff;
    for (let i = 0; i < str.length; i++) {
      crc ^= str.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
    return crc.toString(16).toUpperCase().padStart(4, '0');
  }
  const tlv = (tag, v) => tag + pad(v.length, 2) + v;
  /** Thai QR (PromptPay) payload, EMVCo format. */
  function promptPayPayload(id, amount) {
    const d = String(id || '').replace(/\D/g, '');
    let acct;
    if (d.length === 10 && d.startsWith('0')) acct = tlv('01', '0066' + d.slice(1));
    else if (d.length === 13) acct = tlv('02', d);
    else if (d.length === 15) acct = tlv('03', d);
    else fail('e_promptpay');
    let s = tlv('00', '01') + tlv('01', amount ? '12' : '11') + tlv('29', tlv('00', 'A000000677010111') + acct) + tlv('58', 'TH') + tlv('53', '764');
    if (amount) s += tlv('54', Number(amount).toFixed(2));
    s += '6304';
    return s + crc16(s);
  }

  /* ---------------------------------------------------------------- backup */
  function exportData(db) { return JSON.stringify({ app: 'homestay', exportedAt: new Date().toISOString(), db }); }
  function importData(text) {
    let j;
    try { j = JSON.parse(text); } catch { fail('e_backup'); }
    if (!j || j.app !== 'homestay' || !j.db || !Array.isArray(j.db.bookings)) fail('e_backup');
    return migrate(j.db);
  }

  root.HS = {
    DB_KEY, STATUS, LIVE, SOURCES, METHODS, StayError, msg,
    dateStr, addDays, nightsBetween, weekday, validDate, uid,
    defaultsDb, migrate,
    saveRoom, removeRoom, setHousekeeping,
    saveGuest, searchGuests, guestHistory, isForeign,
    nightRates, conflict, availableRooms,
    createBooking, updateBooking, addExtra, removeExtra, totals, setDiscount, addPayment, removePayment,
    confirmBooking, checkIn, checkOut, cancelBooking, markNoShow, reinstate, setTm30,
    today, chart, report, bookingsCsv,
    intlPhone, fillMessage, messageLinks, promptPayPayload, crc16, exportData, importData,
  };
})(typeof window !== 'undefined' ? window : globalThis);
