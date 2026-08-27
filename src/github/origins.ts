import { openDB, type DBSchema } from 'idb'
import type { GithubOrigin } from './article-adapter'

interface OriginDatabase extends DBSchema {
  origins: { key: string; value: GithubOrigin }
}

// Separate adapter metadata; local drafts/ZIP and the editor have no GitHub fields.
async function database() {
  return openDB<OriginDatabase>('ipost-github-origins', 1, {
    upgrade(db) { db.createObjectStore('origins') },
  })
}

export const githubOrigins = {
  async list() {
    const db = await database()
    try {
      const tx = db.transaction('origins')
      const [ids, origins] = await Promise.all([tx.store.getAllKeys(), tx.store.getAll()])
      return new Map(ids.map((id, index) => [id, origins[index]]))
    } finally { db.close() }
  },
  async get(id: string) {
    const db = await database()
    try { return await db.get('origins', id) } finally { db.close() }
  },
  async set(id: string, origin: GithubOrigin) {
    window.localStorage.setItem('ipost-github-linked', 'true')
    const db = await database()
    try { await db.put('origins', origin, id) } finally { db.close() }
  },
  async delete(id: string) {
    const db = await database()
    try { await db.delete('origins', id) } finally { db.close() }
  },
}
