import { describe, it, expect, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { Terminal } from '../../../src/terminal.js';
import { Command } from '../../../src/types.js';
import { waitForOutput } from '../../helpers/wait-for-output.js';

interface FakeStdin extends PassThrough {
    isTTY: boolean;
    isRaw: boolean;
    rawModes: boolean[];
    setRawMode: (mode: boolean) => void;
}

function makeTtyStdin(): FakeStdin {
    const rawModes: boolean[] = [];
    const stdin = Object.assign(new PassThrough(), {
        isTTY: true,
        isRaw: false,
        rawModes,
        setRawMode: (mode: boolean) => {
            rawModes.push(mode);
        }
    });
    return stdin;
}

describe('Terminal raw mode', () => {
    let term: Terminal | undefined;

    afterEach(async () => {
        await term?.stop();
        term = undefined;
    });

    it('engages raw mode on start and releases it on stop', async () => {
        const stdin = makeTtyStdin();
        const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
        term = new Terminal({ stdin: stdin as unknown as NodeJS.ReadStream, stdout, prompt: '' });
        await term.start();
        expect(stdin.rawModes).toContain(true);
        await term.stop();
        expect(stdin.rawModes).toContain(false);
    });

    it('completes commands through the keypress pipeline on a TTY stdin', async () => {
        const stdin = makeTtyStdin();
        const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const chunks: string[] = [];
        stdout.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
        term = new Terminal({ stdin: stdin as unknown as NodeJS.ReadStream, stdout, prompt: '' });
        const cmd = new (class extends Command {
            execute() {}
        })('workspace');
        term.register(cmd);
        await term.start();
        stdin.write('wor\t');
        await waitForOutput(chunks, (s) => s.includes('workspace'));
        expect(chunks.join('')).toContain('workspace');
    });
});
