import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import {
  dateInputToApiIso,
  dedupeAvailabilitySlots,
  normalizeAvailabilities,
  parseAvailabilityEntryDate,
  validateNormalizedSlots,
} from '../lib/availability.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

test('normalizeAvailabilities maps groups and disables', () => {
  const raw = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'availability-sample.json'), 'utf8'));
  const slots = normalizeAvailabilities(raw, '2026-05-13');
  assert.equal(slots.length, 2);
  assert.equal(slots[0].court, 'Court East A');
  assert.equal(slots[0].start, 540);
  assert.equal(slots[0].open, true);
  assert.equal(slots[1].open, false);
  assert.deepEqual(validateNormalizedSlots(slots), []);
});

test('normalizeAvailabilities returns empty when no day matches (no silent wrong day)', () => {
  const raw = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'availability-sample.json'), 'utf8'));
  const slots = normalizeAvailabilities(raw, '2099-01-01');
  assert.equal(slots.length, 0);
});

test('normalizeAvailabilities handles ISO Date strings', () => {
  const raw = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'availability-iso-date.json'), 'utf8'));
  const slots = normalizeAvailabilities(raw, '2026-05-13');
  assert.equal(slots.length, 1);
  assert.equal(slots[0].start, 600);
});

test('parseAvailabilityEntryDate handles /Date(ms)/ and ISO', () => {
  const d1 = parseAvailabilityEntryDate('/Date(1778673600000)/');
  assert.equal(d1.getUTCFullYear(), 2026);
  const d2 = parseAvailabilityEntryDate('2026-05-13T12:00:00Z');
  assert.ok(!Number.isNaN(d2.getTime()));
});

test('dedupeAvailabilitySlots prefers open when duplicate keys', () => {
  const merged = dedupeAvailabilitySlots([
    { court: 'A', start: 540, duration: 30, open: false },
    { court: 'A', start: 540, duration: 30, open: true },
  ]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].open, true);
});

test('dateInputToApiIso uses ISO string at noon local', () => {
  assert.match(dateInputToApiIso('2026-05-13'), /2026-05-13T\d\d:\d\d:\d\d\.\d{3}Z$/);
});

test('validateNormalizedSlots flags bad shapes', () => {
  const issues = validateNormalizedSlots([
    { court: '', start: 0, duration: 30, open: true },
    { court: 'A', start: NaN, duration: 0, open: 'yes' },
  ]);
  assert.ok(issues.some((msg) => msg.includes('court name')));
  assert.ok(issues.some((msg) => msg.includes('start')));
  assert.ok(issues.some((msg) => msg.includes('duration')));
  assert.ok(issues.some((msg) => msg.includes('open')));
});
