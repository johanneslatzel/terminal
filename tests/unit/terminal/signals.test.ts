import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { Terminal } from '../../../src/terminal.js';
import { Command, CommandContext } from '../../../src/types.js';
import { InterruptedError } from '../../../src/errors.js';
import { CommandArguments } from '../../../src/command-arguments.js';
import { z } from 'zod';
import { waitForOutput } from '../../helpers/wait-for-output.js';

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
    // SIGINT / close handling
    // ------------------------------------------------------------------

    it('SIGINT writes ^C and re-prompts', async () => {
        await term.start();
        const rl = (term as unknown as { rl: NodeJS.EventEmitter }).rl;
        rl.emit('SIGINT');
        expect(chunks.join('')).toContain('^C');
    });

    it('SIGINT does not write ^C when silentSigint is true', async () => {
        const ttyIn = Object.assign(new PassThrough(), {
            isTTY: true, setRawMode: () => {}, isRaw: false
        }) as unknown as NodeJS.ReadStream;
        const ttyOut = new PassThrough() as unknown as NodeJS.WriteStream;
        const ttyChunks: string[] = [];
        ttyOut.on('data', (chunk: Buffer) => ttyChunks.push(chunk.toString()));
        const t = new Terminal({ stdin: ttyIn, stdout: ttyOut, prompt: '', silentSigint: true });
        await t.start();
        const rl = (t as unknown as { rl: NodeJS.EventEmitter }).rl;
        rl.emit('SIGINT');
        expect(ttyChunks.join('')).not.toContain('^C');
        await t.stop();
    });

    it('SIGINT during argument prompt aborts command and allows new commands', async () => {
        const executed: string[] = [];
        const cmd = new (class extends Command {
            constructor() {
                super('req', 'Requires id', [
                    { name: 'id', schema: z.string(), required: true }
                ]);
            }
            async execute(_ctx: CommandContext, args: CommandArguments) {
                const id = await args.require<string>('id');
                executed.push(id);
            }
        })();
        term.register(cmd);

        const other = new (class extends Command {
            constructor() {
                super('other', 'Other command');
            }
            execute(ctx: CommandContext) {
                ctx.stdout.write('ok\n');
                executed.push('other');
            }
        })();
        term.register(other);

        await term.start();

        // Type command without required arg → triggers interactive prompt
        stdin.write('req\n');
        await waitForOutput(chunks, (s) => s.includes('argument [id]:'));

        // CTRL+C should abort the prompt
        const rl = (term as unknown as { rl: NodeJS.EventEmitter }).rl;
        rl.emit('SIGINT');
        await new Promise((r) => setTimeout(r, 50));

        // The command should not have executed with any value
        expect(executed).not.toContain('req');
        expect(executed).not.toContain('other');

        // Now type a completely different command — it should work normally
        stdin.write('other\n');
        await waitForOutput(chunks, (s) => s.includes('ok'));
        expect(executed).toContain('other');
    });

    it('command catches InterruptedError and continues gracefully', async () => {
        const cmd = new (class extends Command {
            constructor() {
                super('catchy', 'Catches interrupt', [
                    { name: 'id', schema: z.string(), required: true }
                ]);
            }
            async execute(ctx: CommandContext, args: CommandArguments) {
                try {
                    await args.require<string>('id');
                } catch (e) {
                    if (e instanceof InterruptedError) {
                        ctx.stdout.write('cancelled\n');
                        return;
                    }
                    throw e;
                }
                ctx.stdout.write('done\n');
            }
        })();
        term.register(cmd);
        await term.start();

        stdin.write('catchy\n');
        await waitForOutput(chunks, (s) => s.includes('argument [id]:'));

        const rl = (term as unknown as { rl: NodeJS.EventEmitter }).rl;
        rl.emit('SIGINT');
        await waitForOutput(chunks, (s) => s.includes('cancelled'));
        expect(chunks.join('')).toContain('cancelled');
        expect(chunks.join('')).not.toContain('done');
    });

    it('two required args, CTRL+C on first — second prompt never appears', async () => {
        const executed: string[] = [];
        const cmd = new (class extends Command {
            constructor() {
                super('twoarg', 'Two required args', [
                    { name: 'first', schema: z.string(), required: true },
                    { name: 'second', schema: z.string(), required: true }
                ]);
            }
            async execute(_ctx: CommandContext, args: CommandArguments) {
                const a = await args.require<string>('first');
                const b = await args.require<string>('second');
                executed.push(`${a}:${b}`);
            }
        })();
        term.register(cmd);
        await term.start();

        stdin.write('twoarg\n');
        await waitForOutput(chunks, (s) => s.includes('argument [first]:'));

        const rl = (term as unknown as { rl: NodeJS.EventEmitter }).rl;
        rl.emit('SIGINT');
        await new Promise((r) => setTimeout(r, 50));

        // Only the first prompt should have appeared
        expect(chunks.join('')).toContain('argument [first]:');
        expect(chunks.join('')).not.toContain('argument [second]:');
        // Command should not have completed
        expect(executed).toEqual([]);
    });

    it('double CTRL+C during argument prompt — shows ^C twice and re-prompts', async () => {
        const cmd = new (class extends Command {
            constructor() {
                super('dc', 'Double cancel', [
                    { name: 'x', schema: z.string(), required: true }
                ]);
            }
            async execute(_ctx: CommandContext, args: CommandArguments) {
                await args.require<string>('x');
            }
        })();
        term.register(cmd);
        await term.start();

        stdin.write('dc\n');
        await waitForOutput(chunks, (s) => s.includes('argument [x]:'));

        const rl = (term as unknown as { rl: NodeJS.EventEmitter }).rl;
        rl.emit('SIGINT');
        await new Promise((r) => setTimeout(r, 10));
        // Second CTRL+C at the command prompt — just re-prompts
        rl.emit('SIGINT');
        await new Promise((r) => setTimeout(r, 50));

        const output = chunks.join('');
        // Should see ^C at least twice
        const cCount = (output.match(/\^C/g) || []).length;
        expect(cCount).toBeGreaterThanOrEqual(2);
    });

    it('SIGINT during argument prompt suppresses ^C when silentSigint is true', async () => {
        const ttyIn = Object.assign(new PassThrough(), {
            isTTY: true, setRawMode: () => {}, isRaw: false
        }) as unknown as NodeJS.ReadStream;
        const ttyOut = new PassThrough() as unknown as NodeJS.WriteStream;
        const ttyChunks: string[] = [];
        ttyOut.on('data', (chunk: Buffer) => ttyChunks.push(chunk.toString()));
        const t = new Terminal({ stdin: ttyIn, stdout: ttyOut, prompt: '', silentSigint: true });

        const cmd = new (class extends Command {
            constructor() {
                super('req', 'Requires id', [
                    { name: 'id', schema: z.string(), required: true }
                ]);
            }
            async execute(_ctx: CommandContext, args: CommandArguments) {
                await args.require<string>('id');
            }
        })();
        t.register(cmd);
        await t.start();

        ttyIn.write('req\n');
        await waitForOutput(ttyChunks, (s) => s.includes('argument [id]:'));

        const rl = (t as unknown as { rl: NodeJS.EventEmitter }).rl;
        rl.emit('SIGINT');
        await new Promise((r) => setTimeout(r, 50));

        expect(ttyChunks.join('')).not.toContain('^C');
        await t.stop();
    });

    it('close event stops the terminal', async () => {
        await term.start();
        expect((term as unknown as { running: boolean }).running).toBe(true);
        (term as unknown as { rl: NodeJS.EventEmitter }).rl.emit('close');
        await new Promise((r) => setTimeout(r, 20));
        expect((term as unknown as { running: boolean }).running).toBe(false);
    });

    it('stdin end stops the terminal gracefully', async () => {
        await term.start();
        stdin.emit('end');
        await new Promise((r) => setTimeout(r, 50));
    });

    // ------------------------------------------------------------------
});
