/**
 * Notes written with no signal.
 *
 * The moment this whole product turns on is a site visit with no bars, when
 * what you did that morning is still in your head and will not be by Friday.
 * So the box has to accept text without a network, and hold it until there is
 * one.
 *
 * What it does *not* do is post those notes to the record by itself when the
 * signal comes back. Nothing reaches a record a mentor signs without a human
 * reading it first — that rule does not get an exception for being offline.
 * So a queued note comes back as a note, on the dump screen, to be parsed and
 * reviewed like any other.
 *
 * IndexedDB rather than localStorage: a quarter of site notes is more than the
 * ~5MB localStorage gives you, and a write that silently fails at the quota is
 * exactly the failure this is here to prevent.
 */

export interface QueuedNote {
  id: string
  raw: string
  /** The day it was written, so weekday names still resolve correctly later. */
  reference: string
  createdAt: string
  /** Why it ended up here, so the screen can say something true. */
  reason: 'offline' | 'failed'
}

const DB_NAME = 'pedr'
const DB_VERSION = 1
const STORE = 'outbox'

export function isSupported(): boolean {
  return typeof indexedDB !== 'undefined'
}

/**
 * One connection for the page, opened on first use.
 *
 * Opening and closing per operation deadlocks: close() during a live
 * transaction leaves the next open() waiting on a connection that never
 * finishes tidying up, and the box stops accepting text — which is the one
 * thing it exists to do.
 */
let connection: Promise<IDBDatabase> | null = null

function open(): Promise<IDBDatabase> {
  if (connection) return connection
  connection = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('createdAt', 'createdAt')
      }
    }
    request.onsuccess = () => {
      const db = request.result
      // Another tab upgrading the schema closes this one; the next call opens
      // a fresh connection rather than using a dead handle.
      db.onclose = () => { connection = null }
      db.onversionchange = () => { db.close(); connection = null }
      resolve(db)
    }
    request.onerror = () => reject(request.error ?? new Error('Could not open the local store.'))
    // A private window, or a browser with site data switched off.
    request.onblocked = () => reject(new Error('The local store is in use by another tab.'))
  })
  connection = connection.catch((error) => {
    connection = null
    throw error
  })
  return connection
}

async function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const request = run(tx.objectStore(STORE))
    let result: T
    request.onsuccess = () => { result = request.result }
    request.onerror = () => reject(request.error ?? new Error('Local store write failed.'))
    // A write is not durable until the transaction commits, so that is what is
    // waited on rather than the request succeeding.
    tx.oncomplete = () => resolve(result)
    tx.onabort = () => reject(tx.error ?? new Error('Local store transaction aborted.'))
    tx.onerror = () => reject(tx.error ?? new Error('Local store transaction failed.'))
  })
}

export async function queue(
  input: { raw: string; reference: string; reason?: QueuedNote['reason'] },
): Promise<QueuedNote> {
  const note: QueuedNote = {
    id: newId(),
    raw: input.raw,
    reference: input.reference,
    createdAt: new Date().toISOString(),
    reason: input.reason ?? 'offline',
  }
  await withStore('readwrite', (store) => store.add(note))
  return note
}

/** Oldest first: they are worked through in the order they were written. */
export async function list(): Promise<QueuedNote[]> {
  const all = await withStore<QueuedNote[]>('readonly', (store) => store.getAll())
  return all.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export async function count(): Promise<number> {
  return withStore<number>('readonly', (store) => store.count())
}

export async function remove(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id))
}

export async function clear(): Promise<void> {
  await withStore('readwrite', (store) => store.clear())
}

/**
 * Everything above throws when the browser will not give us a store — a
 * private window, site data blocked, a quota that is already full. A queue
 * that cannot be read is not a reason to break the page, so callers get an
 * empty answer and the screen stays honest about what it can do.
 */
export async function safeList(): Promise<QueuedNote[]> {
  if (!isSupported()) return []
  try {
    return await list()
  } catch {
    return []
  }
}

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
}
