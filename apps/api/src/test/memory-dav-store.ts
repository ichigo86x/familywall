import { DavStore, DavStoreError, type CollectionSpec, type StoredObject } from "../modules/dav/dav-store";

/** In-memory CalDAV collections for tests, with etags like a real server. */
export class MemoryDavStore extends DavStore {
  public readonly enabled = true;
  public readonly collections = new Map<string, Map<string, { ics: string; etag: string }>>();
  private version = 0;

  private objects(collection: CollectionSpec): Map<string, { ics: string; etag: string }> {
    let objects = this.collections.get(collection.name);
    if (!objects) {
      objects = new Map();
      this.collections.set(collection.name, objects);
    }
    return objects;
  }

  public async ensure(collection: CollectionSpec): Promise<void> {
    this.objects(collection);
  }

  public async list(collection: CollectionSpec): Promise<StoredObject[]> {
    return [...this.objects(collection)].map(([id, object]) => ({ id, ...object }));
  }

  public async get(collection: CollectionSpec, id: string): Promise<StoredObject | undefined> {
    const object = this.objects(collection).get(id);
    return object ? { id, ...object } : undefined;
  }

  public async put(collection: CollectionSpec, id: string, ics: string, condition: { etag?: string | null; create?: boolean } = {}): Promise<void> {
    const current = this.objects(collection).get(id);
    if ((condition.create && current) || (condition.etag && current?.etag !== condition.etag)) {
      throw new DavStoreError("Il dato è stato modificato altrove nel frattempo. Ricarica e riprova.");
    }
    this.version += 1;
    this.objects(collection).set(id, { ics, etag: `"${this.version}"` });
  }

  public async remove(collection: CollectionSpec, id: string): Promise<void> {
    this.objects(collection).delete(id);
  }

  public clearCache(): void {}
}
