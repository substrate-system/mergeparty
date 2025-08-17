import { waitFor } from '@substrate-system/dom'
import { effect } from '@substrate-system/signs'
import { State, statusMessages } from './state.js'
import '@substrate-system/text-input'
import Debug from '@substrate-system/debug'
import { type DocHandle } from '@substrate-system/automerge-repo-slim'
const debug = Debug()

const qs = document.querySelector.bind(document)
const state = State()
const connector = await waitFor('.connector form')
const connectBtn = document.getElementById('connect')
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

        // create a new document if a doc ID was not passed in
        docId = (docId || State.createDoc(state).documentId)
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
    const doc = state.document.value
    if (!doc) return

    const textarea = ev.target as HTMLTextAreaElement
    const newValue = textarea.value

    // Update the automerge document
    doc.change(() => {
        // Since AppDoc is defined as string, we directly assign the value
        return newValue
    })
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
 * Update textarea when document changes (for collaborative editing)
 */
effect(() => {
    const doc = state.document.value
    if (!doc || !text) return

    // Listen for document changes
    doc.on('change', () => {
        const currentValue = doc.docSync()
        if (text.value !== currentValue) {
            text.value = currentValue || ''
        }
    })

    // Set initial value
    const initialValue = doc.docSync()
    if (initialValue !== undefined) {
        text.value = initialValue
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
