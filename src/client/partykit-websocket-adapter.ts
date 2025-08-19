import {
    WebSocketClientAdapter
} from '@automerge/automerge-repo-network-websocket'

interface PartyKitNetworkAdapterOptions {
    host?:string
    room:string
    party?:string
}

/**
 * A WebSocket network adapter that connects to PartyKit servers.
 * This is just a thin wrapper around the official WebSocketClientAdapter
 * that constructs the correct PartyKit WebSocket URL.
 */
export class PartyKitNetworkAdapter extends WebSocketClientAdapter {
    #options:PartyKitNetworkAdapterOptions

    constructor (options:PartyKitNetworkAdapterOptions) {
        // Construct the PartyKit WebSocket URL
        const host = options.host || 'localhost:1999'
        const party = options.party || 'main'
        const room = options.room

        // PartyKit WebSocket URL format: ws://host/parties/<party>/<room>
        const protocol = host.startsWith('http://') ? 'ws://' : 'wss://'
        const cleanHost = host.replace(/^https?:\/\//, '')
        const url = `${protocol}${cleanHost}/parties/${party}/${room}`

        console.log('Connecting to PartyKit server:', url)

        // Call the parent constructor with the constructed URL
        super(url)

        this.#options = options
    }
}
