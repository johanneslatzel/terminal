import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { Terminal } from '../../../src/terminal.js';
import { Command, CommandContainer } from '../../../src/types.js';
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
    // Command execution
    // ------------------------------------------------------------------

    it('default CommandContainer execute prints container help', async () => {
        const container = new CommandContainer('ns', 'A namespace');
        container.add(
            new (class extends Command {
                async execute() {}
            })('sub', 'A subcommand')
        );
        const output: string[] = [];
        const ctx = {
            stdout: {
                write: (s: string) => {
                    output.push(s);
                }
            }
        } as unknown as import('../../../src/types.js').CommandContext;
        await container.execute(
            ctx,
            null as unknown as import('../../../src/command-arguments.js').CommandArguments
        );
        expect(output.join('')).toContain('ns - A namespace');
        expect(output.join('')).toContain('Subcommands:');
        expect(output.join('')).toContain('sub');
    });

    it('executes help command', async () => {
        await term.start();
        await writeAndWait(stdin, chunks, 'help', (s) => s.includes('Commands:'));
        expect(chunks.join('')).toContain('Commands:');
    });

    it('executes exit command and stops', async () => {
        await term.start();
        await writeAndWait(stdin, chunks, 'exit', (_s) => true);
        // exit stops the terminal — no further processing happens
    });

    it('executes clear command', async () => {
        await term.start();
        await writeAndWait(stdin, chunks, 'clear', (s) => s.includes('\x1Bc'));
        expect(chunks.join('')).toContain('\x1Bc');
    });

    it('executes a custom registered command and does not error', async () => {
        const executed: string[] = [];
        const cmd = new (class extends Command {
            execute() {
                executed.push('ok');
            }
        })('ping');
        term.register(cmd);
        await term.start();
        stdin.write('ping\n');
        await new Promise((r) => setTimeout(r, 50));
        expect(executed).toContain('ok');
    });

    it('executes a custom command that writes to ctx.stdout', async () => {
        const cmd = new (class extends Command {
            execute(ctx: import('../../../src/types.js').CommandContext) {
                ctx.stdout.write('pong\n');
            }
        })('ping');
        term.register(cmd);
        await term.start();
        await writeAndWait(stdin, chunks, 'ping', (s) => s.includes('pong'));
        expect(chunks.join('')).toContain('pong');
    });

    it('executes a custom command using ctx.state, ctx.logger, ctx.stdin', async () => {
        const cmd = new (class extends Command {
            execute(ctx: import('../../../src/types.js').CommandContext) {
                ctx.state.called = true;
                ctx.logger.info('log');
                expect(ctx.stdin).toBeDefined();
                ctx.stdout.write(String(ctx.state.called) + '\n');
            }
        })('multi');
        term.register(cmd);
        await term.start();
        await writeAndWait(stdin, chunks, 'multi', (s) => s.includes('true'));
    });

    // ------------------------------------------------------------------
    // Error handling
    // ------------------------------------------------------------------

    it('shows error for unknown command', async () => {
        await term.start();
        await writeAndWait(stdin, chunks, 'nonexistent', (s) => s.includes('Unknown command'));
        expect(chunks.join('')).toContain('nonexistent');
    });

    it('suggests commands for prefix-matched input', async () => {
        await term.start();
        await writeAndWait(stdin, chunks, 'h', (s) => s.includes('Did you mean'));
        expect(chunks.join('')).toContain('help');
    });

    it('empty input just re-prompts', async () => {
        await term.start();
        stdin.write('\n');
        await new Promise((r) => setTimeout(r, 50));
        // Should not produce any error output
        expect(chunks.join('')).not.toContain('Unknown command');
    });

    // ------------------------------------------------------------------
});
