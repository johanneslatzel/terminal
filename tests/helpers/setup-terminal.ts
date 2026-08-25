import { PassThrough } from 'node:stream';
import { Terminal } from '../../src/terminal.js';
import type { TerminalOptions } from '../../src/types.js';

export interface TestTerminalSetup {
    stdin: PassThrough;
    stdout: PassThrough;
    chunks: string[];
    term: Terminal;
    stop: () => Promise<void>;
}

/**
 * Create a Terminal wired to fresh PassThrough streams, with all stdout
 * output collected into `chunks`. Extra options (e.g. `shortcutPath`,
 * `historyPath`) are merged over the test defaults. `stop` tears the
 * terminal down and is meant to be passed straight to an `afterEach` hook.
 */
export function setupTerminal(options: Partial<TerminalOptions> = {}): TestTerminalSetup {
    const stdin = new PassThrough();
    const stdout = new PassThrough();
    const chunks: string[] = [];
    stdout.on('data', (chunk: Buffer) => chunks.push(chunk.toString()));
    const term = new Terminal({
        prompt: '',
        stdin: stdin as unknown as NodeJS.ReadStream,
        stdout: stdout as unknown as NodeJS.WriteStream,
        ...options
    });
    return { stdin, stdout, chunks, term, stop: () => term.stop() };
}
