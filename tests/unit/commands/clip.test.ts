import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { PassThrough } from 'node:stream';
import { Terminal } from '../../../src/terminal.js';
import { command } from '../../../src/command-factory.js';
import { PipelineInputAcceptance } from '../../../src/types.js';
import { setupTerminal } from '../../helpers/setup-terminal.js';
import { waitForOutput } from '../../helpers/wait-for-output.js';

vi.mock('node:child_process', () => {
    const mockSpawn = vi.fn();
    return { spawn: mockSpawn };
});
describe('clip command', () => {
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

    it('copies pipeline objects to clipboard as JSON', async () => {
        const mockStdin = { write: vi.fn(), end: vi.fn() };
        const mockProc = {
            stdin: mockStdin,
            on: vi.fn((_event: string, handler: (...args: number[]) => void) => {
                if (_event === 'close') setTimeout(() => handler(0), 0);
            })
        };
        spawnMock.mockReturnValue(mockProc);

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ id: 1, name: 'test' });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        term.register(producer);
        await term.start();

        stdin.write('producer | clip\n');
        await waitForOutput(chunks, (s) => s.includes('Copied'));
        expect(chunks.join('')).toContain('Copied 1 object(s) to clipboard');
        expect(mockStdin.write).toHaveBeenCalledWith('[{"id":1,"name":"test"}]');
        expect(mockStdin.end).toHaveBeenCalled();
    });

    it('handles clipboard tool errors gracefully', async () => {
        const mockProc = {
            stdin: { write: vi.fn(), end: vi.fn() },
            on: vi.fn((_event: string, handler: (...args: number[]) => void) => {
                if (_event === 'close') setTimeout(() => handler(1), 0);
            })
        };
        spawnMock.mockReturnValue(mockProc);

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ x: 1 });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        term.register(producer);
        await term.start();

        stdin.write('producer | clip\n');
        await waitForOutput(chunks, (s) => s.includes('error'));
        expect(chunks.join('')).toContain('Clipboard error');
    });

    it('handles spawn error events by retrying next tool', async () => {
        const mockProc = {
            stdin: { write: vi.fn(), end: vi.fn() },
            on: vi.fn((_event: string, handler: (...args: any[]) => void) => {
                if (_event === 'error') {
                    setTimeout(() => handler(), 0);
                }
            })
        };
        spawnMock.mockReturnValue(mockProc);

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ x: 1 });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        term.register(producer);
        await term.start();

        stdin.write('producer | clip\n');
        await waitForOutput(chunks, (s) => s.includes('error'));
        expect(chunks.join('')).toContain('Clipboard error');
    });

    it('shows message when pipeline has no objects', async () => {
        const producer = command('producer', async (_ctx) => {},
            { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        term.register(producer);
        await term.start();

        stdin.write('producer | clip\n');
        await new Promise((r) => setTimeout(r, 100));
        expect(chunks.join('')).toContain('No pipeline input');
    });

    it('shows message when used as standalone command', async () => {
        await term.start();
        stdin.write('clip\n');
        await new Promise((r) => setTimeout(r, 100));
        expect(chunks.join('')).toContain('No pipeline input');
    });
});

describe('clip command (all tools exhausted)', () => {
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

    it('reports when all clipboard tools fail', async () => {
        let callCount = 0;
        spawnMock.mockImplementation(() => {
            callCount++;
            const mockProc = {
                stdin: { write: vi.fn(), end: vi.fn() },
                on: vi.fn((_event: string, handler: (...args: any[]) => void) => {
                    if (_event === 'close') setTimeout(() => handler(1), 0);
                })
            };
            return mockProc;
        });

        const producer = command('producer', async (ctx) => {
            ctx.output!.submit({ x: 1 });
        }, { acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true });

        term.register(producer);
        await term.start();

        stdin.write('producer | clip\n');
        await new Promise((r) => setTimeout(r, 200));
        expect(callCount).toBe(4);
        const output = chunks.join('');
        expect(output).toContain('Clipboard error');
        expect(output).toContain('Install pbcopy, xclip, xsel, or clip.');
    });
});

