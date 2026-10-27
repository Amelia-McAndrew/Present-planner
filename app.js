(() => {
  'use strict';

  // People you buy presents for, with their birthdays, and what you've got them each
  // Christmas and birthday. Everything is saved on this device in local storage.

  const STORAGE_KEY = 'present-planner-v1';
  const OCCASIONS = { christmas: { icon: '🎄', label: 'Christmas' }, birthday: { icon: '🎂', label: 'Birthday' } };
  const GIFT_STATUS = { idea: { icon: '💡', label: 'Idea' }, bought: { icon: '🛍️', label: 'Bought' }, sent: { icon: '✅', label: 'Sent' } };
  const NEXT_STATUS = { idea: 'bought', bought: 'sent', sent: 'idea' };
  const STATE_TEXT = { none: 'Nothing yet', idea: 'Only ideas', bought: 'Not sent yet', sent: 'Sent' };
  const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'long' }));
  const DUE_DAYS = { birthday: 30, christmas: 60 };   // how far ahead "To sort" looks
  const LATER_DAYS = 183;

  // ---------- State ----------

  let data = load();
  let peopleYear = today().getFullYear();
  let spendYear = today().getFullYear();

  function valid(value) {
    return value && Array.isArray(value.people) && Array.isArray(value.gifts);
  }

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (valid(parsed)) return parsed;
    } catch (e) { /* fall through to empty */ }
    return { people: [], gifts: [] };
  }

  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch (e) { /* storage unavailable */ }
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  // ---------- Helpers ----------

  const $ = (sel) => document.querySelector(sel);

  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v);
    }
    for (const c of children.flat()) {
      if (c == null || c === false) continue;
      node.append(c instanceof Node ? c : document.createTextNode(String(c)));
    }
    return node;
  }

  function today() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: 'GBP' });
  function moneyText(n) {
    const text = money.format(n || 0);
    return Number.isInteger(n || 0) ? text.replace(/\.00$/, '') : text;
  }

  // A date in a given year, with 29 February falling on the 28th in other years.
  function dateInYear(year, month, day) {
    const last = new Date(year, month, 0).getDate();
    return new Date(year, month - 1, Math.min(day, last));
  }

  // The next time an occasion comes round for a person (today counts), or null.
  function nextOccasion(person, occasion, from = today()) {
    let date;
    if (occasion === 'christmas') {
      if (person.christmas === false) return null;
      date = new Date(from.getFullYear(), 11, 25);
      if (date < from) date = new Date(from.getFullYear() + 1, 11, 25);
    } else {
      if (!person.bday) return null;
      const { day, month } = person.bday;
      date = dateInYear(from.getFullYear(), month, day);
      if (date < from) date = dateInYear(from.getFullYear() + 1, month, day);
    }
    const days = Math.round((date - from) / 86400000);
    const age = occasion === 'birthday' && person.bday.year ? date.getFullYear() - person.bday.year : null;
    return { person, occasion, date, year: date.getFullYear(), days, age };
  }

  // Occasions coming up, soonest first. `limit` is a number of days, or one per occasion.
  function upcoming(limit, after = -1) {
    const list = [];
    for (const person of data.people) {
      for (const occasion of Object.keys(OCCASIONS)) {
        const next = nextOccasion(person, occasion);
        const max = typeof limit === 'number' ? limit : limit[occasion];
        const min = typeof after === 'number' ? after : after[occasion];
        if (next && next.days <= max && next.days > min) list.push(next);
      }
    }
    return list.sort((a, b) => a.days - b.days || a.person.name.localeCompare(b.person.name));
  }

  function giftsFor(personId, occasion, year) {
    return data.gifts.filter((g) => g.personId === personId && (!occasion || g.occasion === occasion) && g.year === year);
  }

  // Where an occasion's presents are at: nothing yet, only ideas, bought but not all sent, or all sent.
  function occasionState(list) {
    if (!list.length) return 'none';
    if (list.every((g) => g.status === 'sent')) return 'sent';
    if (list.some((g) => g.status !== 'idea')) return 'bought';
    return 'idea';
  }

  function whenText(occ) {
    const date = occ.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    const when = occ.days === 0 ? 'today' : occ.days === 1 ? 'tomorrow' : `in ${occ.days} days`;
    return `${date} · ${when}${occ.age ? ` · turning ${occ.age}` : ''}`;
  }

  // What's been bought or sent (ideas don't count as spent yet).
  function spent(list) {
    return list.filter((g) => g.status !== 'idea').reduce((sum, g) => sum + (g.cost || 0), 0);
  }

  // ---------- Coming up ----------

  // One row for a birthday or Christmas, with what to do next.
  function dueRow(occ) {
    const list = giftsFor(occ.person.id, occ.occasion, occ.year);
    const state = occasionState(list);
    const urgent = state !== 'sent' && occ.days <= 7;
    const bought = list.filter((g) => g.status === 'bought');
    const what = list.length
      ? list.map((g) => `${GIFT_STATUS[g.status].icon} ${g.what}`).join(', ')
      : 'No present yet';
    return el('li', { class: `due-row ${state === 'sent' ? 'done' : urgent ? 'urgent' : ''}` },
      el('div', { class: 'due-info' },
        el('span', { class: 'due-name' }, `${OCCASIONS[occ.occasion].icon} ${occ.person.name}`),
        el('span', { class: 'muted due-when' }, `${OCCASIONS[occ.occasion].label} – ${whenText(occ)}`),
        el('span', { class: 'due-what' }, what)),
      el('span', { class: `badge ${state === 'sent' ? 'ok' : urgent || state === 'none' ? 'bad' : 'warn'}` }, STATE_TEXT[state]),
      bought.length
        ? el('button', { type: 'button', class: 'btn btn-small', onclick: () => {
            bought.forEach((g) => { g.status = 'sent'; });
            save();
            render();
          } }, 'Mark sent')
        : state === 'sent'
          ? null
          : el('button', { type: 'button', class: 'btn btn-small', onclick: () => openGiftDialog(null, occ.person.id, occ.occasion, occ.year) }, '+ Present'));
  }

  function renderUpcoming() {
    const due = upcoming(DUE_DAYS).filter((occ) => occasionState(giftsFor(occ.person.id, occ.occasion, occ.year)) !== 'sent');
    $('#due').replaceChildren(...due.map(dueRow));
    $('#due-empty').hidden = due.length > 0;
    $('#due-empty').textContent = data.people.length
      ? 'Nothing to sort out soon. 🎉'
      : 'Add the people you buy presents for in People, and they’ll show up here before their birthdays and Christmas.';
    $('#due-count').textContent = due.length ? String(due.length) : '';
    $('#due-count').hidden = !due.length;

    // Further ahead, plus anything soon that's already sent.
    const soonSent = upcoming(DUE_DAYS).filter((occ) => occasionState(giftsFor(occ.person.id, occ.occasion, occ.year)) === 'sent');
    const later = [...soonSent, ...upcoming(LATER_DAYS, DUE_DAYS)].sort((a, b) => a.days - b.days);
    $('#later').replaceChildren(...later.map(dueRow));
    $('#later-empty').hidden = later.length > 0;
    $('#later-empty').textContent = data.people.length ? 'Nothing else in the next 6 months.' : '';
  }

  // ---------- People ----------

  function birthdayText(person) {
    if (!person.bday) return 'No birthday';
    const { day, month, year } = person.bday;
    return `🎂 ${day} ${MONTHS[month - 1]}${year ? ` ${year}` : ''}`;
  }

  function giftRow(gift) {
    const status = GIFT_STATUS[gift.status] || GIFT_STATUS.idea;
    return el('li', { class: 'gift-row' },
      el('button', { type: 'button', class: 'gift-main', onclick: () => openGiftDialog(gift) },
        el('span', { class: 'gift-what' }, `${OCCASIONS[gift.occasion].icon} ${gift.what}`),
        gift.notes ? el('span', { class: 'muted gift-notes' }, gift.notes) : null),
      el('span', { class: 'gift-cost' }, gift.cost ? moneyText(gift.cost) : ''),
      el('button', { type: 'button', class: `badge gift-status ${gift.status}`, title: 'Tap to change', onclick: () => {
        gift.status = NEXT_STATUS[gift.status] || 'bought';
        save();
        render();
      } }, `${status.icon} ${status.label}`));
  }

  function personCard(person) {
    const list = data.gifts.filter((g) => g.personId === person.id && g.year === peopleYear)
      .sort((a, b) => a.occasion.localeCompare(b.occasion) || a.what.localeCompare(b.what));
    const meta = [birthdayText(person)];
    if (person.christmas === false) meta.push('No Christmas present');
    if (person.budget) meta.push(`Budget ${moneyText(person.budget)}`);
    const over = Object.keys(OCCASIONS).filter((occ) => person.budget && spent(list.filter((g) => g.occasion === occ)) > person.budget);
    const total = spent(list);
    return el('article', { class: 'card' },
      el('div', { class: 'card-head' },
        el('h3', {}, person.name),
        el('span', { class: 'muted' }, total ? moneyText(total) : ''),
        el('button', { type: 'button', class: 'btn btn-icon', title: `Edit ${person.name}`, 'aria-label': `Edit ${person.name}`, onclick: () => openPersonDialog(person) }, '✏️')),
      el('p', { class: 'muted card-meta' }, meta.join(' · '),
        over.length ? el('span', { class: 'badge bad' }, `Over budget for ${over.map((o) => OCCASIONS[o].label).join(' and ')}`) : null),
      person.notes ? el('p', { class: 'muted card-meta card-notes' }, person.notes) : null,
      list.length
        ? el('ul', { class: 'gift-list' }, list.map(giftRow))
        : el('p', { class: 'card-empty' }, `Nothing for ${peopleYear} yet.`),
      el('button', { type: 'button', class: 'btn btn-small card-add', onclick: () => openGiftDialog(null, person.id) }, '+ Present'));
  }

  function renderPeople() {
    $('#people-year').textContent = String(peopleYear);
    const q = $('#search').value.trim().toLowerCase();
    const people = data.people.filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    $('#people').replaceChildren(...people.map(personCard));
    $('#people-empty').hidden = data.people.length > 0;
  }

  // ---------- Spending ----------

  function renderSpending() {
    $('#spend-year').textContent = String(spendYear);
    const yearGifts = data.gifts.filter((g) => g.year === spendYear);
    $('#spend-total').textContent = moneyText(spent(yearGifts));
    $('#spend-xmas').textContent = moneyText(spent(yearGifts.filter((g) => g.occasion === 'christmas')));
    $('#spend-bday').textContent = moneyText(spent(yearGifts.filter((g) => g.occasion === 'birthday')));
    $('#spend-ideas').textContent = moneyText(yearGifts.filter((g) => g.status === 'idea').reduce((s, g) => s + (g.cost || 0), 0));
    const rows = data.people
      .map((p) => ({ p, list: yearGifts.filter((g) => g.personId === p.id) }))
      .filter(({ list }) => list.length)
      .sort((a, b) => spent(b.list) - spent(a.list) || a.p.name.localeCompare(b.p.name));
    $('#spend-table').replaceChildren(...(rows.length ? [
      el('thead', {}, el('tr', {}, el('th', {}, 'Person'), el('th', {}, '🎄'), el('th', {}, '🎂'), el('th', {}, 'Total'))),
      el('tbody', {}, rows.map(({ p, list }) => el('tr', {},
        el('td', {}, p.name),
        el('td', {}, moneyText(spent(list.filter((g) => g.occasion === 'christmas')))),
        el('td', {}, moneyText(spent(list.filter((g) => g.occasion === 'birthday')))),
        el('td', {}, el('strong', {}, moneyText(spent(list))))))),
    ] : [el('caption', { class: 'muted' }, `No presents bought for ${spendYear}.`)]));
  }

  function render() {
    renderUpcoming();
    renderPeople();
    renderSpending();
  }

  $('#people-year-prev').addEventListener('click', () => { peopleYear--; renderPeople(); });
  $('#people-year-next').addEventListener('click', () => { peopleYear++; renderPeople(); });
  $('#spend-year-prev').addEventListener('click', () => { spendYear--; renderSpending(); });
  $('#spend-year-next').addEventListener('click', () => { spendYear++; renderSpending(); });
  $('#search').addEventListener('input', renderPeople);
  $('#add-person-btn').addEventListener('click', () => openPersonDialog(null));

  // ---------- Tabs ----------

  const TABS = ['upcoming', 'people', 'spending'];

  function showTab(name) {
    for (const tab of TABS) {
      $(`#tab-${tab}`).setAttribute('aria-selected', String(tab === name));
      $(`#${tab}-view`).hidden = tab !== name;
    }
  }

  for (const tab of TABS) $(`#tab-${tab}`).addEventListener('click', () => showTab(tab));

  document.querySelectorAll('[data-close]').forEach((btn) =>
    btn.addEventListener('click', () => btn.closest('dialog').close()));

  // ---------- Person dialog ----------

  const personDialog = $('#person-dialog');
  $('#person-month').replaceChildren(el('option', { value: '' }, '—'), ...MONTHS.map((m, i) => el('option', { value: String(i + 1) }, m)));

  function openPersonDialog(person) {
    $('#person-dialog-title').textContent = person ? 'Edit person' : 'Add person';
    $('#person-id').value = person?.id ?? '';
    $('#person-name').value = person?.name ?? '';
    $('#person-day').value = person?.bday?.day ?? '';
    $('#person-month').value = person?.bday ? String(person.bday.month) : '';
    $('#person-year').value = person?.bday?.year ?? '';
    $('#person-christmas').checked = person ? person.christmas !== false : true;
    $('#person-budget').value = person?.budget ?? '';
    $('#person-notes').value = person?.notes ?? '';
    $('#person-delete').hidden = !person;
    personDialog.showModal();
    $('#person-name').focus();
  }

  $('#person-form').addEventListener('submit', (e) => {
    const day = parseInt($('#person-day').value, 10);
    const month = parseInt($('#person-month').value, 10);
    const year = parseInt($('#person-year').value, 10);
    if ((day || month) && !(day >= 1 && month >= 1 && day <= new Date(2000, month, 0).getDate())) {
      e.preventDefault();
      alert('Please give a day and month that exist, or leave both blank.');
      return;
    }
    const budget = parseFloat($('#person-budget').value);
    const fields = {
      name: $('#person-name').value.trim(),
      bday: day && month ? { day, month, ...(year > 1900 ? { year } : {}) } : null,
      christmas: $('#person-christmas').checked,
      budget: budget > 0 ? budget : null,
      notes: $('#person-notes').value.trim(),
    };
    if (!fields.name) return;
    const id = $('#person-id').value;
    if (id) Object.assign(data.people.find((p) => p.id === id), fields);
    else data.people.push({ id: uid(), ...fields });
    save();
    render();
  });

  $('#person-delete').addEventListener('click', () => {
    const id = $('#person-id').value;
    const person = data.people.find((p) => p.id === id);
    if (!person) return;
    const count = data.gifts.filter((g) => g.personId === id).length;
    if (!confirm(count ? `Delete ${person.name} and the ${count} present${count === 1 ? '' : 's'} recorded for them?` : `Delete ${person.name}?`)) return;
    data.people = data.people.filter((p) => p.id !== id);
    data.gifts = data.gifts.filter((g) => g.personId !== id);
    save();
    render();
    personDialog.close();
  });

  // ---------- Present dialog ----------

  const giftDialog = $('#gift-dialog');

  // What you've given someone before, so you don't give the same thing twice.
  function showGiftHistory() {
    const personId = $('#gift-person').value;
    const editing = $('#gift-id').value;
    const past = data.gifts.filter((g) => g.personId === personId && g.id !== editing)
      .sort((a, b) => b.year - a.year).slice(0, 6);
    $('#gift-history').hidden = !past.length;
    $('#gift-history').textContent = past.length
      ? `Before: ${past.map((g) => `${g.year} ${OCCASIONS[g.occasion].icon} ${g.what}${g.cost ? ` (${moneyText(g.cost)})` : ''}`).join(' · ')}`
      : '';
  }

  // With no occasion given, pick whichever of the person's occasions comes round next.
  function defaultOccasion(personId) {
    const person = data.people.find((p) => p.id === personId);
    const next = person && Object.keys(OCCASIONS).map((o) => nextOccasion(person, o)).filter(Boolean).sort((a, b) => a.days - b.days)[0];
    return next ? [next.occasion, next.year] : ['christmas', today().getFullYear()];
  }

  function openGiftDialog(gift, personId, occasion, year) {
    if (!data.people.length) {
      alert('Add a person first.');
      return;
    }
    $('#gift-dialog-title').textContent = gift ? 'Edit present' : 'Add present';
    $('#gift-person').replaceChildren(...[...data.people].sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => el('option', { value: p.id }, p.name)));
    $('#gift-id').value = gift?.id ?? '';
    $('#gift-person').value = gift?.personId ?? personId ?? $('#gift-person').value;
    const [defOcc, defYear] = defaultOccasion($('#gift-person').value);
    $('#gift-occasion').value = gift?.occasion ?? occasion ?? defOcc;
    $('#gift-year').value = gift?.year ?? year ?? defYear;
    $('#gift-what').value = gift?.what ?? '';
    $('#gift-cost').value = gift?.cost || '';
    $('#gift-status').value = gift?.status ?? 'idea';
    $('#gift-notes').value = gift?.notes ?? '';
    $('#gift-delete').hidden = !gift;
    showGiftHistory();
    giftDialog.showModal();
    $('#gift-what').focus();
  }

  $('#gift-person').addEventListener('change', showGiftHistory);

  $('#gift-form').addEventListener('submit', () => {
    const cost = parseFloat($('#gift-cost').value);
    const fields = {
      personId: $('#gift-person').value,
      occasion: $('#gift-occasion').value,
      year: parseInt($('#gift-year').value, 10) || today().getFullYear(),
      what: $('#gift-what').value.trim(),
      cost: cost > 0 ? Math.round(cost * 100) / 100 : 0,
      status: $('#gift-status').value,
      notes: $('#gift-notes').value.trim(),
    };
    if (!fields.what) return;
    const id = $('#gift-id').value;
    if (id) Object.assign(data.gifts.find((g) => g.id === id), fields);
    else data.gifts.push({ id: uid(), ...fields });
    save();
    render();
  });

  $('#gift-delete').addEventListener('click', () => {
    const id = $('#gift-id').value;
    const gift = data.gifts.find((g) => g.id === id);
    if (gift && confirm(`Delete ${gift.what}?`)) {
      data.gifts = data.gifts.filter((g) => g.id !== id);
      save();
      render();
      giftDialog.close();
    }
  });

  // ---------- Calendar, export and import ----------

  function download(text, type, name) {
    const a = el('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // A calendar file with every birthday repeating yearly, and a reminder a week before so
  // there's time to post something. Christmas is in calendars already.
  $('#calendar-btn').addEventListener('click', () => {
    const people = data.people.filter((p) => p.bday);
    if (!people.length) {
      alert('Add some birthdays first.');
      return;
    }
    const pad = (n) => String(n).padStart(2, '0');
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+/, '');
    const esc = (t) => t.replace(/[\\,;]/g, (c) => `\\${c}`);
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Present Planner//EN', 'CALSCALE:GREGORIAN'];
    for (const p of people) {
      const { day, month } = p.bday;
      // Leap-day birthdays repeat on 28 February so they show up every year.
      const d = month === 2 && day === 29 ? 28 : day;
      const start = `2000${pad(month)}${pad(d)}`;
      const end = new Date(2000, month - 1, d + 1);
      lines.push('BEGIN:VEVENT',
        `UID:${p.id}@present-planner`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${start}`,
        `DTEND;VALUE=DATE:${end.getFullYear()}${pad(end.getMonth() + 1)}${pad(end.getDate())}`,
        'RRULE:FREQ=YEARLY',
        `SUMMARY:${esc(`🎂 ${p.name}'s birthday`)}`,
        'TRANSP:TRANSPARENT',
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(`${p.name}'s birthday is in a week – sort a present`)}`, 'TRIGGER:-P7D', 'END:VALARM',
        'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    download(lines.join('\r\n') + '\r\n', 'text/calendar', 'birthdays.ics');
  });

  $('#export-btn').addEventListener('click', () => {
    download(JSON.stringify(data, null, 2), 'application/json', `presents-${new Date().toISOString().slice(0, 10)}.json`);
  });

  $('#import-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      if (!valid(parsed)) throw new Error('bad shape');
      if (!confirm('Replace your current people and presents with the imported ones?')) return;
      data = parsed;
      save();
      render();
    } catch (err) {
      alert('That file could not be imported.');
    }
  });

  // ---------- Start ----------

  render();
  // Redraw after midnight or when coming back to the app, so "in N days" stays right.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
