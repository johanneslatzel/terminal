import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { Terminal } from '../../../src/terminal.js';
import { Command, CommandContainer } from '../../../src/types.js';
import { CommandTree } from '../../../src/command-tree.js';

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

});
