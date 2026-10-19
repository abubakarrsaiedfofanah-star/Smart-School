const DATABASE = 'smartschool-offline-work'
const STORE = 'pending-writes'
const ROSTERS = 'offline-rosters'
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000
const ROSTER_AGE_MS = 24 * 60 * 60 * 1000
const OFFLINE_WRITE_TABLES = new Set(['attendance', 'results'])

function openQueue() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('Offline storage is not available in this browser.'))
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 2)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'id' })
      if (!request.result.objectStoreNames.contains(ROSTERS)) request.result.createObjectStore(ROSTERS, { keyPath: 'id' })
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not open offline storage.'))
  })
}

export async function cacheOfflineClasses({ ownerId, schoolId, classes }) {
  return writeRosterCache({ id: `classes:${ownerId}:${schoolId}`, ownerId, schoolId, classes })
}

export async function getOfflineClasses({ ownerId, schoolId }) {
  return readRosterCache(`classes:${ownerId}:${schoolId}`, ownerId)
}

export async function cacheOfflineRoster({ ownerId, schoolId, classId, date, students, statuses }) {
  return writeRosterCache({ id: `roster:${ownerId}:${schoolId}:${classId}:${date}`, ownerId, schoolId, classId, date, students, statuses })
}

export async function getOfflineRoster({ ownerId, schoolId, classId, date }) {
  return readRosterCache(`roster:${ownerId}:${schoolId}:${classId}:${date}`, ownerId)
}

export async function queueOfflineWrite({ ownerId, schoolId, table, payload }) {
  if (!ownerId || !schoolId || !OFFLINE_WRITE_TABLES.has(table)) throw new Error('This offline action is not allowed.')
  if (!Array.isArray(payload) || !payload.length || payload.some(row => !row || row.school_id !== schoolId)) {
    throw new Error('Offline records must belong to your current school.')
  }
  const db = await openQueue()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite')
    transaction.objectStore(STORE).put({
      id: crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`, ownerId, schoolId, table, payload,
      queuedAt: Date.now(),
    })
    transaction.oncomplete = () => { db.close(); resolve() }
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error('Could not queue offline work.')) }
  })
}

export async function syncOfflineWrites({ ownerId, schoolId, supabase }) {
  if (!ownerId || !schoolId || !supabase) throw new Error('A signed-in school account is required to sync offline work.')
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError) throw userError
  if (user?.id !== ownerId) throw new Error('Offline work belongs to a different signed-in account.')
  const { data: account, error: accountError } = await supabase.from('profiles')
    .select('school_id,is_active').eq('id', ownerId).maybeSingle()
  if (accountError) throw accountError
  if (!account || account.is_active !== true || account.school_id !== schoolId) {
    throw new Error('Your active school account could not be verified. Offline work was not synced.')
  }

  const db = await openQueue()
  const entries = await new Promise((resolve, reject) => {
    const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll()
    request.onsuccess = () => resolve(request.result || [])
    request.onerror = () => reject(request.error || new Error('Could not read offline work.'))
  })
  db.close()

  let synced = 0
  for (const entry of entries) {
    if (Date.now() - entry.queuedAt > MAX_AGE_MS) {
      await removeEntry(entry.id)
      continue
    }
    if (entry.ownerId !== ownerId) continue
    if (entry.schoolId !== schoolId || entry.schoolId !== account.school_id
      || !OFFLINE_WRITE_TABLES.has(entry.table) || !Array.isArray(entry.payload)
      || !entry.payload.length || entry.payload.some(row => !row || row.school_id !== account.school_id)) {
      await removeEntry(entry.id)
      continue
    }
    const conflict = entry.table === 'attendance' ? 'student_id,attendance_date' : 'exam_id,student_id'
    const { error } = await supabase.from(entry.table).upsert(entry.payload, { onConflict: conflict })
    if (error) throw error
    await removeEntry(entry.id)
    synced += entry.payload.length
  }
  return synced
}

// Remove device-cached school records when an account signs out. This storage is
// convenience data for the signed-in user, not an authoritative record store.
export async function clearOfflineDataForUser(ownerId) {
  if (!ownerId || !('indexedDB' in window)) return
  const db = await openQueue()
  await new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE, ROSTERS], 'readwrite')
    for (const storeName of [STORE, ROSTERS]) {
      const store = transaction.objectStore(storeName)
      const request = store.openCursor()
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) return
        if (cursor.value.ownerId === ownerId) cursor.delete()
        cursor.continue()
      }
      request.onerror = () => reject(request.error || new Error('Could not clear offline data.'))
    }
    transaction.oncomplete = resolve
    transaction.onerror = () => reject(transaction.error || new Error('Could not clear offline data.'))
  })
  db.close()
}

function removeEntry(id) {
  return openQueue().then(db => new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE, 'readwrite')
    transaction.objectStore(STORE).delete(id)
    transaction.oncomplete = () => { db.close(); resolve() }
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error('Could not clear synced work.')) }
  }))
}

async function writeRosterCache(value) {
  const db = await openQueue()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(ROSTERS, 'readwrite')
    transaction.objectStore(ROSTERS).put({ ...value, cachedAt: Date.now() })
    transaction.oncomplete = () => { db.close(); resolve() }
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error('Could not cache the class list.')) }
  })
}

async function readRosterCache(id, ownerId) {
  const db = await openQueue()
  const entry = await new Promise((resolve, reject) => {
    const request = db.transaction(ROSTERS, 'readonly').objectStore(ROSTERS).get(id)
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error || new Error('Could not read the saved class list.'))
  })
  if (!entry || entry.ownerId !== ownerId || Date.now() - entry.cachedAt > ROSTER_AGE_MS) {
    if (entry) await new Promise(resolve => {
      const transaction = db.transaction(ROSTERS, 'readwrite')
      transaction.objectStore(ROSTERS).delete(id)
      transaction.oncomplete = resolve
      transaction.onerror = resolve
    })
    db.close()
    return null
  }
  db.close()
  return entry
}
