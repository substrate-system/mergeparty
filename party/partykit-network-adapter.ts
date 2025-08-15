// PartyKitNetworkAdapter.ts
import {
    NetworkAdapter,
    type PeerId,
    type Message,
    type PeerMetadata
} from '@automerge/automerge-repo'
import PartySocket from 'partysocket'

interface PartyKitNetworkAdapterOptions {
    host?: string
    room: string
    party?: string
}

export class PartyKitNetworkAdapter extends NetworkAdapter {
    #socket: PartySocket | null = null
    #isReady = false
    #readyPromise: Promise<void> | null = null
    #options: PartyKitNetworkAdapterOptions

    constructor (options: PartyKitNetworkAdapterOptions) {
        super()
        this.#options = {
            host: options.host || 'localhost:1999',
            party: options.party || 'main',
            room: options.room
        }
    }

    isReady (): boolean {
        return this.#isReady
    }

    whenReady (): Promise<void> {
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

            const onOpen = () => {
                this.#socket?.removeEventListener('open', onOpen)
                resolve()
            }

            if (this.#socket) {
                this.#socket.addEventListener('open', onOpen)
            } else {
                // If no socket exists yet, wait for connection
                resolve()
            }
        })

        return this.#readyPromise
    }

    connect (peerId: PeerId, peerMetadata?: PeerMetadata) {
        this.peerId = peerId
        this.peerMetadata = peerMetadata

        if (this.#socket) {
            this.#socket.close()
        }

        this.#socket = new PartySocket({
            host: this.#options.host!,
            party: this.#options.party!,
            room: this.#options.room
        })

        this.#socket.addEventListener('open', () => {
            this.#isReady = true
            console.log('PartyKit connection opened')
        })

        this.#socket.addEventListener('message', (event) => {
            try {
                const parsed = JSON.parse(event.data)

                // Handle peer discovery messages from the server
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
                    return
                }

                // Handle automerge repo messages
                if (parsed.senderId && parsed.targetId && parsed.type) {
                    this.emit('message', parsed as Message)
                }
            } catch (error) {
                console.error('Failed to parse message:', error)
            }
        })

        this.#socket.addEventListener('close', () => {
            this.#isReady = false
            console.log('PartyKit connection closed')
            this.emit('close')
        })

        this.#socket.addEventListener('error', (error) => {
            console.error('PartyKit connection error:', error)
        })
    }

    disconnect () {
        if (this.#socket) {
            this.#socket.close()
            this.#socket = null
        }
        this.#isReady = false
        this.#readyPromise = null
        this.peerId = undefined
        this.peerMetadata = undefined
    }

    send (message: Message) {
        if (!this.#socket || !this.#isReady) {
            console.warn('Cannot send message: socket not connected')
            return
        }

        try {
            this.#socket.send(JSON.stringify(message))
        } catch (error) {
            console.error('Failed to send message:', error)
        }
    }
}
