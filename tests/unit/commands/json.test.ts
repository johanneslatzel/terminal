import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { Terminal } from '../../../src/terminal.js';
import { command } from '../../../src/command-factory.js';
import { PipelineInputAcceptance } from '../../../src/types.js';
import { setupTerminal } from '../../helpers/setup-terminal.js';
import { waitForOutput } from '../../helpers/wait-for-output.js';
describe('json command', () => {
    let stdin: PassThrough;
    let chunks: string[];
    let term: Terminal;
    let stop: () => Promise<void>;

    beforeEach(() => {
        ({ stdin, chunks, term, stop } = setupTerminal());
    });

    afterEach(() => stop());

    it('formats pipeline objects as pretty-printed JSON', async () => {
        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ name: 'Alice', age: 30 });
            ctx.output!.submit({ name: 'Bob', age: 25 });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        term.register(producer);
        await term.start();

        stdin.write('producer | json\n');
        await waitForOutput(chunks, (s) => s.includes('Alice'));
        const output = chunks.join('');
        expect(output).toContain('"name"');
        expect(output).toContain('"age"');
        expect(output).toContain('Alice');
        expect(output).toContain('Bob');
        expect(output).toContain('[');
        expect(output).toContain(']');
    });

    it('produces valid JSON', async () => {
        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ val: 42 });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        term.register(producer);
        await term.start();

        stdin.write('producer | json\n');
        await waitForOutput(chunks, (s) => s.includes('42'));
        const output = chunks.join('').trim();
        expect(() => JSON.parse(output)).not.toThrow();
    });

    it('outputs empty array when used without pipeline input', async () => {
        await term.start();
        stdin.write('json\n');
        await new Promise((r) => setTimeout(r, 100));
        const output = chunks.join('').trim();
        expect(output).toBe('[]');
    });
});

describe('json command (additional branches)', () => {
    let stdin: PassThrough;
    let chunks: string[];
    let term: Terminal;
    let stop: () => Promise<void>;

    beforeEach(() => {
        ({ stdin, chunks, term, stop } = setupTerminal());
    });

    afterEach(() => stop());

    it('formats nested objects', async () => {
        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ user: { name: 'Alice', roles: ['admin'] } });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        term.register(producer);
        await term.start();

        stdin.write('producer | json\n');
        await waitForOutput(chunks, (s) => s.includes('admin'));
        const output = chunks.join('').trim();
        expect(output).toContain('"user"');
        expect(output).toContain('"roles"');
        expect(() => JSON.parse(output)).not.toThrow();
    });

    it('formats objects with null and boolean values', async () => {
        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ active: true, score: null });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        term.register(producer);
        await term.start();

        stdin.write('producer | json\n');
        await waitForOutput(chunks, (s) => s.includes('true'));
        const output = chunks.join('').trim();
        expect(output).toContain('null');
        expect(() => JSON.parse(output)).not.toThrow();
    });
});

