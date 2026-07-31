import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { Terminal } from '../../../src/terminal.js';
import { command } from '../../../src/command-factory.js';
import { PipelineInputAcceptance } from '../../../src/types.js';
import { setupTerminal } from '../../helpers/setup-terminal.js';
import { waitForOutput } from '../../helpers/wait-for-output.js';
describe('table command', () => {
    let stdin: PassThrough;
    let chunks: string[];
    let term: Terminal;
    let stop: () => Promise<void>;

    beforeEach(() => {
        ({ stdin, chunks, term, stop } = setupTerminal());
    });

    afterEach(() => stop());

    it('renders objects as a formatted table', async () => {
        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ Name: 'Alice', Age: 30 });
            ctx.output!.submit({ Name: 'Bob', Age: 25 });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        term.register(producer);
        await term.start();

        stdin.write('producer | table\n');
        await waitForOutput(chunks, (s) => s.includes('Alice'));
        const output = chunks.join('');
        expect(output).toContain('Name');
        expect(output).toContain('Age');
        expect(output).toContain('Alice');
        expect(output).toContain('Bob');
        expect(output).toContain('---');
    });

    it('renders nested object and array cells as JSON', async () => {
        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ tags: ['a', 'b'], meta: { x: 1 } });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        term.register(producer);
        await term.start();

        stdin.write('producer | table\n');
        await waitForOutput(chunks, (s) => s.includes('["a","b"]'));
        const output = chunks.join('');
        expect(output).toContain('["a","b"]');
        expect(output).toContain('{"x":1}');
        expect(output).not.toContain('[object Object]');
    });

    it('renders spaces for missing keys across objects', async () => {
        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ name: 'Alice', age: 30 });
            ctx.output!.submit({ name: 'Bob' });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        term.register(producer);
        await term.start();

        stdin.write('producer | table\n');
        await waitForOutput(chunks, (s) => s.includes('Alice'));
        const output = chunks.join('');
        expect(output).toContain('Bob');
        expect(output).not.toContain('undefined');
    });

    it('renders nothing for empty pipeline', async () => {
        const producer = command('producer', async (_ctx) => {},
            { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });
        term.register(producer);
        await term.start();

        stdin.write('producer | table\n');
        await new Promise((r) => setTimeout(r, 100));
        expect(chunks.join('')).toBe('');
    });
});

describe('table command (additional branches)', () => {
    let stdin: PassThrough;
    let chunks: string[];
    let term: Terminal;
    let stop: () => Promise<void>;

    beforeEach(() => {
        ({ stdin, chunks, term, stop } = setupTerminal());
    });

    afterEach(() => stop());

    it('writes nothing when used as standalone command', async () => {
        await term.start();
        stdin.write('table\n');
        await new Promise((r) => setTimeout(r, 100));
        const output = chunks.join('').trim();
        expect(output).toBe('');
    });

    it('writes nothing when pipeline objects have no keys', async () => {
        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({});
            ctx.output!.submit({});
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        term.register(producer);
        await term.start();

        stdin.write('producer | table\n');
        await new Promise((r) => setTimeout(r, 100));
        const output = chunks.join('').trim();
        expect(output).toBe('');
    });
});

describe('table command (single row and column widths)', () => {
    let stdin: PassThrough;
    let chunks: string[];
    let term: Terminal;
    let stop: () => Promise<void>;

    beforeEach(() => {
        ({ stdin, chunks, term, stop } = setupTerminal());
    });

    afterEach(() => stop());

    it('renders a single-row table correctly', async () => {
        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ a: 'short', longer_field: 'val' });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        term.register(producer);
        await term.start();

        stdin.write('producer | table\n');
        await waitForOutput(chunks, (s) => s.includes('short'));
        const output = chunks.join('');
        expect(output).toContain('| a');
        expect(output).toContain('| longer_field');
        expect(output).toContain('| short');
        expect(output).toContain('| val');
    });

    it('renders nothing when used as standalone command', async () => {
        await term.start();
        stdin.write('table\n');
        await new Promise((r) => setTimeout(r, 100));
        const output = chunks.join('').trim();
        expect(output).toBe('');
    });
});

