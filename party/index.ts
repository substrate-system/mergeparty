import type * as Party from 'partykit/server'

export const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'HEAD, POST, GET, OPTIONS',
    'Access-Control-Allow-Headers':
        'Origin, X-Requested-With, Content-Type, Accept, Authorization',
}

export default class Server implements Party.Server {
    readonly room:Party.Room

    constructor (room:Party.Room) {
        this.room = room
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

        if (url.pathname === '/') {
            return new Response('👍 All good')
        }

        if (url.pathname === '/health') {
            return Response.json({
                status: 'ok',
                room: this.room.id,
                repoInitialized: !!this.repo,
                connectedPeers: Array.from(this.room.getConnections()).length
            })
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

        // let's send a message to the connection
        conn.send('hello from server')
    }

    onMessage (message: string, sender: Party.Connection) {
        // let's log the message
        console.log(`connection ${sender.id} sent message: ${message}`)

        // as well as broadcast it to all the other connections in the room...
        this.room.broadcast(
            `${sender.id}: ${message}`,
            // ...except for the connection it came from
            [sender.id]
        )
    }
}

Server satisfies Party.Worker
