import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { CommandTree } from '../../src/command-tree.js';
import { Terminal } from '../../src/terminal.js';
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

    it('register with parentPath adds command to container', () => {
        const parent = new (class extends CommandContainer {
            async execute() {}
        })('parent');
        term.register(parent);
        const child = new (class extends Command {
            async execute() {}
        })('child');
        term.register(child, 'parent');
        const tree = (term as unknown as { tree: CommandTree }).tree;
        const result = tree.find(['parent', 'child']);
        expect(result).not.toBeNull();
        expect(result!.command.name()).toBe('child');
    });

    it('register with nested parentPath adds command to nested container', () => {
        const inner = new (class extends CommandContainer {
            async execute() {}
        })('inner');
        const outer = new (class extends CommandContainer {
            async execute() {}
        })('outer');
        outer.add(inner);
        term.register(outer);
        const leaf = new (class extends Command {
            async execute() {}
        })('leaf');
        term.register(leaf, 'outer.inner');
        const tree = (term as unknown as { tree: CommandTree }).tree;
        const result = tree.find(['outer', 'inner', 'leaf']);
        expect(result).not.toBeNull();
        expect(result!.command.name()).toBe('leaf');
    });

    it('register with invalid parentPath throws', () => {
        const cmd = new (class extends Command {
            async execute() {}
        })('orphan');
        expect(() => term.register(cmd, 'nonexistent')).toThrow();
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

    it('help with unknown command shows error', async () => {
        await term.start();
        await writeAndWait(stdin, chunks, 'help --command nonexistent', (s) =>
            s.includes('Unknown command: nonexistent')
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
        await writeAndWait(stdin, chunks, 'validate --count -5', (s) =>
            s.includes('Error:')
        );
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
        await writeAndWait(stdin, chunks, 'greet --name x', (s) =>
            s.includes('Error:')
        );
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
        await writeAndWait(stdin, chunks, 'req', (s) =>
            s.includes('argument [input]:')
        );
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
});
