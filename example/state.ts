import { PartySocket } from 'partysocket'
import {
    IndexedDBStorageAdapter
} from '@automerge/automerge-repo-storage-indexeddb'
import {
    WebSocketClientAdapter
} from '@automerge/automerge-repo-network-websocket'
import { type Sign, sign } from '@substrate-system/signs'
import { type DocHandle, Repo } from '@automerge/automerge-repo'
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
    const repo = new Repo({
        network: [
            new WebSocketClientAdapter(PARTYKIT_HOST),
        ],
        storage: new IndexedDBStorageAdapter(),
    })

    return {
        repo,
        document: sign(null),
        status: sign('disconnected'),
        party: null
    }
}

State.connect = function (
    state:ReturnType<typeof State>,
    roomId:string
):PartySocket {
    const party = new PartySocket({
        host: PARTYKIT_HOST,
        room: roomId,
        query: { token: createHeader() }
    })

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
    const { repo } = state
    const docHandle = repo.create<T>()
    state.document.value = docHandle
    return docHandle
}

export const statusMessages = {
    connecting: 'Connecting to server...',
    connected: 'Connected',
    disconnected: 'Disconnected'
}

/**
 * Placeholder
 */
function createHeader () {
    return 'abc123'
}
