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
  storageWriter?: string
}

interface DraftDatabaseSchema extends DBSchema {
  published: { key: string; value: string }
  drafts: {
    key: string
    value: StoredArticleDraft
    indexes: { updatedAt: string }
  }
}

const DATABASE_NAME = 'imx-post-studio'
const DATABASE_VERSION = 2

let databasePromise: Promise<IDBPDatabase<DraftDatabaseSchema>> | undefined

export function getDraftDatabase(): Promise<IDBPDatabase<DraftDatabaseSchema>> {
  if (!databasePromise) {
    let blocked = false
    let rejectBlocked: (reason: Error) => void = () => undefined
    const blockedOpening = new Promise<never>((_resolve, reject) => { rejectBlocked = reject })
    const opening = openDB<DraftDatabaseSchema>(DATABASE_NAME, DATABASE_VERSION, {
      blocked() {
        blocked = true
        rejectBlocked(new Error('请关闭其他旧版 Studio 标签页后重试，以完成草稿存储升级；原草稿不会删除'))
      },
      blocking() {
        databasePromise = undefined
        void opening.then((db) => db.close())
      },
      terminated() { databasePromise = undefined },
      upgrade(database, _oldVersion, _newVersion, transaction) {
        if (!database.objectStoreNames.contains('published')) database.createObjectStore('published')
        const drafts = database.objectStoreNames.contains('drafts')
          ? transaction.objectStore('drafts')
          : database.createObjectStore('drafts', { keyPath: 'id' })

        if (!drafts.indexNames.contains('updatedAt')) {
          drafts.createIndex('updatedAt', 'updatedAt')
        }
      },
    })
    void opening.then((db) => { if (blocked) db.close() }, () => undefined)
    const retryable = Promise.race([opening, blockedOpening]).catch((cause) => {
      if (databasePromise === retryable) databasePromise = undefined
      throw cause
    })
    databasePromise = retryable
  }

  return databasePromise
}
