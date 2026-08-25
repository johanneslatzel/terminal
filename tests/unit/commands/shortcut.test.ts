import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Terminal } from '../../../src/terminal.js';
import { CommandArguments } from '../../../src/command-arguments.js';
import { CommandContainer } from '../../../src/types.js';
import { setupTerminal } from '../../helpers/setup-terminal.js';
import { waitForOutput } from '../../helpers/wait-for-output.js';

describe('shortcut command', () => {
    let stdin: PassThrough;
    let chunks: string[];
    let term: Terminal;
    let stop: () => Promise<void>;
    let tmpDir: string;
    let shortcutsFile: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'repltree-shortcut-cmd-'));
        shortcutsFile = join(tmpDir, 'shortcuts.json');
        ({ stdin, chunks, term, stop } = setupTerminal({ shortcutPath: shortcutsFile }));
    });

    afterEach(() => {
        stop();
        rmSync(tmpDir, { recursive: true, force: true });
    });

    async function type(line: string): Promise<void> {
        stdin.write(line + '\n');
        await new Promise((r) => setTimeout(r, 50));
    }

    it('add stores a shortcut and registers it in the tree', async () => {
        await term.start();
        await type('shortcut add gs git status');

        await waitForOutput(chunks, (s) => s.includes('Saved shortcut "gs".'));
        expect(term.shortcutStore.get('gs')).toBe('git status');
        expect(term.getRootCommands().some((c) => c.name() === 'gs')).toBe(true);
    });

    it('add joins multiple bare tokens into one command string', async () => {
        await term.start();
        await type('shortcut add ll ls -la /tmp');

        await waitForOutput(chunks, (s) => s.includes('Saved shortcut "ll".'));
        expect(term.shortcutStore.get('ll')).toBe('ls -la /tmp');
    });

    it('add rejects names that shadow registered commands', async () => {
        await term.start();
        await type('shortcut add help echo hi');

        await waitForOutput(chunks, (s) => s.includes('is a reserved command name'));
        expect(term.shortcutStore.has('help')).toBe(false);
    });

    it('add updates an existing shortcut under its own name', async () => {
        await term.start();
        await type('shortcut add gs git status');
        await type("shortcut add gs 'git status --short'");

        await waitForOutput(chunks, (s) => s.split('Saved shortcut "gs".').length >= 3);
        expect(term.shortcutStore.get('gs')).toBe('git status --short');
    });

    it('save stores the last executed command', async () => {
        await term.start();
        stdin.write('clear\n');
        await new Promise((r) => setTimeout(r, 100));
        await type('shortcut save cls');

        await waitForOutput(chunks, (s) => s.includes('Saved shortcut "cls".'));
        expect(term.shortcutStore.get('cls')).toBe('clear');
    });

    it('save fails when history is empty', async () => {
        await term.start();
        await type('shortcut save cls');

        await waitForOutput(chunks, (s) => s.includes('No commands in history to save'));
    });

    it('remove deletes a shortcut from store and tree', async () => {
        await term.start();
        await type('shortcut add gs git status');
        await type('shortcut remove gs');

        await waitForOutput(chunks, (s) => s.includes('Removed shortcut "gs".'));
        expect(term.shortcutStore.has('gs')).toBe(false);
        expect(term.getRootCommands().some((c) => c.name() === 'gs')).toBe(false);
    });

    it('remove reports unknown shortcuts', async () => {
        await term.start();
        await type('shortcut remove nope');

        await waitForOutput(chunks, (s) => s.includes('Unknown shortcut: nope'));
    });

    it('list prints all shortcuts', async () => {
        await term.start();
        await type('shortcut add gs git status');
        await type('shortcut list');

        await waitForOutput(chunks, (s) => s.includes('gs → git status'));
    });

    it('list prints a hint when no shortcuts exist', async () => {
        await term.start();
        await type('shortcut list');

        await waitForOutput(chunks, (s) => s.includes('No shortcuts defined.'));
    });

    it('show prints the stored command string', async () => {
        await term.start();
        await type('shortcut add gs git status');
        await type('shortcut show gs');

        await waitForOutput(chunks, (s) => s.includes('git status'));
    });

    it('show reports unknown shortcuts', async () => {
        await term.start();
        await type('shortcut show nope');

        await waitForOutput(chunks, (s) => s.includes('Unknown shortcut: nope'));
    });
});

describe('shortcut command (direct unit tests)', () => {
    let tmpDir: string;
    let shortcutsFile: string;

    beforeEach(() => {
        tmpDir = mkdtempSync(join(tmpdir(), 'repltree-shortcut-unit-'));
        shortcutsFile = join(tmpDir, 'shortcuts.json');
    });

    afterEach(() => {
        rmSync(tmpDir, { recursive: true, force: true });
    });

    function makeTerm(): Terminal {
        const stdout = new PassThrough();
        return new Terminal({
            stdin: new PassThrough() as unknown as NodeJS.ReadStream,
            stdout: stdout as unknown as NodeJS.WriteStream,
            prompt: '',
            shortcutPath: shortcutsFile
        });
    }

    function subcommand(term: Terminal, name: string) {
        const shortcut = term.getRootCommands().find((c) => c.name() === 'shortcut');
        if (!(shortcut instanceof CommandContainer)) {
            throw new Error('shortcut command not registered');
        }
        const child = shortcut.commands().find((c) => c.name() === name);
        if (!child) throw new Error(`subcommand ${name} not found`);
        return child;
    }

    it('rejects shortcut names containing whitespace', async () => {
        const term = makeTerm();

        const add = subcommand(term, 'add');
        const args = new CommandArguments(
            { name: 'bad name', command: 'echo hi' },
            null,
            add.definitions()
        );
        await expect(
            add.execute({ terminal: term, stdout: { write: vi.fn() } } as never, args)
        ).rejects.toThrow('must not contain whitespace');
    });

    it('entry commands print their stored command string', async () => {
        const term = makeTerm();
        term.registerShortcutCommand('gs', 'git status');

        const write = vi.fn();
        const entry = term.getRootCommands().find((c) => c.name() === 'gs')!;
        await entry.execute({ stdout: { write } } as never, {} as never);

        expect(write).toHaveBeenCalledWith('Shortcut: git status\n');
    });
});
