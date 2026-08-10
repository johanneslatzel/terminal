import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { FilteredInputStream } from '../../../src/input/filtered-input-stream.js';
import { CTRL_BACKSPACE, CTRL_W } from '../../../src/keys.js';

interface FakeSource extends PassThrough {
    isTTY: boolean;
    isRaw: boolean;
    rawModes: boolean[];
    setRawMode: (mode: boolean) => void;
}

function makeSource(): FakeSource {
    const rawModes: boolean[] = [];
    const source = Object.assign(new PassThrough(), {
        isTTY: true,
        isRaw: false,
        rawModes,
        setRawMode: (mode: boolean) => {
            rawModes.push(mode);
        }
    });
    return source;
}

describe('FilteredInputStream', () => {
    it('remaps Ctrl+Backspace bytes to Ctrl+W and passes others through', async () => {
        const source = makeSource();
        const filter = new FilteredInputStream(source as unknown as NodeJS.ReadStream);
        const outChunks: Buffer[] = [];
        source.pipe(filter, { end: false });
        filter.on('data', (chunk: Buffer) => outChunks.push(chunk));
        source.write(Buffer.from([CTRL_BACKSPACE, 0x41, CTRL_BACKSPACE]));
        await new Promise((r) => setTimeout(r, 10));
        expect(Buffer.concat(outChunks)).toEqual(
            Buffer.from([CTRL_W.charCodeAt(0), 0x41, CTRL_W.charCodeAt(0)])
        );
    });

    it('forwards raw mode to the source and returns itself', () => {
        const source = makeSource();
        const filter = new FilteredInputStream(source as unknown as NodeJS.ReadStream);
        expect(filter.setRawMode(true)).toBe(filter);
        expect(filter.setRawMode(false)).toBe(filter);
        expect(source.rawModes).toEqual([true, false]);
    });

    it('forwards isTTY and isRaw from the source', () => {
        const source = makeSource();
        const filter = new FilteredInputStream(source as unknown as NodeJS.ReadStream);
        expect(filter.isTTY).toBe(true);
        expect(filter.isRaw).toBe(false);
    });
});
