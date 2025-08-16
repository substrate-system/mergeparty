import type { PartySocket } from 'partysocket'
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb'
import { PartyKitNetworkAdapter } from '../src/partykit-network-adapter.js'
import { type Sign, sign } from '@substrate-system/signs'
import { type DocHandle, Repo } from '@substrate-system/automerge-repo-slim'
import Debug from '@substrate-system/debug'
const debug = Debug()
export const PARTYKIT_HOST:string = (import.meta.env.DEV ?
    'http://localhost:1999' :
    'https://merge-party2.nichoth.partykit.dev')

export type Status = 'connecting'|'connected'|'disconnected'

export type ExampleAppState<T=any> = {
    repo:Repo;
    status:Sign<Status>;
    document:Sign<DocHandle<T>|null>;
    party:PartySocket|null;
}

export function State ():ExampleAppState {
    // Create repo without network adapter first
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

State.connect = async function (
    state:ReturnType<typeof State>,
    documentId:string
):Promise<PartySocket | null> {
    const repo = state.repo

    // Use the document ID to create a partykit room
    const networkAdapter = new PartyKitNetworkAdapter({
        host: PARTYKIT_HOST,
        room: documentId
    })

    repo.networkSubsystem.addNetworkAdapter(networkAdapter)

    // Wait for the network adapter to be ready and have a socket
    await networkAdapter.whenReady()

    const party = networkAdapter.socket

    if (!party) throw new Error('not socket')

    state.party = party

    party.addEventListener('open', () => {
        debug("it's open")
        state.status.value = 'connected'
    })

    party.addEventListener('message', ev => {
        debug('got a message', ev.data)
    })

    party.addEventListener('close', () => {
        debug('websocket is closed')
        state.status.value = 'disconnected'
    })

    return party
}

/**
 * Create a new document, return the doc handle.
 *
 * @param state The state object
 * @returns The document "handle".
 */
State.createDoc = function<T=any> (state:ReturnType<typeof State>):DocHandle<T> {
    const repo = state.repo
    // Create the document to get its ID
    const docHandle = repo.create<T>()

    state.document.value = docHandle
    return docHandle
}

export const statusMessages = {
    connecting: 'Connecting to server...',
    connected: 'Connected',
    disconnected: 'Disconnected'
}
