/** Copy Blob bytes before constructing a File so jsdom never stringifies a Blob from another realm. */
export async function fileFromBlob(blob: Blob, name: string): Promise<File> {
  return new File([await blob.arrayBuffer()], name, { type: blob.type })
}
