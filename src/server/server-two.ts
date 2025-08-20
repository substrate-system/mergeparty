// partykit/server.ts
// Pure relay for Automerge-Repo WebSocket protocol (CBOR frames)
// - No storage; just routes messages between peers in the same room
// - Handshake: expect `join`, reply with `peer`
// - Messages: forward anything with a `targetId` to the mapped peer

import type * as Party from 'partykit/server'
import { encode as cborEncode, decode as cborDecode } from 'cborg'

// Message shapes we care about (minimal). We keep these loose to avoid
// version pinning.
// If you import exact types from
// `@automerge/automerge-repo-network-websocket/dist/messages`,
// you can replace these with those.
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
  senderId:string;
  supportedProtocolVersions?:string[];
  peerMetadata?:Record<string, unknown>;
}
interface PeerMessage extends BaseMsg {
  type:'peer';
  senderId:string; // server id
  targetId:string; // the client's id
  selectedProtocolVersion:string;
  peerMetadata?:Record<string, unknown>;
}

// interface RequestMessage {
//   type:'request';
//   senderId:string; // server id
//   targetId:string; // the client's id
//   selectedProtocolVersion:string;
//   data:ArrayBuffer|Uint8Array;
// }

// interface SyncMessage {
//     type:'sync';
//     documentId:string;
//     targetId:string;  // 'server:<docId>' or a peerId
//     senderId:string;
//     data:ArrayBuffer|Uint8Array;  // binary payload
// }

const SUPPORTED_PROTOCOL_VERSION = '1'

export class MergeParty implements Party.Server {
    readonly room:Party.Room
    readonly serverPeerId:string

    // Connection bookkeeping
    // Map peerId -> Connection
    // private byPeerId = new Map<string, Party.Connection>()
    // Map Connection -> meta { peerId?: string, joined: boolean }
    private byConn = new Map<Party.Connection, {
        peerId?:string;
        joined:boolean
    }>()

    // peerId -> connection
    private peers = new Map<string, Party.Connection>()

    // connection -> peerId
    // ids = new Map<Party.Connection, string>()

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
            this.sendErrorAndClose(conn, 'Expected binary CBOR frame, got string')
            return
        }

        const meta = this.byConn.get(conn) ?? { joined: false }

        // --- Handshake: first message must be `join` ---
        if (!meta.joined) {
            console.log('*** not joined ***', meta)
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
                this.sendErrorAndClose(
                    conn,
                    "Protocol error: expected 'join' as first message"
                )
                return
            }

            const join = msg as JoinMessage
            console.log('**the join message**', join)
            const versions = join.supportedProtocolVersions ?? ['1']
            if (!versions.includes(SUPPORTED_PROTOCOL_VERSION)) {
                this.sendErrorAndClose(
                    conn,
                    'Unsupported protocol version. ' +
                        `Server supports ${SUPPORTED_PROTOCOL_VERSION}`
                )
                return
            }

            if (!join.senderId || typeof join.senderId !== 'string') {
                this.sendErrorAndClose(conn, 'join.senderId missing or invalid')
                return
            }

            // map peerID to connection
            this.peers.set(join.senderId, conn)
            this.byConn.set(conn, { joined: true, peerId: join.senderId })

            // Reply with `peer`
            const peerMsg:PeerMessage = {
                type: 'peer',
                senderId: this.serverPeerId,
                targetId: join.senderId,
                selectedProtocolVersion: SUPPORTED_PROTOCOL_VERSION,
                peerMetadata: {},
            }
            conn.send(toArrayBuffer(cborEncode(peerMsg)))

            console.log('**added to peers**', join.senderId)

            return
        }

        // --- Post-handshake: relay all messages as raw binary ---

        // Decode only if you need to inspect routing (targetId),
        // otherwise broadcast
        let msg:BaseMsg|undefined
        try {
            msg = cborDecode(new Uint8Array(raw)) as BaseMsg
        } catch (_err) {
            // If decode fails, just drop the message (should not happen)
            return
        }

        // testing
        // this.room.broadcast(raw, [conn.id])
        console.log('**all the peers**', Array.from(this.peers.keys()))

        console.log('** the message aaaaaaaa', msg)

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
            console.log('**fanning**')
            console.log('**all the peers**', Array.from(this.peers.keys()))
            for (const [peerId, conn] of this.peers) {
                if (peerId === senderId) continue
                const newMsg = {
                    type,
                    documentId,
                    targetId: peerId,   // important: set explicit recipient
                    senderId,
                    data,               // forward the same binary payload
                }
                console.log('**the new message**', newMsg)
                conn.send(toArrayBuffer(cborEncode({
                    ...msg,
                    targetId: peerId
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

    // Optional HTTP endpoint for health check
    async onRequest (req:Party.Request) {
        if (new URL(req.url).pathname.endsWith('/health')) {
            return new Response('ok', { status: 200 })
        }
        return new Response('Automerge relay running', { status: 200 })
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
// 1) In your PartyKit project, set this as the default export in `server.ts`.
// 2) Clients connect with Repo configured for WebSocket network adapter
//    pointing to your Party URL:
//    ws(s)://<your-domain>/parties/<projectName>/<roomId>
// 3) Each room gives you isolation: peers in the same room can address each
//    other by `peerId`.
// 4) This server does NOT persist or synthesize Automerge sync messages—it only
//    forwards CBOR frames.

// Helper: ensure we send ArrayBuffer (PartyKit accepts ArrayBuffer | string)
function toArrayBuffer (u8:Uint8Array):ArrayBuffer {
    if (u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength) {
        return u8.buffer as ArrayBuffer
    }
    return u8.slice().buffer
}
