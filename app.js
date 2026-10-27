(() => {
  'use strict';

  // People you buy presents for, with their birthdays, and what you've got them each
  // Christmas and birthday. Everything is saved on this device in local storage.

  const STORAGE_KEY = 'present-planner-v1';
  const OCCASIONS = { christmas: { icon: '🎄', label: 'Christmas' }, birthday: { icon: '🎂', label: 'Birthday' } };
  const GIFT_STATUS = { idea: { icon: '💡', label: 'Idea' }, bought: { icon: '🛍️', label: 'Bought' }, sent: { icon: '✅', label: 'Sent' } };
  const NEXT_STATUS = { idea: 'bought', bought: 'sent', sent: 'idea' };
  const STATE_TEXT = { none: 'Nothing yet', idea: 'Only ideas', bought: 'Not sent yet', sent: 'Sent' };
  const CARD_TEXT = { yes: '✉️ Card: Yes', no: '✉️ Card: No' };
  const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i, 1).toLocaleDateString(undefined, { month: 'long' }));
  const DUE_DAYS = { birthday: 30, christmas: 60 };   // how soon something counts as needing sorting

  // ---------- State ----------

  let data = load();
  // The year every tab shows: this year when the app opens.
  let shownYear = today().getFullYear();

  function valid(value) {
    return value && Array.isArray(value.people) && Array.isArray(value.gifts);
  }

  function load() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (valid(parsed)) return withCards(parsed);
    } catch (e) { /* fall through to empty */ }
    return { people: [], gifts: [], cards: {} };
  }

  // Cards sent, as { "personId|occasion|year": true }. Lists saved before cards existed have none.
  function withCards(value) {
    if (!value.cards || typeof value.cards !== 'object') value.cards = {};
    return value;
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

  // A person's birthday or Christmas in a given year (past or future), or null.
  function occasionIn(person, occasion, year) {
    let date;
    if (occasion === 'christmas') date = new Date(year, 11, 25);
    else if (person.bday) date = dateInYear(year, person.bday.month, person.bday.day);
    else return null;
    const days = Math.round((date - today()) / 86400000);
    const age = occasion === 'birthday' && person.bday.year ? year - person.bday.year : null;
    return { person, occasion, date, year, days, age };
  }

  // Budgets are kept per year, and carry on to later years until changed. A budget saved
  // before budgets were per year counts for every year.
  function budgetFor(person, year) {
    const years = Object.keys(person.budgets || {}).map(Number).filter((y) => y <= year);
    if (!years.length) return person.budget || null;
    return person.budgets[Math.max(...years)] || null;
  }

  // Occasions coming up, soonest first. `limit` is a number of days, or one per occasion.
  function upcoming(limit, after = -1, only = null) {
    const list = [];
    for (const person of data.people) {
      for (const occasion of only ? [only] : Object.keys(OCCASIONS)) {
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

  const wantsCard = (person) => person.card !== false;
  const cardKey = (personId, occasion, year) => `${personId}|${occasion}|${year}`;
  const cardSent = (personId, occasion, year) => !!data.cards[cardKey(personId, occasion, year)];

  function toggleCard(personId, occasion, year) {
    const key = cardKey(personId, occasion, year);
    if (data.cards[key]) delete data.cards[key];
    else data.cards[key] = true;
    save();
    render();
  }

  function cardButton(personId, occasion, year, withIcon) {
    const sent = cardSent(personId, occasion, year);
    return el('button', { type: 'button', class: `badge card-toggle ${sent ? 'yes' : ''}`, 'aria-pressed': String(sent),
      title: sent ? 'Card sent – tap to undo' : 'Tap when the card is sent',
      onclick: () => toggleCard(personId, occasion, year) },
    `${withIcon ? `${OCCASIONS[occasion].icon} ` : ''}${sent ? CARD_TEXT.yes : CARD_TEXT.no}`);
  }

  // Sorted when every present is sent and, if they get one, the card is too.
  function occasionDone(occ) {
    return occasionState(giftsFor(occ.person.id, occ.occasion, occ.year)) === 'sent'
      && (!wantsCard(occ.person) || cardSent(occ.person.id, occ.occasion, occ.year));
  }

  function whenText(occ) {
    const date = occ.date.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
    const d = occ.days;
    const when = d === 0 ? 'today' : d === 1 ? 'tomorrow' : d === -1 ? 'yesterday'
      : Math.abs(d) > 60 ? '' : d > 0 ? `in ${d} days` : `${-d} days ago`;
    const age = occ.age ? (d < 0 ? `turned ${occ.age}` : `turning ${occ.age}`) : '';
    return [date, when, age].filter(Boolean).join(' · ');
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
    const done = occasionDone(occ);
    const urgent = !done && occ.days >= 0 && occ.days <= 7;
    const past = occ.days < 0;
    const budget = budgetFor(occ.person, occ.year);
    const bought = list.filter((g) => g.status === 'bought');
    // Each present is a button that opens it for editing.
    const what = list.length
      ? el('span', { class: 'due-gifts' }, list.map((g) => el('button', { type: 'button', class: 'gift-chip', title: `Edit ${g.what}`, onclick: () => openGiftDialog(g) },
          `${GIFT_STATUS[g.status].icon} ${g.what}${g.cost ? ` · ${moneyText(g.cost)}` : ''} `, el('span', { class: 'gift-chip-edit', 'aria-hidden': 'true' }, '✏️'))))
      : el('span', { class: 'due-what' }, 'No present yet');
    const label = done ? 'All sorted' : state === 'sent' ? 'Card not sent' : past && state === 'none' ? 'Nothing recorded' : STATE_TEXT[state];
    return el('li', { class: `due-row ${done || past ? 'done' : urgent ? 'urgent' : ''}` },
      el('div', { class: 'due-info' },
        el('span', { class: 'due-name' }, `${OCCASIONS[occ.occasion].icon} ${occ.person.name}`),
        // Christmas has its own tab with the date at the top, so its rows don't repeat it.
        occ.occasion === 'birthday' ? el('span', { class: 'muted due-when' }, whenText(occ)) : null,
        budget ? el('span', { class: 'muted due-when' }, `Budget ${moneyText(budget)}${spent(list) ? ` · spent ${moneyText(spent(list))}` : ''}`) : null,
        what),
      el('span', { class: `badge ${done ? 'ok' : past ? '' : urgent || state === 'none' ? 'bad' : 'warn'}` }, label),
      el('div', { class: 'due-actions' },
        // More presents can be added any time until everything's sent.
        state === 'sent'
          ? null
          : el('button', { type: 'button', class: 'btn btn-small', onclick: () => openGiftDialog(null, occ.person.id, occ.occasion, occ.year) }, '+ Present'),
        bought.length
          ? el('button', { type: 'button', class: 'btn btn-small', onclick: () => {
              bought.forEach((g) => { g.status = 'sent'; });
              save();
              render();
            } }, 'Mark sent')
          : null,
        wantsCard(occ.person) ? cardButton(occ.person.id, occ.occasion, occ.year) : null));
  }

  function setCount(id, n) {
    $(id).textContent = n ? String(n) : '';
    $(id).hidden = !n;
  }

  // ---------- Birthdays ----------

  function renderBirthdays() {
    const soon = upcoming(DUE_DAYS.birthday, -1, 'birthday');
    const due = soon.filter((occ) => !occasionDone(occ));
    // "To sort" is about now, so it shows with this year (and the count on the tab always does).
    const isThisYear = shownYear === today().getFullYear();
    $('#bday-due-panel').hidden = !isThisYear;
    $('#bday-due').replaceChildren(...due.map(dueRow));
    $('#bday-due-empty').hidden = due.length > 0;
    $('#bday-due-empty').textContent = data.people.some((p) => p.bday)
      ? 'No birthdays to sort out in the next 30 days. 🎉'
      : 'Add the people you buy presents for in People, with their birthdays, and they’ll show up here a month before.';
    setCount('#birthdays-count', due.length);

    // Every birthday in the year shown, January to December (leaving out ones already in To sort).
    const inToSort = new Set(isThisYear ? due.filter((o) => o.year === shownYear).map((o) => o.person.id) : []);
    const all = data.people.map((p) => occasionIn(p, 'birthday', shownYear))
      .filter((occ) => occ && !inToSort.has(occ.person.id))
      .sort((a, b) => a.date - b.date || a.person.name.localeCompare(b.person.name));
    $('#bday-year-title').textContent = `Birthdays in ${shownYear}`;
    $('#bday-later').replaceChildren(...all.map(dueRow));
    $('#bday-later-empty').hidden = all.length > 0;
    $('#bday-later-empty').textContent = data.people.some((p) => p.bday) ? `No other birthdays in ${shownYear}.` : '';
  }

  // ---------- Christmas ----------

  function renderChristmas() {
    // Everyone you buy for, plus anyone who had a Christmas present that year.
    const all = data.people
      .filter((p) => p.christmas !== false || giftsFor(p.id, 'christmas', shownYear).length)
      .map((p) => occasionIn(p, 'christmas', shownYear))
      .sort((a, b) => a.person.name.localeCompare(b.person.name));
    const days = Math.round((new Date(shownYear, 11, 25) - today()) / 86400000);
    $('#xmas-title').textContent = `Christmas ${shownYear}`;
    $('#xmas-when').textContent = days === 0 ? 'today! 🎄' : days === 1 ? 'tomorrow' : days > 0 ? `in ${days} days` : '';

    const todo = all.filter((occ) => !occasionDone(occ));
    const done = all.filter(occasionDone);
    $('#xmas-todo').replaceChildren(...todo.map(dueRow));
    $('#xmas-done').replaceChildren(...done.map(dueRow));
    $('#xmas-todo-head').hidden = !todo.length;
    $('#xmas-todo-head').textContent = days < 0 ? 'Not sorted' : 'Still to sort';
    $('#xmas-done-head').hidden = !done.length;

    const yearGifts = data.gifts.filter((g) => g.occasion === 'christmas' && g.year === shownYear);
    const budget = all.reduce((sum, occ) => sum + (budgetFor(occ.person, shownYear) || 0), 0);
    $('#xmas-summary').hidden = !all.length;
    $('#xmas-summary').textContent = `${done.length} of ${all.length} sorted · ${moneyText(spent(yearGifts))} spent${budget ? ` of ${moneyText(budget)} budget` : ''}`;
    $('#xmas-empty').hidden = all.length > 0;
    $('#xmas-empty').textContent = 'No one to buy for yet. Add people in People and tick “I buy them a Christmas present”.';
    // The count on the tab is about the next Christmas, whichever year is shown, and only
    // once it's getting close.
    const nextTodo = upcoming(DUE_DAYS.christmas, -1, 'christmas').filter((occ) => !occasionDone(occ));
    setCount('#christmas-count', nextTodo.length);
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
      gift.link && parseUrl(gift.link)
        ? el('a', { class: 'btn btn-icon gift-link', href: gift.link, target: '_blank', rel: 'noopener', title: `Open on ${shopName(gift.link)}` }, `🔗 ${shopName(gift.link)}`)
        : null,
      el('span', { class: 'gift-cost' }, gift.cost ? moneyText(gift.cost) : ''),
      el('button', { type: 'button', class: `badge gift-status ${gift.status}`, title: 'Tap to change', onclick: () => {
        gift.status = NEXT_STATUS[gift.status] || 'bought';
        save();
        render();
      } }, `${status.icon} ${status.label}`),
      el('button', { type: 'button', class: 'btn btn-icon', title: `Edit ${gift.what}`, 'aria-label': `Edit ${gift.what}`, onclick: () => openGiftDialog(gift) }, '✏️'));
  }

  function personCard(person) {
    const list = data.gifts.filter((g) => g.personId === person.id && g.year === shownYear)
      .sort((a, b) => a.occasion.localeCompare(b.occasion) || a.what.localeCompare(b.what));
    const meta = [birthdayText(person)];
    if (person.christmas === false) meta.push('No Christmas present');
    if (!wantsCard(person)) meta.push('No card');
    const cardOccasions = wantsCard(person)
      ? Object.keys(OCCASIONS).filter((o) => (o === 'christmas' ? person.christmas !== false : !!person.bday))
      : [];
    const budget = budgetFor(person, shownYear);
    if (budget) meta.push(`Budget ${moneyText(budget)}`);
    const over = Object.keys(OCCASIONS).filter((occ) => budget && spent(list.filter((g) => g.occasion === occ)) > budget);
    const total = spent(list);
    return el('article', { class: 'card' },
      el('div', { class: 'card-head' },
        el('h3', {}, person.name),
        el('span', { class: 'muted' }, total ? moneyText(total) : ''),
        el('button', { type: 'button', class: 'btn btn-icon', title: `Edit ${person.name}`, 'aria-label': `Edit ${person.name}`, onclick: () => openPersonDialog(person) }, '✏️')),
      el('p', { class: 'muted card-meta' }, meta.join(' · '),
        over.length ? el('span', { class: 'badge bad' }, `Over budget for ${over.map((o) => OCCASIONS[o].label).join(' and ')}`) : null),
      person.notes ? el('p', { class: 'muted card-meta card-notes' }, person.notes) : null,
      cardOccasions.length
        ? el('p', { class: 'card-meta' }, cardOccasions.map((o) => cardButton(person.id, o, shownYear, true)))
        : null,
      list.length
        ? el('ul', { class: 'gift-list' }, list.map(giftRow))
        : el('p', { class: 'card-empty' }, `Nothing for ${shownYear} yet.`),
      el('button', { type: 'button', class: 'btn btn-small card-add', onclick: () => openGiftDialog(null, person.id) }, '+ Present'));
  }

  function renderPeople() {
    const q = $('#search').value.trim().toLowerCase();
    const people = data.people.filter((p) => !q || p.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
    $('#people').replaceChildren(...people.map(personCard));
    $('#people-empty').hidden = data.people.length > 0;
  }

  // ---------- Spending ----------

  function renderSpending() {
    $('#spend-title').textContent = `Spending in ${shownYear}`;
    const yearGifts = data.gifts.filter((g) => g.year === shownYear);
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
    ] : [el('caption', { class: 'muted' }, `No presents bought for ${shownYear}.`)]));
  }

  function render() {
    const thisYear = today().getFullYear();
    $('#year-label').textContent = String(shownYear);
    $('#year-today').hidden = shownYear === thisYear;
    $('#year-today').textContent = `Back to ${thisYear}`;
    renderBirthdays();
    renderChristmas();
    renderPeople();
    renderSpending();
  }

  $('#year-prev').addEventListener('click', () => { shownYear--; render(); });
  $('#year-next').addEventListener('click', () => { shownYear++; render(); });
  $('#year-today').addEventListener('click', () => { shownYear = today().getFullYear(); render(); });
  $('#search').addEventListener('input', renderPeople);
  $('#add-person-btn').addEventListener('click', () => openPersonDialog(null));

  // ---------- Tabs ----------

  const TABS = ['birthdays', 'christmas', 'people', 'spending'];

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
    $('#person-card').checked = person ? wantsCard(person) : true;
    $('#person-budget-year').textContent = String(shownYear);
    $('#person-budget-hint').textContent = shownYear < today().getFullYear()
      ? `(optional – just for ${shownYear})`
      : '(optional – carries on to later years until you change it)';
    $('#person-budget').value = (person && budgetFor(person, shownYear)) ?? '';
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
    const budget = parseFloat($('#person-budget').value) > 0 ? parseFloat($('#person-budget').value) : null;
    const id = $('#person-id').value;
    const existing = id ? data.people.find((p) => p.id === id) : null;
    // Save the budget against the year shown, only if it's changed for that year.
    const budgets = { ...(existing?.budgets || {}) };
    if (!existing || budget !== budgetFor(existing, shownYear)) {
      // Changing a past year's budget leaves the years after it as they were.
      if (existing && shownYear < today().getFullYear() && !(String(shownYear + 1) in budgets)) {
        budgets[shownYear + 1] = budgetFor(existing, shownYear + 1) || 0;
      }
      budgets[shownYear] = budget || 0;
    }
    const fields = {
      name: $('#person-name').value.trim(),
      bday: day && month ? { day, month, ...(year > 1900 ? { year } : {}) } : null,
      christmas: $('#person-christmas').checked,
      card: $('#person-card').checked,
      budgets,
      notes: $('#person-notes').value.trim(),
    };
    if (!fields.name) return;
    if (existing) Object.assign(existing, fields);
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
    for (const key of Object.keys(data.cards)) if (key.startsWith(`${id}|`)) delete data.cards[key];
    save();
    render();
    personDialog.close();
  });

  // ---------- Product links ----------

  function firstUrl(text) {
    const match = (text || '').match(/https?:\/\/[^\s<>"']+/);
    return match ? match[0] : '';
  }

  function parseUrl(text) {
    try {
      const url = new URL(text.trim());
      return /^https?:$/.test(url.protocol) ? url : null;
    } catch (e) { return null; }
  }

  // "www.johnlewis.com" -> "Johnlewis", "amazon.co.uk" -> "Amazon".
  function shopName(link) {
    const url = parseUrl(link || '');
    if (!url) return '';
    const parts = url.hostname.replace(/^(www|m|shop)\./, '').split('.');
    const main = parts.length > 2 && parts[parts.length - 2].length <= 3 ? parts[parts.length - 3] : parts[parts.length - 2] || parts[0];
    return main.charAt(0).toUpperCase() + main.slice(1);
  }

  // Shops can't be read from here, so guess the product's name from the words in the link,
  // e.g. amazon.co.uk/Lego-Classic-Bricks/dp/B00NHQFA1I -> "Lego Classic Bricks".
  function nameFromLink(link) {
    const url = parseUrl(link || '');
    if (!url) return '';
    const words = (segment) => decodeURIComponent(segment)
      .replace(/\.(html?|aspx|php)$/i, '')
      .split(/[-_+\s]+/)
      .filter((w) => /[a-z]/i.test(w) && !/\d{3,}/.test(w) && !/^[A-Z0-9]{8,}$/.test(w));
    let best = [];
    for (const segment of url.pathname.split('/')) {
      try {
        const w = words(segment);
        if (w.length > best.length) best = w;
      } catch (e) { /* not decodable */ }
    }
    if (best.length < 2) return '';
    const name = best.slice(0, 8).join(' ');
    return name.charAt(0).toUpperCase() + name.slice(1);
  }

  // A shared page's title is usually the product name with the shop on the end:
  // "Yankee Candle : Amazon.co.uk: Home", "Cashmere Scarf | John Lewis", "Mug - Etsy UK".
  function productTitle(title) {
    let t = title.split(/\s+[|:]\s+/)[0].trim();
    const dash = Math.max(t.lastIndexOf(' - '), t.lastIndexOf(' – '));
    if (dash > 0 && t.length - dash <= 25) t = t.slice(0, dash).trim();
    return t;
  }

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

  let nameFromLinkUsed = false;   // the name was filled in from the link, so a new link can replace it

  function showLinkButton() {
    const url = parseUrl($('#gift-link').value);
    $('#gift-open').hidden = !url;
    if (url) $('#gift-open').href = url.href;
  }

  function setGiftLink(text) {
    const link = firstUrl(text) || text.trim();
    $('#gift-link').value = link;
    if (!$('#gift-what').value.trim() || nameFromLinkUsed) {
      const name = nameFromLink(link);
      if (name) {
        $('#gift-what').value = name;
        nameFromLinkUsed = true;
      }
    }
    showLinkButton();
  }

  function openGiftDialog(gift, personId, occasion, year, shared) {
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
    $('#gift-link').value = gift?.link ?? '';
    nameFromLinkUsed = false;
    if (shared) {
      setGiftLink(shared.link);
      const title = productTitle(shared.title || '');
      if (title && !parseUrl(title)) { $('#gift-what').value = title; nameFromLinkUsed = false; }
    }
    showLinkButton();
    $('#gift-cost').value = gift?.cost || '';
    $('#gift-status').value = gift?.status ?? 'idea';
    $('#gift-notes').value = gift?.notes ?? '';
    $('#gift-delete').hidden = !gift;
    showGiftHistory();
    giftDialog.showModal();
    $(shared ? '#gift-cost' : '#gift-what').focus();
  }

  $('#gift-person').addEventListener('change', showGiftHistory);
  $('#gift-what').addEventListener('input', () => { nameFromLinkUsed = false; });
  $('#gift-link').addEventListener('change', () => setGiftLink($('#gift-link').value));
  $('#gift-link').addEventListener('paste', () => setTimeout(() => setGiftLink($('#gift-link').value)));
  $('#gift-paste').addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (firstUrl(text)) setGiftLink(text);
      else alert('There’s no link on your clipboard. Copy the product’s link from the shop first.');
    } catch (e) {
      $('#gift-link').focus();
      alert('Your phone didn’t allow pasting from here. Press and hold in the Link box and choose Paste.');
    }
  });

  $('#gift-form').addEventListener('submit', () => {
    const cost = parseFloat($('#gift-cost').value);
    const fields = {
      personId: $('#gift-person').value,
      occasion: $('#gift-occasion').value,
      year: parseInt($('#gift-year').value, 10) || today().getFullYear(),
      what: $('#gift-what').value.trim(),
      link: parseUrl($('#gift-link').value) ? $('#gift-link').value.trim() : '',
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
      data = withCards(parsed);
      save();
      render();
    } catch (err) {
      alert('That file could not be imported.');
    }
  });

  // ---------- Start ----------

  render();

  // Shared from a shop's app or website (Android: Share → Presents): add it as a present.
  (() => {
    const params = new URLSearchParams(location.search);
    const link = parseUrl(params.get('url') || '') ? params.get('url') : firstUrl(params.get('text')) || firstUrl(params.get('title'));
    if (!link) return;
    history.replaceState(null, '', location.pathname);
    if (!data.people.length) {
      alert('Add the people you buy for first, then share the product again.');
      showTab('people');
      return;
    }
    const text = (params.get('text') || '').replace(link, '').trim();
    openGiftDialog(null, null, null, null, { link, title: params.get('title') || text });
  })();
  // Redraw after midnight or when coming back to the app, so "in N days" stays right.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
})();
