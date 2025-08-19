import type * as Party from 'partykit/server'
import { MergeParty, CORS } from '../src/server/index.js'
// import { Repo } from '@substrate-system/automerge-repo-slim'

// Parties accept requests at /parties/:party/:roomId.
// The default party in each project is called "main"
// http://localhost:1999/parties/main/example

export default class ExampleServer extends MergeParty {
    /**
     * Authenticate in here.
     */
    static async onBeforeConnect (request:Party.Request, _lobby:Party.Lobby) {
        try {
            // get _pk from query string (PartyKit's internal parameter)
            const pk = new URL(request.url).searchParams.get('_pk') ?? ''

            if (!pk) {
                return new Response('Missing _pk parameter', {
                    status: 401,
                    headers: CORS
                })
            }

            // this is not real authorization
            // we trust everyone with a _pk
            console.log('**before connect**', pk)

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
