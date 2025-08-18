import type { PartySocket } from 'partysocket'
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb'
import { PartyKitNetworkAdapter } from '../src/partykit-network-adapter.js'
import { type Sign, sign } from '@substrate-system/signs'
import {
    type DocHandle,
    Repo
} from '@substrate-system/automerge-repo-slim'
import Debug from '@substrate-system/debug'
const debug = Debug()
export const PARTYKIT_HOST:string = (import.meta.env.DEV ?
    'http://localhost:1999' :
    'https://merge-party2.nichoth.partykit.dev')

export type Status = 'connecting'|'connected'|'disconnected'

export type AppDoc = {
    text: string
}

export type ExampleAppState = {
    repo:Repo;
    status:Sign<Status>;
    document:Sign<DocHandle<AppDoc>|null>;
    party:PartySocket|null;
}

// 4MzR8u8GQvvkx3tEdHbEatvDHhuN

export function State ():ExampleAppState {
    // Create repo without network adapter, so it doesn't
    // connect automatically
    const repo = new Repo({
        storage: new IndexedDBStorageAdapter(),
    })

    return {
        repo,
        document: sign(null),
        status: sign('disconnected'),
        party: null
    }
}

State.disconnect = function (state:ReturnType<typeof State>) {
    // Close the PartySocket if it exists
    if (state.party) {
        state.party.close()
    }

    // Remove all network adapters from the repo
    const adapters = state.repo.networkSubsystem.adapters
    adapters.forEach(adapter => {
        if (adapter instanceof PartyKitNetworkAdapter) {
            adapter.disconnect()
            state.repo.networkSubsystem.removeNetworkAdapter(adapter)
        }
    })

    // Update status
    state.status.value = 'disconnected'
}

/**
 * Use 1 partykit "room" per document.
 *
 * Once we connect to the room, then find the document by ID.
 */
State.connect = async function (
    state:ReturnType<typeof State>,
    documentId:string
):Promise<PartySocket|null> {
    const repo = state.repo

    try {
        // Use the document ID to create a partykit room
        const networkAdapter = new PartyKitNetworkAdapter({
            host: PARTYKIT_HOST,
            room: documentId
        })

        repo.networkSubsystem.addNetworkAdapter(networkAdapter)

        // Set status to connecting when we start waiting for connection
        state.status.value = 'connecting'

        // Wait for the network adapter
        debug('waiting for network adapter...')
        await networkAdapter.whenReady()
        debug('network adapter ready!')

        const party = networkAdapter.socket

        if (!party) throw new Error('no socket available')

        state.party = party

        party.addEventListener('open', async () => {
            debug("it's open")
            state.status.value = 'connected'

            // only relevant if we don't have the doc
            if (!state.document.value) {
                debug("Don't have the document yet... so fetch from network...")
                // Wait for sync messages before trying to find document
                setTimeout(async () => {
                    if (!state.document.value) {
                        debug('Looking for document:', documentId)
                        debug('Repo has documents:', Object.keys(repo.handles))

                        // Try to find the exact document by the provided ID
                        if (repo.handles[documentId]) {
                            debug('Found exact document in repo handles!')
                            const doc = repo.handles[documentId] as DocHandle<AppDoc>
                            debug('Waiting for document to be ready...')
                            debug('doc promise', doc.whenReady())
                            await doc.whenReady()
                            state.document.value = doc
                            return
                        }

                        // If we don't have the document yet, wait for sync
                        debug('Document not in local handles, waiting for sync...')

                        let attempts = 0
                        const maxAttempts = 15  // Wait up to 15 seconds total

                        const checkForDocument = async ():Promise<boolean> => {
                            attempts++
                            debug(`Sync attempt ${attempts}/${maxAttempts}` +
                                ` for document ${documentId}`)
                            debug('Current repo handles:', Object.keys(repo.handles))

                            if (repo.handles[documentId]) {
                                debug('Document appeared via sync!', documentId)
                                const doc = repo.handles[documentId] as DocHandle<AppDoc>
                                await doc.whenReady()
                                debug('Document is ready, content:', doc.doc())
                                state.document.value = doc
                                return true
                            }

                            if (attempts < maxAttempts) {
                                // Continue waiting
                                setTimeout(checkForDocument, 1000)
                                return false
                            } else {
                                // After waiting 15 seconds, error
                                throw new Error('Document not found')
                            }
                        }

                        await checkForDocument()
                    }
                }, 2000)  // Wait 2 seconds before starting sync checks
            }
        })

        party.addEventListener('message', ev => {
            debug('got a message', ev.data)
            if (ev.data instanceof ArrayBuffer) {
                debug('Message size:', ev.data.byteLength, 'bytes')
                debug('Repo handles after message:', Object.keys(repo.handles))
            }
        })

        party.addEventListener('close', () => {
            debug('websocket is closed')
            state.status.value = 'disconnected'
        })

        party.addEventListener('error', (error) => {
            debug('websocket error:', error)
            state.status.value = 'disconnected'
        })

        return party
    } catch (error) {
        debug('Connection error:', error)
        state.status.value = 'disconnected'
        return null
    }
}

/**
 * Create a new document, return the doc handle.
 *
 * @param state The state object
 * @returns The document "handle".
 */
State.createDoc = function (state:ReturnType<typeof State>):DocHandle<AppDoc> {
    const repo = state.repo
    // Create the document to get its ID
    const docHandle = repo.create({ text: '' })

    state.document.value = docHandle
    return docHandle
}

export const statusMessages = {
    connecting: 'Connecting to server...',
    connected: 'Connected',
    disconnected: 'Disconnected'
}
