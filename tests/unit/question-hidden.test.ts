import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { Terminal } from '../../src/terminal.js';
import { Command, CommandContext } from '../../src/types.js';
import { CTRL_BACKSPACE } from '../../src/keys.js';
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

    it('returns empty on Ctrl+C without ^C when silentSigint is true', async () => {
        const stdin = ttyPassThrough();
        const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const chunks: string[] = [];
        stdout.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));

        const term = new Terminal({ stdin, stdout, prompt: '', silentSigint: true });
        await term.start();

        const promise = term.questionHidden('p: ');
        stdin.write('\x03');
        const result = await promise;

        expect(result).toBe('');
        expect(chunks.join('')).not.toContain('^C');
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

    it('readline survives acceptSecret with dropInflightKeystrokes enabled', async () => {
        const stdin = ttyPassThrough();
        const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const chunks: string[] = [];
        stdout.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));

        const executed: string[] = [];
        const login = new (class extends Command {
            async execute(ctx: CommandContext) {
                const pw = await ctx.terminal.questionHidden('Password: ');
                executed.push('login:' + pw);
            }
        })('login');
        const greet = new (class extends Command {
            execute() { executed.push('greet'); }
        })('greet');

        const term = new Terminal({
            stdin, stdout, prompt: '',
            dropInflightKeystrokes: true
        });
        term.register(login);
        term.register(greet);
        await term.start();

        stdin.write('login\n');
        await new Promise((r) => setTimeout(r, 20));
        stdin.write('secret\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(executed).toContain('login:secret');

        chunks.length = 0;
        stdin.write('greet\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(executed).toContain('greet');
        await term.stop();
    });

    it('Ctrl+Backspace byte flows through filter in TTY mode', async () => {
        const ttyIn = Object.assign(new PassThrough(), {
            isTTY: true,
            setRawMode: () => {},
            isRaw: false
        }) as unknown as NodeJS.ReadStream;
        const ttyOut = new PassThrough() as unknown as NodeJS.WriteStream;
        let executed = false;
        const cmd = new (class extends Command {
            execute() { executed = true; }
        })('game');
        const term = new Terminal({ stdin: ttyIn, stdout: ttyOut, prompt: '' });
        term.register(cmd);
        await term.start();

        ttyIn.write(Buffer.from('game list'));
        ttyIn.write(Buffer.from([CTRL_BACKSPACE]));
        ttyIn.write(Buffer.from('\n'));
        await new Promise((r) => setTimeout(r, 100));

        expect(executed).toBe(true);
        await term.stop();
    });
});
