import { Transform } from 'node:stream';
import { CTRL_BACKSPACE, CTRL_W } from '../keys.js';

/**
 * Byte-level input filter that sits between the real stdin and readline.
 *
 * Extends {@link Transform} but also forwards the raw-mode control that
 * readline expects from its input stream: `createInterface` calls
 * `input.setRawMode(true)` when `terminal: true`, and `close()` calls
 * `input.setRawMode(false)`. A plain `Transform` has neither `setRawMode`
 * nor `isTTY`/`isRaw`, so readline silently skips raw-mode engagement and
 * the TTY stays in canonical mode — TAB, arrows and the other editing keys
 * are then processed by the terminal driver instead of readline. Forwarding
 * keeps readline working while still remapping 0x08 (Ctrl+Backspace) to
 * 0x17 (Ctrl+W, word deletion).
 */
export class FilteredInputStream extends Transform {
    constructor(private readonly source: NodeJS.ReadStream) {
        super({
            transform(chunk: Buffer, _encoding: BufferEncoding, callback) {
                const filtered = Buffer.alloc(chunk.length);
                for (let i = 0; i < chunk.length; i++) {
                    const byte = chunk[i]!;
                    filtered[i] = byte === CTRL_BACKSPACE ? CTRL_W.charCodeAt(0) : byte;
                }
                callback(null, filtered);
            }
        });
    }

    setRawMode(mode: boolean): this {
        this.source.setRawMode(mode);
        return this;
    }

    get isTTY(): boolean {
        return this.source.isTTY;
    }

    get isRaw(): boolean | undefined {
        return this.source.isRaw;
    }
}
