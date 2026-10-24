import test from 'node:test'
import assert from 'node:assert/strict'
import { formatCurrency } from '../src/lib/formatters.js'

test('currency formatting returns a localized amount for a supported currency', () => {
  assert.match(formatCurrency(1234, 'KES'), /1,?234/)
})

test('Swahili KES formatting returns a localized amount', () => {
  assert.match(formatCurrency(1234, 'KES', 'sw'), /1,?234/)
})

test('invalid currency codes fall back to KES', () => {
  assert.equal(formatCurrency(100, 'bad'), formatCurrency(100, 'KES'))
})

test('invalid numeric input safely formats as zero', () => {
  assert.match(formatCurrency('not a number', 'USD'), /0/)
})
