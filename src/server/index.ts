// Pure relay for Automerge-Repo WebSocket protocol (CBOR frames)
// - No storage; just routes messages between peers in the same room
// - Handshake: expect `join`, reply with `peer`
// - Messages: forward anything with a `targetId` to the mapped peer

import type * as Party from 'partykit/server'
import { encode as cborEncode, decode as cborDecode } from 'cborg'

export const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'HEAD, POST, GET, OPTIONS',
    'Access-Control-Allow-Headers':
        'Origin, X-Requested-With, Content-Type, Accept, Authorization',
}

// Message shapes we care about.
interface BaseMsg {
    type:'join'|'peer'|'request'|'sync';
    senderId?:string;
    targetId?:string;
    // additional fields vary by message type
    [k: string]:unknown;
}

// Join/Peer specifics
interface JoinMessage extends BaseMsg {
    type:'join';
    supportedProtocolVersions?:string[];
    peerMetadata?:Record<string, unknown>;
}
interface PeerMessage extends BaseMsg {
    type:'peer';
    selectedProtocolVersion:string;
    peerMetadata?:Record<string, unknown>;
}

const SUPPORTED_PROTOCOL_VERSION = '1'

export class MergeParty implements Party.Server {
    readonly room:Party.Room
    readonly serverPeerId:string

    private peers = new Map<string, Party.Connection>()  // peerId -> connection
    // Connection -> meta { peerId?: string, joined: boolean }
    private byConn = new Map<Party.Connection, {
        peerId?:string;
        joined:boolean
    }>()

    constructor (room:Party.Room) {
        this.room = room
        // Use a deterministic server peer id per room so clients can address
        // the server if they want
        this.serverPeerId = `server:${room.id}`
    }

    // ---- WebSocket lifecycle ----
    onConnect (conn:Party.Connection) {
        this.byConn.set(conn, { joined: false })
    }

    onClose (conn:Party.Connection) {
        const meta = this.byConn.get(conn)
        if (meta?.peerId) this.peers.delete(meta.peerId)
        this.byConn.delete(conn)
    }

    // All Automerge-Repo messages must be binary (CBOR). If a string arrives,
    // treat as error. Only decode for handshake, otherwise relay raw.
    async onMessage (raw:ArrayBuffer|string, conn:Party.Connection) {
        if (typeof raw === 'string') {
            this.sendErrorAndClose(conn,
                'Expected binary CBOR frame, got string')
            return
        }

        const meta = this.byConn.get(conn) ?? { joined: false }

        // --- Handshake: first message must be `join` ---
        if (!meta.joined) {
            let msg:BaseMsg
            try {
                msg = cborDecode(new Uint8Array(raw)) as BaseMsg
            } catch (e) {
                return this.sendErrorAndClose(
                    conn,
                    `CBOR decode failed: ${(e as Error).message}`
                )
            }

            if (msg.type !== 'join') {
                return this.sendErrorAndClose(conn,
                    "Protocol error: expected 'join' as first message"
                )
            }

            const join = msg as JoinMessage
            const versions = join.supportedProtocolVersions ?? ['1']
            if (!versions.includes(SUPPORTED_PROTOCOL_VERSION)) {
                return this.sendErrorAndClose(conn,
                    'Unsupported protocol version. ' +
                        `Server supports ${SUPPORTED_PROTOCOL_VERSION}`)
            }

            if (!join.senderId || typeof join.senderId !== 'string') {
                this.sendErrorAndClose(conn, '`senderId` missing or invalid')
                return
            }

            // ---------- message is valid join ----------

            // map peerID to connection
            this.peers.set(join.senderId, conn)
            this.byConn.set(conn, { joined: true, peerId: join.senderId })

            // 1) Tell the new client about all existing peers
            for (const existingId of this.peers.keys()) {
                if (existingId === join.senderId) continue
                this.announce(existingId, join.senderId)
            }

            // 2) Tell all existing peers about the new client
            for (const [existingId, _existingConn] of this.peers) {
                if (existingId === join.senderId) continue
                this.announce(join.senderId, existingId)
            }

            return
        }

        // --- Post-handshake: relay all messages as raw binary ---

        // Decode only if you need to inspect routing (targetId),
        // otherwise broadcast
        let msg:BaseMsg|undefined
        try {
            msg = cborDecode(new Uint8Array(raw)) as BaseMsg
        } catch (err) {
            // If decode fails, just drop the message (should not happen)
            console.log('**bad message**', err)
            return
        }

        const { type, documentId, targetId, senderId, data } = msg

        // If the message has a targetId, send only to that peer
        const target = this.peers.get(targetId || '')
        if (target) {
            target.send(raw)  // relay the original raw ArrayBuffer
            return
        }

        // Fan-out to all other peers in this room when
        // targetId is 'server:<docId>'
        if (targetId && targetId.includes('server:')) {
            for (const [peerId, conn] of this.peers) {
                if (peerId === senderId) continue
                conn.send(toArrayBuffer(cborEncode({
                    ...msg,
                    targetId: peerId   // important: set explicit recipient
                })))
            }
        } else {
            // Directed delivery (occasionally used by clients)
            const conn = this.peers.get(targetId!)
            if (conn) {
                conn.send(cborEncode({
                    type,
                    documentId,
                    targetId,
                    senderId,
                    data
                }))
            }
        }
    }

    private announce (announcedPeerId:string, toClientId:string) {
        const msg:PeerMessage = {
            type: 'peer',
            senderId: announcedPeerId,  // the peer being announced
            targetId: toClientId,  // the client who should learn about it
            selectedProtocolVersion: SUPPORTED_PROTOCOL_VERSION,
            peerMetadata: {},
        }

        const toConn = this.peers.get(toClientId)
        if (toConn) {
            toConn.send(toArrayBuffer(cborEncode(msg)))
        }
    }

    // HTTP endpoint for health check
    async onRequest (req:Party.Request) {
        const url = new URL(req.url)
        console.log('**url path**', url.pathname)

        if (new URL(req.url).pathname.includes('/health')) {
            return Response.json({
                status: 'ok',
                room: this.room.id,
                connectedPeers: Array.from(this.room.getConnections()).length
            }, { status: 200, headers: CORS })
        }

        return new Response('👍 All good', { status: 200, headers: CORS })
    }

    // ---- helpers ----
    private sendErrorAndClose (conn:Party.Connection, message:string):void {
        const errorMsg = { type: 'error', message }
        try {
            conn.send(toArrayBuffer(cborEncode(errorMsg)))
        } finally {
            conn.close()
        }
    }
}

// Usage notes:
// * Clients connect with Repo configured for WebSocket network adapter
//    pointing to your Party URL:
//    ws(s)://<your-domain>/parties/<projectName>/<roomId>
// * Each room gives you isolation: peers in the same room can address each
//    other by `peerId`.
// * This server does NOT persist or synthesize Automerge sync messages—it only
//    forwards CBOR frames.

// Helper: ensure we send ArrayBuffer (PartyKit accepts ArrayBuffer | string)
function toArrayBuffer (u8:Uint8Array):ArrayBuffer {
    if (u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength) {
        return u8.buffer as ArrayBuffer
    }
    return u8.slice().buffer
}
