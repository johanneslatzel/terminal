import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { Terminal } from '../../../src/terminal.js';
import { command } from '../../../src/command-factory.js';
import { PipelineInputAcceptance } from '../../../src/types.js';
import { waitForOutput } from '../../helpers/wait-for-output.js';
describe('Pipeline validation errors', () => {
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

    it('Errors when left command does not provide pipeline output', async () => {
        const noOutput = command('nooutput', async () => {});
        const consumer = command('consumer', async () => {},
            { acceptsPipelineInput: PipelineInputAcceptance.Array });

        term.register(noOutput);
        term.register(consumer);
        await term.start();

        stdin.write('nooutput | consumer\n');
        await waitForOutput(chunks, (s) => s.includes('Error:'));
        expect(chunks.join('')).toContain('does not provide pipeline output');
    });

    it('Errors when right command does not accept pipeline input', async () => {
        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ x: 1 });
        }, { providesPipelineOutput: true });

        const noInput = command('noinput', async () => {});

        term.register(producer);
        term.register(noInput);
        await term.start();

        stdin.write('producer | noinput\n');
        await waitForOutput(chunks, (s) => s.includes('Error:'));
        expect(chunks.join('')).toContain('does not accept pipeline input');
    });

    it('Errors on empty pipeline segment (leading pipe)', async () => {
        await term.start();

        stdin.write('| cmd\n');
        await waitForOutput(chunks, (s) => s.includes('Error:'));
        expect(chunks.join('')).toContain('Empty pipeline segment');
    });

    it('Errors on trailing pipe', async () => {
        await term.start();

        stdin.write('cmd |\n');
        await waitForOutput(chunks, (s) => s.includes('Error:'));
        expect(chunks.join('')).toContain('Pipeline cannot end with');
    });
});
