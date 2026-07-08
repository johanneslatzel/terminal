import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { CommandTree } from '../../src/command-tree.js';
import { Terminal } from '../../src/terminal.js';
import { command, container } from '../../src/command-factory.js';
import { Command, CommandContainer, CommandContext } from '../../src/types.js';
import { CommandNotFoundError } from '../../src/errors.js';
import { CommandArguments } from '../../src/command-arguments.js';
import { z } from 'zod';

async function waitForOutput(
    chunks: string[],
    predicate: (s: string) => boolean,
    timeout = 2000
): Promise<void> {
    const start = Date.now();
    while (!predicate(chunks.join(''))) {
        if (Date.now() - start > timeout) {
            throw new Error(`Timeout waiting for output. Got: "${chunks.join('')}"`);
        }
        await new Promise((r) => setTimeout(r, 10));
    }
}

async function writeAndWait(
    stdin: PassThrough,
    chunks: string[],
    input: string,
    predicate: (s: string) => boolean
): Promise<void> {
    stdin.write(input + '\n');
    await waitForOutput(chunks, predicate);
}

// ---------------------------------------------------------------------------
// Terminal — construction & registration
// ---------------------------------------------------------------------------

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

    // ------------------------------------------------------------------
    // Construction
    // ------------------------------------------------------------------

    it('registers builtins on construction', () => {
        const names = term.getRootCommands().map((c) => c.name());
        expect(names).toContain('help');
        expect(names).toContain('exit');
        expect(names).toContain('clear');
    });

    it('uses default options when none provided', () => {
        const r = new Terminal();
        expect(r.getRootCommands().length).toBeGreaterThan(0);
    });

    // ------------------------------------------------------------------
    // register / getRootCommands
    // ------------------------------------------------------------------

    it('register adds a custom root command', () => {
        const cmd = new (class extends Command {
            async execute() {}
        })('testcmd');
        term.register(cmd);
        const names = term.getRootCommands().map((c) => c.name());
        expect(names).toContain('testcmd');
    });

    it('adds a subcommand via parent container', () => {
        const parent = new (class extends CommandContainer {
            async execute() {}
        })('parent');
        term.register(parent);
        const child = new (class extends Command {
            async execute() {}
        })('child');
        parent.add(child);
        const tree = (term as unknown as { tree: CommandTree }).tree;
        const result = tree.find(['parent', 'child']);
        expect(result).not.toBeNull();
        expect(result!.command.name()).toBe('child');
    });

    // ------------------------------------------------------------------
    // setPrompt
    // ------------------------------------------------------------------

    it('setPrompt before start updates options.prompt without error', () => {
        term.setPrompt('custom> ');
        expect(() => term.start()).not.toThrow();
    });

    it('setPrompt after start updates live rl prompt', async () => {
        await term.start();
        term.setPrompt('λ ');
        const rl = (term as unknown as { rl: { getPrompt: () => string } }).rl;
        expect(rl.getPrompt()).toBe('λ ');
    });

    it('setPrompt persists across stop/start cycle', async () => {
        await term.start();
        term.setPrompt('persist> ');
        await term.stop();
        await term.start();
        // After restart, the new readline should use the updated prompt
        const rl = (term as unknown as { rl: { getPrompt: () => string } }).rl;
        expect(rl.getPrompt()).toBe('persist> ');
    });

    // ------------------------------------------------------------------
    // start / stop lifecycle
    // ------------------------------------------------------------------

    it('start runs without error', async () => {
        await term.start();
        expect(chunks.join('')).toBe('');
    });

    it('stop after start does not throw', async () => {
        await term.start();
        await term.stop();
    });

    it('stop before start is idempotent', async () => {
        await term.stop();
        await term.stop();
    });

    it('calling start twice is a no-op', async () => {
        await term.start();
        await term.start();
        expect(chunks.join('')).toBe('');
    });

    it('saveHistory returns early when no historyPath set', async () => {
        await term.start();
        await expect(term.saveHistory()).resolves.toBeUndefined();
    });

    // ------------------------------------------------------------------
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
        } as unknown as import('../../src/types.js').CommandContext;
        await container.execute(
            ctx,
            null as unknown as import('../../src/command-arguments.js').CommandArguments
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
            execute(ctx: import('../../src/types.js').CommandContext) {
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
            execute(ctx: import('../../src/types.js').CommandContext) {
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
    // Hook builder
    // ------------------------------------------------------------------

    it('beforeParse hook via term.hook() can transform input', async () => {
        term.hook()
            .beforeParse()
            .do((input) => (input === 'h' ? 'help' : input));
        await term.start();
        await writeAndWait(stdin, chunks, 'h', (s) => s.includes('Commands:'));
    });

    it('afterParse hook can transform tokens', async () => {
        term.hook()
            .afterParse()
            .do((tokens) => tokens.map((t) => (t === 'h' ? 'help' : t)));
        await term.start();
        await writeAndWait(stdin, chunks, 'h', (s) => s.includes('Commands:'));
    });

    it('beforeExecute hook fires', async () => {
        const fired: string[] = [];
        term.hook()
            .beforeExecute()
            .do((command, _ctx, _args) => {
                fired.push(command.name());
            });
        await term.start();
        await writeAndWait(stdin, chunks, 'help', (s) => s.includes('Commands:'));
        expect(fired).toContain('help');
    });

    it('beforeExecute can cancel execution by returning false', async () => {
        const executed: string[] = [];
        term.hook()
            .beforeExecute()
            .do((command) => {
                if (command.name() === 'help') return false;
            });
        const cmd = new (class extends Command {
            execute() {
                executed.push('ran');
            }
        })('other');
        term.register(cmd);
        await term.start();
        stdin.write('help\n');
        await new Promise((r) => setTimeout(r, 50));
        expect(executed).not.toContain('ran');
    });

    it('beforeParse hook error surfaces on stdout and blocks execution', async () => {
        term.hook()
            .beforeParse()
            .do(() => {
                throw new Error('parse fail');
            });
        await term.start();
        await writeAndWait(stdin, chunks, 'help', (s) => s.includes('Error: parse fail'));
    });

    it('afterParse hook error surfaces on stdout and blocks execution', async () => {
        term.hook()
            .afterParse()
            .do(() => {
                throw new Error('tokens fail');
            });
        await term.start();
        await writeAndWait(stdin, chunks, 'help', (s) => s.includes('Error: tokens fail'));
    });

    it('beforeExecute hook error surfaces on stdout and blocks execution', async () => {
        const executed: string[] = [];
        term.hook()
            .beforeExecute()
            .do(() => {
                throw new Error('hook fail');
            });
        const cmd = new (class extends Command {
            execute() {
                executed.push('ran');
            }
        })('mycmd');
        term.register(cmd);
        await term.start();
        await writeAndWait(stdin, chunks, 'mycmd', (s) => s.includes('Error: hook fail'));
        expect(executed).not.toContain('ran');
    });

    it('afterExecute hook error surfaces after command output', async () => {
        term.hook()
            .afterExecute()
            .do(() => {
                throw new Error('after fail');
            });
        await term.start();
        await writeAndWait(stdin, chunks, 'help', (s) => s.includes('Commands:'));
        expect(chunks.join('')).toContain('Error: after fail');
    });

    it('onError hook error does not prevent default error output', async () => {
        term.hook()
            .onError()
            .do(() => {
                throw new Error('onError fail');
            });
        await term.start();
        await writeAndWait(stdin, chunks, 'nonexistent', (s) => s.includes('Unknown command'));
        expect(chunks.join('')).toContain('Error in onError hook: onError fail');
    });

    it('readline error event is handled', async () => {
        await term.start();
        (term as unknown as { rl: { emit: (ev: string, err: Error) => void } }).rl.emit(
            'error',
            new Error('oops')
        );
        expect(chunks.join('')).toContain('Readline error: oops');
    });

    it('afterExecute hook fires after command', async () => {
        const results: unknown[] = [];
        term.hook()
            .afterExecute()
            .do((result) => {
                results.push(result);
            });

        const cmd = new (class extends Command {
            async execute() {
                return undefined;
            }
        })('ret');
        term.register(cmd);
        await term.start();
        await writeAndWait(stdin, chunks, 'ret', () => true);
    });

    it('onError hook fires on unknown command', async () => {
        const errors: Error[] = [];
        term.hook()
            .onError()
            .do((error) => {
                errors.push(error);
            });
        await term.start();
        await writeAndWait(stdin, chunks, 'xyz', (s) => s.includes('Unknown'));
        expect(errors.length).toBeGreaterThan(0);
        expect(errors[0]).toBeInstanceOf(CommandNotFoundError);
    });

    it('onError can suppress default error output by returning true', async () => {
        term.hook()
            .onError()
            .do((_error) => true);
        await term.start();
        stdin.write('nonexistent\n');
        await new Promise((r) => setTimeout(r, 50));
        expect(chunks.join('')).not.toContain('Unknown command');
    });

    it('multiple hooks on the same event all fire', async () => {
        const order: string[] = [];
        term.hook()
            .beforeExecute()
            .do(() => {
                order.push('a');
            });
        term.hook()
            .beforeExecute()
            .do(() => {
                order.push('b');
            });
        await term.start();
        await writeAndWait(stdin, chunks, 'help', (s) => s.includes('Commands:'));
        expect(order).toEqual(['a', 'b']);
    });

    it('hook.dispose() unregisters the callback', async () => {
        const fired: string[] = [];
        const h = term
            .hook()
            .beforeExecute()
            .do((command) => {
                fired.push(command.name());
            });
        h.dispose();

        await term.start();
        await writeAndWait(stdin, chunks, 'help', (s) => s.includes('Commands:'));
        expect(fired).toEqual([]);
    });

    it('hook.dispose() is idempotent', () => {
        const h = term
            .hook()
            .beforeParse()
            .do((input) => input);
        h.dispose();
        h.dispose(); // should not throw
    });

    it('hook.dispose() works for afterParse', async () => {
        const fired: string[] = [];
        const h = term
            .hook()
            .afterParse()
            .do((tokens) => {
                fired.push('ran');
                return tokens;
            });
        h.dispose();

        await term.start();
        await writeAndWait(stdin, chunks, 'help', (s) => s.includes('Commands:'));
        expect(fired).toEqual([]);
    });

    it('hook.dispose() works for afterExecute', async () => {
        const fired: string[] = [];
        const cmd = new (class extends Command {
            async execute() {}
        })('noop');
        term.register(cmd);
        const h = term
            .hook()
            .afterExecute()
            .do(() => {
                fired.push('ran');
            });
        h.dispose();

        await term.start();
        stdin.write('noop\n');
        await new Promise((r) => setTimeout(r, 50));
        expect(fired).toEqual([]);
    });

    it('hook.dispose() works for onError', async () => {
        const fired: string[] = [];
        const h = term
            .hook()
            .onError()
            .do(() => {
                fired.push('ran');
                return true;
            });
        h.dispose();

        await term.start();
        stdin.write('nonexistent\n');
        await new Promise((r) => setTimeout(r, 50));
        expect(fired).toEqual([]);
    });

    // ------------------------------------------------------------------
    // SIGINT / close handling
    // ------------------------------------------------------------------

    it('SIGINT writes ^C and re-prompts', async () => {
        await term.start();
        const rl = (term as unknown as { rl: NodeJS.EventEmitter }).rl;
        rl.emit('SIGINT');
        expect(chunks.join('')).toContain('^C');
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
    // Scoped help via Terminal (help.ts branch)
    // ------------------------------------------------------------------

    it('scoped help via help command', async () => {
        await term.start();
        await writeAndWait(stdin, chunks, 'help --command help', (s) =>
            s.includes('help - Show help')
        );
    });

    it('scoped help via positional argument', async () => {
        await term.start();
        await writeAndWait(stdin, chunks, 'help exit', (s) =>
            s.includes('exit - Exit the terminal')
        );
    });

    it('help with unknown command shows error', async () => {
        await term.start();
        await writeAndWait(stdin, chunks, 'help --command nonexistent', (s) =>
            s.includes('Unknown command: nonexistent')
        );
    });

    it('help with unknown command shows error via positional arg', async () => {
        await term.start();
        await writeAndWait(stdin, chunks, 'help nonexistent', (s) =>
            s.includes('Unknown command: nonexistent')
        );
    });

    it('scoped help for nested subcommand via positional args', async () => {
        const list = container('list', 'List commands', [
            command('verify', 'Verify a listing', [], async () => {})
        ]);
        const game = container('game', 'Game commands', [list]);
        term.register(game);
        await term.start();
        await writeAndWait(stdin, chunks, 'help game list', (s) =>
            s.includes('list - List commands') && s.includes('Subcommands:') && s.includes('verify')
        );
    });

    it('scoped help for deeply nested subcommand', async () => {
        const verify = command('verify', 'Verify a listing', [], async () => {});
        const list = container('list', 'List commands', [verify]);
        const game = container('game', 'Game commands', [list]);
        term.register(game);
        await term.start();
        await writeAndWait(stdin, chunks, 'help game list verify', (s) =>
            s.includes('verify - Verify a listing')
        );
    });

    it('scoped help via --command with nested path', async () => {
        const list = container('list', 'List commands', [
            command('verify', 'Verify a listing', [], async () => {})
        ]);
        const game = container('game', 'Game commands', [list]);
        term.register(game);
        await term.start();
        await writeAndWait(stdin, chunks, 'help --command "game list verify"', (s) =>
            s.includes('verify - Verify a listing')
        );
    });

    it('scoped help for unknown nested subcommand shows error', async () => {
        const game = container('game', 'Game commands');
        term.register(game);
        await term.start();
        await writeAndWait(stdin, chunks, 'help game bogus', (s) =>
            s.includes('Unknown command: game bogus')
        );
    });

    it('groups bare tokens after --flag value', async () => {
        const printCmd = command('print', 'print fields', [
            { name: 'fields', schema: z.array(z.string()) }
        ], async (ctx, args) => {
            const fields = await args.require<string[]>('fields');
            ctx.stdout.write(fields.join('|') + '\n');
        });
        term.register(printCmd);
        await term.start();
        await writeAndWait(stdin, chunks, 'print --fields id, name, email', (s) =>
            s.includes('id|name|email')
        );
    });

    it('groups bare tokens after flag with no positional defs', async () => {
        const printCmd = command('print', 'print fields', [
            { name: 'fields', schema: z.string() }
        ], async (ctx, args) => {
            const fields = await args.require<string>('fields');
            ctx.stdout.write(fields + '\n');
        });
        term.register(printCmd);
        await term.start();
        await writeAndWait(stdin, chunks, 'print --fields id name email', (s) =>
            s.includes('id name email')
        );
    });

    it('bare tokens after unsplit --flag value are grouped', async () => {
        const printCmd = command('print', 'print fields', [
            { name: 'fields', schema: z.string() }
        ], async (ctx, args) => {
            const fields = await args.require<string>('fields');
            ctx.stdout.write(fields + '\n');
        });
        term.register(printCmd);
        await term.start();
        await writeAndWait(stdin, chunks, 'print --fields "id, name" additional', (s) =>
            s.includes('id, name additional')
        );
    });

    // ------------------------------------------------------------------
    // plain Error handling
    // ------------------------------------------------------------------

    it('handles plain Error thrown by command', async () => {
        const cmd = new (class extends Command {
            execute() {
                throw new Error('oh no');
            }
        })('crash');
        term.register(cmd);
        await term.start();
        await writeAndWait(stdin, chunks, 'crash', (s) => s.includes('Error: oh no'));
    });

    // ------------------------------------------------------------------
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
        const internalHistory = (ttyTerm as unknown as { _history: string[] })._history;
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
        const internalHistory = (ttyTerm as unknown as { _history: string[] })._history;
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

    // ------------------------------------------------------------------
    // exit / stop lifecycle
    // ------------------------------------------------------------------

    it('stop pauses stdin', async () => {
        await term.start();
        await term.stop();
        expect(stdin.isPaused()).toBe(true);
    });

    it('exit prevents further command processing', async () => {
        const cmd = new (class extends Command {
            execute(ctx: import('../../src/types.js').CommandContext) {
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
});

// ---------------------------------------------------------------------------
// History persistence
// ---------------------------------------------------------------------------

describe('history persistence', () => {
    let tmpDir: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'repltree-history-'));
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    it('loadHistory returns [] when no historyPath set', async () => {
        const term = new Terminal({
            stdin: new PassThrough() as unknown as NodeJS.ReadStream,
            stdout: new PassThrough() as unknown as NodeJS.WriteStream,
            prompt: ''
        });
        expect(await term.loadHistory()).toEqual([]);
    });

    it('loadHistory returns [] when file does not exist', async () => {
        const term = new Terminal({
            stdin: new PassThrough() as unknown as NodeJS.ReadStream,
            stdout: new PassThrough() as unknown as NodeJS.WriteStream,
            prompt: '',
            historyPath: join(tmpDir, 'nope.json')
        });
        expect(await term.loadHistory()).toEqual([]);
    });

    it('loadHistory parses a valid JSON array', async () => {
        const filePath = join(tmpDir, 'history.json');
        writeFileSync(filePath, JSON.stringify(['help', 'clear', 'exit']), 'utf-8');
        const term = new Terminal({
            stdin: new PassThrough() as unknown as NodeJS.ReadStream,
            stdout: new PassThrough() as unknown as NodeJS.WriteStream,
            prompt: '',
            historyPath: filePath
        });
        expect(await term.loadHistory()).toEqual(['help', 'clear', 'exit']);
    });

    it('loadHistory deduplicates keeping the last occurrence', async () => {
        const filePath = join(tmpDir, 'history.json');
        writeFileSync(
            filePath,
            JSON.stringify(['help', 'clear', 'help', 'exit', 'clear']),
            'utf-8'
        );
        const term = new Terminal({
            stdin: new PassThrough() as unknown as NodeJS.ReadStream,
            stdout: new PassThrough() as unknown as NodeJS.WriteStream,
            prompt: '',
            historyPath: filePath
        });
        // Last occurrences: help (idx 2), exit (idx 3), clear (idx 4)
        expect(await term.loadHistory()).toEqual(['help', 'exit', 'clear']);
    });

    it('loadHistory returns [] for invalid JSON', async () => {
        const filePath = join(tmpDir, 'history.json');
        writeFileSync(filePath, 'not json', 'utf-8');
        const term = new Terminal({
            stdin: new PassThrough() as unknown as NodeJS.ReadStream,
            stdout: new PassThrough() as unknown as NodeJS.WriteStream,
            prompt: '',
            historyPath: filePath
        });
        expect(await term.loadHistory()).toEqual([]);
    });

    it('loadHistory returns [] for non-array JSON', async () => {
        const filePath = join(tmpDir, 'history.json');
        writeFileSync(filePath, '{"a":1}', 'utf-8');
        const term = new Terminal({
            stdin: new PassThrough() as unknown as NodeJS.ReadStream,
            stdout: new PassThrough() as unknown as NodeJS.WriteStream,
            prompt: '',
            historyPath: filePath
        });
        expect(await term.loadHistory()).toEqual([]);
    });

    it('loadHistory trims to historySize', async () => {
        const filePath = join(tmpDir, 'history.json');
        const entries = ['a', 'b', 'c', 'd', 'e'];
        writeFileSync(filePath, JSON.stringify(entries), 'utf-8');
        const term = new Terminal({
            stdin: new PassThrough() as unknown as NodeJS.ReadStream,
            stdout: new PassThrough() as unknown as NodeJS.WriteStream,
            prompt: '',
            historyPath: filePath,
            historySize: 3
        });
        expect(await term.loadHistory()).toEqual(['c', 'd', 'e']);
    });

    function ttyStdin(): NodeJS.ReadStream {
        return Object.assign(new PassThrough(), {
            isTTY: true,
            setRawMode: () => {},
            isRaw: false
        }) as unknown as NodeJS.ReadStream;
    }

    it('saveHistory writes rl.history as JSON array', async () => {
        const filePath = join(tmpDir, 'history.json');
        const stdin = ttyStdin();
        const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const chunks: string[] = [];
        stdout.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));

        const term = new Terminal({
            stdin,
            stdout,
            prompt: '',
            historyPath: filePath
        });

        const executed: string[] = [];
        term.register(
            new (class extends Command {
                execute() {
                    executed.push('ran');
                }
            })('ping')
        );

        await term.start();
        stdin.write('help\n');
        await waitForOutput(chunks, (s) => s.includes('Commands:'));
        stdin.write('ping\n');
        await new Promise((r) => setTimeout(r, 50));
        await term.stop();

        await term.saveHistory();

        const saved = JSON.parse(readFileSync(filePath, 'utf-8'));
        expect(Array.isArray(saved)).toBe(true);
        expect(saved).toContain('help');
        expect(saved).toContain('ping');
    });

    it('saveHistory trims to historySize', async () => {
        const filePath = join(tmpDir, 'history.json');
        const stdin = ttyStdin();
        const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
        stdout.on('data', () => {});

        const term = new Terminal({
            stdin,
            stdout,
            prompt: '',
            historyPath: filePath,
            historySize: 1
        });

        await term.start();
        stdin.write('help\n');
        await new Promise((r) => setTimeout(r, 50));
        stdin.write('clear\n');
        await new Promise((r) => setTimeout(r, 50));
        await term.stop();

        await term.saveHistory();

        const saved = JSON.parse(readFileSync(filePath, 'utf-8'));
        expect(saved.length).toBeLessThanOrEqual(1);
    });

    it('round-trip: commands survive save → load cycle', async () => {
        const filePath = join(tmpDir, 'history.json');
        const stdin1 = ttyStdin();
        const stdout1 = new PassThrough() as unknown as NodeJS.WriteStream;
        const chunks1: string[] = [];
        stdout1.on('data', (chunk: Buffer) => chunks1.push(chunk.toString()));

        // First session
        const term1 = new Terminal({
            stdin: stdin1,
            stdout: stdout1,
            prompt: '',
            historyPath: filePath
        });

        await term1.start();
        stdin1.write('help\n');
        await waitForOutput(chunks1, (s) => s.includes('Commands:'));
        stdin1.write('clear\n');
        await new Promise((r) => setTimeout(r, 50));
        await term1.stop();
        await term1.saveHistory();

        // Second session
        const stdin2 = ttyStdin();
        const stdout2 = new PassThrough() as unknown as NodeJS.WriteStream;
        stdout2.on('data', () => {});

        const term2 = new Terminal({
            stdin: stdin2,
            stdout: stdout2,
            prompt: '',
            historyPath: filePath
        });

        const loaded = await term2.loadHistory();
        expect(loaded).toContain('help');
        expect(loaded).toContain('clear');

        // Start with preloaded history
        await term2.start();
        const rl = (term2 as unknown as { rl: { history: string[] } }).rl;
        // rl.history should include the loaded entries
        expect(rl.history.length).toBeGreaterThanOrEqual(2);
        await term2.stop();
    });

    it('saveHistory creates parent directories', async () => {
        const nestedPath = join(tmpDir, 'a', 'b', 'c', 'history.json');
        const stdin = ttyStdin();
        const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
        stdout.on('data', () => {});

        const term = new Terminal({
            stdin,
            stdout,
            prompt: '',
            historyPath: nestedPath
        });

        await term.start();
        stdin.write('help\n');
        await new Promise((r) => setTimeout(r, 50));
        await term.stop();

        await term.saveHistory();
        expect(existsSync(nestedPath)).toBe(true);
        const saved = JSON.parse(readFileSync(nestedPath, 'utf-8'));
        expect(saved).toContain('help');
    });

    it('saveHistory is a no-op when terminal not started', async () => {
        const filePath = join(tmpDir, 'history.json');
        const term = new Terminal({
            stdin: new PassThrough() as unknown as NodeJS.ReadStream,
            stdout: new PassThrough() as unknown as NodeJS.WriteStream,
            prompt: '',
            historyPath: filePath
        });
        // Should not throw
        await term.saveHistory();
        expect(existsSync(filePath)).toBe(false);
    });

    it('loadHistory stores internally for createReadline', async () => {
        const filePath = join(tmpDir, 'history.json');
        writeFileSync(filePath, JSON.stringify(['help', 'clear']), 'utf-8');
        const term = new Terminal({
            stdin: new PassThrough() as unknown as NodeJS.ReadStream,
            stdout: new PassThrough() as unknown as NodeJS.WriteStream,
            prompt: '',
            historyPath: filePath
        });
        await term.loadHistory();
        const preloaded = (term as unknown as { _history: string[] })._history;
        expect(preloaded).toEqual(['help', 'clear']);
    });
});

// ---------------------------------------------------------------------------
// questionHidden
// ---------------------------------------------------------------------------

function ttyPassThrough(): NodeJS.ReadStream {
    return Object.assign(new PassThrough(), {
        isTTY: true,
        isRaw: false,
        setRawMode: () => {}
    }) as unknown as NodeJS.ReadStream;
}

describe('Terminal.questionHidden', () => {
    it('returns typed string and echoes mask', async () => {
        const stdin = ttyPassThrough();
        const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const chunks: string[] = [];
        stdout.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));

        const term = new Terminal({ stdin, stdout, prompt: '' });
        await term.start();

        const promise = term.questionHidden('password: ');
        stdin.write('secret\n');
        const result = await promise;

        expect(result).toBe('secret');
        const output = chunks.join('');
        expect(output).toContain('password: ');
        expect(output).toContain('******');
        await term.stop();
    });

    it('returns empty on Ctrl+C', async () => {
        const stdin = ttyPassThrough();
        const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const chunks: string[] = [];
        stdout.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));

        const term = new Terminal({ stdin, stdout, prompt: '' });
        await term.start();

        const promise = term.questionHidden('p: ');
        stdin.write('\x03');
        const result = await promise;

        expect(result).toBe('');
        expect(chunks.join('')).toContain('^C');
        await term.stop();
    });

    it('handles backspace', async () => {
        const stdin = ttyPassThrough();
        const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
        stdout.on('data', () => {});

        const term = new Terminal({ stdin, stdout, prompt: '' });
        await term.start();

        const promise = term.questionHidden('p: ');
        stdin.write('ab\x7f\n');
        const result = await promise;

        expect(result).toBe('a');
        await term.stop();
    });

    it('mask: "" produces no echo', async () => {
        const stdin = ttyPassThrough();
        const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const chunks: string[] = [];
        stdout.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));

        const term = new Terminal({ stdin, stdout, prompt: '' });
        await term.start();

        const promise = term.questionHidden('p: ', '');
        stdin.write('secret\n');
        const result = await promise;

        expect(result).toBe('secret');
        const output = chunks.join('');
        expect(output).toContain('p:');
        expect(output).not.toContain('*');
        await term.stop();
    });

    it('readline is restored after hidden input', async () => {
        const stdin = ttyPassThrough();
        const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const chunks: string[] = [];
        stdout.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));

        const executed: string[] = [];
        const cmd = new (class extends Command {
            execute() { executed.push('ran'); }
        })('mycmd');

        const term = new Terminal({ stdin, stdout, prompt: '' });
        term.register(cmd);
        await term.start();

        const promise = term.questionHidden('p: ');
        stdin.write('hello\n');
        await promise;

        stdin.write('mycmd\n');
        await new Promise((r) => setTimeout(r, 50));

        expect(executed).toContain('ran');
        await term.stop();
    });

    it('throws when terminal not started', async () => {
        const stdin = ttyPassThrough();
        const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const term = new Terminal({ stdin, stdout, prompt: '' });

        await expect(term.questionHidden('p: ')).rejects.toThrow('Terminal not started');
        await term.stop();
    });

    it('falls back to visible prompt when stdin is not a TTY', async () => {
        const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
        const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const chunks: string[] = [];
        stdout.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));

        const term = new Terminal({ stdin, stdout, prompt: '' });
        await term.start();

        const promise = term.questionHidden('token: ');
        stdin.write('my-token\n');
        const result = await promise;

        expect(result).toBe('my-token');
        expect(chunks.join('')).toContain('token: ');
        await term.stop();
    });
});
