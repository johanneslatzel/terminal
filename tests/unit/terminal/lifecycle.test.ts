import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { Terminal } from '../../../src/terminal.js';
import { Command, CommandContext } from '../../../src/types.js';
import { CommandArguments } from '../../../src/command-arguments.js';
import { z } from 'zod';
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
    // exit / stop lifecycle
    // ------------------------------------------------------------------

    it('stop pauses stdin', async () => {
        await term.start();
        await term.stop();
        expect(stdin.isPaused()).toBe(true);
    });

    it('exit prevents further command processing', async () => {
        const cmd = new (class extends Command {
            execute(ctx: import('../../../src/types.js').CommandContext) {
                ctx.stdout.write('ran\n');
            }
        })('mycmd');
        term.register(cmd);
        await term.start();
        stdin.write('exit\n');
        await new Promise((r) => setTimeout(r, 50));
        const snapshot = chunks.join('');
        stdin.write('mycmd\n');
        await new Promise((r) => setTimeout(r, 50));
        expect(chunks.join('')).toBe(snapshot);
    });

    it('error then exit stops terminal', async () => {
        await term.start();
        stdin.write('nonexistent\n');
        await waitForOutput(chunks, (s) => s.includes('Unknown command'));
        stdin.write('exit\n');
        await new Promise((r) => setTimeout(r, 50));
        const snapshot = chunks.join('');
        stdin.write('help\n');
        await new Promise((r) => setTimeout(r, 50));
        expect(chunks.join('')).toBe(snapshot);
    });

    it('exit works in non-TTY mode', async () => {
        await term.start();
        stdin.write('exit\n');
        await new Promise((r) => setTimeout(r, 50));
        const snapshot = chunks.join('');
        stdin.write('help\n');
        await new Promise((r) => setTimeout(r, 50));
        expect(chunks.join('')).toBe(snapshot);
    });

    it('start after stop restarts cleanly', async () => {
        await term.start();
        await term.stop();
        await term.start();
        await writeAndWait(stdin, chunks, 'help', (s) => s.includes('Commands:'));
        expect(chunks.join('')).toContain('Commands:');
    });

    // ------------------------------------------------------------------
    // Bad argument input through terminal loop
    // ------------------------------------------------------------------

    it('surfaces InvalidArgumentsError from command with bad args', async () => {
        const cmd = new (class extends Command {
            constructor() {
                super('validate', 'Test validation', [
                    { name: 'count', schema: z.coerce.number().positive(), required: true }
                ]);
            }
            async execute(_ctx: CommandContext, args: CommandArguments) {
                await args.require<number>('count');
            }
        })();
        term.register(cmd);
        await term.start();
        await writeAndWait(stdin, chunks, 'validate --count -5', (s) => s.includes('Error:'));
        expect(chunks.join('')).toMatch(/Argument "count"/);
    });

    it('surfaces schema validation error for string min length', async () => {
        const cmd = new (class extends Command {
            constructor() {
                super('greet', 'Test validation', [
                    { name: 'name', schema: z.string().min(2), required: true }
                ]);
            }
            async execute(_ctx: CommandContext, args: CommandArguments) {
                await args.require<string>('name');
            }
        })();
        term.register(cmd);
        await term.start();
        await writeAndWait(stdin, chunks, 'greet --name x', (s) => s.includes('Error:'));
        expect(chunks.join('')).toMatch(/Too small/);
    });

    it('prompts for missing required arg when readline is available', async () => {
        const cmd = new (class extends Command {
            constructor() {
                super('req', 'Required test', [
                    { name: 'input', schema: z.string(), required: true }
                ]);
            }
            async execute(_ctx: CommandContext, args: CommandArguments) {
                await args.require<string>('input');
            }
        })();
        term.register(cmd);
        await term.start();
        await writeAndWait(stdin, chunks, 'req', (s) => s.includes('argument [input]:'));
    });

    // ------------------------------------------------------------------
    // beforeExit hook
    // ------------------------------------------------------------------

    it('beforeExit hook fires when exit command runs', async () => {
        let called = false;
        term.hook()
            .beforeExit()
            .do(() => {
                called = true;
            });
        await term.start();
        stdin.write('exit\n');
        await new Promise((r) => setTimeout(r, 50));
        expect(called).toBe(true);
    });

    it('beforeExit hook fires on term.stop()', async () => {
        let called = false;
        term.hook()
            .beforeExit()
            .do(() => {
                called = true;
            });
        await term.start();
        await term.stop();
        expect(called).toBe(true);
    });

    it('beforeExit hook.dispose() unregisters the callback', async () => {
        let called = false;
        const h = term
            .hook()
            .beforeExit()
            .do(() => {
                called = true;
            });
        h.dispose();
        await term.start();
        stdin.write('exit\n');
        await new Promise((r) => setTimeout(r, 50));
        expect(called).toBe(false);
    });

    // ------------------------------------------------------------------
    // onStart hook
    // ------------------------------------------------------------------

    it('onStart hook fires when start() is called', async () => {
        let called = false;
        term.hook()
            .onStart()
            .do(() => {
                called = true;
            });
        await term.start();
        expect(called).toBe(true);
    });

    it('onStart hook fires before the first prompt', async () => {
        const output: string[] = [];
        term.hook()
            .onStart()
            .do(() => {
                output.push('banner');
            });
        await term.start();
        // The hook fires before rl.prompt() — the banner should appear
        expect(output).toContain('banner');
    });

    it('onStart async hook works', async () => {
        const order: string[] = [];
        term.hook()
            .onStart()
            .do(async () => {
                await new Promise((r) => setTimeout(r, 10));
                order.push('async-start');
            });
        await term.start();
        expect(order).toContain('async-start');
    });

    it('onStart hook.dispose() unregisters the callback', async () => {
        let called = false;
        const h = term
            .hook()
            .onStart()
            .do(() => {
                called = true;
            });
        h.dispose();
        await term.start();
        expect(called).toBe(false);
    });

    // ------------------------------------------------------------------
    // onStop hook
    // ------------------------------------------------------------------

    it('onStop hook fires when stop() is called', async () => {
        let called = false;
        term.hook()
            .onStop()
            .do(() => {
                called = true;
            });
        await term.start();
        await term.stop();
        expect(called).toBe(true);
    });

    it('onStop hook fires after cleanup (stdin is paused)', async () => {
        let stdinPaused = false;
        term.hook()
            .onStop()
            .do(() => {
                stdinPaused = stdin.isPaused();
            });
        await term.start();
        await term.stop();
        expect(stdinPaused).toBe(true);
    });

    it('onStop async hook works', async () => {
        const order: string[] = [];
        term.hook()
            .onStop()
            .do(async () => {
                await new Promise((r) => setTimeout(r, 10));
                order.push('async-stop');
            });
        await term.start();
        await term.stop();
        expect(order).toContain('async-stop');
    });

    it('onStop hook.dispose() unregisters the callback', async () => {
        let called = false;
        const h = term
            .hook()
            .onStop()
            .do(() => {
                called = true;
            });
        h.dispose();
        await term.start();
        await term.stop();
        expect(called).toBe(false);
    });

    // ------------------------------------------------------------------
});
