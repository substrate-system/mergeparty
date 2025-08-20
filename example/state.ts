import type { PartySocket } from 'partysocket'
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb'
import { type Sign, sign } from '@substrate-system/signs'
import { decode } from '@substrate-system/automerge-repo-slim/helpers/cbor.js'
import {
    type DocHandle,
    Repo
} from '@substrate-system/automerge-repo-slim'
import Debug from '@substrate-system/debug'
import { type AnyDocumentId } from '@automerge/automerge-repo'
// import { PartyKitNetworkAdapter } from '../src/client/partykit-websocket-adapter.js'
// import {
//     WebSocketClientAdapter
// } from '@automerge/automerge-repo-network-websocket'
// import { PartykitWebsocketAdapter } from '../src/client/partykit-websocket-adapter.js'
import { PartykitNetworkAdapter } from '../src/client/partykit-websocket-adapter.js'

const debug = Debug('app:state')

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

export function State ():ExampleAppState {
    // Create repo without network adapter, so it doesn't
    // connect automatically
    const repo = new Repo({
        storage: new IndexedDBStorageAdapter(),
    })

    repo.networkSubsystem?.on?.('peer', (p) => console.log('peer', p))

    return {
        repo,
        document: sign(null),
        status: sign('disconnected'),
        party: null
    }
}

State.disconnect = function (state:ReturnType<typeof State>) {
    // Remove all network adapters from the repo
    const adapters = state.repo.networkSubsystem.adapters
    adapters.forEach(adapter => {
        // if (adapter instanceof WebSocketClientAdapter) {
        // if (adapter instanceof PartykitWebsocketAdapter) {
        if (adapter instanceof PartykitNetworkAdapter) {
            adapter.disconnect()
            state.repo.networkSubsystem.removeNetworkAdapter(adapter)
        }
    })

    // Update status
    state.status.value = 'disconnected'
    state.party = null
}

/**
 * Use 1 partykit "room" per document.
 *
 * Once we connect to the room, then find the document by ID.
 */
State.connect = async function (
    state:ReturnType<typeof State>,
    documentId?:string
):Promise<PartySocket|null> {
    const repo = state.repo
    if (!documentId) {
        const doc = await State.createDoc(state)
        documentId = doc.documentId
    }

    try {
        // Use the document ID to create a partykit room
        // const networkAdapter = new PartyKitNetworkAdapter({
        // const networkAdapter = new WebSocketClientAdapter({
        //     host: PARTYKIT_HOST,
        //     room: documentId
        // })

        // const networkAdapter = new WebSocketClientAdapter(PARTYKIT_HOST)
        // const networkAdapter = new PartykitWebsocketAdapter()
        const networkAdapter = new PartykitNetworkAdapter({
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
        state.status.value = 'connected'

        if (!state.document.value) {
            debug("Don't have the document yet... so fetch from network...")

            // Try to find the document using repo.find() which handles
            // network loading
            try {
                debug('Attempting to find document:', documentId)
                const doc = await repo.find<AppDoc>(documentId as AnyDocumentId)
                state.document.value = doc

                // Wait for it to be ready
                // (this will trigger network sync if needed)
                debug('Waiting for document to be ready...')
                await doc.whenReady()
                debug('Document is ready, content:', doc.doc())
            } catch (error) {
                const err = error as Error
                debug('Could not find document', documentId)
                throw err
            }
        }

        const party = networkAdapter.socket as PartySocket
        if (!party) throw new Error('no socket available')

        state.party = party

        party.addEventListener('message', ev => {
            if (ev.data instanceof ArrayBuffer) {
                debug('Message size:', ev.data.byteLength, 'bytes')
                debug('Repo handles after message:', Object.keys(repo.handles))
                debug(
                    '********************************got a message***',
                    decode(new Uint8Array(ev.data))
                )
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
