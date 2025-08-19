// PartyKitNetworkAdapter.ts
import {
    NetworkAdapter,
    type PeerId,
    type Message,
    type PeerMetadata,
    cbor
} from '@substrate-system/automerge-repo-slim'
import {
    type JoinMessage,
    type PeerMessage,
    type FromClientMessage,
    type FromServerMessage,
} from '@automerge/automerge-repo-network-websocket'
import PartySocket from 'partysocket'
import Debug from '@substrate-system/debug'
import { ProtocolV1 } from '@automerge/automerge-repo-network-websocket'

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

    #log:ReturnType<typeof Debug>

    // this adapter only connects to one remote client at a time
    remotePeerId?:PeerId

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
        this.#log = Debug('automerge-repo:websocket:browser')
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
        clearInterval(this.#retryIntervalId)
        this.#retryIntervalId = undefined
        this.join()
    }

    onMessage = (event:MessageEvent) => {
        this.receiveMessage(event.data as Uint8Array)
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
            // (node)
            if (event.error.code !== 'ECONNREFUSED') {
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
        this.remotePeerId = remotePeerId
        this.emit('peer-candidate', {
            peerId: remotePeerId,
            peerMetadata,
        })
    }

    receiveMessage (messageBytes:Uint8Array) {
        if (!this.socket) throw new Error('not socket')
        let message:FromServerMessage
        try {
            message = decode(new Uint8Array(messageBytes))
        } catch (e) {
            this.#log('error decoding message:', e)
            return
        }

        if (messageBytes.byteLength === 0) {
            throw new Error('received a zero-length message')
        }

        if (isPeerMessage(message)) {
            const { peerMetadata } = message
            this.#log(`peer: ${message.senderId}`)
            this.peerCandidate(message.senderId, peerMetadata)
        } else if (isErrorMessage(message)) {
            this.#log(`error: ${message.message}`)
        } else {
            this.emit('message', message)
        }
    }

    connect (peerId:PeerId, peerMetadata?:PeerMetadata):PartySocket {
        this.peerId = peerId
        this.peerMetadata = peerMetadata
        this.#log('connecting')

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
        // this.socket.addEventListener('open', () => {
        //     this.#ready = true
        //     console.log('PartyKit connection opened')
        // })

        this.socket.addEventListener('message', (event) => {
            try {
                // Handle binary CBOR messages
                // (all Automerge messages are CBOR-encoded)
                if (event.data instanceof ArrayBuffer) {
                    const message = decode(new Uint8Array(event.data)) as any

                    // Handle peer discovery messages from the server
                    if (message.type === 'peer-candidate') {
                        this.emit('peer-candidate', {
                            peerId: message.peerId,
                            peerMetadata: message.peerMetadata || {}
                        })
                        return
                    }

                    if (message.type === 'peer-disconnected') {
                        this.emit('peer-disconnected', {
                            peerId: message.peerId
                        })
                        return
                    }

                    // Handle automerge repo messages
                    if (message.senderId && message.targetId && message.type) {
                        this.emit('message', message as Message)
                    }
                    return
                }

                // Fallback for text messages
                // (shouldn't happen with proper CBOR encoding)
                console.warn('Received non-binary message; this should not happen.')
                const parsed = JSON.parse(event.data)

                if (parsed.type === 'peer-candidate') {
                    this.emit('peer-candidate', {
                        peerId: parsed.peerId,
                        peerMetadata: parsed.peerMetadata || {}
                    })
                    return
                }

                if (parsed.type === 'peer-disconnected') {
                    this.emit('peer-disconnected', {
                        peerId: parsed.peerId
                    })
                }
            } catch (error) {
                console.error('Failed to parse message:', error)
            }
        })

        this.socket.addEventListener('close', () => {
            this.#ready = false
            console.log('PartyKit connection closed')
            this.emit('close')
        })

        this.socket.addEventListener('error', (error) => {
            console.error('PartyKit connection error:', error)
        })

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

        // if (!this.socket || !this.#ready) {
        //     console.warn('Cannot send message: socket not connected')
        //     return
        // }

        // try {
        //     // Encode all messages as CBOR and send as binary
        //     const encoded = encode(message)
        //     this.socket.send(encoded.buffer.slice(
        //         encoded.byteOffset,
        //         encoded.byteOffset + encoded.byteLength
        //     ))
        // } catch (error) {
        //     console.error('Failed to send message:', error)
        // }
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

function isPeerMessage (
    message:FromServerMessage
):message is PeerMessage {
    return message.type === 'peer'
}

function isErrorMessage (
    message:FromServerMessage
):message is ErrorMessage {
    return message.type === 'error'
}

/**
 * This incantation deals with websocket sending the whole underlying buffer
 * even if we just have a uint8array view on it
 */
export function toArrayBuffer (bytes:Uint8Array):ArrayBuffer {
    const { buffer, byteOffset, byteLength } = bytes
    return buffer.slice(byteOffset, byteOffset + byteLength) as ArrayBuffer
}
