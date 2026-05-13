/** Pure helpers shared by the content script (inlined copy in content.js) and Node tests. */

export function parseDateValue(date) {
  return new Date(`${date}T00:00:00`);
}

export function sameDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

/**
 * <input type="date"> yields YYYY-MM-DD in local calendar semantics.
 * Use noon local to reduce timezone edge cases when serializing for the API.
 */
export function dateInputToApiIso(dateStr) {
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    throw new Error('Invalid date.');
  }
  return new Date(`${dateStr}T12:00:00`).toISOString();
}

export function minutesToLabel(minutes) {
  const hours24 = Math.floor(minutes / 60);
  const mins = String(minutes % 60).padStart(2, '0');
  const suffix = hours24 >= 12 ? 'PM' : 'AM';
  const hours12 = ((hours24 + 11) % 12) + 1;
  return `${hours12}:${mins}${suffix}`;
}

/**
 * PerfectMind uses `/Date(ms)/`, ISO strings, or numeric epoch in `availabilities[].Date`.
 * Do not use `/\d+/` on ISO strings — it would only capture the year.
 */
export function parseAvailabilityEntryDate(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return new Date(value);
  const s = String(value).trim();
  const ms = s.match(/\/Date\((-?\d+)\)\//);
  if (ms) return new Date(Number(ms[1]));
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return new Date(t);
  return null;
}

/** When the same court/start/duration appears from multiple durationIds, keep open if any row is bookable. */
export function dedupeAvailabilitySlots(slots) {
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

/**
 * @param {*} data Parsed JSON from FacilityAvailability
 * @param {string} selectedDate YYYY-MM-DD from the popup
 * @returns {{ court: string, start: number, duration: number, open: boolean }[]}
 */
export function normalizeAvailabilities(data, selectedDate) {
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

/**
 * Sanity checks on normalized slots for debugging / automated validation.
 */
export function validateNormalizedSlots(slots) {
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
