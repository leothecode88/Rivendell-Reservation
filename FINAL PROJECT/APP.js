'use strict';

const STORAGE_KEY = 'rivendell_reservations_v1';
const PLACEHOLDER = 'assets/images/placeholder.svg';
const STATUSES = ['Confirmed', 'Completed', 'Cancelled'];
const FIELDS = ['name', 'email', 'venue', 'date', 'slot', 'guests', 'requests'];

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');
const findVenue = (id) => VENUES.find((v) => v.id === id);
const findSlot = (id) => SLOTS.find((s) => s.id === id);

function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function esc(text) {
  const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  return String(text).replace(/[&<>"']/g, (c) => map[c]);
}

function formatDate(str) {
  return new Date(str + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'short',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function totalCost(venueId, guests) {
  const v = findVenue(venueId);
  return v.price + v.perGuest * guests;
}

function imgTag(src, alt) {
  return '<img src="' + src + '" alt="' + esc(alt) + '" width="800" height="600" loading="lazy" ' +
    'onerror="this.onerror=null;this.src=\'' + PLACEHOLDER + '\'">';
}

let toastTimer = null;
let shownRef = null;
let reservations = loadReservations();

function isValidRecord(r) {
  return !!r && typeof r === 'object' && typeof r.ref === 'string' &&
    typeof r.name === 'string' && typeof r.email === 'string' &&
    !!findVenue(r.venueId) && !!findSlot(r.slot) &&
    /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
    Number.isInteger(r.guests) && r.guests > 0 && STATUSES.includes(r.status);
}

function loadReservations() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const data = raw ? JSON.parse(raw) : [];

    if (!Array.isArray(data)) {
      return [];
    }

    const clean = data.filter(isValidRecord);

    if (clean.length < data.length) {
      showToast('Some damaged saved records were skipped.', 'error');
    }

    return clean;
  } catch (err) {
    showToast('Saved data could not be read, so the list was reset.', 'error');
    return [];
  }
}

function saveReservations() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reservations));
    return true;
  } catch (err) {
    showToast('Your browser blocked saving. Records will be lost on refresh.', 'error');
    return false;
  }
}

function showToast(message, type) {
  const t = $('toast');
  t.textContent = message;
  t.className = 'toast show ' + (type || 'info');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    t.className = 'toast';
  }, 4500);
}

function hasConflict(v, ignoreRef) {
  return reservations.some((r) => r.ref !== ignoreRef && r.status !== 'Cancelled' &&
    r.venueId === v.venueId && r.date === v.date && r.slot === v.slot);
}

function validate(v, ignoreRef) {
  const errors = {};
  const venue = findVenue(v.venueId);

  if (!v.name) {
    errors.name = 'Enter the guest name.';
  } else if (!/^[\p{L}][\p{L} .'-]{1,59}$/u.test(v.name)) {
    errors.name = 'Use 2 to 60 letters. Spaces, periods, apostrophes and hyphens are allowed.';
  }

  if (!v.email) {
    errors.email = 'Enter an email address.';
  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) {
    errors.email = 'Enter a valid email, such as name@example.com.';
  }

  if (!venue) {
    errors.venue = 'Select a venue.';
  }

  if (!v.date) {
    errors.date = 'Choose a date.';
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date) || isNaN(new Date(v.date + 'T00:00:00'))) {
    errors.date = 'Enter a valid date.';
  } else if (v.date < todayStr()) {
    errors.date = 'Past dates cannot be reserved. Choose today or a later date.';
  }

  if (!findSlot(v.slot)) {
    errors.slot = 'Select a time slot.';
  }

  if (!v.guests) {
    errors.guests = 'Enter the number of guests.';
  } else if (!Number.isInteger(v.guests) || v.guests < 1) {
    errors.guests = 'Guests must be a whole number of 1 or more.';
  } else if (venue && v.guests > venue.capacity) {
    errors.guests = venue.name + ' holds at most ' + venue.capacity + ' guests.';
  }

  if (v.requests.length > 200) {
    errors.requests = 'Keep special requests to 200 characters or fewer.';
  }

  if (!errors.venue && !errors.date && !errors.slot && hasConflict(v, ignoreRef)) {
    errors.slot = 'This venue is already reserved for that date and slot. Choose another slot, date or venue.';
  }

  return errors;
}

function showErrors(errors) {
  let first = null;

  FIELDS.forEach((f) => {
    const msg = errors[f] || '';
    $('err-' + f).textContent = msg;
    $(f).setAttribute('aria-invalid', msg ? 'true' : 'false');

    if (msg && !first) {
      first = $(f);
    }
  });

  return first;
}

function readForm() {
  return {
    name: $('name').value.trim().replace(/\s+/g, ' '),
    email: $('email').value.trim(),
    venueId: $('venue').value,
    date: $('date').value,
    slot: $('slot').value,
    guests: Number($('guests').value),
    requests: $('requests').value.trim()
  };
}

function newRef() {
  const stamp = todayStr().replace(/-/g, '');
  let ref;

  do {
    ref = 'RVD-' + stamp + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
  } while (reservations.some((r) => r.ref === ref));

  return ref;
}

function updateGuestHint() {
  const v = findVenue($('venue').value);

  $('guest-hint').textContent = v
    ? 'Capacity ' + v.capacity + ' guests. Price: ' + v.price + ' sp per slot plus ' + v.perGuest + ' sp per guest.'
    : 'Select a venue to see its capacity and price.';
}

function resetForm() {
  $('booking-form').reset();
  $('edit-ref').value = '';
  $('form-title').textContent = 'Reserve a venue';
  $('submit-btn').textContent = 'Confirm reservation';
  $('cancel-edit').hidden = true;

  showErrors({});
  updateGuestHint();
}

function startEdit(r) {
  $('edit-ref').value = r.ref;
  $('name').value = r.name;
  $('email').value = r.email;
  $('venue').value = r.venueId;
  $('date').value = r.date;
  $('slot').value = r.slot;
  $('guests').value = r.guests;
  $('requests').value = r.requests || '';

  $('form-title').textContent = 'Update reservation ' + r.ref;
  $('submit-btn').textContent = 'Save changes';
  $('cancel-edit').hidden = false;

  showErrors({});
  updateGuestHint();
  $('book').scrollIntoView({ behavior: 'smooth' });
}

function handleSubmit(e) {
  e.preventDefault();

  const values = readForm();
  const editRef = $('edit-ref').value;
  const firstBad = showErrors(validate(values, editRef));

  if (firstBad) {
    firstBad.focus();
    showToast('Please fix the highlighted fields.', 'error');
    return;
  }

  let record;

  if (editRef) {
    record = reservations.find((r) => r.ref === editRef);

    if (!record) {
      showToast('That reservation no longer exists.', 'error');
      resetForm();
      return;
    }

    Object.assign(record, values);
  } else {
    record = Object.assign({
      ref: newRef(),
      status: 'Confirmed',
      createdAt: new Date().toISOString()
    }, values);

    reservations.push(record);
  }

  if (saveReservations()) {
    showToast(editRef ? 'Reservation updated.' : 'Reservation confirmed.', 'success');
  }

  resetForm();
  renderRecords();
  showConfirmation(record.ref);
}

function renderVenues() {
  $('venue-grid').innerHTML = VENUES.map((v) =>
    '<article class="card">' + imgTag(v.image, v.name + ' in Rivendell') +
    '<div class="card-body"><h3>' + esc(v.name) + '</h3><p>' + esc(v.description) + '</p>' +
    '<p class="hint">Up to ' + v.capacity + ' guests<br>' + v.price + ' sp per slot, plus ' + v.perGuest + ' sp per guest</p>' +
    '<button class="btn small" type="button" data-venue="' + v.id + '">Reserve this venue</button></div></article>'
  ).join('');

  $('venue').innerHTML = '<option value="">Select a venue</option>' +
    VENUES.map((v) => '<option value="' + v.id + '">' + esc(v.name) + '</option>').join('');

  $('slot').innerHTML = '<option value="">Select a time slot</option>' +
    SLOTS.map((s) => '<option value="' + s.id + '">' + esc(s.label) + '</option>').join('');
}

function recordCard(r) {
  const v = findVenue(r.venueId);
  const ref = esc(r.ref);
  const open = r.status === 'Confirmed';

  const btn = (action, label, cls) =>
    '<button class="btn small ' + (cls || 'alt') + '" type="button" data-action="' + action + '" data-ref="' + ref + '">' + label + '</button>';

  return '<article class="card"><div class="card-body">' +
    '<p class="badge ' + r.status.toLowerCase() + '">' + r.status + '</p>' +
    '<h3>' + ref + '</h3>' +
    '<p><strong>' + esc(r.name) + '</strong><br>' + esc(v.name) + '</p>' +
    '<p>' + formatDate(r.date) + '<br>' + esc(findSlot(r.slot).label) + '</p>' +
    '<p class="hint">' + r.guests + ' guest(s), total ' + totalCost(r.venueId, r.guests) + ' sp (simulated)</p>' +
    '<div class="actions">' + btn('view', 'View') +
    (open ? btn('edit', 'Edit') + btn('complete', 'Mark completed') + btn('cancel', 'Cancel') : '') +
    btn('delete', 'Delete', 'danger') + '</div></div></article>';
}

function renderRecords() {
  const q = $('search').value.trim().toLowerCase();
  const status = $('filter-status').value;
  const slotIndex = (id) => SLOTS.findIndex((s) => s.id === id);

  const list = reservations
    .filter((r) => (status === 'All' || r.status === status) &&
      (!q || (r.ref + ' ' + r.name + ' ' + findVenue(r.venueId).name).toLowerCase().includes(q)))
    .sort((a, b) => a.date.localeCompare(b.date) || slotIndex(a.slot) - slotIndex(b.slot));

  $('record-count').textContent = 'Showing ' + list.length + ' of ' + reservations.length + ' reservation(s).';

  if (!list.length) {
    $('record-list').innerHTML = '<p class="empty">' + (reservations.length
      ? 'No reservations match your search or filter. Clear the search box or choose All statuses.'
      : 'No reservations saved yet. Use the form above to make your first booking.') + '</p>';
    return;
  }

  $('record-list').innerHTML = list.map(recordCard).join('');
}

function showConfirmation(ref) {
  const r = reservations.find((x) => x.ref === ref);

  if (!r) {
    return;
  }

  shownRef = ref;

  const rows = [
    ['Reference number', r.ref],
    ['Status', r.status],
    ['Guest', r.name],
    ['Email', r.email],
    ['Venue', findVenue(r.venueId).name],
    ['Date', formatDate(r.date)],
    ['Time slot', findSlot(r.slot).label],
    ['Guests', r.guests],
    ['Special requests', r.requests || 'None'],
    ['Total (simulated)', totalCost(r.venueId, r.guests) + ' silver pennies']
  ];

  $('confirmation-body').innerHTML = '<dl class="details">' +
    rows.map((p) => '<div><dt>' + p[0] + '</dt><dd>' + esc(p[1]) + '</dd></div>').join('') + '</dl>';

  $('confirmation').hidden = false;
  $('confirmation').scrollIntoView({ behavior: 'smooth' });
  $('confirmation-title').focus({ preventScroll: true });
}

function setStatus(rec, status, question) {
  if (!confirm(question)) {
    return;
  }

  rec.status = status;

  if (saveReservations()) {
    showToast(rec.ref + ' is now ' + status + '.', 'success');
  }

  renderRecords();

  if (shownRef === rec.ref) {
    showConfirmation(rec.ref);
  }
}

function deleteRecord(rec) {
  if (!confirm('Delete ' + rec.ref + ' permanently? This cannot be undone.')) {
    return;
  }

  reservations = reservations.filter((r) => r.ref !== rec.ref);

  if (saveReservations()) {
    showToast(rec.ref + ' was deleted.', 'success');
  }

  if (shownRef === rec.ref) {
    $('confirmation').hidden = true;
    shownRef = null;
  }

  if ($('edit-ref').value === rec.ref) {
    resetForm();
  }

  renderRecords();
}

function handleRecordClick(e) {
  const btn = e.target.closest('[data-action]');

  if (!btn) {
    return;
  }

  const rec = reservations.find((r) => r.ref === btn.dataset.ref);

  if (!rec) {
    showToast('That reservation could not be found.', 'error');
    return;
  }

  switch (btn.dataset.action) {
    case 'view':
      showConfirmation(rec.ref);
      break;

    case 'edit':
      startEdit(rec);
      break;

    case 'complete':
      setStatus(rec, 'Completed', 'Mark ' + rec.ref + ' as completed?');
      break;

    case 'cancel':
      setStatus(rec, 'Cancelled', 'Cancel ' + rec.ref + '? Its slot becomes available again.');
      break;

    case 'delete':
      deleteRecord(rec);
      break;
  }
}

function init() {
  renderVenues();
  $('date').min = todayStr();
  updateGuestHint();
  renderRecords();

  $('booking-form').addEventListener('submit', handleSubmit);
  $('venue').addEventListener('change', updateGuestHint);

  $('cancel-edit').addEventListener('click', () => {
    resetForm();
    showToast('Changes discarded.', 'info');
  });

  $('record-list').addEventListener('click', handleRecordClick);
  $('search').addEventListener('input', renderRecords);
  $('filter-status').addEventListener('change', renderRecords);

  $('venue-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-venue]');

    if (!btn) {
      return;
    }

    $('venue').value = btn.dataset.venue;
    updateGuestHint();
    $('book').scrollIntoView({ behavior: 'smooth' });
    $('name').focus({ preventScroll: true });
  });
}
init();