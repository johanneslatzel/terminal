import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { Terminal } from '../../../src/terminal.js';
import { command } from '../../../src/command-factory.js';
import { PipelineInputAcceptance } from '../../../src/types.js';
import { setupTerminal } from '../../helpers/setup-terminal.js';
import { waitForOutput } from '../../helpers/wait-for-output.js';
describe('select command', () => {
    let stdin: PassThrough;
    let chunks: string[];
    let term: Terminal;
    let stop: () => Promise<void>;

    beforeEach(() => {
        ({ stdin, chunks, term, stop } = setupTerminal());
    });

    afterEach(() => stop());

    it('selects specified attributes from pipeline objects', async () => {
        const log: unknown[] = [];

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ name: 'Alice', age: 30, city: 'NYC' });
            ctx.output!.submit({ name: 'Bob', age: 25, city: 'LA' });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            log.push(await args.requirePipelineArray());
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | select name,age | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(log).toEqual([[{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }]]);
    });

    it('passes through all attributes when none specified', async () => {
        const log: unknown[] = [];

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ x: 1, y: 2 });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            log.push(await args.requirePipelineArray());
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | select | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(log).toEqual([[{ x: 1, y: 2 }]]);
    });

    it('writes help when used as non-intermediate command', async () => {
        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ x: 1 });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        term.register(producer);
        await term.start();

        stdin.write('producer | select x\n');
        await waitForOutput(chunks, (s) => s.includes('intermediate'));
        expect(chunks.join('')).toContain('intermediate pipeline command');
    });

    it('selects only existing attributes (ignores missing ones)', async () => {
        const log: unknown[] = [];

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ name: 'Alice', age: 30, city: 'NYC' });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            log.push(await args.requirePipelineArray());
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | select name,magic,age | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(log).toEqual([[{ name: 'Alice', age: 30 }]]);
    });

    it('splits attributes on whitespace after commas', async () => {
        const log: unknown[] = [];

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ name: 'Alice', age: 30, city: 'NYC' });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            log.push(await args.requirePipelineArray());
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | select name, age | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(log).toEqual([[{ name: 'Alice', age: 30 }]]);
    });

    it('excludes inherited properties from picked attributes', async () => {
        const log: unknown[] = [];

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ name: 'Alice' });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            log.push(await args.requirePipelineArray());
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | select name,constructor,toString | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(log).toEqual([[{ name: 'Alice' }]]);
    });
});

describe('select command (empty input)', () => {
    let stdin: PassThrough;
    let term: Terminal;
    let stop: () => Promise<void>;

    beforeEach(() => {
        ({ stdin, term, stop } = setupTerminal());
    });

    afterEach(() => stop());

    it('produces no output when pipeline is empty', async () => {
        const log: unknown[] = [];

        const producer = command('producer', async (_ctx) => {
            // no output
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            const all = await args.requirePipelineArray();
            log.push(all);
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | select x,y | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(log).toHaveLength(1);
        expect((log[0] as unknown[])).toHaveLength(0);
    });
});



describe('select command (mapping grammar)', () => {
    let stdin: PassThrough;
    let term: Terminal;
    let stop: () => Promise<void>;

    beforeEach(() => {
        ({ stdin, term, stop } = setupTerminal());
    });

    afterEach(() => stop());

    function producerWith(items: Record<string, unknown>[]) {
        return command('producer', async (ctx) => {
            for (const item of items) ctx.output!.submit(item);
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });
    }

    async function runAndCapture(line: string): Promise<Record<string, unknown>[]> {
        let result: Record<string, unknown>[] | null = null;
        const consumer = command('consumer', async (_ctx, args) => {
            result = await args.requirePipelineArray();
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });
        term.register(consumer);
        await term.start();
        stdin.write(line + '\n');
        await new Promise((r) => setTimeout(r, 100));
        return result ?? [];
    }

    it('renames a source key into a new output key', async () => {
        term.register(producerWith([{ id: 7, age: 30, name: 'A' }]));
        const result = await runAndCapture('producer | select taskId=id | consumer');
        expect(result).toEqual([{ taskId: 7 }]);
    });

    it('resolves dotted source paths', async () => {
        term.register(producerWith([{ user: { name: 'A' }, id: 1 }]));
        const result = await runAndCapture('producer | select owner=user.name | consumer');
        expect(result).toEqual([{ owner: 'A' }]);
    });

    it('emits an empty string for an empty source', async () => {
        term.register(producerWith([{ id: 1, name: 'A' }]));
        const result = await runAndCapture('producer | select author= | consumer');
        expect(result).toEqual([{ author: '' }]);
    });

    it('mixes keep, rename and literal projections', async () => {
        term.register(producerWith([{ id: 7, name: 'A' }]));
        const result = await runAndCapture('producer | select name, taskId=id, author= | consumer');
        expect(result).toEqual([{ name: 'A', taskId: 7, author: '' }]);
    });

    it('applies a swap against the original keys (no chaining)', async () => {
        term.register(producerWith([{ a: 1, b: 2 }]));
        const result = await runAndCapture('producer | select a=b, b=a | consumer');
        expect(result).toEqual([{ b: 1, a: 2 }]);
    });

    it('silently ignores a missing source path', async () => {
        term.register(producerWith([{ name: 'A' }]));
        const result = await runAndCapture('producer | select x=missing | consumer');
        expect(result).toEqual([{}]);
    });

    it('keeps the last projection when two target the same output key', async () => {
        term.register(producerWith([{ a: 1, b: 2 }]));
        const result = await runAndCapture('producer | select x=a, x=b | consumer');
        expect(result).toEqual([{ x: 2 }]);
    });

    it('treats a self-rename as keeping the value', async () => {
        term.register(producerWith([{ name: 'A' }]));
        const result = await runAndCapture('producer | select name=name | consumer');
        expect(result).toEqual([{ name: 'A' }]);
    });

    it('writes nothing for empty input', async () => {
        term.register(producerWith([]));
        const result = await runAndCapture('producer | select a=b | consumer');
        expect(result).toEqual([]);
    });

    it('throws for an empty output key', async () => {
        const out: string[] = [];
        const stdout = new PassThrough();
        stdout.on('data', (c: Buffer) => out.push(c.toString()));
        const t2 = new Terminal({ prompt: '', stdin: stdin as unknown as NodeJS.ReadStream, stdout: stdout as unknown as NodeJS.WriteStream });
        t2.register(producerWith([{ name: 'A' }]));
        t2.register(command('consumer', async () => {}, { acceptsPipelineInput: PipelineInputAcceptance.Array }));
        await t2.start();
        stdin.write('producer | select =x | consumer\n');
        await waitForOutput(out, (s) => s.includes('Error:'));
        expect(out.join('')).toContain('new key must not be empty');
        await t2.stop();
    });
});
