import type * as Party from 'partykit/server'
import {
    Repo,
    type PeerId,
    cbor
} from '@substrate-system/automerge-repo-slim'
import { PartyKitStorageAdapter } from './partykit-storage.js'

const { encode, decode } = cbor

export const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'HEAD, POST, GET, OPTIONS',
    'Access-Control-Allow-Headers':
        'Origin, X-Requested-With, Content-Type, Accept, Authorization',
}

export class MergeParty implements Party.Server {
    readonly room:Party.Room
    private repo:Repo
    private connectedPeers:Map<string, PeerId> = new Map()

    constructor (room:Party.Room) {
        this.room = room

        // Create the Automerge repo with PartyKit storage
        this.repo = new Repo({
            storage: new PartyKitStorageAdapter(room.storage),
            // Use the room ID as the server's peer ID
            peerId: `server:${room.id}` as PeerId,
            // Share everything by default for the server
            sharePolicy: async () => true
        })

        console.log(`MergeParty repo initialized for room: ${room.id}`)
    }

    // Get or create a document in the repo
    getDocument (documentId: string) {
        return this.repo.find(documentId as any)
    }

    // Create a new document
    create<T> (initialData?: T) {
        return this.repo.create(initialData)
    }

    // HTTP requests
    async onRequest (req: Party.Request): Promise<Response> {
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
            return new Response('👍 Automerge Repo Server', { headers: CORS })
        }

        if (subpath === '/health') {
            return Response.json({
                status: 'ok',
                room: this.room.id,
                connectedPeers: this.connectedPeers.size,
            },
            { headers: CORS })
        }

        return new Response('Not Found', { status: 404 })
    }

    onConnect (conn: Party.Connection, ctx: Party.ConnectionContext) {
        console.log(
            `Connected:
  id: ${conn.id}
  room: ${this.room.id}
  url: ${new URL(ctx.request.url).pathname}`
        )

        // Don't send any messages on connect - wait for join message from client
        // according to Automerge WebSocket protocol
    }

    async onMessage (message: string | ArrayBuffer, sender: Party.Connection) {
        try {
            let parsed: any

            if (typeof message === 'string') {
                // Handle string messages as JSON (join messages)
                parsed = JSON.parse(message)

                // Handle join message according to Automerge WebSocket protocol
                if (parsed.type === 'join') {
                    console.log(`Join request from ${parsed.senderId}`)

                    // Store the peer connection
                    this.connectedPeers.set(sender.id, parsed.senderId)

                    // Send peer response to the joining client
                    const peerResponse = {
                        type: 'peer',
                        senderId: `server:${this.room.id}`, // Server's ID
                        peerMetadata: {
                            storageId: `server:${this.room.id}`,
                            isEphemeral: false // Server has persistent storage
                        },
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

                    console.log(`Sent peer response for ${parsed.senderId}`)
                    return
                }
            } else if (message instanceof ArrayBuffer) {
                // Handle binary messages (CBOR-encoded sync protocol)
                try {
                    const msgBytes = new Uint8Array(message)
                    parsed = decode(msgBytes)
                } catch {
                    // If CBOR decode fails, ignore
                    console.log('Failed to decode CBOR message')
                    return
                }
            } else {
                console.warn('Unknown message type:', typeof message)
                return
            }

            // Handle Automerge repo messages
            if (parsed.type === 'request') {
                console.log(`Handling request for document ${parsed.documentId} from ${parsed.senderId}`)
                await this.handleDocumentRequest(parsed, sender)
                return
            }
            
            if (parsed.type === 'sync') {
                console.log(`Handling sync message for document ${parsed.documentId} from ${parsed.senderId}`)
                await this.handleSyncMessage(parsed, sender)
                return
            }

            console.log('Unhandled message type:', parsed.type)
        } catch (error) {
            console.error('Error processing message:', error)
        }
    }

    onClose (conn: Party.Connection) {
        console.log(`Disconnected: ${conn.id}`)

        // Remove the peer from our tracking
        const peerId = this.connectedPeers.get(conn.id)
        if (peerId) {
            this.connectedPeers.delete(conn.id)
            console.log(`Removed peer ${peerId}`)
        }
    }
}

// Export as default for PartyKit
export default MergeParty

// Also satisfy the Party.Worker interface
MergeParty satisfies Party.Worker
