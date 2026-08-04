import type { MediaAsset } from '../metadata/article'

interface RegisteredObjectUrl {
  blob: Blob
  url: string
}

export class ObjectUrlRegistry {
  private readonly urls = new Map<string, RegisteredObjectUrl>()

  get(asset: MediaAsset): string {
    const current = this.urls.get(asset.id)
    if (current?.blob === asset.blob) {
      return current.url
    }

    if (current) {
      URL.revokeObjectURL(current.url)
    }

    const url = URL.createObjectURL(asset.blob)
    this.urls.set(asset.id, { blob: asset.blob, url })
    return url
  }

  revoke(id: string): void {
    const current = this.urls.get(id)
    if (!current) {
      return
    }

    URL.revokeObjectURL(current.url)
    this.urls.delete(id)
  }

  dispose(): void {
    for (const id of [...this.urls.keys()]) {
      this.revoke(id)
    }
  }
}
