// PartyKitNetworkAdapter.ts
import {
    NetworkAdapter,
    type PeerId,
    type PeerMetadata,
    cbor
} from '@substrate-system/automerge-repo-slim'
import {
    type JoinMessage,
    type FromClientMessage,
} from '@automerge/automerge-repo-network-websocket'
import PartySocket from 'partysocket'
import Debug from '@substrate-system/debug'
import { ProtocolV1 } from '@automerge/automerge-repo-network-websocket'

// the /slim package in automerge
// https://github.com/automerge/automerge-repo/blob/main/packages/automerge-repo/package.json#L38

// https://stackoverflow.com/questions/45802988
type TimeoutId = ReturnType<typeof setTimeout>

const { encode, decode } = cbor

/**
 * An error occurred.
 * The other end will terminate the connection after sending this message.
 */
export type ErrorMessage = {
    type: 'error'
    senderId:PeerId; // The peer sending the message
    message:string;  // A description of the error
    targetId:PeerId  // The PeerID of the client
}
interface PartyKitNetworkAdapterOptions {
    host?:string;
    room:string;
    party?:string;
}

/**
 * client-side
 */
export class PartyKitNetworkAdapter extends NetworkAdapter {
    #ready = false
    #retryIntervalId?:TimeoutId
    readonly retryInterval = 5000
    #readyResolver?:() => void
    #readyPromise:Promise<void> = new Promise<void>(resolve => {
        this.#readyResolver = resolve
    })

    // #log:ReturnType<typeof Debug>
    #log = Debug('automerge-repo:websocket:browser')

    // Track multiple peers instead of just one
    connectedPeers: Set<PeerId> = new Set()

    socket:PartySocket|null = null
    // #isReady = false
    // #readyPromise:Promise<void> | null = null
    #options:PartyKitNetworkAdapterOptions

    constructor (options:PartyKitNetworkAdapterOptions) {
        super()
        this.#options = {
            host: options.host || 'localhost:1999',
            party: options.party || 'main',
            room: options.room
        }
        // this.#log = Debug('automerge-repo:websocket:browser')
    }

    isReady ():boolean {
        return this.#ready
    }

    whenReady ():Promise<void> {
        return this.#readyPromise
    }

    #forceReady () {
        if (!this.#ready) {
            this.#ready = true
            this.#readyResolver?.()
        }
    }

    onOpen = () => {
        this.#log('open')
        this.#ready = true
        this.#readyResolver?.()
        clearInterval(this.#retryIntervalId)
        this.#retryIntervalId = undefined
        this.join()
    }

    // When a socket closes, or disconnects, remove it from the array.
    onClose = () => {
        this.#log('close')
        // Notify about all connected peers disconnecting
        for (const peerId of this.connectedPeers) {
            this.emit('peer-disconnected', { peerId })
        }
        this.connectedPeers.clear()

        if (this.retryInterval > 0 && !this.#retryIntervalId) {
            // try to reconnect
            setTimeout(() => {
                if (!this.peerId) throw new Error('not peerId')
                return this.connect(this.peerId, this.peerMetadata)
            }, this.retryInterval)
        }
    }

    onMessage = (event:MessageEvent) => {
        let messageBytes: Uint8Array

        if (event.data instanceof ArrayBuffer) {
            messageBytes = new Uint8Array(event.data)
        } else if (event.data instanceof Uint8Array) {
            messageBytes = event.data
        } else if (typeof event.data === 'string') {
            // Handle string messages (like legacy peer discovery)
            try {
                const parsed = JSON.parse(event.data)
                if (parsed.type === 'peer-candidate') {
                    // Legacy format - still support it
                    this.peerCandidate(parsed.peerId, parsed.peerMetadata || {})
                    return
                }
                if (parsed.type === 'peer-disconnected') {
                    // Remove from our connected peers set
                    this.connectedPeers.delete(parsed.peerId)
                    this.emit('peer-disconnected', { peerId: parsed.peerId })
                    return
                }
                // For other parsed messages, emit them directly
                this.emit('message', parsed)
                return
            } catch (e) {
                this.#log('error parsing string message:', e)
                return
            }
        } else {
            this.#log('unknown message type:', typeof event.data)
            return
        }

        this.receiveMessage(messageBytes)
    }

    /**
     * The websocket error handler signature is different on node and
     * the browser.
     */
    onError = (
        event:
            | Event  // browser
            | ErrorEvent  // node
    ) => {
        if ('error' in event) {
            this.#log('error', event.error)
            // (node)
            if (event.error.code !== 'ECONNREFUSED') {
                this.#log('error', event.error)
                /* c8 ignore next */
                throw event.error
            }
        } else {
            // (browser) We get no information about errors.
            // https://stackoverflow.com/a/31003057/239663
            // There will be an error logged in the console
            // (`WebSocket connection to 'wss://foo.com/' failed`),
            // but by design the error is unavailable to scripts. We'll just
            // assume this is a failed connection.
        }

        this.#log('Connection failed, retrying...')
    }

    join () {
        if (!this.peerId) throw new Error('not peerId')
        if (!this.socket) throw new Error('not socket')
        if (this.socket.readyState === WebSocket.OPEN) {
            this.send(joinMessage(this.peerId!, this.peerMetadata!))
        } else {
            // We'll try again in the `onOpen` handler
        }
    }

    peerCandidate (remotePeerId:PeerId, peerMetadata:PeerMetadata) {
        if (!this.socket) throw new Error('Not socket')
        this.#forceReady()

        // Add to our set of connected peers
        this.connectedPeers.add(remotePeerId)

        this.emit('peer-candidate', {
            peerId: remotePeerId,
            peerMetadata,
        })
    }

    receiveMessage (messageBytes:Uint8Array) {
        if (!this.socket) throw new Error('not socket')

        if (messageBytes.byteLength === 0) {
            throw new Error('received a zero-length message')
        }

        // Try to decode as CBOR first for Automerge protocol messages
        let message: any
        try {
            message = decode(messageBytes)
        } catch (e) {
            this.#log('error decoding message as CBOR:', e)
            // If CBOR decode fails, this might be raw binary data
            // For now, ignore it as the protocol should use CBOR
            return
        }

        // Handle different message types according to Automerge WebSocket protocol
        if (message.type === 'peer') {
            // This is a peer response from the server during handshake
            this.#log(`received peer message from ${message.senderId}`)
            this.peerCandidate(message.senderId, message.peerMetadata || {})
        } else if (message.type === 'error') {
            this.#log(`received error: ${message.message}`)
        } else if (message.type === 'sync' || message.type === 'request' || message.type === 'ephemeral') {
            // These are the main Automerge repo messages that need to be forwarded
            this.emit('message', message)
        } else if (message.type === 'doc-unavailable') {
            this.emit('message', message)
        } else {
            // Unknown message type, log and ignore
            this.#log('unknown message type:', message.type)
        }
    }

    connect (peerId:PeerId, peerMetadata?:PeerMetadata):PartySocket {
        this.peerId = peerId
        this.peerMetadata = peerMetadata
        this.#log('connecting...')

        // close the socket if it is open
        if (this.socket) {
            this.socket.close()
        }

        // create a new socket
        this.socket = new PartySocket({
            host: this.#options.host!,
            party: this.#options.party!,
            room: this.#options.room
        })

        // Set binary type to arraybuffer for CBOR messages
        this.socket.binaryType = 'arraybuffer'

        this.socket.addEventListener('open', this.onOpen)
        this.socket.addEventListener('close', this.onClose)
        this.socket.addEventListener('message', this.onMessage)
        this.socket.addEventListener('error', this.onError)

        // Mark this adapter as ready if we haven't received an ack in 1 second.
        // We might hear back from the other end at some point but we shouldn't
        // hold up marking things as unavailable for any longer
        setTimeout(() => this.#forceReady(), 1000)
        this.join()

        return this.socket
    }

    disconnect () {
        if (this.socket) {
            this.socket.close()
            this.socket = null
        }
        this.#ready = false
        this.peerId = undefined
        this.peerMetadata = undefined
    }

    send (message:FromClientMessage) {
        if ('data' in message && message.data?.byteLength === 0) {
            throw new Error('Tried to send a zero-length message')
        }

        if (!this.peerId) throw new Error('not peerId')

        if (!this.socket) {
            this.#log('Tried to send on a disconnected socket.')
            return
        }

        if (this.socket.readyState !== WebSocket.OPEN) {
            throw new Error(`Websocket not ready (${this.socket.readyState})`)
        }

        const encoded = encode(message)
        this.socket.send(toArrayBuffer(encoded))
    }
}

export function sleep (n:number):Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, n))
}

function joinMessage (
    senderId: PeerId,
    peerMetadata: PeerMetadata
):JoinMessage {
    return {
        type: 'join',
        senderId,
        peerMetadata,
        supportedProtocolVersions: [ProtocolV1],
    }
}

/**
 * This incantation deals with websocket sending the whole underlying buffer
 * even if we just have a uint8array view on it
 */
export function toArrayBuffer (bytes:Uint8Array):ArrayBuffer {
    const { buffer, byteOffset, byteLength } = bytes
    return buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer
}
