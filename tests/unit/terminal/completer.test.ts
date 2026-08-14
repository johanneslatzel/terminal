import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { Terminal } from '../../../src/terminal.js';
import { Command } from '../../../src/types.js';
import { waitForOutput } from '../../helpers/wait-for-output.js';

async function writeAndWait(
    stdin: PassThrough,
    chunks: string[],
    input: string,
    predicate: (s: string) => boolean
): Promise<void> {
    stdin.write(input + '\n');
    await waitForOutput(chunks, predicate);
}

describe('Terminal', () => {
    let stdin: PassThrough;
    let stdout: PassThrough;
    let chunks: string[];
    let term: Terminal;

    beforeEach(() => {
        stdin = new PassThrough();
        stdout = new PassThrough();
        chunks = [];
        stdout.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
        term = new Terminal({
            prompt: '',
            stdin: stdin as unknown as NodeJS.ReadStream,
            stdout: stdout as unknown as NodeJS.WriteStream
        });
    });

    afterEach(async () => {
        await term.stop();
    });
    // TTY stream configuration
    // ------------------------------------------------------------------

    it('works with TTY-like input stream', async () => {
        const ttyStdin = Object.assign(new PassThrough(), {
            isTTY: true,
            setRawMode: () => {},
            isRaw: false
        }) as unknown as NodeJS.ReadStream;
        const ttyStdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const ttyChunks: string[] = [];
        ttyStdout.on('data', (chunk: Buffer) => ttyChunks.push(chunk.toString()));
        const ttyTerm = new Terminal({
            stdin: ttyStdin,
            stdout: ttyStdout,
            prompt: ''
        });
        await ttyTerm.start();
        ttyStdin.write('help\n');
        await new Promise((r) => setTimeout(r, 100));
        expect(ttyChunks.join('')).toContain('Commands:');
        await ttyTerm.stop();
    });

    it('exercises the readline completer callback', async () => {
        const ttyStdin = Object.assign(new PassThrough(), {
            isTTY: true,
            setRawMode: () => {},
            isRaw: false
        }) as unknown as NodeJS.ReadStream;
        const ttyStdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const ttyTerm = new Terminal({
            stdin: ttyStdin,
            stdout: ttyStdout,
            prompt: ''
        });
        await ttyTerm.start();

        const rl = (
            ttyTerm as unknown as {
                rl: { completer: (l: string, cb: () => void) => void };
            }
        ).rl;
        rl.completer('he', () => {});

        await ttyTerm.stop();
    });

    it('completes pipeline commands through the readline completer', async () => {
        const ttyStdin = Object.assign(new PassThrough(), {
            isTTY: true,
            setRawMode: () => {},
            isRaw: false
        }) as unknown as NodeJS.ReadStream;
        const ttyStdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const ttyTerm = new Terminal({
            stdin: ttyStdin,
            stdout: ttyStdout,
            prompt: ''
        });
        await ttyTerm.start();

        const rl = (
            ttyTerm as unknown as {
                rl: {
                    completer: (
                        l: string,
                        cb: (e: unknown, r: [string[], string]) => void
                    ) => [string[], string] | void;
                };
            }
        ).rl;

        const result = await new Promise<[string[], string]>((resolve, reject) => {
            const timer = setTimeout(
                () => reject(new Error('completer callback never invoked')),
                500
            );
            const ret = rl.completer('json | s', (err, completions) => {
                clearTimeout(timer);
                if (err) reject(err);
                else resolve(completions);
            });
            if (ret !== undefined) {
                clearTimeout(timer);
                resolve(ret);
            }
        });

        expect(result).toEqual([['select', 'sort'], 's']);

        await ttyTerm.stop();
    });

    it('inserts the bare enum flag name on Tab (no value hint)', async () => {
        const ttyStdin = Object.assign(new PassThrough(), {
            isTTY: true,
            setRawMode: () => {},
            isRaw: false
        }) as unknown as NodeJS.ReadStream;
        const ttyStdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const ttyTerm = new Terminal({
            stdin: ttyStdin,
            stdout: ttyStdout,
            prompt: ''
        });
        await ttyTerm.start();

        ttyStdin.write('aggregate --m\t');
        await new Promise((r) => setTimeout(r, 50));

        const rl = (ttyTerm as unknown as { rl: { line: string } }).rl;
        expect(rl.line).toBe('aggregate --mode');

        await ttyTerm.stop();
    });

    it('inserts the full enum value for a single match on Tab', async () => {
        const ttyStdin = Object.assign(new PassThrough(), {
            isTTY: true,
            setRawMode: () => {},
            isRaw: false
        }) as unknown as NodeJS.ReadStream;
        const ttyStdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const ttyTerm = new Terminal({
            stdin: ttyStdin,
            stdout: ttyStdout,
            prompt: ''
        });
        await ttyTerm.start();

        ttyStdin.write('aggregate --mode cou\t');
        await new Promise((r) => setTimeout(r, 50));

        const rl = (ttyTerm as unknown as { rl: { line: string } }).rl;
        expect(rl.line).toBe('aggregate --mode count');

        await ttyTerm.stop();
    });

    it('lists bare flags without inserting the enum hint when several flags match', async () => {
        const ttyStdin = Object.assign(new PassThrough(), {
            isTTY: true,
            setRawMode: () => {},
            isRaw: false
        }) as unknown as NodeJS.ReadStream;
        const ttyStdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const chunks: string[] = [];
        ttyStdout.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
        const ttyTerm = new Terminal({
            stdin: ttyStdin,
            stdout: ttyStdout,
            prompt: ''
        });
        await ttyTerm.start();

        ttyStdin.write('aggregate --\t');
        await new Promise((r) => setTimeout(r, 50));
        ttyStdin.write('\t');
        await waitForOutput(chunks, (s) => s.includes('--mode'));

        const rl = (ttyTerm as unknown as { rl: { line: string } }).rl;
        expect(rl.line).toBe('aggregate --');
        expect(rl.line).not.toContain('[');
        expect(chunks.join('')).not.toContain('[count');

        await ttyTerm.stop();
    });

    it('lists matching enum values without inserting a hint when several match', async () => {
        const ttyStdin = Object.assign(new PassThrough(), {
            isTTY: true,
            setRawMode: () => {},
            isRaw: false
        }) as unknown as NodeJS.ReadStream;
        const ttyStdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const chunks: string[] = [];
        ttyStdout.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
        const ttyTerm = new Terminal({
            stdin: ttyStdin,
            stdout: ttyStdout,
            prompt: ''
        });
        await ttyTerm.start();

        ttyStdin.write('aggregate --mode me\t');
        await new Promise((r) => setTimeout(r, 50));
        ttyStdin.write('\t');
        await waitForOutput(chunks, (s) => s.includes('median'));

        const rl = (ttyTerm as unknown as { rl: { line: string } }).rl;
        expect(rl.line).toBe('aggregate --mode me');
        expect(rl.line).not.toContain('[');
        expect(chunks.join('')).not.toContain('[count');

        await ttyTerm.stop();
    });

    it('tracks entered commands in _history with TTY stdin', async () => {
        const ttyStdin = Object.assign(new PassThrough(), {
            isTTY: true,
            setRawMode: () => {},
            isRaw: false
        }) as unknown as NodeJS.ReadStream;
        const ttyStdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const ttyTerm = new Terminal({
            stdin: ttyStdin,
            stdout: ttyStdout,
            prompt: ''
        });
        await ttyTerm.start();
        ttyStdin.write('manual-entry\n');
        await new Promise((r) => setTimeout(r, 100));
        await ttyTerm.stop();
        const internalHistory = (ttyTerm as unknown as { historyStore: { entries: string[] } })
            .historyStore.entries;
        expect(internalHistory).toContain('manual-entry');
    });

    it('deduplicates non-consecutive commands in _history', async () => {
        const ttyStdin = Object.assign(new PassThrough(), {
            isTTY: true,
            setRawMode: () => {},
            isRaw: false
        }) as unknown as NodeJS.ReadStream;
        const ttyStdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const ttyTerm = new Terminal({
            stdin: ttyStdin,
            stdout: ttyStdout,
            prompt: ''
        });
        await ttyTerm.start();
        ttyStdin.write('foo\n');
        await new Promise((r) => setTimeout(r, 100));
        ttyStdin.write('bar\n');
        await new Promise((r) => setTimeout(r, 100));
        ttyStdin.write('foo\n');
        await new Promise((r) => setTimeout(r, 100));
        await ttyTerm.stop();
        const internalHistory = (ttyTerm as unknown as { historyStore: { entries: string[] } })
            .historyStore.entries;
        expect(internalHistory).toEqual(['bar', 'foo']);
    });

    it('throws non-Error value shows error message', async () => {
        const cmd = new (class extends Command {
            execute() {
                throw 'raw string';
            }
        })('throwraw');
        term.register(cmd);
        await term.start();
        await writeAndWait(stdin, chunks, 'throwraw', (s) => s.includes('Error: raw string'));
        expect(chunks.join('')).toContain('Error: raw string');
    });

    it('keeps the terminal usable after tab with an unclosed quote', async () => {
        const ttyStdin = Object.assign(new PassThrough(), {
            isTTY: true,
            setRawMode: () => {},
            isRaw: false
        }) as unknown as NodeJS.ReadStream;
        const ttyStdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const chunks: string[] = [];
        ttyStdout.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
        const ttyTerm = new Terminal({
            stdin: ttyStdin,
            stdout: ttyStdout,
            prompt: ''
        });
        await ttyTerm.start();

        ttyStdin.write('workspace add "/home/johannes/Pro\t');
        await new Promise((r) => setTimeout(r, 50));

        const rl = (ttyTerm as unknown as { rl: { line: string; paused: boolean } }).rl;
        expect(rl.paused).toBe(false);
        expect(rl.line).toBe('workspace add "/home/johannes/Pro');

        // Enter still submits the unclosed line through the normal error
        // path instead of wedging the terminal.
        ttyStdin.write('\n');
        await waitForOutput(chunks, (s) => s.includes('Error: Unclosed " quote'));

        // A clean command afterwards still executes.
        ttyStdin.write('help\n');
        await waitForOutput(chunks, (s) => s.includes('Commands:'));

        expect(chunks.join('')).not.toContain('Readline error');

        await ttyTerm.stop();
    });

    // ------------------------------------------------------------------
});
