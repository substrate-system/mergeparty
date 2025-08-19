import type { Storage } from 'partykit/server'
import type {
    StorageAdapterInterface,
    StorageKey
} from '@substrate-system/automerge-repo-slim'

export class PartyKitStorageAdapter implements StorageAdapterInterface {
    storage:Storage

    constructor (storage:Storage) {
        this.storage = storage
    }

    async load (key:string|string[]):Promise<Uint8Array|undefined> {
        const storageKey = Array.isArray(key) ? key.join('/') : key
        const data = await this.storage.get<Uint8Array>(storageKey)
        return data
    }

    async save (key:string|string[], data:Uint8Array):Promise<void> {
        const storageKey = Array.isArray(key) ? key.join('/') : key
        await this.storage.put(storageKey, data)
    }

    async remove (key:string|string[]):Promise<void> {
        const storageKey = Array.isArray(key) ? key.join('/') : key
        await this.storage.delete(storageKey)
    }

    async loadRange (_keyPrefix:StorageKey):Promise<any[]> {
        // Not implemented: PartyKit KV does not support range queries
        return []
    }

    async removeRange (_keyPrefix:StorageKey):Promise<void> {
        // Not implemented: PartyKit KV does not support range deletes
    }
}
