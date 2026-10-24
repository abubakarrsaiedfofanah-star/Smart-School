import test from 'node:test'
import assert from 'node:assert/strict'
import { hasSchoolPermission } from '../src/lib/schoolRoles.js'

test('school administrators can manage school permissions', () => {
  assert.equal(hasSchoolPermission('school_admin', [], 'school.timetable.manage'), true)
})

test('principals receive explicitly assigned operational permissions', () => {
  assert.equal(hasSchoolPermission('teacher', ['principal'], 'school.timetable.manage'), true)
  assert.equal(hasSchoolPermission('teacher', ['principal'], 'school.reports.view'), true)
})

test('HR and Finance portal access stays separated', () => {
  assert.equal(hasSchoolPermission('staff', ['hr_admin'], 'school.hr.portal.view'), true)
  assert.equal(hasSchoolPermission('staff', ['hr_admin'], 'school.finance.portal.view'), false)
  assert.equal(hasSchoolPermission('teacher', ['finance_officer'], 'school.finance.portal.view'), true)
  assert.equal(hasSchoolPermission('teacher', ['finance_officer'], 'school.hr.portal.view'), false)
})

test('dual HR and Finance assignment grants neither isolated portal', () => {
  const assignments = ['hr_admin', 'finance_officer']
  assert.equal(hasSchoolPermission('staff', assignments, 'school.hr.portal.view'), false)
  assert.equal(hasSchoolPermission('staff', assignments, 'school.finance.portal.view'), false)
})

test('unknown roles and permissions are denied', () => {
  assert.equal(hasSchoolPermission('student', ['not_a_role'], 'school.hr.manage'), false)
})
