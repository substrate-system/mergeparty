import { waitFor } from '@substrate-system/dom'
import Debug from '@substrate-system/debug'
import { effect } from '@substrate-system/signs'
import { State, statusMessages } from './state.js'
import '@substrate-system/text-input'
const debug = Debug()
export const PARTYKIT_HOST:string = (import.meta.env.DEV ?
    'http://localhost:1999' :
    'https://merge-party.nichoth.partykit.dev')

/**
 * This runs in the browser.
 */
const form = await waitFor('form')
const state = State()

const connector = await waitFor('.connection-status form')

connector?.addEventListener('submit', ev => {
    ev.preventDefault()
    debug('click')
    const els = (ev.target as HTMLFormElement).elements
    let docId:string = els['docuemnt-id'].value
    // create a new document if a doc ID was not passed in
    docId = docId || State.createDoc(state).documentId
    State.connect(state, docId)
})

/**
 * Set the visual status element when the connection state changes.
 */
effect(async () => {
    const status = state.status.value
    const statusElement = (document.querySelector('.connection-status'))!
    statusElement.setAttribute('data-status', status)

    const message = statusMessages[status]
    // Update the visible text
    const connectionText = statusElement.querySelector('.connection-text')
    if (connectionText) {
        connectionText.textContent = message
    }

    const text = document.querySelector('textarea')
    text?.setAttribute('disabled', '')

    debug('status.....', status)
    if (status === 'disconnected') {
        const text = document.querySelector('textarea')
        text?.setAttribute('disabled', '')
    }

    // Update the visually hidden text for screen readers
    const hiddenText = statusElement.querySelector('.visually-hidden')
    if (hiddenText) {
        hiddenText.textContent = `WebSocket connection status: ${message}`
    }
})

form?.addEventListener('submit', ev => {
    ev.preventDefault()
    const text = (ev.target as HTMLFormElement).elements['text'] as HTMLTextAreaElement

    debug('submitting the form...', text.value)
})
