// PartyKit Automerge Repo Sync Server (server-four.ts)
// Ported from https://github.com/automerge/automerge-repo-sync-server/src/server.js
// This version uses PartyKit's room API instead of ws/express

import type * as Party from 'partykit/server'
import { Repo } from '@automerge/automerge-repo'
// You may need to implement this
import { PartyKitServerAdapter } from './partykit-server-adapter.js'
import { PartyKitStorageAdapter } from './partykit-storage.js'
import { type PeerId } from '@substrate-system/automerge-repo-slim'
import { toU8 } from '../util.js'
// import { InMemoryStorageAdapter } from '@automerge/automerge-repo-storage-memory'

export default class Server implements Party.Server {
    repo:Repo
    room:Party.Room
    serverPeerId:PeerId
    // Map our PartyKit connection.id -> peerId (as announced in "join")
    private connToPeer = new Map<string, PeerId>()
    // Map peerId -> PartyKit connection
    private peerToConn = new Map<PeerId, Party.Connection>()

    constructor (room: Party.Room) {
        this.room = room
        this.serverPeerId = `partykit-server-${room.id}`
        // Use in-memory storage for now; swap for persistent if needed
        this.repo = new Repo({
            network: [new PartyKitServerAdapter(room)],
            storage: new PartyKitStorageAdapter(this.room.storage),
            peerId: this.serverPeerId,
            sharePolicy: async () => false, // Only sync docs clients know about
        })
    }

    onConnect (_conn:Party.Connection) {
        // Nothing to do yet; we’ll wait for the client's "join" message
        // You could rate-limit or auth in static onBeforeConnect if needed.
    }

    onClose (conn:Party.Connection) {
        const peerId = this.connToPeer.get(conn.id)
        if (peerId) {
            this.connToPeer.delete(conn.id)
            this.peerToConn.delete(peerId)
        }
    }

    async onMessage (raw:ArrayBuffer|string, conn:Party.Connection) {
        // Messages from the official adapter are CBOR-encoded binary frames.
        // We decode only to handle "join" and to optionally check documentId;
        // After that we typically re-broadcast the *original bytes*.
    }

    async onRequest (req:Party.Request) {
        if (new URL(req.url).pathname.endsWith('/health')) {
            return new Response('ok', { status: 200 })
        }
        return new Response('👍 PartyKit Automerge Repo Sync Server running', { status: 200 })
    }
}

// Note: You need to implement PartyKitServerAdapter to bridge PartyKit <-> Automerge network
// See automerge-repo's NodeWSServerAdapter for reference implementation.
