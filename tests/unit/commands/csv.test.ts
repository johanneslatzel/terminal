import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { Terminal } from '../../../src/terminal.js';
import { command } from '../../../src/command-factory.js';
import { PipelineInputAcceptance } from '../../../src/types.js';
import { setupTerminal } from '../../helpers/setup-terminal.js';
import { waitForOutput } from '../../helpers/wait-for-output.js';

describe('csv command', () => {
    let stdin: PassThrough;
    let chunks: string[];
    let term: Terminal;
    let stop: () => Promise<void>;

    beforeEach(() => {
        ({ stdin, chunks, term, stop } = setupTerminal());
    });

    afterEach(() => stop());

    it('formats pipeline objects as CSV with a union header', async () => {
        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ name: 'Alice', age: 30 });
            ctx.output!.submit({ name: 'Bob' });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        term.register(producer);
        await term.start();
        stdin.write('producer | csv\n');
        await waitForOutput(chunks, (s) => s.includes('Alice'));
        const output = chunks.join('');
        expect(output).toBe('name,age\nAlice,30\nBob,\n');
    });

    it('quotes cells containing commas, quotes, and newlines', async () => {
        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ note: 'a,b', q: 'say "hi"', nl: 'line1\nline2' });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        term.register(producer);
        await term.start();
        stdin.write('producer | csv\n');
        await waitForOutput(chunks, (s) => s.includes('a,b'));
        const output = chunks.join('');
        expect(output).toContain('"a,b"');
        expect(output).toContain('"say ""hi"""');
        expect(output).toContain('"line1\nline2"');
    });

    it('JSON-stringifies nested object and array cells', async () => {
        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ meta: { x: 1 }, list: [1, 2] });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        term.register(producer);
        await term.start();
        stdin.write('producer | csv\n');
        await waitForOutput(chunks, (s) => s.includes('meta'));
        const output = chunks.join('');
        expect(output).toContain('"{""x"":1}"');
        expect(output).toContain('"[1,2]"');
    });

    it('writes nothing for empty input', async () => {
        await term.start();
        stdin.write('csv\n');
        await new Promise((r) => setTimeout(r, 100));
        expect(chunks.join('').trim()).toBe('');
    });

    it('writes nothing when rows have no keys', async () => {
        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({});
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        term.register(producer);
        await term.start();
        stdin.write('producer | csv\n');
        await new Promise((r) => setTimeout(r, 100));
        expect(chunks.join('').trim()).toBe('');
    });
});
