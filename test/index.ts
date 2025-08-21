import { test } from '@substrate-system/tapzero'
import { PartykitNetworkAdapter } from '../src/client/partykit-websocket-adapter.js'

const PARTYKIT_HOST = 'http://localhost:1999'

test('smoke test', async t => {
    const networkAdapter = new PartykitNetworkAdapter({
        host: PARTYKIT_HOST,
        room: 'abc123'
    })

    t.ok(networkAdapter, 'Should create the thing')
})
