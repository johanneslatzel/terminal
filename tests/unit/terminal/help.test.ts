import { describe, it, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { Terminal } from '../../../src/terminal.js';
import { command, container } from '../../../src/command-factory.js';
import { Command } from '../../../src/types.js';
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
        const list = container('list', {
            description: 'List commands',
            children: [
                command('verify', async () => {}, { description: 'Verify a listing' })
            ]
        });
        const game = container('game', { description: 'Game commands', children: [list] });
        term.register(game);
        await term.start();
        await writeAndWait(stdin, chunks, 'help game list', (s) =>
            s.includes('list - List commands') && s.includes('Subcommands:') && s.includes('verify')
        );
    });

    it('scoped help for deeply nested subcommand', async () => {
        const verify = command('verify', async () => {}, { description: 'Verify a listing' });
        const list = container('list', { description: 'List commands', children: [verify] });
        const game = container('game', { description: 'Game commands', children: [list] });
        term.register(game);
        await term.start();
        await writeAndWait(stdin, chunks, 'help game list verify', (s) =>
            s.includes('verify - Verify a listing')
        );
    });

    it('scoped help via --command with nested path', async () => {
        const list = container('list', {
            description: 'List commands',
            children: [
                command('verify', async () => {}, { description: 'Verify a listing' })
            ]
        });
        const game = container('game', { description: 'Game commands', children: [list] });
        term.register(game);
        await term.start();
        await writeAndWait(stdin, chunks, 'help --command "game list verify"', (s) =>
            s.includes('verify - Verify a listing')
        );
    });

    it('scoped help for unknown nested subcommand shows error', async () => {
        const game = container('game', { description: 'Game commands' });
        term.register(game);
        await term.start();
        await writeAndWait(stdin, chunks, 'help game bogus', (s) =>
            s.includes('Unknown command: game bogus')
        );
    });

    it('groups bare tokens after --flag value', async () => {
        const printCmd = command('print', async (ctx, args) => {
            const fields = await args.require<string[]>('fields');
            ctx.stdout.write(fields.join('|') + '\n');
        }, {
            description: 'print fields',
            arguments: [{ name: 'fields', schema: z.array(z.string()) }]
        });
        term.register(printCmd);
        await term.start();
        await writeAndWait(stdin, chunks, 'print --fields id, name, email', (s) =>
            s.includes('id|name|email')
        );
    });

    it('groups bare tokens after flag with no positional defs', async () => {
        const printCmd = command('print', async (ctx, args) => {
            const fields = await args.require<string>('fields');
            ctx.stdout.write(fields + '\n');
        }, {
            description: 'print fields',
            arguments: [{ name: 'fields', schema: z.string() }]
        });
        term.register(printCmd);
        await term.start();
        await writeAndWait(stdin, chunks, 'print --fields id name email', (s) =>
            s.includes('id name email')
        );
    });

    it('bare tokens after unsplit --flag value are grouped', async () => {
        const printCmd = command('print', async (ctx, args) => {
            const fields = await args.require<string>('fields');
            ctx.stdout.write(fields + '\n');
        }, {
            description: 'print fields',
            arguments: [{ name: 'fields', schema: z.string() }]
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
});
