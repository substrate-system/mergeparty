// partykit/server.ts
// Pure relay for Automerge-Repo WebSocket protocol (CBOR frames)
// - No storage; just routes messages between peers in the same room
// - Handshake: expect `join`, reply with `peer`
// - Messages: forward anything with a `targetId` to the mapped peer

import type * as Party from 'partykit/server'
import { encode as cborEncode, decode as cborDecode } from 'cborg'

// Helper: ensure we send ArrayBuffer (PartyKit accepts ArrayBuffer | string)
function toArrayBuffer (u8:Uint8Array):ArrayBuffer {
    if (u8.byteOffset === 0 && u8.byteLength === u8.buffer.byteLength) {
        return u8.buffer as ArrayBuffer
    }
    return u8.slice().buffer
}

// Message shapes we care about (minimal). We keep these loose to avoid
// version pinning.
// If you import exact types from
// `@automerge/automerge-repo-network-websocket/dist/messages`,
// you can replace these with those.
interface BaseMsg {
  type: string;
  senderId?: string;
  targetId?: string;
  // additional fields vary by message type
  [k: string]: unknown;
}

// Join/Peer specifics
interface JoinMessage extends BaseMsg {
  type: 'join';
  senderId: string;
  supportedProtocolVersions?: string[];
  peerMetadata?: Record<string, unknown>;
}
interface PeerMessage extends BaseMsg {
  type: 'peer';
  senderId: string; // server id
  targetId: string; // the client's id
  selectedProtocolVersion: string;
  peerMetadata?: Record<string, unknown>;
}

const SUPPORTED_PROTOCOL_VERSION = '1'

export default class Server implements Party.Server {
    readonly room:Party.Room
    readonly serverPeerId:string

    // Connection bookkeeping
    // Map peerId -> Connection
    private byPeerId = new Map<string, Party.Connection>()
    // Map Connection -> meta { peerId?: string, joined: boolean }
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
        if (meta?.peerId) this.byPeerId.delete(meta.peerId)
        this.byConn.delete(conn)
    }

    // All Automerge-Repo messages must be binary (CBOR). If a string arrives,
    // treat as error.
    async onMessage (raw:ArrayBuffer|string, conn:Party.Connection) {
        if (typeof raw === 'string') {
            this.sendErrorAndClose(conn, 'Expected binary CBOR frame, got string')
            return
        }

        let msg: BaseMsg
        try {
            msg = cborDecode(new Uint8Array(raw)) as BaseMsg
        } catch (e) {
            this.sendErrorAndClose(conn, `CBOR decode failed: ${(e as Error).message}`)
            return
        }

        const meta = this.byConn.get(conn) ?? { joined: false }

        // --- Handshake: first message must be `join` ---
        if (!meta.joined) {
            if (msg.type !== 'join') {
                this.sendErrorAndClose(
                    conn,
                    "Protocol error: expected 'join' as first message"
                )
                return
            }
            const join = msg as JoinMessage
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

            // Register mappings
            this.byPeerId.set(join.senderId, conn)
            this.byConn.set(conn, { joined: true, peerId: join.senderId })

            // Reply with `peer`
            const peerMsg:PeerMessage = {
                type: 'peer',
                senderId: this.serverPeerId,
                targetId: join.senderId,
                selectedProtocolVersion: SUPPORTED_PROTOCOL_VERSION,
                // optional echo/augment metadata
                peerMetadata: {},
            }
            conn.send(toArrayBuffer(cborEncode(peerMsg)))
            return
        }

        // --- Post-handshake: route messages by targetId ---
        // For a pure relay, we don't inspect message types deeply;
        // we just forward.
        const targetId = msg.targetId
        if (!targetId || typeof targetId !== 'string') {
            // Some client-originated messages might be server-addressed;
            // ignore silently if not targetted.
            // You can tighten this into an error if you prefer strictness.
            return
        }

        const dst = this.byPeerId.get(targetId)
        if (!dst) {
            // Optional: you could reply with a doc-unavailable for
            // request/sync, but as a relay we just drop.
            return
        }

        try {
            dst.send(toArrayBuffer(cborEncode(msg)))
        } catch (_err) {
            // If send fails (e.g., closed), clean up mapping
            const meta2 = this.byConn.get(dst)
            if (meta2?.peerId) this.byPeerId.delete(meta2.peerId)
            this.byConn.delete(dst)
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
