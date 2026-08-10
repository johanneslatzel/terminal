import { describe, it, expect, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { z } from 'zod';
import { Terminal } from '../../../src/terminal.js';
import { Command } from '../../../src/types.js';
import type { CommandArguments, CommandContext } from '../../../src/index.js';
import { waitForOutput } from '../../helpers/wait-for-output.js';

function makeTtyStdin(): PassThrough & {
    isTTY: boolean;
    isRaw: boolean;
    setRawMode: (mode: boolean) => void;
} {
    const stdin = Object.assign(new PassThrough(), {
        isTTY: true,
        isRaw: false,
        setRawMode: (mode: boolean) => {
            (stdin as { isRaw: boolean }).isRaw = mode;
        }
    });
    return stdin;
}

describe('Terminal accept-prompt redraw', () => {
    let term: Terminal | undefined;

    afterEach(async () => {
        await term?.stop();
        term = undefined;
    });

    it('keeps the accept prompt visible when Backspace triggers a readline redraw', async () => {
        const stdin = makeTtyStdin();
        const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const chunks: string[] = [];
        stdout.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));

        term = new Terminal({
            stdin: stdin as unknown as NodeJS.ReadStream,
            stdout,
            prompt: '> '
        });
        term.register(
            new (class extends Command {
                async execute(_ctx: CommandContext, args: CommandArguments): Promise<void> {
                    await args.require('arg');
                }
            })('cmd', undefined, [{ name: 'arg', schema: z.string() }])
        );
        await term.start();

        stdin.write('cmd\n');
        await waitForOutput(chunks, (s) => s.includes('argument [arg]: '));

        // 'abc' then Backspace (0x7f = DEL). Readline redraws the whole
        // prompt + buffer on the delete — the prompt text must be rewritten.
        stdin.write('abc\x7f');
        await waitForOutput(
            chunks,
            (s) => (s.split('argument [arg]: ').length - 1) >= 2
        );

        const out = chunks.join('');
        expect(out).toContain('argument [arg]: ab');
        expect(out).not.toContain('> ab');

        stdin.write('\n');
    });

    it('does not leak aborted accept input into the next command prompt', async () => {
        const stdin = makeTtyStdin();
        const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
        const chunks: string[] = [];
        stdout.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));

        term = new Terminal({
            stdin: stdin as unknown as NodeJS.ReadStream,
            stdout,
            prompt: '> '
        });
        term.register(
            new (class extends Command {
                async execute(_ctx: CommandContext, args: CommandArguments): Promise<void> {
                    await args.require('arg');
                }
            })('cmd', undefined, [{ name: 'arg', schema: z.string() }])
        );
        await term.start();

        stdin.write('cmd\n');
        await waitForOutput(chunks, (s) => s.includes('argument [arg]: '));

        stdin.write('as');
        await waitForOutput(chunks, (s) => s.includes('argument [arg]: as'));

        stdin.write('\x03');
        await waitForOutput(chunks, (s) => s.includes('^C'));
        await new Promise((r) => setTimeout(r, 50));

        expect(chunks.join('')).not.toContain('> as');
    });
});
