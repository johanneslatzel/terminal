import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { readRawTerminal } from '../../src/hidden-input.js';
import { CTRL_C, CTRL_W, KEY_BS } from '../../src/keys.js';

function makeTtyStreams(): { input: any; output: any } {
    const input = Object.assign(new PassThrough(), {
        isTTY: true,
        isRaw: false,
        setRawMode: () => {}
    });
    const output = new PassThrough();
    return { input, output };
}

describe('readRawTerminal', () => {
    it('returns typed string with mask echo', async () => {
        const { input, output } = makeTtyStreams();
        const outputChunks: string[] = [];
        output.on('data', (chunk: Buffer) => outputChunks.push(chunk.toString()));

        const promise = readRawTerminal(input, output, 'password: ');
        input.write('hello\n');
        const result = await promise;

        expect(result).toBe('hello');
        expect(outputChunks.join('')).toContain('password: ');
        expect(outputChunks.join('')).toContain('*****');
    });

    it('returns empty string on empty input', async () => {
        const { input, output } = makeTtyStreams();
        output.on('data', () => {});

        const promise = readRawTerminal(input, output, 'p: ');
        input.write('\n');
        const result = await promise;

        expect(result).toBe('');
    });

    it('returns empty string on Ctrl+C', async () => {
        const { input, output } = makeTtyStreams();
        const outputChunks: string[] = [];
        output.on('data', (chunk: Buffer) => outputChunks.push(chunk.toString()));

        const promise = readRawTerminal(input, output, 'p: ');
        input.write(CTRL_C);
        const result = await promise;

        expect(result).toBe('');
        expect(outputChunks.join('')).toContain('^C');
    });

    it('handles backspace correctly', async () => {
        const { input, output } = makeTtyStreams();
        output.on('data', () => {});

        const promise = readRawTerminal(input, output, 'p: ');
        input.write('ab' + KEY_BS + 'c\n');
        const result = await promise;

        expect(result).toBe('ac');
    });

    it('backspace at empty input is no-op', async () => {
        const { input, output } = makeTtyStreams();
        output.on('data', () => {});

        const promise = readRawTerminal(input, output, 'p: ');
        input.write(KEY_BS + '\n');
        const result = await promise;

        expect(result).toBe('');
    });

    it('mask: "" produces no echo', async () => {
        const { input, output } = makeTtyStreams();
        const outputChunks: string[] = [];
        output.on('data', (chunk: Buffer) => outputChunks.push(chunk.toString()));

        const promise = readRawTerminal(input, output, 'p: ', '');
        input.write('secret\n');
        const result = await promise;

        expect(result).toBe('secret');
        expect(outputChunks.join('')).not.toContain('*');
    });

    it('custom mask character', async () => {
        const { input, output } = makeTtyStreams();
        const outputChunks: string[] = [];
        output.on('data', (chunk: Buffer) => outputChunks.push(chunk.toString()));

        const promise = readRawTerminal(input, output, 'token: ', '#');
        input.write('abc\n');
        const result = await promise;

        expect(result).toBe('abc');
        expect(outputChunks.join('')).toContain('###');
    });

    it('skips control characters', async () => {
        const { input, output } = makeTtyStreams();
        output.on('data', () => {});

        const promise = readRawTerminal(input, output, 'p: ');
        input.write(Buffer.from([0x01, 0x02, 0x61, 0x0a]));
        const result = await promise;

        expect(result).toBe('a');
    });

    it('Ctrl+W deletes last word', async () => {
        const { input, output } = makeTtyStreams();
        output.on('data', () => {});

        const promise = readRawTerminal(input, output, 'p: ');
        input.write('game list' + CTRL_W + '\n');
        const result = await promise;

        expect(result).toBe('game ');
    });

    it('Ctrl+W skips trailing whitespace before deleting word', async () => {
        const { input, output } = makeTtyStreams();
        output.on('data', () => {});

        const promise = readRawTerminal(input, output, 'p: ');
        input.write('game list  ' + CTRL_W + '\n');
        const result = await promise;

        expect(result).toBe('game ');
    });

    it('Ctrl+W at start of input is no-op', async () => {
        const { input, output } = makeTtyStreams();
        output.on('data', () => {});

        const promise = readRawTerminal(input, output, 'p: ');
        input.write(CTRL_W + '\n');
        const result = await promise;

        expect(result).toBe('');
    });

    it('Ctrl+W with multiple words deletes last word only', async () => {
        const { input, output } = makeTtyStreams();
        output.on('data', () => {});

        const promise = readRawTerminal(input, output, 'p: ');
        input.write('a b c' + CTRL_W + '\n');
        const result = await promise;

        expect(result).toBe('a b ');
    });

    it('uses default false for isRaw when undefined', async () => {
        const input = Object.assign(new PassThrough(), {
            isTTY: true,
            setRawMode: () => {}
        });
        const output = new PassThrough();
        output.on('data', () => {});

        const promise = readRawTerminal(input as any, output as any, 'p: ');
        input.write('hello\n');
        const result = await promise;

        expect(result).toBe('hello');
    });
});
