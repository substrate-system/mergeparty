import { waitFor } from '@substrate-system/dom'
import { effect } from '@substrate-system/signs'
import { State, statusMessages } from './state.js'
import '@substrate-system/text-input'
import Debug from '@substrate-system/debug'
const debug = Debug()

const state = State()

const connector = await waitFor('.connector form')

connector?.addEventListener('submit', ev => {
    ev.preventDefault()
    debug('submit')
    const els = (ev.target as HTMLFormElement).elements
    let docId:string = els['document-id'].value
    // create a new document if a doc ID was not passed in
    docId = (docId || State.createDoc(state).documentId)

    State.connect(state, docId)
})

/**
 * Connection state change
 */
effect(() => {
    const status = state.status.value
    const statusElement = (document.querySelector('.connection-status'))!
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

    const text = document.querySelector('textarea')

    // Change form state
    if (status === 'disconnected' || status === 'connecting') {
        text?.setAttribute('disabled', '')
        document
            .querySelector('form.textarea button')?.setAttribute('disabled', '')
    } else {
        text?.removeAttribute('disabled')
        document
            .querySelector('form.textarea button')?.removeAttribute('disabled')
    }
})

const form = await waitFor('form.textarea')
form?.addEventListener('submit', ev => {
    ev.preventDefault()
    const text = (ev.target as HTMLFormElement).elements['text'] as HTMLTextAreaElement

    debug('submitting the form...', text.value)
})
