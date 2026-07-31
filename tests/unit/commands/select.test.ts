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

