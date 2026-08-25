import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Terminal } from '../../src/terminal.js';
import { Command } from '../../src/types.js';
import { waitForOutput } from '../helpers/wait-for-output.js';
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

    it('saveHistory writes [] when history is empty', async () => {
        const filePath = join(tmpDir, 'history.json');
        const term = new Terminal({
            stdin: new PassThrough() as unknown as NodeJS.ReadStream,
            stdout: new PassThrough() as unknown as NodeJS.WriteStream,
            prompt: '',
            historyPath: filePath
        });

        await term.saveHistory();

        expect(existsSync(filePath)).toBe(true);
        expect(JSON.parse(readFileSync(filePath, 'utf-8'))).toEqual([]);
    });

    it('saveHistory heals a corrupt history file on the next save', async () => {
        const filePath = join(tmpDir, 'history.json');
        writeFileSync(filePath, 'not json', 'utf-8');
        const term = new Terminal({
            stdin: new PassThrough() as unknown as NodeJS.ReadStream,
            stdout: new PassThrough() as unknown as NodeJS.WriteStream,
            prompt: '',
            historyPath: filePath
        });

        await term.loadHistory(); // parse fails → empty store
        await term.saveHistory(); // overwrites the corrupt file

        expect(readFileSync(filePath, 'utf-8')).toBe('[]\n');
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
        const preloaded = (term as unknown as { historyStore: { entries: string[] } })
            .historyStore.entries;
        expect(preloaded).toEqual(['help', 'clear']);
    });
});
