// PartyKitServerAdapter: Automerge Repo network adapter for PartyKit
// Inspired by NodeWSServerAdapter from automerge-repo-network-websocket
import type { PeerId, Message } from '@automerge/automerge-repo'
import { NetworkAdapter } from '@automerge/automerge-repo'
import type * as Party from 'partykit/server'

export class PartyKitServerAdapter extends NetworkAdapter {
    room:Party.Room
    peers:Map<string, Party.Connection> = new Map()
    callbacks:Set<(peerId:PeerId, message:Uint8Array) => void> = new Set()

    constructor (room:Party.Room) {
        super()
        this.room = room
    }

    // Automerge expects send(message: Message)
    send (message:Message) {
        // Message should have .targetId and .data (Uint8Array)
        const targetId = (message as any).targetId as string|undefined
        const data = (message as any).data as Uint8Array
        if (targetId && data) {
            const conn = this.peers.get(targetId)
            if (conn) conn.send(data)
        }
    }

    // Called by Automerge Repo to broadcast a message to all peers
    broadcast (message:Uint8Array) {
        for (const conn of this.peers.values()) {
            conn.send(message)
        }
    }

    // Register a callback for incoming messages
    onMessage (callback:(peerId:PeerId, message:Uint8Array) => void) {
        this.callbacks.add(callback)
    }

    onConnect (conn:Party.Connection) {
        const peerId = conn.id as PeerId
        this.peers.set(peerId as unknown as string, conn)
    }

    onClose (conn:Party.Connection) {
        const peerId = conn.id as PeerId
        this.peers.delete(peerId as unknown as string)
    }

    // Called by PartyKit server on incoming message
    onMessageFromConnection (conn:Party.Connection, raw:ArrayBuffer | string) {
        if (typeof raw === 'string') return
        const peerId = conn.id as PeerId
        for (const cb of this.callbacks) {
            cb(peerId, new Uint8Array(raw))
        }
    }

    // Automerge NetworkAdapterInterface stubs
    isReady () {
        return true
    }

    whenReady ():Promise<void> {
        return Promise.resolve()
    }

    connect () {
        // No-op for server
    }

    disconnect () {
        // No-op for server
    }

    subscribeToPeerEvents () {
        // No-op for server
        return () => {}
    }

    subscribeToConnectionStatus () {
        // No-op for server
        return () => {}
    }

    subscribeToNetworkStatus () {
        // No-op for server
        return () => {}
    }

    get networkId () {
        return 'partykit-server'
    }

    get type () {
        return 'partykit-server-adapter'
    }
}
