import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Terminal } from '../../../src/terminal.js';

describe('Terminal.historyEntries', () => {
    let tmpDir: string;

    function makeTerm(historyPath?: string): Terminal {
        return new Terminal({
            stdin: new PassThrough() as unknown as NodeJS.ReadStream,
            stdout: new PassThrough() as unknown as NodeJS.WriteStream,
            prompt: '',
            ...(historyPath !== undefined ? { historyPath } : {})
        });
    }

    it('is exposed before start and returns the loaded entries', async () => {
        tmpDir = mkdtempSync(join(tmpdir(), 'repltree-history-entries-'));
        try {
            const filePath = join(tmpDir, 'history.json');
            writeFileSync(filePath, JSON.stringify(['help', 'clear']), 'utf-8');
            const term = makeTerm(filePath);

            await term.loadHistory();

            expect(term.historyEntries).toEqual(['help', 'clear']);
        } finally {
            rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('returns a copy — mutating the result does not affect the store', async () => {
        const term = makeTerm();
        await term.loadHistory();

        term.historyEntries.push('mutated');

        expect(term.historyEntries).toEqual([]);
    });
});
