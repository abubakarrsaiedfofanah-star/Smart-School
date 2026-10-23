export const educationLevels = [
  { stage: 'pre_primary', label: 'Pre-primary', levels: ['Nursery 1', 'Nursery 2', 'Kindergarten'] },
  { stage: 'primary', label: 'Primary school', levels: ['Class 1', 'Class 2', 'Class 3', 'Class 4', 'Class 5', 'Class 6'] },
  { stage: 'jss', label: 'Junior Secondary School (JSS)', levels: ['JSS 1', 'JSS 2', 'JSS 3'] },
  { stage: 'sss', label: 'Senior Secondary School (SSS)', levels: ['SSS 1', 'SSS 2', 'SSS 3'] },
]

export function classLabel(item) {
  return [item.name, item.grade && item.grade !== item.name ? item.grade : ''].filter(Boolean).join(' · ')
}

export function groupClasses(classes) {
  const groups = educationLevels.map(group => ({ ...group, classes: [] }))
  const other = { stage: 'other', label: 'Other classes', classes: [] }
  for (const item of classes || []) {
    const group = groups.find(entry => entry.stage === item.education_stage)
    ;(group || other).classes.push(item)
  }
  for (const group of [...groups, other]) {
    group.classes.sort((a, b) => (a.level_order ?? Number.MAX_SAFE_INTEGER) - (b.level_order ?? Number.MAX_SAFE_INTEGER)
      || String(a.name || '').localeCompare(String(b.name || ''), undefined, { numeric: true }))
  }
  return [...groups.filter(group => group.classes.length), ...(other.classes.length ? [other] : [])]
}
