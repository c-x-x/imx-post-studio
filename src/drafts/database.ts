import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { ArticleDraft, MediaAsset } from '../metadata/article'

/**
 * IndexedDB records use byte buffers for media rather than `Blob` values. WebKit
 * can display a Blob produced by the WebP WASM encoder but refuses to clone that
 * Blob into IndexedDB. The reader deliberately also accepts legacy Blob records
 * so existing drafts remain available without a schema migration.
 */
export interface StoredMediaAsset extends Omit<MediaAsset, 'blob'> {
  blob: ArrayBuffer | Blob
  blobType?: string
}

export interface StoredArticleDraft extends Omit<ArticleDraft, 'media'> {
  media: StoredMediaAsset[]
}

interface DraftDatabaseSchema extends DBSchema {
  drafts: {
    key: string
    value: StoredArticleDraft
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
