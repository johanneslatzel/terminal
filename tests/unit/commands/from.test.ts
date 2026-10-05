import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Terminal } from '../../../src/terminal.js';
import { command } from '../../../src/command-factory.js';
import { PipelineInputAcceptance } from '../../../src/types.js';
import { setupTerminal } from '../../helpers/setup-terminal.js';
import { waitForOutput } from '../../helpers/wait-for-output.js';

describe('from command', () => {
    let dir: string;
    let stdin: PassThrough;
    let chunks: string[];
    let term: Terminal;
    let stop: () => Promise<void>;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'repltree-from-'));
        ({ stdin, chunks, term, stop } = setupTerminal());
    });

    afterEach(async () => {
        await stop();
        await rm(dir, { recursive: true, force: true });
    });

    it('reads a JSON array into pipeline objects', async () => {
        const file = join(dir, 'data.json');
        await writeFile(file, JSON.stringify([{ name: 'A' }, { name: 'B' }]), 'utf8');
        let result: Record<string, unknown>[] | null = null;
        const consumer = command('consumer', async (_ctx, args) => {
            result = await args.requirePipelineArray();
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });
        term.register(consumer);
        await term.start();
        stdin.write(`from ${file} | consumer\n`);
        await new Promise((r) => setTimeout(r, 100));
        expect(result).toEqual([{ name: 'A' }, { name: 'B' }]);
    });

    it('reads a single JSON object as one record', async () => {
        const file = join(dir, 'single.json');
        await writeFile(file, JSON.stringify({ name: 'A' }), 'utf8');
        let result: Record<string, unknown>[] | null = null;
        const consumer = command('consumer', async (_ctx, args) => {
            result = await args.requirePipelineArray();
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });
        term.register(consumer);
        await term.start();
        stdin.write(`from ${file} | consumer\n`);
        await new Promise((r) => setTimeout(r, 100));
        expect(result).toEqual([{ name: 'A' }]);
    });

    it('reads an empty JSON array as zero records', async () => {
        const file = join(dir, 'empty.json');
        await writeFile(file, '[]', 'utf8');
        let result: Record<string, unknown>[] | null = null;
        const consumer = command('consumer', async (_ctx, args) => {
            result = await args.requirePipelineArray();
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });
        term.register(consumer);
        await term.start();
        stdin.write(`from ${file} | consumer\n`);
        await new Promise((r) => setTimeout(r, 100));
        expect(result).toEqual([]);
    });

    it('reads a CSV file with header row', async () => {
        const file = join(dir, 'data.csv');
        await writeFile(file, 'name;age\nA;30\nB;25\n', 'utf8');
        let result: Record<string, unknown>[] | null = null;
        const consumer = command('consumer', async (_ctx, args) => {
            result = await args.requirePipelineArray();
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });
        term.register(consumer);
        await term.start();
        stdin.write(`from ${file} | consumer\n`);
        await new Promise((r) => setTimeout(r, 100));
        expect(result).toEqual([
            { name: 'A', age: '30' },
            { name: 'B', age: '25' }
        ]);
    });

    it('reads a CSV file with quoted cells containing commas', async () => {
        const file = join(dir, 'quoted.csv');
        await writeFile(file, 'name;note\nA;"hello, world"\nB;"say ""hi"""\n', 'utf8');
        let result: Record<string, unknown>[] | null = null;
        const consumer = command('consumer', async (_ctx, args) => {
            result = await args.requirePipelineArray();
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });
        term.register(consumer);
        await term.start();
        stdin.write(`from ${file} | consumer\n`);
        await new Promise((r) => setTimeout(r, 100));
        expect(result).toEqual([
            { name: 'A', note: 'hello, world' },
            { name: 'B', note: 'say "hi"' }
        ]);
    });

    it('reads an empty CSV file as zero records', async () => {
        const file = join(dir, 'empty.csv');
        await writeFile(file, '', 'utf8');
        let result: Record<string, unknown>[] | null = null;
        const consumer = command('consumer', async (_ctx, args) => {
            result = await args.requirePipelineArray();
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });
        term.register(consumer);
        await term.start();
        stdin.write(`from ${file} | consumer\n`);
        await new Promise((r) => setTimeout(r, 100));
        expect(result).toEqual([]);
    });

    it('reads a CSV file overriding the default delimiter via --delimiter', async () => {
        const file = join(dir, 'semi.csv');
        await writeFile(file, 'name,age\nA,30\nB,25\n', 'utf8');
        let result: Record<string, unknown>[] | null = null;
        const consumer = command('consumer', async (_ctx, args) => {
            result = await args.requirePipelineArray();
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });
        term.register(consumer);
        await term.start();
        stdin.write(`from ${file} --delimiter ',' | consumer\n`);
        await new Promise((r) => setTimeout(r, 100));
        expect(result).toEqual([
            { name: 'A', age: '30' },
            { name: 'B', age: '25' }
        ]);
    });

    it('uses the terminal defaultDelimiter when --delimiter is omitted', async () => {
        const file = join(dir, 'data.csv');
        await writeFile(file, 'name,age\nA,30\nB,25\n', 'utf8');
        let result: Record<string, unknown>[] | null = null;
        const consumer = command('consumer', async (_ctx, args) => {
            result = await args.requirePipelineArray();
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });
        const out = new PassThrough();
        out.on('data', () => undefined);
        const t2 = new Terminal({
            prompt: '',
            stdin: stdin as unknown as NodeJS.ReadStream,
            stdout: out as unknown as NodeJS.WriteStream,
            defaultDelimiter: ','
        });
        t2.register(consumer);
        await t2.start();
        stdin.write(`from ${file} | consumer\n`);
        await new Promise((r) => setTimeout(r, 100));
        expect(result).toEqual([
            { name: 'A', age: '30' },
            { name: 'B', age: '25' }
        ]);
        await t2.stop();
    });

    it('reads a header-only CSV file as zero records', async () => {
        const file = join(dir, 'header.csv');
        await writeFile(file, 'name;age\n', 'utf8');
        let result: Record<string, unknown>[] | null = null;
        const consumer = command('consumer', async (_ctx, args) => {
            result = await args.requirePipelineArray();
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });
        term.register(consumer);
        await term.start();
        stdin.write(`from ${file} | consumer\n`);
        await new Promise((r) => setTimeout(r, 100));
        expect(result).toEqual([]);
    });

    it('reads a CSV file with quoted cells containing newlines', async () => {
        const file = join(dir, 'nl.csv');
        await writeFile(file, 'name;note\nA;"line1\nline2"\n', 'utf8');
        let result: Record<string, unknown>[] | null = null;
        const consumer = command('consumer', async (_ctx, args) => {
            result = await args.requirePipelineArray();
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });
        term.register(consumer);
        await term.start();
        stdin.write(`from ${file} | consumer\n`);
        await new Promise((r) => setTimeout(r, 100));
        expect(result).toEqual([{ name: 'A', note: 'line1\nline2' }]);
    });

    it('reads a CSV file with CRLF line endings', async () => {
        const file = join(dir, 'crlf.csv');
        await writeFile(file, 'name;age\r\nA;30\r\n', 'utf8');
        let result: Record<string, unknown>[] | null = null;
        const consumer = command('consumer', async (_ctx, args) => {
            result = await args.requirePipelineArray();
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });
        term.register(consumer);
        await term.start();
        stdin.write(`from ${file} | consumer\n`);
        await new Promise((r) => setTimeout(r, 100));
        expect(result).toEqual([{ name: 'A', age: '30' }]);
    });

    it('reads a CSV file with a UTF-8 BOM', async () => {
        const file = join(dir, 'bom.csv');
        await writeFile(file, '\uFEFFname;age\nA;30\n', 'utf8');
        let result: Record<string, unknown>[] | null = null;
        const consumer = command('consumer', async (_ctx, args) => {
            result = await args.requirePipelineArray();
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });
        term.register(consumer);
        await term.start();
        stdin.write(`from ${file} | consumer\n`);
        await new Promise((r) => setTimeout(r, 100));
        expect(result).toEqual([{ name: 'A', age: '30' }]);
    });

    it('reads a JSON file with nested values', async () => {
        const file = join(dir, 'nested.json');
        await writeFile(
            file,
            JSON.stringify([{ name: 'A', meta: { x: 1 }, tags: ['a', 'b'] }]),
            'utf8'
        );
        let result: Record<string, unknown>[] | null = null;
        const consumer = command('consumer', async (_ctx, args) => {
            result = await args.requirePipelineArray();
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });
        term.register(consumer);
        await term.start();
        stdin.write(`from ${file} | consumer\n`);
        await new Promise((r) => setTimeout(r, 100));
        expect(result).toEqual([{ name: 'A', meta: { x: 1 }, tags: ['a', 'b'] }]);
    });

    it('throws for a CSV row with the wrong cell count', async () => {
        const file = join(dir, 'bad.csv');
        await writeFile(file, 'name;age\nA\n', 'utf8');
        const out: string[] = [];
        const stdout = new PassThrough();
        stdout.on('data', (c: Buffer) => out.push(c.toString()));
        const t2 = new Terminal({ prompt: '', stdin: stdin as unknown as NodeJS.ReadStream, stdout: stdout as unknown as NodeJS.WriteStream });
        await t2.start();
        stdin.write(`from ${file}\n`);
        await waitForOutput(out, (s) => s.includes('Error:'));
        expect(out.join('')).toContain('expected 2');
        await t2.stop();
    });

    it('reports the offending row number for CSV cell-count errors', async () => {
        const file = join(dir, 'rowerr.csv');
        await writeFile(file, 'h1;h2\n1;2\n3\n', 'utf8');
        const out: string[] = [];
        const stdout = new PassThrough();
        stdout.on('data', (c: Buffer) => out.push(c.toString()));
        const t2 = new Terminal({ prompt: '', stdin: stdin as unknown as NodeJS.ReadStream, stdout: stdout as unknown as NodeJS.WriteStream });
        await t2.start();
        stdin.write(`from ${file}\n`);
        await waitForOutput(out, (s) => s.includes('Error:'));
        expect(out.join('')).toContain('row 2');
        await t2.stop();
    });

    it('reads a tab-delimited CSV file', async () => {
        const file = join(dir, 'tab.csv');
        await writeFile(file, 'a\tb\n1\t2\n', 'utf8');
        let result: Record<string, unknown>[] | null = null;
        const consumer = command('consumer', async (_ctx, args) => {
            result = await args.requirePipelineArray();
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });
        term.register(consumer);
        await term.start();
        stdin.write(`from ${file} --delimiter '\t' | consumer\n`);
        await new Promise((r) => setTimeout(r, 100));
        expect(result).toEqual([{ a: '1', b: '2' }]);
    });

    it('reads an Excel-style CSV export (BOM, CRLF, quoted commas)', async () => {
        const file = join(dir, 'excel.csv');
        await writeFile(file, '\uFEFFname;note\r\nA;"x,y"\r\n', 'utf8');
        let result: Record<string, unknown>[] | null = null;
        const consumer = command('consumer', async (_ctx, args) => {
            result = await args.requirePipelineArray();
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });
        term.register(consumer);
        await term.start();
        stdin.write(`from ${file} | consumer\n`);
        await new Promise((r) => setTimeout(r, 100));
        expect(result).toEqual([{ name: 'A', note: 'x,y' }]);
    });

    it('reads a JSON file with duplicate keys (last value wins)', async () => {
        const file = join(dir, 'dupes.json');
        await writeFile(file, '{"a":1,"a":2}', 'utf8');
        let result: Record<string, unknown>[] | null = null;
        const consumer = command('consumer', async (_ctx, args) => {
            result = await args.requirePipelineArray();
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });
        term.register(consumer);
        await term.start();
        stdin.write(`from ${file} | consumer\n`);
        await new Promise((r) => setTimeout(r, 100));
        expect(result).toEqual([{ a: 2 }]);
    });

    it('throws for a JSON array containing non-objects', async () => {
        const file = join(dir, 'badarr.json');
        await writeFile(file, '[1, 2]', 'utf8');
        const out: string[] = [];
        const stdout = new PassThrough();
        stdout.on('data', (c: Buffer) => out.push(c.toString()));
        const t2 = new Terminal({ prompt: '', stdin: stdin as unknown as NodeJS.ReadStream, stdout: stdout as unknown as NodeJS.WriteStream });
        await t2.start();
        stdin.write(`from ${file}\n`);
        await waitForOutput(out, (s) => s.includes('Error:'));
        expect(out.join('')).toContain('must contain only objects');
        await t2.stop();
    });

    it('throws for a top-level JSON primitive', async () => {
        const file = join(dir, 'primitive.json');
        await writeFile(file, '42', 'utf8');
        const out: string[] = [];
        const stdout = new PassThrough();
        stdout.on('data', (c: Buffer) => out.push(c.toString()));
        const t2 = new Terminal({ prompt: '', stdin: stdin as unknown as NodeJS.ReadStream, stdout: stdout as unknown as NodeJS.WriteStream });
        await t2.start();
        stdin.write(`from ${file}\n`);
        await waitForOutput(out, (s) => s.includes('Error:'));
        expect(out.join('')).toContain('must be an array or object');
        await t2.stop();
    });

    it('throws for a missing file', async () => {
        const missing = join(dir, 'nope.json');
        const out: string[] = [];
        const stdout = new PassThrough();
        stdout.on('data', (c: Buffer) => out.push(c.toString()));
        const t2 = new Terminal({ prompt: '', stdin: stdin as unknown as NodeJS.ReadStream, stdout: stdout as unknown as NodeJS.WriteStream });
        await t2.start();
        stdin.write(`from ${missing}\n`);
        await waitForOutput(out, (s) => s.includes('Error:'));
        expect(out.join('')).toContain('Failed to read');
        await t2.stop();
    });

    it('throws for a malformed JSON file', async () => {
        const file = join(dir, 'bad.json');
        await writeFile(file, '{ not json', 'utf8');
        const out: string[] = [];
        const stdout = new PassThrough();
        stdout.on('data', (c: Buffer) => out.push(c.toString()));
        const t2 = new Terminal({ prompt: '', stdin: stdin as unknown as NodeJS.ReadStream, stdout: stdout as unknown as NodeJS.WriteStream });
        await t2.start();
        stdin.write(`from ${file}\n`);
        await waitForOutput(out, (s) => s.includes('Error:'));
        expect(out.join('')).toContain('Failed to parse JSON');
        await t2.stop();
    });

    it('throws for an unsupported extension', async () => {
        const file = join(dir, 'data.txt');
        await writeFile(file, 'x', 'utf8');
        const out: string[] = [];
        const stdout = new PassThrough();
        stdout.on('data', (c: Buffer) => out.push(c.toString()));
        const t2 = new Terminal({ prompt: '', stdin: stdin as unknown as NodeJS.ReadStream, stdout: stdout as unknown as NodeJS.WriteStream });
        await t2.start();
        stdin.write(`from ${file}\n`);
        await waitForOutput(out, (s) => s.includes('Error:'));
        expect(out.join('')).toContain('Unsupported file extension');
        await t2.stop();
    });

    it('ignores output when no downstream pipe', async () => {
        const file = join(dir, 'data.json');
        await writeFile(file, JSON.stringify([{ name: 'A' }]), 'utf8');
        await term.start();
        stdin.write(`from ${file}\n`);
        await new Promise((r) => setTimeout(r, 100));
        const output = chunks.join('').trim();
        expect(output).toBe('');
    });
});
