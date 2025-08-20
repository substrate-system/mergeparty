// src/server/server-three.ts
import type * as Party from 'partykit/server'
import { encode as cborEncode, decode as cborDecode } from 'cborg'

// ----
// minimal protocol types (mirror @automerge/automerge-repo-network-websocket)
// ----
type PeerId = string;
type ProtocolVersion = '1';  // ProtocolV1 is "1" in the official package
type AnyMessage = Record<string, unknown> & { type: string };

type JoinMessage = {
    type:'join';
    senderId:PeerId;
    supportedProtocolVersions:ProtocolVersion[];
    peerMetadata?:Record<string, unknown>;
};

type PeerMessage = {
    type:'peer';
    senderId:PeerId;  // server peer id
    targetId:PeerId;  // the client's peer id
    selectedProtocolVersion:ProtocolVersion;
    peerMetadata?:Record<string, unknown>;
};

type ErrorMessage = {
    type:'error';
    message:string;
    senderId:PeerId;
    targetId:PeerId;
};

function toU8 (msg:string|ArrayBuffer):Uint8Array {
    if (typeof msg === 'string') return new TextEncoder().encode(msg)
    return msg instanceof ArrayBuffer ? new Uint8Array(msg) : new Uint8Array()
}

export const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'HEAD, POST, GET, OPTIONS',
    'Access-Control-Allow-Headers':
    'Origin, X-Requested-With, Content-Type, Accept, Authorization',
}

export class MergeParty implements Party.Server {
    readonly room:Party.Room

    // Map our PartyKit connection.id -> peerId (as announced in "join")
    private connToPeer = new Map<string, PeerId>()
    // Map peerId -> PartyKit connection
    private peerToConn = new Map<PeerId, Party.Connection>()

    // One stable server peerId per room (deterministic for debugging)
    private serverPeerId:PeerId

    constructor (room:Party.Room) {
        this.room = room
        this.serverPeerId = `server:${room.id}`
    }

    // Simple health endpoint and CORS preflight
    async onRequest (req:Party.Request):Promise<Response> {
        if (req.method === 'OPTIONS') {
            return new Response(null, {
                headers: CORS,
                status: 200
            })
        }

        const url = new URL(req.url)
        if (url.pathname.endsWith('/health')) {
            return Response.json({
                status: 'ok',
                room: this.room.id,
                connectedPeers: Array.from(this.room.getConnections()).length,
            }, { headers: CORS, status: 200 })
        }

        return new Response('Automerge relay is running', {
            headers: { ...CORS, 'content-type': 'text/plain' },
        })
    }

    async onConnect (_conn:Party.Connection) {
    // Nothing to do yet; we’ll wait for the client's "join" message
    // You could rate-limit or auth in static onBeforeConnect if needed.
    }

    async onClose (conn:Party.Connection) {
        const peerId = this.connToPeer.get(conn.id)
        if (peerId) {
            this.connToPeer.delete(conn.id)
            this.peerToConn.delete(peerId)
        }
    }

    async onError (conn:Party.Connection, error: Error) {
        console.error('[relay] connection error', { id: conn.id, error })
    }

    async onMessage (message:string|ArrayBuffer, sender:Party.Connection) {
        // Messages from the official adapter are CBOR-encoded binary frames.
        // We decode only to handle "join" and to optionally check documentId;
        // After that we typically re-broadcast the *original bytes*.
        const raw = toU8(message)

        let parsed:AnyMessage|undefined
        try {
            parsed = cborDecode(raw) as AnyMessage
        } catch {
            // If not CBOR, ignore silently (or close)
            return
        }

        // Handle the "join" handshake
        if (parsed?.type === 'join') {
            const join = parsed as JoinMessage

            // Remember mapping connection <-> peer
            this.connToPeer.set(sender.id, join.senderId)
            this.peerToConn.set(join.senderId, sender)

            // Negotiate protocol version (we support "1")
            const selected = join.supportedProtocolVersions.includes('1') ?
                '1' :
                undefined

            if (!selected) {
                const err: ErrorMessage = {
                    type: 'error',
                    message: 'No compatible protocol version',
                    senderId: this.serverPeerId,
                    targetId: join.senderId,
                }
                sender.send(cborEncode(err))
                sender.close()
                return
            }

            const peerMsg:PeerMessage = {
                type: 'peer',
                senderId: this.serverPeerId,
                targetId: join.senderId,
                selectedProtocolVersion: selected,
                peerMetadata: { server: 'partykit', room: this.room.id },
            }

            sender.send(cborEncode(peerMsg))
            return
        }

        // Optional guard: enforce 1-document-per-room if the message
        // carries documentId
        const documentId = (parsed as any)?.documentId as string|undefined
        if (documentId && documentId !== this.room.id) {
            const senderPeer = this.connToPeer.get(sender.id) ?? 'unknown'
            const err:ErrorMessage = {
                type: 'error',
                message: `Document ${documentId} not allowed in room ${this.room.id}`,
                senderId: this.serverPeerId,
                targetId: senderPeer,
            }
            sender.send(cborEncode(err))
            return
        }

        // Relay policy:
        // - If the message specifies targetId and we have that peer,
        //   send only there.
        // - Otherwise, broadcast to everyone except the sender.
        const targetId = (parsed as any)?.targetId as PeerId|undefined
        if (targetId && this.peerToConn.has(targetId)) {
            this.peerToConn.get(targetId)!.send(raw)
            return
        }

        // Broadcast to all other peers in the room
        this.room.broadcast(raw, [sender.id])
    }
}
