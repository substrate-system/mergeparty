import { waitFor } from '@substrate-system/dom'
import { effect } from '@substrate-system/signs'
import { State, statusMessages } from './state.js'
import '@substrate-system/text-input'
import Debug from '@substrate-system/debug'
import { type DocHandle } from '@substrate-system/automerge-repo-slim'
const debug = Debug(import.meta.env.DEV)

localStorage.setItem('DEBUG', 'automerge-repo:*')

const qs = document.querySelector.bind(document)
const state = State()
const connector = await waitFor('.connector form')
const text = qs('textarea')
const submitBtn = qs('form.textarea button')

if (import.meta.env.DEV) {
    // @ts-expect-error dev
    window.state = state
}

connector?.addEventListener('submit', async ev => {
    ev.preventDefault()
    debug('connect/disconnect')

    // connect or disconnect?
    const status = state.status.value

    if (status === 'disconnected') {
        // connect
        const els = (ev.target as HTMLFormElement).elements
        let docId:string = els['document-id'].value

        // If no document ID provided, create one a new one
        if (!docId) {
            const newDoc = State.createDoc(state)
            docId = newDoc.documentId
        }

        await State.connect(state, docId)
    }

    if (status === 'connected') {
        // disconnect
        State.disconnect(state)
    }
})

/**
 * Synchronize state - update automerge doc when textarea changes
 */
text?.addEventListener('input', (ev) => {
    const data = state.document.value
    if (!data) {
        debug('No document available for input')
        return
    }

    const textarea = ev.target as HTMLTextAreaElement
    const newValue = textarea.value

    debug('Updating document with new value:', newValue)

    // Update the automerge document
    data.change((d) => {
        debug(
            'Inside change function, old value:', d.text,
            'new value:', newValue
        )
        d.text = newValue
    })

    const afterChange = data.doc()
    debug('Document after change:', afterChange)
})

/**
 * Connection state change
 */
effect(() => {
    const status = state.status.value
    const statusElement = (qs('.connection-status'))!
    statusElement.setAttribute('data-status', status)

    debug('status.....', status)

    const message = statusMessages[status]

    // Update the visible text
    const connectionText = statusElement.querySelector('.connection-text')
    if (connectionText) {
        connectionText.textContent = message
    }

    // Update the visually hidden text for screen readers
    const hiddenText = statusElement.querySelector('.visually-hidden')
    if (hiddenText) {
        hiddenText.textContent = `WebSocket connection status: ${message}`
    }

    const connectBtn = document.getElementById('connect')

    // Change form state
    if (status === 'disconnected' || status === 'connecting') {
        text?.setAttribute('disabled', '')
        submitBtn?.setAttribute('disabled', '')
        connectBtn!.innerText = 'Connect'
    } else {
        // is connected
        text?.removeAttribute('disabled')
        submitBtn?.removeAttribute('disabled')
        connectBtn!.innerText = 'Disconnect'
    }
})

const form = await waitFor('form.textarea')
form?.addEventListener('submit', ev => {
    ev.preventDefault()
    const text = (ev.target as HTMLFormElement).elements['text'] as HTMLTextAreaElement

    debug('submitting the form...', text.value)
})

/**
 * When we have a document, show its ID in the UI.
 */
effect(() => {
    const doc = state.document.value
    if (!doc) return
    qs('.connector')!.innerHTML += DocId(doc)
})

/**
 * Update textarea when document changes
 */
effect(() => {
    const data = state.document.value
    if (!data || !text) return

    debug('Setting up document change listener for document:', data.documentId)

    // Listen for document changes
    const handleChange = () => {
        const doc = data.doc()
        const currentValue = doc?.text || ''
        debug('Document changed! New value:', currentValue)
        debug('Current textarea value:', text.value)
        if (text.value !== currentValue) {
            debug('Updating textarea from', text.value, 'to', currentValue)
            text.value = currentValue
        } else {
            debug('Textarea already has the correct value')
        }
    }

    // Add event listeners to see what's happening
    data.on('change', handleChange)

    // Set initial value
    const doc = data.doc()
    const initialValue = doc?.text || ''
    if (initialValue !== undefined) {
        text.value = initialValue
    }

    // Cleanup function
    return () => {
        data.off('change', handleChange)
    }
})

/**
 * Create a new HTML node with the document ID
 */
function DocId (doc:DocHandle<any>):string {
    return `<div class="doc-id">
        <span class="explanation">Your document ID: </span>
        ${doc.documentId}
    </div>`
}
