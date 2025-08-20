export function toU8 (msg:string|ArrayBuffer):Uint8Array {
    if (typeof msg === 'string') return new TextEncoder().encode(msg)
    return msg instanceof ArrayBuffer ? new Uint8Array(msg) : new Uint8Array()
}
