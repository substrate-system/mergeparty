import type * as Party from 'partykit/server'
import {
    cbor,
    NetworkAdapter,
    type PeerId,
    type PeerMetadata
} from '@substrate-system/automerge-repo-slim'

const { encode, decode } = cbor

export const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'HEAD, POST, GET, OPTIONS',
    'Access-Control-Allow-Headers':
        'Origin, X-Requested-With, Content-Type, Accept, Authorization',
}

export class MergeParty extends NetworkAdapter implements Party.Server {
    sockets:{ [peerId:PeerId]:WebSocket } = {}
    readonly room: Party.Room
    #ready:boolean = false
    #readyResolver?: () => void
    #readyPromise: Promise<void> = new Promise<void>(resolve => {
        this.#readyResolver = resolve
    })

    // constructor (room:Party.Room) {
    //     super()
    //     this.room = room
    // }
    constructor (
        private server:Party.Server,
        private keepAliveInterval = 5000
    ) {
        super()
    }

    #forceReady () {
        if (!this.#ready) {
            this.#ready = true
            this.#readyResolver?.()
        }
    }

    isReady ():boolean {
        return this.#ready
    }

    whenReady () {
        return this.#readyPromise
    }

    connect (peerId: PeerId, peerMetadata?: PeerMetadata) {
        this.peerId = peerId
        this.peerMetadata = peerMetadata

        this.server.on('close', () => {
            clearInterval(keepAliveId)
            this.disconnect()
        })

        this.server.on('connection', (socket: WebSocketWithIsAlive) => {
        // When a socket closes, or disconnects, remove it from our list
            socket.on('close', () => {
                this.#removeSocket(socket)
            })

            socket.on('message', message =>
                this.receiveMessage(message as Uint8Array, socket)
            )

            // Start out "alive", and every time we get a pong, reset that state.
            socket.isAlive = true
            socket.on('pong', () => (socket.isAlive = true))

            this.#forceReady()
        })

        const keepAliveId = setInterval(() => {
        // Terminate connections to lost clients
            const clients = this.server.clients as Set<WebSocketWithIsAlive>
            clients.forEach(socket => {
                if (socket.isAlive) {
                    // Mark all clients as potentially dead until we hear from them
                    socket.isAlive = false
                    socket.ping()
                } else {
                    this.#terminate(socket)
                }
            })
        }, this.keepAliveInterval)
    }

    // HTTP requests
    async onRequest (req:Party.Request):Promise<Response> {
        if (req.method === 'OPTIONS') {
            // respond to cors preflight requests
            return new Response(null, {
                status: 200,
                headers: CORS
            })
        }

        if (req.method !== 'GET') {
            return new Response(null, { status: 405, headers: CORS })
        }

        const url = new URL(req.url)
        // /parties/<partyName>/<roomId>
        const base = `/parties/main/${this.room.id}`

        // Derive subpath inside this party ("/", "/health", etc.)
        let subpath = '/'
        if (url.pathname === base || url.pathname === `${base}/`) {
            subpath = '/'
        } else if (url.pathname.startsWith(`${base}/`)) {
            subpath = url.pathname.slice(base.length) // e.g. "/health"
        }

        if (subpath === '/') {
            return new Response('👍 All good', { headers: CORS })
        }

        if (subpath === '/health') {
            return Response.json({
                status: 'ok',
                room: this.room.id,
                connectedPeers: Array.from(this.room.getConnections()).length,
            },
            { headers: CORS })
        }

        return new Response('Not Found', { status: 404 })
    }

    onConnect (conn: Party.Connection, ctx: Party.ConnectionContext) {
        // A websocket just connected!
        console.log(
      `Connected:
  id: ${conn.id}
  room: ${this.room.id}
  url: ${new URL(ctx.request.url).pathname}`
        )

        // Don't send any messages on connect - wait for join message from client
        // according to Automerge WebSocket protocol
    }

    onMessage (message: string|ArrayBuffer, sender: Party.Connection) {
        try {
            let parsed:{ senderId, type, targetId }

            if (typeof message === 'string') {
                // Handle string messages as JSON (join messages)
                parsed = JSON.parse(message)

                // Handle join message according to Automerge WebSocket protocol
                if (parsed.type === 'join') {
                    console.log(`Join request from ${parsed.senderId}`)

                    // Send peer response to the joining client
                    const peerResponse = {
                        type: 'peer',
                        senderId: sender.id, // Server's ID, not client's
                        peerMetadata: {}, // Server metadata
                        selectedProtocolVersion: '1',
                        targetId: parsed.senderId // Client's ID
                    }

                    // Encode and send peer response
                    const encodedResponse = encode(peerResponse)
                    const buf = encodedResponse.buffer as ArrayBuffer
                    sender.send(buf.slice(
                        encodedResponse.byteOffset,
                        encodedResponse.byteOffset + encodedResponse.byteLength
                    ))

                    // Don't broadcast join messages to other peers - that's not part of the protocol
                    // Each peer should establish their own connection

                    console.log(`Sent peer response for ${parsed.senderId}`)
                    return
                }
            } else if (message instanceof ArrayBuffer) {
                // Handle binary messages (CBOR-encoded sync protocol)
                console.log(
                    `Binary message from ${sender.id} (${message.byteLength} bytes)`
                )

                try {
                    const msgBytes = new Uint8Array(message)
                    parsed = decode(msgBytes)
                } catch {
                    // If CBOR decode fails, this might be raw Automerge data
                    // Broadcast as-is to other peers
                    console.log(
                        `Raw binary data from ${sender.id}, broadcasting as-is`
                    )
                    this.room.broadcast(message, [sender.id])
                    return
                }
            } else {
                console.warn('Unknown message type:', typeof message)
                return
            }

            console.log(`Message from ${sender.id}:`, parsed.type || 'unknown')

            // Handle sync protocol messages - route based on targetId
            if (parsed.targetId) {
                // Message has a specific target
                const targetConnection = Array.from(this.room.getConnections())
                    .find(conn => conn.id === parsed.targetId)

                if (targetConnection) {
                    // Re-encode as CBOR and send to target
                    const encoded = encode(parsed)
                    const buf = encoded.buffer as ArrayBuffer
                    targetConnection.send(buf.slice(
                        encoded.byteOffset,
                        encoded.byteOffset + encoded.byteLength
                    ))
                } else {
                    console.warn(`Target peer ${parsed.targetId} not found`)
                }
            } else {
                // Broadcast to all other peers
                const encoded = encode(parsed)
                const buf = encoded.buffer as ArrayBuffer
                this.room.broadcast(buf.slice(
                    encoded.byteOffset,
                    encoded.byteOffset + encoded.byteLength
                ), [sender.id])
            }
        } catch (error) {
            console.error('Error parsing message:', error)
            // For binary messages that can't be parsed, just broadcast them
            if (message instanceof ArrayBuffer) {
                this.room.broadcast(message, [sender.id])
            }
        }
    }

    onClose (conn:Party.Connection) {
        // Notify other peers about disconnection using CBOR encoding
        const peerDisconnectedMessage = {
            type: 'peer-disconnected',
            peerId: conn.id
        }

        const encoded = encode(peerDisconnectedMessage)
        const buf = encoded.buffer as ArrayBuffer
        this.room.broadcast(buf.slice(
            encoded.byteOffset,
            encoded.byteOffset + encoded.byteLength
        ), [conn.id])
    }
}

MergeParty satisfies Party.Worker
