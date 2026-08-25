import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import {
    existsSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Terminal } from '../../../src/terminal.js';
import { Command, type CommandContext, type TerminalOptions } from '../../../src/types.js';
import { CommandTree } from '../../../src/command-tree.js';
import { Completer } from '../../../src/completion/completer.js';
import { setupTerminal } from '../../helpers/setup-terminal.js';
import { waitForOutput } from '../../helpers/wait-for-output.js';

/** Minimal command used as an expansion target. */
class HelloCommand extends Command {
    constructor() {
        super('hello', 'Prints a greeting');
    }

    execute(ctx: CommandContext): void {
        ctx.stdout.write('HELLO-FROM-HELLO\n');
    }
}

describe('Terminal shortcuts integration', () => {
    let stdin: PassThrough;
    let chunks: string[];
    let term: Terminal;
    let stop: () => Promise<void>;
    let tmpDir: string;
    let shortcutsFile: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'repltree-shortcuts-'));
        shortcutsFile = join(tmpDir, 'shortcuts.json');
    });

    afterEach(() => {
        stop();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    function boot(options: Partial<TerminalOptions> = {}): void {
        ({ stdin, chunks, term, stop } = setupTerminal({ shortcutPath: shortcutsFile, ...options }));
    }

    function writeStore(data: Record<string, string>): void {
        writeFileSync(shortcutsFile, JSON.stringify(data));
    }

    function readStore(): Record<string, string> {
        return JSON.parse(readFileSync(shortcutsFile, 'utf8')) as Record<string, string>;
    }

    async function type(line: string): Promise<void> {
        stdin.write(line + '\n');
        await new Promise((r) => setTimeout(r, 50));
    }

    it('loads persisted shortcuts into the command tree on start', async () => {
        writeStore({ gs: 'git status' });
        boot();
        await term.start();

        const gs = term.getRootCommands().find((c) => c.name() === 'gs');
        expect(gs?.description()).toBe('Shortcut: git status');

        // Shortcuts participate in tab completion.
        const tree = (term as unknown as { tree: CommandTree }).tree;
        expect(new Completer(tree).complete('g').matches).toContain('gs');
    });

    it('expands a typed shortcut name and records the original input in history', async () => {
        writeStore({ sayhi: 'hello' });
        boot();
        term.register(new HelloCommand());
        await term.start();

        await type('sayhi');
        await waitForOutput(chunks, (s) => s.includes('HELLO-FROM-HELLO'));

        expect(term.historyEntries).toContain('sayhi');
        expect(term.historyEntries).not.toContain('hello');
    });

    it('expands before beforeParse hooks observe the line', async () => {
        writeStore({ sayhi: 'hello' });
        boot();
        term.register(new HelloCommand());

        const seen: string[] = [];
        term.hook()
            .beforeParse()
            .do((line: string) => {
                seen.push(line);
                return line;
            });

        await term.start();
        await type('sayhi');
        await waitForOutput(chunks, (s) => s.includes('HELLO-FROM-HELLO'));

        expect(seen).toContain('hello');
        expect(seen).not.toContain('sayhi');
    });

    it('does not expand when extra arguments are appended', async () => {
        writeStore({ sayhi: 'hello' });
        boot();
        term.register(new HelloCommand());
        await term.start();

        await type('sayhi extra');
        await waitForOutput(chunks, (s) => s.includes('Unexpected token "extra"'));

        expect(chunks.join('')).not.toContain('HELLO-FROM-HELLO');
    });

    it('warns about and skips loaded shortcuts that shadow commands', async () => {
        writeStore({ hello: 'clear' });
        boot();
        term.register(new HelloCommand());
        await term.start();

        await waitForOutput(chunks, (s) => s.includes('Warning: shortcut "hello"'));

        // The real command still wins at runtime.
        await type('hello');
        await waitForOutput(chunks, (s) => s.includes('HELLO-FROM-HELLO'));

        expect(term.shortcutStore.has('hello')).toBe(false);
    });

    it('persists runtime adds to the shortcut file', async () => {
        boot();
        await term.start();

        await type('shortcut add zzz echo hi');
        await waitForOutput(chunks, (s) => s.includes('Saved shortcut "zzz".'));

        expect(existsSync(shortcutsFile)).toBe(true);
        expect(readStore()).toEqual({ zzz: 'echo hi' });
    });

    it('persists removes to the shortcut file', async () => {
        writeStore({ gone: 'ls', kept: 'pwd' });
        boot();
        await term.start();

        await type('shortcut remove gone');
        await waitForOutput(chunks, (s) => s.includes('Removed shortcut "gone".'));

        expect(readStore()).toEqual({ kept: 'pwd' });
    });

    it('reloads cleanly across a stop/start cycle', async () => {
        writeStore({ gs: 'git status' });
        boot();
        await term.start();
        await stop();
        chunks.length = 0;

        await term.start();

        expect(chunks.join('')).not.toContain('Warning');
        expect(term.getRootCommands().filter((c) => c.name() === 'gs')).toHaveLength(1);
    });

    it('defaults the shortcut path to ./shortcuts.json in the working directory', () => {
        const bare = new Terminal();
        expect((bare as unknown as { shortcutPath: string }).shortcutPath).toBe(
            join(process.cwd(), 'shortcuts.json')
        );
    });
});
