import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { Terminal } from '../../../src/terminal.js';
import { Command } from '../../../src/types.js';

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
    // Concurrency / serialization
    // ------------------------------------------------------------------

    it('serializes line events during async command execution', async () => {
        term.setPrompt('$ ');
        let resume = () => {};
        const gate = new Promise<void>((r) => {
            resume = r;
        });

        const slowCmd = new (class extends Command {
            async execute(ctx: import('../../../src/types.js').CommandContext) {
                ctx.stdout.write('first\n');
                await gate;
                ctx.stdout.write('last\n');
            }
        })('slow');
        term.register(slowCmd);
        await term.start();

        // consume initial prompt from start()
        chunks.length = 0;

        stdin.write('slow\n');
        // give handleLine time to acquire the mutex and reach the await gate
        await new Promise((r) => setTimeout(r, 50));
        stdin.write('\n'); // empty line — queued, not processed concurrently
        await new Promise((r) => setTimeout(r, 20));
        resume();
        await new Promise((r) => setTimeout(r, 100));

        const output = chunks.join('');
        const firstIdx = output.indexOf('first');
        const lastIdx = output.indexOf('last');
        const promptIdx = output.indexOf('$ ');

        expect(firstIdx).not.toBe(-1);
        expect(lastIdx).not.toBe(-1);
        expect(promptIdx).not.toBe(-1);
        // all command output must appear before any prompt
        expect(firstIdx).toBeLessThan(lastIdx);
        expect(lastIdx).toBeLessThan(promptIdx);
    });

    it('drops inflight keystrokes when option is set', async () => {
        let resume = () => {};
        const gate = new Promise<void>((r) => {
            resume = r;
        });
        const executed: string[] = [];
        const ttyIn = Object.assign(new PassThrough(), {
            isTTY: true,
            setRawMode: () => {},
            isRaw: false
        }) as unknown as NodeJS.ReadStream;
        const ttyOut = new PassThrough() as unknown as NodeJS.WriteStream;
        const chunks: string[] = [];
        ttyOut.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));

        const term = new Terminal({
            stdin: ttyIn,
            stdout: ttyOut,
            prompt: '',
            dropInflightKeystrokes: true
        });
        term.register(
            new (class extends Command {
                async execute() {
                    await gate;
                    executed.push('slow');
                }
            })('slow')
        );
        term.register(
            new (class extends Command {
                execute() {
                    executed.push('other');
                }
            })('other')
        );

        await term.start();
        chunks.length = 0;

        ttyIn.write('slow\n');
        await new Promise((r) => setTimeout(r, 20));
        ttyIn.write('other\n');
        await new Promise((r) => setTimeout(r, 20));
        // emit a line directly on rl while InputManager is in drop mode to exercise the guard
        const rl = (term as unknown as {
            rl: { emit: (ev: string, line: string) => void };
        }).rl;
        rl.emit('line', 'direct-line');
        resume();
        await new Promise((r) => setTimeout(r, 100));

        expect(executed).toEqual(['slow']);
    });

    it('drops inflight keystrokes in non-TTY mode', async () => {
        let resume = () => {};
        const gate = new Promise<void>((r) => {
            resume = r;
        });
        const executed: string[] = [];
        const stdIn = new PassThrough() as unknown as NodeJS.ReadStream;
        const stdOut = new PassThrough() as unknown as NodeJS.WriteStream;

        const term = new Terminal({
            stdin: stdIn,
            stdout: stdOut,
            prompt: '',
            dropInflightKeystrokes: true
        });
        term.register(
            new (class extends Command {
                async execute() {
                    await gate;
                    executed.push('slow');
                }
            })('slow')
        );
        term.register(
            new (class extends Command {
                execute() {
                    executed.push('other');
                }
            })('other')
        );

        await term.start();

        stdIn.write('slow\n');
        await new Promise((r) => setTimeout(r, 20));
        stdIn.write('other\n');
        await new Promise((r) => setTimeout(r, 20));
        resume();
        await new Promise((r) => setTimeout(r, 100));

        expect(executed).toEqual(['slow']);
    });
});
