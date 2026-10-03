const { test } = require('node:test')
const assert = require('node:assert/strict')
const { ensureColors, nextColor, palette, validColor } = require('./electron/calendar-colors.cjs')

test('old calendar sources gain distinct profile colors without losing their fields', () => {
  const sources = [
    { id: 'a', profileId: 'work', name: 'Personal', value: 'private-link' },
    { id: 'b', profileId: 'work', name: 'Work', value: 'another-private-link' },
    { id: 'c', profileId: 'other', name: 'Personal', value: 'third-private-link' },
    { id: 'd', profileId: 'work', name: 'Custom', color: '#123abc', value: 'fourth-private-link' }
  ]
  const colored = ensureColors(sources)
  assert.deepEqual(colored.map(item => item.color), [palette[0], palette[1], palette[0], '#123ABC'])
  assert.deepEqual(colored.map(item => item.value), sources.map(item => item.value))
  assert.equal(sources[0].color, undefined)
  assert.equal(nextColor(colored, 'work'), palette[2])
})

test('calendar colors accept only six-digit hex values', () => {
  assert.equal(validColor('#aBc123'), true)
  for (const value of ['red', '#fff', '#12345678', 'var(--bad)', null]) assert.equal(validColor(value), false)
})
