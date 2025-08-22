import type * as Party from 'partykit/server'
import { MergeParty, CORS } from '../src/server/index.js'

// Parties accept requests at /parties/:party/:roomId.
// The default party in each project is called "main"
// http://localhost:1999/parties/main/example

export default class ExampleServer extends MergeParty {
    /**
     * Authenticate in here.
     */
    static async onBeforeConnect (request:Party.Request, _lobby:Party.Lobby) {
        try {
            // auth here

            // forward the request to `onConnect`
            return request
        } catch (_err) {
            const err = _err as Error
            // authentication failed!
            // short-circuit the request before it's forwarded to the party
            return new Response(
                'Unauthorized -- ' + err.message,
                { status: 401, headers: CORS }
            )
        }
    }
}

ExampleServer satisfies Party.Worker
