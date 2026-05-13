/* Availability helpers: keep in sync with lib/availability.js (Node tests import that file). */

function parseDateValue(date) {
  return new Date(`${date}T00:00:00`);
}

function sameDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function dateInputToApiIso(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error('Invalid date.');
  }
  return new Date(`${dateStr}T12:00:00`).toISOString();
}

function parseAvailabilityEntryDate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
  const s = String(value).trim();
  const ms = s.match(/\/Date\((-?\d+)\)\//);
  if (ms) return new Date(Number(ms[1]));
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t);
  return null;
}

function dedupeAvailabilitySlots(slots) {
  const map = new Map();
  for (const s of slots) {
    const key = `${s.court}\0${s.start}\0${s.duration}`;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, { ...s });
    } else if (s.open && !prev.open) {
      map.set(key, { ...s });
    }
  }
  return [...map.values()];
}

function normalizeAvailabilities(data, selectedDate) {
  const requestedDay = parseDateValue(selectedDate);
  const availabilities = data?.availabilities || [];
  const day = availabilities.find((entry) => {
    const d = parseAvailabilityEntryDate(entry?.Date);
    return d && !Number.isNaN(d.getTime()) && sameDay(d, requestedDay);
  });
  if (!day) return [];

  const groups = day.BookingGroups || [];
  const slots = groups.flatMap((group) => (group.AvailableSpots || []).map((spot) => ({
    court: group.Name,
    start: spot.Time?.TotalMinutes ?? 0,
    duration: spot.Duration?.TotalMinutes ?? 30,
    open: !spot.IsDisabled,
  })));
  return dedupeAvailabilitySlots(slots);
}

function validateNormalizedSlots(slots) {
  const issues = [];
  for (let i = 0; i < slots.length; i += 1) {
    const s = slots[i];
    const prefix = `slot[${i}]`;
    if (typeof s.court !== 'string' || !s.court.trim()) {
      issues.push(`${prefix}: missing court name`);
    }
    if (typeof s.start !== 'number' || Number.isNaN(s.start)) {
      issues.push(`${prefix}: invalid start minutes`);
    }
    if (typeof s.duration !== 'number' || s.duration <= 0) {
      issues.push(`${prefix}: invalid duration`);
    }
    if (typeof s.open !== 'boolean') {
      issues.push(`${prefix}: open must be boolean`);
    }
  }
  return issues;
}

function getAntiForgeryToken() {
  return document.querySelector('input[name="__RequestVerificationToken"]')?.value || null;
}

function getPageIds() {
  const url = new URL(location.href);
  const facilityId = url.searchParams.get('facilityId') || '5dd9d9de-c567-472f-8f92-c0b0040fce0b';
  const mapId = url.searchParams.get('mapId')
    || (facilityId === '5dd9d9de-c567-472f-8f92-c0b0040fce0b'
      ? '7d8b8d20-b7cf-43ac-8167-0738142baff3'
      : facilityId);
  return {
    facilityId,
    mapId,
    widgetId: url.searchParams.get('widgetId') || '15f6af07-39c5-473e-b053-96653f77a406',
    calendarId: url.searchParams.get('calendarId') || 'bce15730-1f38-4e5c-889c-856322a7f877',
  };
}

function extractLandingPageService() {
  const scripts = Array.from(document.scripts || []);
  for (const script of scripts) {
    const text = script.textContent || '';
    if (!text.includes('new MainViewModel({')) continue;

    const match = text.match(/services:\s*(\[[\s\S]*?\]),\s*availabilityUrl:/m);
    if (!match) continue;

    try {
      const services = JSON.parse(match[1]);
      if (Array.isArray(services) && services.length) return services[0];
    } catch {
      // ignore and continue to fallbacks
    }
  }

  return null;
}

function getLiveServiceId() {
  return extractLandingPageService()?.ID || window.jQuery?.('#services-dropdown').val() || 'e413294c-507d-4653-b25e-c30c09be2e3f';
}

function getLiveDurationIds() {
  const service = extractLandingPageService();
  const durationIds = service?.Durations?.[0]?.DurationIDs;
  if (Array.isArray(durationIds) && durationIds.length) return durationIds;

  return [
    '393bd548-77a3-42db-8b10-02580516a1d6',
    'abfe26e9-3c74-4bf9-a82d-0ae8e99fd8d4',
    'b2645b1b-0c84-40d5-b39f-87f93eb06d53',
    '60887470-6f40-4743-833c-8b384b3e8df8',
    '229389cc-d915-4b60-9df8-9d1fdd136405',
    '631e4ac3-3b5b-4232-97d7-c5a0349c0c24',
    '6f6b5113-ca4a-4db6-a02d-c984436d94ab',
    '6d2a7123-cc28-403b-922c-de17e7607b51',
  ];
}

async function fetchFacilityList() {
  const ids = getPageIds();
  const token = getAntiForgeryToken();
  const body = new URLSearchParams();

  body.set('take', '10000');
  body.set('skip', '0');
  body.set('page', '1');
  body.set('pageSize', '10000');
  body.set('ShouldCheckAvailability', 'false');
  body.set('calendarId', ids.calendarId);
  body.set('widgetId', ids.widgetId);
  body.set('mapId', ids.mapId);
  body.set('filtersLoaded', 'true');
  body.set('__RequestVerificationToken', token || '');

  const response = await fetch('/32617/Clients/BookMe4FacilityMap/GetFacilities', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Facility list request failed (${response.status}).`);
  }

  const data = await response.json();
  return Array.isArray(data.facilities) ? data.facilities : [];
}

async function fetchAvailabilityForFacility(facilityId, selectedDate) {
  const ids = getPageIds();
  const token = getAntiForgeryToken();
  const body = new URLSearchParams();

  body.set('facilityId', facilityId);
  body.set('date', dateInputToApiIso(selectedDate));
  body.set('daysCount', '7');
  body.set('duration', '30');
  body.set('serviceId', getLiveServiceId());
  body.set('widgetId', ids.widgetId);
  body.set('calendarId', ids.calendarId);
  for (const durationId of getLiveDurationIds()) {
    body.append('durationIds[]', durationId);
  }
  body.set('__RequestVerificationToken', token || '');

  const response = await fetch('/32617/Clients/BookMe4LandingPages/FacilityAvailability', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: body.toString(),
  });

  if (!response.ok) {
    throw new Error(`Availability request failed (${response.status}).`);
  }

  return response.json();
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'PING') {
    sendResponse({ ok: true });
    return;
  }

  if (message?.type !== 'FIND_COURTS') return;

  (async () => {
    try {
      const selectedDate = message.payload?.date;
      if (!selectedDate) {
        sendResponse({ ok: false, error: 'Missing date in payload.' });
        return;
      }

      const facilities = await fetchFacilityList();
      const availabilityByFacility = await Promise.all(
        facilities.map(async (facility) => {
          const raw = await fetchAvailabilityForFacility(facility.ID, selectedDate);
          const slots = normalizeAvailabilities(raw, selectedDate);
          const validationIssues = validateNormalizedSlots(slots);
          if (validationIssues.length) {
            console.warn('[Court Finder]', facility.Name, validationIssues);
          }
          return {
            name: facility.Name,
            id: facility.ID,
            slots,
          };
        })
      );

      const ids = getPageIds();
      const courts = availabilityByFacility.map((facility) => ({
        court: facility.name,
        facilityId: facility.id,
        slots: facility.slots,
      }));

      sendResponse({
        ok: true,
        results: {
          date: selectedDate,
          siteOrigin: location.origin,
          mapId: ids.mapId,
          widgetId: ids.widgetId,
          calendarId: ids.calendarId,
          courts,
        },
      });
    } catch (error) {
      sendResponse({ ok: false, error: error.message || 'Failed to fetch availability.' });
    }
  })();

  return true;
});
