import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { Terminal } from '../../../src/terminal.js';
import { command } from '../../../src/command-factory.js';
import { PipelineInputAcceptance } from '../../../src/types.js';
import { setupTerminal } from '../../helpers/setup-terminal.js';
import { waitForOutput } from '../../helpers/wait-for-output.js';
describe('sort command', () => {
    let stdin: PassThrough;
    let chunks: string[];
    let term: Terminal;
    let stop: () => Promise<void>;

    beforeEach(() => {
        ({ stdin, chunks, term, stop } = setupTerminal());
    });

    afterEach(() => stop());

    it('sorts by first attribute by default', async () => {
        const log: unknown[] = [];

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ name: 'Charlie' });
            ctx.output!.submit({ name: 'Alice' });
            ctx.output!.submit({ name: 'Bob' });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            log.push(await args.requirePipelineArray());
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | sort | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(log).toEqual([[{ name: 'Alice' }, { name: 'Bob' }, { name: 'Charlie' }]]);
    });

    it('sorts by specified --attribute', async () => {
        const log: unknown[] = [];

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ name: 'Charlie', rank: 3 });
            ctx.output!.submit({ name: 'Alice', rank: 1 });
            ctx.output!.submit({ name: 'Bob', rank: 2 });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            log.push(await args.requirePipelineArray());
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | sort --attribute rank | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(log).toEqual([
            [{ name: 'Alice', rank: 1 }, { name: 'Bob', rank: 2 }, { name: 'Charlie', rank: 3 }]
        ]);
    });

    it('sorts by numeric values numerically', async () => {
        const log: unknown[] = [];

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ val: 100 });
            ctx.output!.submit({ val: 20 });
            ctx.output!.submit({ val: 3 });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            log.push(await args.requirePipelineArray());
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | sort | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(log).toEqual([[{ val: 3 }, { val: 20 }, { val: 100 }]]);
    });

    it('passes through objects when no sort key exists', async () => {
        const log: unknown[] = [];

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({});
            ctx.output!.submit({});
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            log.push(await args.requirePipelineArray());
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | sort | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(log).toHaveLength(1);
        expect((log[0] as Record<string, unknown>[])).toHaveLength(2);
    });

    it('writes help when used as non-intermediate command', async () => {
        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ x: 2 });
            ctx.output!.submit({ x: 1 });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        term.register(producer);
        await term.start();

        stdin.write('producer | sort\n');
        await waitForOutput(chunks, (s) => s.includes('intermediate'));
        expect(chunks.join('')).toContain('intermediate pipeline command');
    });

    it('passes through when --attribute is an empty string', async () => {
        const log: unknown[] = [];

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ b: 1 });
            ctx.output!.submit({ a: 2 });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            log.push(await args.requirePipelineArray());
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | sort --attribute "" | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(log).toEqual([[{ b: 1 }, { a: 2 }]]);
    });

    it('sorts mixed number and string values using string comparison', async () => {
        const log: unknown[] = [];

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ key: '10' });
            ctx.output!.submit({ key: 9 });
            ctx.output!.submit({ key: 'x' });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            log.push(await args.requirePipelineArray());
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | sort --attribute key | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(log).toEqual([[{ key: '10' }, { key: 9 }, { key: 'x' }]]);
    });

    it('preserves order when --attribute is missing on all items', async () => {
        const log: unknown[] = [];

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ name: 'b' });
            ctx.output!.submit({ name: 'a' });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            log.push(await args.requirePipelineArray());
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | sort --attribute missing | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(log).toEqual([[{ name: 'b' }, { name: 'a' }]]);
    });

    it('sorts items with the attribute before items missing it', async () => {
        const log: unknown[] = [];

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ name: 'zeta', rank: 2 });
            ctx.output!.submit({ name: 'missing-one' });
            ctx.output!.submit({ name: 'alpha', rank: 1 });
            ctx.output!.submit({ name: 'missing-two' });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            log.push(await args.requirePipelineArray());
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | sort --attribute rank | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(log).toEqual([
            [
                { name: 'alpha', rank: 1 },
                { name: 'zeta', rank: 2 },
                { name: 'missing-one' },
                { name: 'missing-two' }
            ]
        ]);
    });
});

describe('sort command (additional branches)', () => {
    let stdin: PassThrough;
    let chunks: string[];
    let term: Terminal;
    let stop: () => Promise<void>;
    let spawnMock: ReturnType<typeof vi.fn>;

    beforeEach(async () => {
        const childProcess: { spawn: ReturnType<typeof vi.fn> } =
            await vi.importMock('node:child_process') as any;
        spawnMock = childProcess.spawn;
        spawnMock.mockReset();

        ({ stdin, chunks, term, stop } = setupTerminal());
    });

    afterEach(() => stop());

    it('writes nothing when used as standalone command', async () => {
        await term.start();
        stdin.write('sort\n');
        await new Promise((r) => setTimeout(r, 100));
        const output = chunks.join('').trim();
        expect(output).toBe('');
    });

    it('sorts objects with null sort key values correctly', async () => {
        const log: unknown[] = [];
        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ val: null });
            ctx.output!.submit({ val: 1 });
            ctx.output!.submit({ val: null });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            log.push(await args.requirePipelineArray());
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | sort | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(log).toHaveLength(1);
        const result = log[0] as Record<string, unknown>[];
        expect(result[0]!.val).toBe(1);
    });
});

describe('sort command (alias and edge cases)', () => {
    let stdin: PassThrough;
    let term: Terminal;
    let stop: () => Promise<void>;

    beforeEach(() => {
        ({ stdin, term, stop } = setupTerminal());
    });

    afterEach(() => stop());

    it('sorts by --attribute using short alias -a', async () => {
        const log: unknown[] = [];

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ name: 'Charlie', rank: 3 });
            ctx.output!.submit({ name: 'Alice', rank: 1 });
            ctx.output!.submit({ name: 'Bob', rank: 2 });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            log.push(await args.requirePipelineArray());
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | sort -a rank | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(log).toEqual([
            [{ name: 'Alice', rank: 1 }, { name: 'Bob', rank: 2 }, { name: 'Charlie', rank: 3 }]
        ]);
    });

    it('handles both values being null for sort key', async () => {
        const log: unknown[] = [];

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ val: null });
            ctx.output!.submit({ val: null });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        const consumer = command('consumer', async (_ctx, args) => {
            log.push(await args.requirePipelineArray());
        }, { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(producer);
        term.register(consumer);
        await term.start();

        stdin.write('producer | sort | consumer\n');
        await new Promise((r) => setTimeout(r, 100));

        expect(log).toHaveLength(1);
        expect((log[0] as unknown[])).toHaveLength(2);
    });
});

