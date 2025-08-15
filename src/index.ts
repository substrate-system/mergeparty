import type * as Party from 'partykit/server'
import { Repo } from '@automerge/automerge-repo'
import { PartyKitNetworkAdapter } from './partykit-network-adapter.js'

export const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'HEAD, POST, GET, OPTIONS',
    'Access-Control-Allow-Headers':
        'Origin, X-Requested-With, Content-Type, Accept, Authorization',
}

export default class Server implements Party.Server {
    readonly room:Party.Room
    readonly repo:Repo

    constructor (room:Party.Room) {
        this.room = room

        const adapter = new PartyKitNetworkAdapter({
            host: 'localhost:1999',
            room: room.id
        })

        this.repo = new Repo({
            network: [adapter]
        })
    }

    // HTTP requests
    async onRequest (req:Party.Request): Promise<Response> {
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

    onConnect (conn: Party.Connection, ctx: Party.ConnectionContext) {
        // A websocket just connected!
        console.log(
      `Connected:
  id: ${conn.id}
  room: ${this.room.id}
  url: ${new URL(ctx.request.url).pathname}`
        )

        // Notify other peers about this new peer
        const peerCandidateMessage = {
            type: 'peer-candidate',
            peerId: conn.id,
            peerMetadata: {}
        }

        this.room.broadcast(JSON.stringify(peerCandidateMessage), [conn.id])
    }

    onMessage (message:string|ArrayBuffer, sender:Party.Connection) {
        try {
            const msgString = typeof message === 'string' ? message : new TextDecoder().decode(message)
            const parsed = JSON.parse(msgString)

            console.log(`Message from ${sender.id}:`, parsed.type || 'unknown')

            // Handle automerge repo messages
            if (parsed.targetId) {
                // Route message to specific target
                const targetConnection = Array.from(this.room.getConnections())
                    .find(conn => conn.id === parsed.targetId)

                if (targetConnection) {
                    targetConnection.send(msgString)
                } else {
                    console.warn(`Target peer ${parsed.targetId} not found`)
                }
            } else {
                // Broadcast to all other peers
                this.room.broadcast(msgString, [sender.id])
            }
        } catch (error) {
            console.error('Error parsing message:', error)
            // Fallback: broadcast raw message
            this.room.broadcast(message, [sender.id])
        }
    }

    onClose (conn: Party.Connection) {
        // Notify other peers about disconnection
        const peerDisconnectedMessage = {
            type: 'peer-disconnected',
            peerId: conn.id
        }

        this.room.broadcast(JSON.stringify(peerDisconnectedMessage), [conn.id])
    }
}

Server satisfies Party.Worker
