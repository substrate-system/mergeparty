// PartyKitNetworkAdapter.ts
import {
    NetworkAdapter,
    type PeerId,
    type Message,
    type PeerMetadata,
    cbor
} from '@substrate-system/automerge-repo-slim'
import PartySocket from 'partysocket'

const { encode, decode } = cbor

interface PartyKitNetworkAdapterOptions {
    host?:string
    room:string
    party?:string
}

/**
 * We use this in the client-side code.
 */
export class PartyKitNetworkAdapter extends NetworkAdapter {
    socket:PartySocket|null = null
    #isReady = false
    #readyPromise:Promise<void> | null = null
    #options:PartyKitNetworkAdapterOptions

    constructor (options:PartyKitNetworkAdapterOptions) {
        super()
        this.#options = {
            host: options.host || 'localhost:1999',
            party: options.party || 'main',
            room: options.room
        }
    }

    isReady ():boolean {
        return this.#isReady
    }

    whenReady ():Promise<void> {
        if (this.#isReady) {
            return Promise.resolve()
        }

        if (this.#readyPromise) {
            return this.#readyPromise
        }

        this.#readyPromise = new Promise((resolve) => {
            if (this.#isReady) {
                resolve()
                return
            }

            const onOpen = async () => {
                this.socket?.removeEventListener('open', onOpen)
                // wait a bit for sync messages
                await sleep(1000)
                resolve()
            }

            if (this.socket) {
                this.socket.addEventListener('open', onOpen)
            } else {
                // If no socket exists yet, wait for connection
                resolve()
            }
        })

        return this.#readyPromise
    }

    connect (peerId:PeerId, peerMetadata?:PeerMetadata):PartySocket {
        this.peerId = peerId
        this.peerMetadata = peerMetadata

        if (this.socket) {
            this.socket.close()
        }

        this.socket = new PartySocket({
            host: this.#options.host!,
            party: this.#options.party!,
            room: this.#options.room
        })

        // Set binary type to arraybuffer for CBOR messages
        this.socket.binaryType = 'arraybuffer'

        this.socket.addEventListener('open', () => {
            this.#isReady = true
            console.log('PartyKit connection opened')
        })

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
            this.#isReady = false
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
        this.#isReady = false
        this.#readyPromise = null
        this.peerId = undefined
        this.peerMetadata = undefined
    }

    send (message:Message) {
        if (!this.socket || !this.#isReady) {
            console.warn('Cannot send message: socket not connected')
            return
        }

        try {
            // Encode all messages as CBOR and send as binary
            const encoded = encode(message)
            this.socket.send(encoded.buffer.slice(
                encoded.byteOffset,
                encoded.byteOffset + encoded.byteLength
            ))
        } catch (error) {
            console.error('Failed to send message:', error)
        }
    }
}

function sleep (n:number):Promise<void> {
    return new Promise<void>(resolve => setTimeout(resolve, n))
}
