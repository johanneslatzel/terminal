import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Terminal } from '../../../src/terminal.js';
import { command } from '../../../src/command-factory.js';
import { PipelineInputAcceptance } from '../../../src/types.js';
import { setupTerminal } from '../../helpers/setup-terminal.js';
import { waitForOutput } from '../../helpers/wait-for-output.js';

describe('to command', () => {
    let dir: string;
    let stdin: PassThrough;
    let term: Terminal;
    let stop: () => Promise<void>;

    beforeEach(async () => {
        dir = await mkdtemp(join(tmpdir(), 'repltree-to-'));
        ({ stdin, term, stop } = setupTerminal());
    });

    afterEach(async () => {
        await stop();
        await rm(dir, { recursive: true, force: true });
    });

    function makeProducer() {
        return command('producer', async (ctx) => {
            ctx.output!.submit({ name: 'A', age: 30 });
            ctx.output!.submit({ name: 'B', age: 25 });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });
    }

    it('writes pipeline rows as JSON', async () => {
        const file = join(dir, 'out.json');
        term.register(makeProducer());
        await term.start();
        stdin.write(`producer | to ${file}\n`);
        await new Promise((r) => setTimeout(r, 100));
        const text = await readFile(file, 'utf8');
        expect(JSON.parse(text)).toEqual([
            { name: 'A', age: 30 },
            { name: 'B', age: 25 }
        ]);
    });

    it('writes pipeline rows as CSV', async () => {
        const file = join(dir, 'out.csv');
        term.register(makeProducer());
        await term.start();
        stdin.write(`producer | to ${file}\n`);
        await new Promise((r) => setTimeout(r, 100));
        const text = await readFile(file, 'utf8');
        expect(text).toBe('name;age\nA;30\nB;25\n');
    });

    it('writes pipeline rows as CSV using the terminal defaultDelimiter', async () => {
        const file = join(dir, 'out.csv');
        const out = new PassThrough();
        out.on('data', () => undefined);
        const t2 = new Terminal({
            prompt: '',
            stdin: stdin as unknown as NodeJS.ReadStream,
            stdout: out as unknown as NodeJS.WriteStream,
            defaultDelimiter: ','
        });
        t2.register(makeProducer());
        await t2.start();
        stdin.write(`producer | to ${file}\n`);
        await new Promise((r) => setTimeout(r, 100));
        const text = await readFile(file, 'utf8');
        expect(text).toBe('name,age\nA,30\nB,25\n');
        await t2.stop();
    });

    it('writes pipeline rows as CSV with a custom delimiter', async () => {
        const file = join(dir, 'out-semi.csv');
        term.register(makeProducer());
        await term.start();
        stdin.write(`producer | to ${file} --delimiter ','\n`);
        await new Promise((r) => setTimeout(r, 100));
        const text = await readFile(file, 'utf8');
        expect(text).toBe('name,age\nA,30\nB,25\n');
    });

    it('writes pipeline rows as tab-delimited CSV', async () => {
        const file = join(dir, 'tab.csv');
        term.register(makeProducer());
        await term.start();
        stdin.write(`producer | to ${file} --delimiter '\t'\n`);
        await new Promise((r) => setTimeout(r, 100));
        const text = await readFile(file, 'utf8');
        expect(text).toBe('name\tage\nA\t30\nB\t25\n');
    });

    it('round-trips tricky CSV cells through to and from', async () => {
        const file = join(dir, 'tricky.csv');
        const tricky = command('tricky', async (ctx) => {
            ctx.output!.submit({ name: 'A,B', note: 'say "hi"', nl: 'x\ny' });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });
        let result: Record<string, unknown>[] | null = null;
        const consumer = command('consumer', async (_ctx, args) => {
            result = await args.requirePipelineArray();
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });
        term.register(tricky);
        term.register(consumer);
        await term.start();
        stdin.write(`tricky | to ${file}\n`);
        await new Promise((r) => setTimeout(r, 100));
        const text = await readFile(file, 'utf8');
        expect(text).toBe('name;note;nl\n"A,B";"say ""hi""";"x\ny"\n');

        stdin.write(`from ${file} | consumer\n`);
        await new Promise((r) => setTimeout(r, 100));
        expect(result).toEqual([{ name: 'A,B', note: 'say "hi"', nl: 'x\ny' }]);
    });

    it('round-trips csv to json via from and to', async () => {
        const src = join(dir, 'data.csv');
        const dest = join(dir, 'round.json');
        await writeFile(src, 'name;age\nA;30\nB;25\n', 'utf8');
        term.register(makeProducer());
        await term.start();
        stdin.write(`from ${src} | to ${dest}\n`);
        await new Promise((r) => setTimeout(r, 100));
        const destText = await readFile(dest, 'utf8');
        expect(JSON.parse(destText)).toEqual([
            { name: 'A', age: '30' },
            { name: 'B', age: '25' }
        ]);
    });

    it('throws when writing to a non-writable path', async () => {
        const file = join(dir, 'sub', 'out.json');
        const out: string[] = [];
        const stdout = new PassThrough();
        stdout.on('data', (c: Buffer) => out.push(c.toString()));
        const t2 = new Terminal({ prompt: '', stdin: stdin as unknown as NodeJS.ReadStream, stdout: stdout as unknown as NodeJS.WriteStream });
        t2.register(makeProducer());
        await t2.start();
        stdin.write(`producer | to ${file}\n`);
        await waitForOutput(out, (s) => s.includes('Error:'));
        expect(out.join('')).toContain('Failed to write');
        await t2.stop();
    });

    it('throws for an unsupported extension', async () => {
        const file = join(dir, 'out.txt');
        const out: string[] = [];
        const stdout = new PassThrough();
        stdout.on('data', (c: Buffer) => out.push(c.toString()));
        const t2 = new Terminal({ prompt: '', stdin: stdin as unknown as NodeJS.ReadStream, stdout: stdout as unknown as NodeJS.WriteStream });
        t2.register(makeProducer());
        await t2.start();
        stdin.write(`producer | to ${file}\n`);
        await waitForOutput(out, (s) => s.includes('Error:'));
        expect(out.join('')).toContain('Unsupported file extension');
        await t2.stop();
    });

    it('writes an empty file for empty input', async () => {
        const file = join(dir, 'empty.json');
        term.register(makeProducer());
        await term.start();
        stdin.write(`producer | filter nope=x | to ${file}\n`);
        await new Promise((r) => setTimeout(r, 100));
        const text = await readFile(file, 'utf8');
        expect(JSON.parse(text)).toEqual([]);
    });
});
