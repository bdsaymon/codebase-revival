import test from 'node:test';
import assert from 'node:assert/strict';
import { getTimeOfDayGreeting } from './homeGreeting';

test('returns Good Morning with name during morning hours', () => {
  const morning = new Date(2026, 10, 21, 9, 15, 0);
  const res = getTimeOfDayGreeting({ date: morning, name: 'Mithila', isEnglish: false });
  assert.equal(res.headline, 'Good Morning, Mithila');
  assert.equal(res.subtitle, 'I can help you.');
  assert.equal(res.placeholder, 'How can I help you today?');
});

test('returns Good Afternoon, Good Evening, and Good Night in English with user name at the end', () => {
  const afternoon = new Date(2026, 10, 21, 14, 0, 0);
  const evening = new Date(2026, 10, 21, 20, 30, 0);
  const night = new Date(2026, 10, 21, 23, 15, 0);
  assert.equal(
    getTimeOfDayGreeting({ date: afternoon, name: 'SAYMON HASAN' }).headline,
    'Good Afternoon, SAYMON HASAN'
  );
  assert.equal(
    getTimeOfDayGreeting({ date: evening, name: 'Saymon' }).headline,
    'Good Evening, Saymon'
  );
  assert.equal(
    getTimeOfDayGreeting({ date: night, name: 'Saymon' }).headline,
    'Good Night, Saymon'
  );
});

test('falls back cleanly to English time-of-day greeting when name is empty', () => {
  const morning = new Date(2026, 10, 21, 8, 0, 0);
  const res = getTimeOfDayGreeting({ date: morning, name: '   ' });
  assert.equal(res.headline, 'Good Morning');
  assert.equal(res.subtitle, 'I can help you.');
});
