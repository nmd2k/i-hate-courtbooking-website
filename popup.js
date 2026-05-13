import { minutesToLabel } from './lib/availability.js';

const form = document.getElementById('search-form');
const statusEl = document.getElementById('status');
const resultsEl = document.getElementById('results');
const dateEl = document.getElementById('date');
const startTimeEl = document.getElementById('start-time');
const endTimeEl = document.getElementById('end-time');

const MIN_TIME = 7 * 60;
const MAX_TIME = 22 * 60;
const STEP = 30;

function minutesToValue(minutes) {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

function valueToMinutes(value) {
  const [hours, mins] = value.split(':').map(Number);
  return hours * 60 + mins;
}

function todayValue() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function courtShortName(name) {
  return name
    .replace(/^East\s*A$/i, 'EA')
    .replace(/^East\s*B$/i, 'EB')
    .replace(/^East\s*C$/i, 'EC')
    .replace(/^East\s*D$/i, 'ED')
    .replace(/^West\s*E$/i, 'WE')
    .replace(/^West\s*F$/i, 'WF')
    .replace(/^West\s*G$/i, 'WG')
    .replace(/^West\s*H$/i, 'WH');
}

function populateTimeSelect(select, includeEndBoundary = false) {
  select.innerHTML = '';
  const limit = includeEndBoundary ? MAX_TIME : MAX_TIME - STEP;
  for (let minutes = MIN_TIME; minutes <= limit; minutes += STEP) {
    const option = document.createElement('option');
    option.value = minutesToValue(minutes);
    option.textContent = minutesToLabel(minutes);
    select.appendChild(option);
  }
}

function syncEndOptions() {
  const startMinutes = valueToMinutes(startTimeEl.value);
  const minEnd = startMinutes + STEP;
  endTimeEl.innerHTML = '';

  for (let minutes = minEnd; minutes <= MAX_TIME; minutes += STEP) {
    const option = document.createElement('option');
    option.value = minutesToValue(minutes);
    option.textContent = minutesToLabel(minutes);
    endTimeEl.appendChild(option);
  }

  if (valueToMinutes(endTimeEl.value || '00:00') < minEnd) {
    endTimeEl.value = minutesToValue(minEnd);
  }
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab;
}

/** Booking UI often lives in a PerfectMind iframe while the tab URL is sport.unimelb.edu.au. */
async function sendMessageToPerfectMindFrame(tabId, message) {
  let frames = [];
  try {
    frames = await chrome.webNavigation.getAllFrames({ tabId });
  } catch {
    /* webNavigation unavailable */
  }

  const perfectmind = frames.filter(
    (f) => typeof f.url === 'string' && f.url.includes('unimelb.perfectmind.com')
  );

  const tryOrder = perfectmind.length
    ? perfectmind.sort((a, b) => a.frameId - b.frameId)
    : null;

  let lastErr;
  if (tryOrder) {
    for (const frame of tryOrder) {
      try {
        return await chrome.tabs.sendMessage(tabId, message, { frameId: frame.frameId });
      } catch (e) {
        lastErr = e;
      }
    }
  }
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    lastErr = e;
  }
  const hint = 'Open the badminton booking view. If it is inside the sport website, use that tab so the PerfectMind frame loads, then search again.';
  throw new Error(lastErr?.message ? `${lastErr.message} ${hint}` : hint);
}

async function loadLastQuery() {
  const data = await chrome.storage.session.get('lastQuery');
  return data.lastQuery || null;
}

async function saveLastQuery(payload) {
  await chrome.storage.session.set({ lastQuery: payload });
}

function renderResults(results) {
  if (!results?.courts?.length) {
    resultsEl.replaceChildren(Object.assign(document.createElement('div'), { className: 'result', textContent: 'No courts found.' }));
    return;
  }
}

function buildMatrix(results, startTime, endTime, stepMinutes) {
  const start = valueToMinutes(startTime);
  const end = valueToMinutes(endTime);
  const times = [];
  for (let t = start; t < end; t += stepMinutes) times.push(t);

  const courts = results.courts.map((court) => court.court).sort();
  const table = document.createElement('div');
  table.className = 'matrix';

  const header = document.createElement('div');
  header.className = 'row';
  header.innerHTML = `<div class="header-cell time-head">Time</div>${courts.map((court) => `<div class="header-cell court-head" title="${court}">${courtShortName(court)}</div>`).join('')}`;
  table.appendChild(header);

  for (const time of times) {
    const row = document.createElement('div');
    row.className = 'row';
    const timeCell = document.createElement('div');
    timeCell.className = 'cell time-cell';
    timeCell.textContent = minutesToLabel(time);
    row.appendChild(timeCell);

    for (const court of courts) {
      const available = results.courts.find((item) => item.court === court)?.slots.some((slot) => time >= slot.start && time < slot.start + slot.duration && slot.open);

      const cell = document.createElement('div');
      cell.className = `cell ${available ? 'open' : 'closed'}`;
      cell.title = court;
      row.appendChild(cell);
    }

    table.appendChild(row);
  }

  return table;
}

function init() {
  populateTimeSelect(startTimeEl, false);
  populateTimeSelect(endTimeEl, true);
  startTimeEl.value = minutesToValue(9 * 60);
  syncEndOptions();

  dateEl.value = todayValue();
  dateEl.addEventListener('click', () => {
    if (typeof dateEl.showPicker === 'function') {
      dateEl.showPicker();
    }
  });

  startTimeEl.addEventListener('change', syncEndOptions);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    statusEl.textContent = 'Searching current tab...';
    resultsEl.innerHTML = '';

    const payload = {
      date: dateEl.value,
      startTime: startTimeEl.value,
      endTime: endTimeEl.value,
      stepMinutes: STEP,
    };

    try {
      await saveLastQuery(payload);
      const tab = await getActiveTab();
      if (!tab?.id) throw new Error('No active tab found.');

      const response = await sendMessageToPerfectMindFrame(tab.id, { type: 'FIND_COURTS', payload });
      if (!response?.ok) throw new Error(response?.error || 'Could not fetch availability.');

      const totalSlots = response.results.courts.reduce((n, c) => n + (c.slots?.length || 0), 0);
      if (totalSlots === 0) {
        statusEl.textContent = `Loaded ${response.results.courts.length} venue(s), but no slots for ${payload.date}. Pick another date or open DevTools → Network → FacilityAvailability and confirm the JSON includes that day.`;
      } else {
        statusEl.textContent = `Loaded ${response.results.courts.length} court(s).`;
      }
      resultsEl.replaceChildren(buildMatrix(response.results, payload.startTime, payload.endTime, payload.stepMinutes));
    } catch (error) {
      statusEl.textContent = error.message || 'Search failed.';
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  try {
    init();
  loadLastQuery().then((lastQuery) => {
      if (!lastQuery) return;
      if (lastQuery.date) dateEl.value = lastQuery.date;
      if (lastQuery.startTime) startTimeEl.value = lastQuery.startTime;
      syncEndOptions();
      if (lastQuery.endTime) endTimeEl.value = lastQuery.endTime;
    });
  } catch (error) {
    statusEl.textContent = error.message || 'Popup failed to initialize.';
  }
});
