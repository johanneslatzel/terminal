import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { Terminal } from '../../../src/terminal.js';
import { Command } from '../../../src/types.js';
import { CommandNotFoundError } from '../../../src/errors.js';
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
});
