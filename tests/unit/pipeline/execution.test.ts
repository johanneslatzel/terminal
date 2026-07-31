import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { Terminal } from '../../../src/terminal.js';
import { PipelineInputAcceptance } from '../../../src/types.js';
import { command } from '../../../src/command-factory.js';
import { z } from 'zod';
describe('Pipeline execution', () => {
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

    it('Array pipeline: passes all output at once', async () => {
        const produced: string[] = [];
        const consumed: unknown[] = [];

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ item: 'a' });
            ctx.output!.submit({ item: 'b' });
            produced.push('produced');
        }, { description: 'Produces output', acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            consumed.push(await args.requirePipelineArray());
        }, { description: 'Consumes input', acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(produced).toEqual(['produced']);
        expect(consumed).toHaveLength(1);
        expect(consumed[0]).toEqual([{ item: 'a' }, { item: 'b' }]);
    });

    it('Single pipeline: calls consumer per item sequentially with auto-mapped fields', async () => {
        const order: number[] = [];

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ seq: 1 });
            ctx.output!.submit({ seq: 2 });
        }, { providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            const seq = await args.require<number>('seq');
            order.push(seq);
        }, {
            arguments: [{ name: 'seq', schema: z.coerce.number() }],
            acceptsPipelineInput: PipelineInputAcceptance.Single
        });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(order).toEqual([1, 2]);
    });

    it('Single pipeline: processes items sequentially (awaits each call)', async () => {
        const order: number[] = [];

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ seq: 1 });
            ctx.output!.submit({ seq: 2 });
        }, { providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            const seq = await args.require<number>('seq');
            order.push(seq);
        }, {
            arguments: [{ name: 'seq', schema: z.coerce.number() }],
            acceptsPipelineInput: PipelineInputAcceptance.Single
        });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(order).toEqual([1, 2]);
    });

    it('Pipeline chaining: A | B | C', async () => {
        const log: string[] = [];

        const a = command('a', async (ctx) => {
            ctx.output!.submit({ val: 1 });
        }, { providesPipelineOutput: true });

        const b = command('b', async (ctx, args) => {
            const input = await args.requirePipelineArray();
            for (const item of input) {
                ctx.output!.submit({ val: (item.val as number) + 1 });
            }
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array, providesPipelineOutput: true });

        const c = command('c', async (_ctx, args) => {
            log.push(JSON.stringify(await args.requirePipelineArray()));
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(a);
        term.register(b);
        term.register(c);
        await term.start();

        stdin.write('a | b | c\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(log).toEqual(['[{"val":2}]']);
    });

    it('Non-pipeline commands still work normally', async () => {
        const log: string[] = [];
        const cmd = command('ping', async () => {
            log.push('pong');
        });
        term.register(cmd);
        await term.start();

        stdin.write('ping\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(log).toEqual(['pong']);
    });

    it('write() accepts array of objects', async () => {
        const log: unknown[] = [];

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit([{ x: 1 }, { x: 2 }]);
        }, { providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            log.push(await args.requirePipelineArray());
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(log).toEqual([[{ x: 1 }, { x: 2 }]]);
    });

    it('Single in middle of chain receives items and passes output forward', async () => {
        const log: string[] = [];

        const a = command('a', async (ctx) => {
            ctx.output!.submit({ n: 1 });
            ctx.output!.submit({ n: 2 });
        }, { providesPipelineOutput: true });

        const b = command('b', async (ctx, args) => {
            const n = await args.require<number>('n');
            ctx.output!.submit({ n: n + 1 });
        }, {
            arguments: [{ name: 'n', schema: z.coerce.number() }],
            acceptsPipelineInput: PipelineInputAcceptance.Single,
            providesPipelineOutput: true
        });

        const c = command('c', async (_ctx, args) => {
            log.push(JSON.stringify(await args.requirePipelineArray()));
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(a);
        term.register(b);
        term.register(c);
        await term.start();

        stdin.write('a | b | c\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(log).toEqual(['[{"n":2},{"n":3}]']);
    });

    it('Single in middle of chain receives items and passes output forward (sequential)', async () => {
        const log: string[] = [];
        let resolve1 = () => {};
        let resolve2 = () => {};
        const gate1 = new Promise<void>((r) => { resolve1 = r; });
        const gate2 = new Promise<void>((r) => { resolve2 = r; });

        const a = command('a', async (ctx) => {
            ctx.output!.submit({ n: 1 });
            ctx.output!.submit({ n: 2 });
        }, { providesPipelineOutput: true });

        const b = command('b', async (ctx, args) => {
            const n = await args.require<number>('n');
            if (n === 1) await gate1;
            else await gate2;
            ctx.output!.submit({ n: n + 10 });
        }, {
            arguments: [{ name: 'n', schema: z.coerce.number() }],
            acceptsPipelineInput: PipelineInputAcceptance.Single,
            providesPipelineOutput: true
        });

        const c = command('c', async (_ctx, args) => {
            log.push(JSON.stringify(await args.requirePipelineArray()));
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(a);
        term.register(b);
        term.register(c);
        await term.start();

        stdin.write('a | b | c\n');
        await new Promise((r) => setTimeout(r, 50));

        resolve1();
        resolve2();
        await new Promise((r) => setTimeout(r, 50));

        expect(log).toEqual(['[{"n":11},{"n":12}]']);
    });

    it('Single mode auto-maps pipeline fields to args', async () => {
        const results: Record<string, string> = {};

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ name: 'Alice', age: 30 });
        }, { providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            results.name = await args.require<string>('name');
            results.age = await args.require<string>('age');
        }, {
            description: 'Consumes input',
            arguments: [
                { name: 'name', schema: z.string() },
                { name: 'age', schema: z.string() }
            ],
            acceptsPipelineInput: PipelineInputAcceptance.Single
        });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(results).toEqual({ name: 'Alice', age: '30' });
    });

    it('Single mode: CLI args override pipeline fields', async () => {
        const results: Record<string, string> = {};

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ name: 'Alice' });
        }, { providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            results.name = await args.require<string>('name');
        }, {
            description: 'Consumes input',
            arguments: [
                { name: 'name', schema: z.string() }
            ],
            acceptsPipelineInput: PipelineInputAcceptance.Single
        });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | consumer --name Bob\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(results).toEqual({ name: 'Bob' });
    });

    it('Array mode: requirePipelineArray() returns all items', async () => {
        const consumed: unknown[] = [];

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ x: 1 });
            ctx.output!.submit({ x: 2 });
        }, { providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            consumed.push(await args.requirePipelineArray());
        }, {
            description: 'Consumes input',
            acceptsPipelineInput: PipelineInputAcceptance.Array
        });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(consumed).toEqual([[{ x: 1 }, { x: 2 }]]);
    });

    it('Single mode standalone (no pipe) executes once with CLI args', async () => {
        const log: string[] = [];

        const cmd = command('greet', async (_ctx, args) => {
            log.push(await args.require<string>('name'));
        }, {
            arguments: [{ name: 'name', schema: z.string() }],
            acceptsPipelineInput: PipelineInputAcceptance.Single
        });

        term.register(cmd);
        await term.start();

        stdin.write('greet --name standalone\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(log).toEqual(['standalone']);
    });

    it('Single mode: extra pipeline fields beyond declared args are ignored but declared ones work', async () => {
        const results: Record<string, string> = {};

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ name: 'Alice', age: 30, city: 'NYC' });
        }, { providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            results.name = await args.require<string>('name');
            results.age = await args.require<string>('age');
        }, {
            arguments: [
                { name: 'name', schema: z.string() },
                { name: 'age', schema: z.string() }
            ],
            acceptsPipelineInput: PipelineInputAcceptance.Single
        });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(results).toEqual({ name: 'Alice', age: '30' });
    });

    it('Array mode with CLI arguments alongside pipeline items', async () => {
        const logItems: unknown[] = [];
        let logSuffix = '';

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ id: 1 });
            ctx.output!.submit({ id: 2 });
        }, { providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            logItems.push(await args.requirePipelineArray());
            logSuffix = await args.require<string>('suffix');
        }, {
            arguments: [{ name: 'suffix', schema: z.string() }],
            acceptsPipelineInput: PipelineInputAcceptance.Array
        });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | consumer --suffix .bak\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(logItems).toEqual([[{ id: 1 }, { id: 2 }]]);
        expect(logSuffix).toBe('.bak');
    });

    it('requirePipelineArray() throws when no pipeline input is available', async () => {
        const { CommandArguments } = await import('../../../src/command-arguments.js');
        const args = new CommandArguments({}, null);
        await expect(args.requirePipelineArray()).rejects.toThrow(
            'Pipeline array input is not available'
        );
    });

    it('Single mode command can act as a producer in the middle of a pipeline', async () => {
        const consumed: unknown[] = [];

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ val: 1 });
            ctx.output!.submit({ val: 2 });
        }, { providesPipelineOutput: true });

        const mid = command('mid', async (ctx, args) => {
            const val = await args.require<number>('val');
            ctx.output!.submit({ double: val * 2 });
        }, {
            arguments: [{ name: 'val', schema: z.coerce.number() }],
            acceptsPipelineInput: PipelineInputAcceptance.Single,
            providesPipelineOutput: true
        });

        const consumer = command('consumer', async (_ctx, args) => {
            consumed.push(await args.requirePipelineArray());
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(producer);
        term.register(mid);
        term.register(consumer);
        await term.start();

        stdin.write('producer | mid | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(consumed).toEqual([[{ double: 2 }, { double: 4 }]]);
    });
});
