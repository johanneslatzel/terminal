import * as readline from 'node:readline';
import { StringDecoder } from 'node:string_decoder';

type ReadlineWithStreams = readline.Interface & {
    input: NodeJS.ReadStream;
    output: NodeJS.WriteStream;
};

/**
 * Temporarily suspend a readline interface to take over the input stream
 * in raw mode.  Save active `'data'` listeners, pause the readline,
 * and remove all listeners so hidden input can be read directly.
 *
 * Restore everything by calling the returned {@link suspendReadline#resume} function
 * (which also calls `rl.prompt()` to redraw the prompt).
 *
 * @param rl - Active readline interface whose input/output streams to borrow.
 * @returns `input` and `output` streams for raw reading, plus a
 *   `resume` function that restores readline to its previous state.
 */
export function suspendReadline(rl: readline.Interface): {
    input: NodeJS.ReadStream;
    output: NodeJS.WriteStream;
    resume: () => void;
} {
    const { input, output } = rl as unknown as ReadlineWithStreams;
    const dataListeners = input.rawListeners('data') as ((...args: unknown[]) => void)[];
    rl.pause();
    input.removeAllListeners('data');
    return {
        input,
        output,
        resume: () => {
            for (const listener of dataListeners) input.on('data', listener);
            rl.resume();
            rl.prompt();
        }
    };
}

/**
 * Read a single line of input from a raw-mode terminal.
 *
 * Writes the prompt, enables raw mode, reads characters one at a time,
 * echoes a configurable mask for each printable keystroke, and handles
 * Enter, Backspace, Ctrl+C, and control-character filtering.
 *
 * @param input  - Terminal input stream (must support `setRawMode`).
 * @param output - Terminal output stream (for prompt and mask echo).
 * @param prompt - Text to display before reading.
 * @param mask   - Character echoed per keystroke (default `'*'`).
 *                 Pass `''` for no echo at all.
 * @returns The accumulated input text.  Empty string on Ctrl+C.
 */
export async function readRawTerminal(
    input: NodeJS.ReadStream,
    output: NodeJS.WriteStream,
    prompt: string,
    mask: string = '*'
): Promise<string> {
    output.write(prompt);

    const wasRaw = (input as any).isRaw ?? false;
    (input as any).setRawMode(true);
    input.resume();

    const decoder = new StringDecoder();
    const buf: string[] = [];

    return new Promise<string>((resolve) => {
        const onData = (chunk: Buffer) => {
            const text = decoder.write(chunk);

            for (const char of text) {
                if (char === '\r' || char === '\n') {
                    finish(buf.join(''));
                    return;
                }

                if (char === '\x03') {
                    output.write('^C\n');
                    finish('');
                    return;
                }

                if (char === '\x7f' || char === '\b') {
                    if (buf.length > 0) {
                        buf.pop();
                        output.write('\b \b');
                    }
                    continue;
                }

                if (char.charCodeAt(0) < 32) continue;

                buf.push(char);
                if (mask) output.write(mask);
            }
        };

        const finish = (result: string) => {
            input.removeListener('data', onData);
            (input as any).setRawMode(wasRaw);
            input.pause();
            output.write('\n');
            resolve(result);
        };

        input.on('data', onData);
    });
}
