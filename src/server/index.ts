import type * as Party from 'partykit/server'
import {
    cbor
} from '@substrate-system/automerge-repo-slim'

const { encode, decode } = cbor

export const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'HEAD, POST, GET, OPTIONS',
    'Access-Control-Allow-Headers':
        'Origin, X-Requested-With, Content-Type, Accept, Authorization',
}

export class MergeParty implements Party.Server {
    readonly room: Party.Room

    constructor (room: Party.Room) {
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
            let parsed: any

            if (typeof message === 'string') {
                // Handle string messages as JSON (join messages)
                parsed = JSON.parse(message)

                // Handle join message according to Automerge WebSocket protocol
                if (parsed.type === 'join') {
                    console.log(`Join request from ${parsed.senderId}`)

                    // Send peer response to the joining client
                    const peerResponse = {
                        type: 'peer',
                        senderId: parsed.senderId,
                        peerMetadata: parsed.peerMetadata || {},
                        protocolVersion: 1
                    }

                    // Encode and send peer response
                    const encodedResponse = encode(peerResponse)
                    const buf = encodedResponse.buffer as ArrayBuffer
                    sender.send(buf.slice(
                        encodedResponse.byteOffset,
                        encodedResponse.byteOffset + encodedResponse.byteLength
                    ))

                    // Notify existing peers about the new peer
                    this.room.broadcast(buf.slice(
                        encodedResponse.byteOffset,
                        encodedResponse.byteOffset + encodedResponse.byteLength
                    ), [sender.id])

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
