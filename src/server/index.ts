import type * as Party from 'partykit/server'
import {
    cbor,
    StorageAdapterInterface
} from '@substrate-system/automerge-repo-slim'

const { encode, decode } = cbor

export const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'HEAD, POST, GET, OPTIONS',
    'Access-Control-Allow-Headers':
        'Origin, X-Requested-With, Content-Type, Accept, Authorization',
}

export class MergeParty implements Party.Server {
    readonly room:Party.Room

    constructor (room:Party.Room) {
        this.room = room
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

    onConnect (conn:Party.Connection, ctx:Party.ConnectionContext) {
        // A websocket just connected!
        console.log(
      `Connected:
  id: ${conn.id}
  room: ${this.room.id}
  url: ${new URL(ctx.request.url).pathname}`
        )

        // Don't send any messages on connect - wait for the client to
        // send 'join'
    }

    onMessage (message:string|ArrayBuffer, sender:Party.Connection) {
        try {
            // Handle binary messages (CBOR-encoded Automerge sync messages)
            if (message instanceof ArrayBuffer) {
                console.log(
                    `Binary message from ${sender.id} (${message.byteLength} bytes)`
                )
                // Broadcast binary message to all other peers
                this.room.broadcast(message, [sender.id])
                return
            }

            let parsed:any

            if (typeof message === 'string') {
                // Handle string messages as JSON
                parsed = JSON.parse(message)
            } else {
                // Handle binary messages (Uint8Array from TextDecoder) as CBOR
                try {
                    const msgBytes = new Uint8Array(message)
                    parsed = decode(msgBytes)
                } catch {
                    // Fallback to JSON parsing if CBOR fails
                    const msgString = new TextDecoder().decode(message)
                    parsed = JSON.parse(msgString)
                }
            }

            console.log(`Message from ${sender.id}:`, parsed.type || 'unknown')

            // Handle automerge messages - relay them to other peers
            if (parsed.senderId || parsed.targetId) {
                // Route message to specific target if specified
                if (parsed.targetId) {
                    const targetConnection = Array.from(this.room.getConnections())
                        .find(conn => conn.id === parsed.targetId)

                    if (targetConnection) {
                        // Re-encode as CBOR before sending
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
                    // Broadcast to all other peers as CBOR
                    const encoded = encode(parsed)
                    const buf = encoded.buffer as ArrayBuffer
                    this.room.broadcast(buf.slice(
                        encoded.byteOffset,
                        encoded.byteOffset + encoded.byteLength
                    ), [sender.id])
                }
                return
            }

            // Handle other message types (peer discovery, etc.)
            const encoded = encode(parsed)
            const buf = encoded.buffer as ArrayBuffer
            this.room.broadcast(buf.slice(
                encoded.byteOffset,
                encoded.byteOffset + encoded.byteLength
            ), [sender.id])
        } catch (error) {
            console.error('Error parsing message:', error)
            // Don't fallback to broadcasting raw messages for sync errors
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
