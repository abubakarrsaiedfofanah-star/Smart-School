const DATABASE = 'smartschool-offline-work'
const STORE = 'pending-writes'
const ROSTERS = 'offline-rosters'
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000
const ROSTER_AGE_MS = 24 * 60 * 60 * 1000

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

export async function syncOfflineWrites({ ownerId, supabase }) {
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
    const conflict = entry.table === 'attendance' ? 'student_id,attendance_date' : 'exam_id,student_id'
    const { error } = await supabase.from(entry.table).upsert(entry.payload, { onConflict: conflict })
    if (error) throw error
    await removeEntry(entry.id)
    synced += entry.payload.length
  }
  return synced
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
