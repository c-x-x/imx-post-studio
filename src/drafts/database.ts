import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ArticleDraft } from '../metadata/article'

interface DraftDatabaseSchema extends DBSchema {
  drafts: {
    key: string
    value: ArticleDraft
    indexes: { updatedAt: string }
  }
}

const DATABASE_NAME = 'imx-post-studio'
const DATABASE_VERSION = 1

let databasePromise: Promise<IDBPDatabase<DraftDatabaseSchema>> | undefined

export function getDraftDatabase(): Promise<IDBPDatabase<DraftDatabaseSchema>> {
  databasePromise ??= openDB<DraftDatabaseSchema>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database, _oldVersion, _newVersion, transaction) {
      const drafts = database.objectStoreNames.contains('drafts')
        ? transaction.objectStore('drafts')
        : database.createObjectStore('drafts', { keyPath: 'id' })

      if (!drafts.indexNames.contains('updatedAt')) {
        drafts.createIndex('updatedAt', 'updatedAt')
      }
    },
  })

  return databasePromise
}
