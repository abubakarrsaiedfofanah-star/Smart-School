import test from 'node:test'
import assert from 'node:assert/strict'
import { classLabel, groupClasses } from '../src/lib/educationLevels.js'

test('class labels avoid repeating a matching grade', () => {
  assert.equal(classLabel({ name: 'Class 1', grade: 'Class 1' }), 'Class 1')
})

test('class labels separate a distinct grade with a readable middle dot', () => {
  assert.equal(classLabel({ name: 'Blue', grade: 'Class 1' }), 'Blue · Class 1')
})

test('classes are grouped in education stage order and sorted within each stage', () => {
  const grouped = groupClasses([
    { name: 'JSS 2', education_stage: 'jss' },
    { name: 'Class 2', education_stage: 'primary', level_order: 2 },
    { name: 'Class 1', education_stage: 'primary', level_order: 1 },
  ])

  assert.deepEqual(grouped.map(group => group.stage), ['primary', 'jss'])
  assert.deepEqual(grouped[0].classes.map(item => item.name), ['Class 1', 'Class 2'])
})

test('unknown classes are preserved in an Other group and sorted naturally', () => {
  const grouped = groupClasses([
    { name: 'Room 10', education_stage: 'custom' },
    { name: 'Room 2', education_stage: 'custom' },
  ])

  assert.equal(grouped[0].stage, 'other')
  assert.deepEqual(grouped[0].classes.map(item => item.name), ['Room 2', 'Room 10'])
})

test('empty input returns no groups', () => {
  assert.deepEqual(groupClasses([]), [])
})
