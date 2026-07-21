import { StringDecoder } from 'node:string_decoder';
import { CTRL_C, CTRL_W, KEY_DEL, KEY_BS } from './keys.js';

/**
 * Read a single line of input from a raw-mode terminal.
 *
 * Writes the prompt, enables raw mode, reads characters one at a time,
 * echoes a configurable mask for each printable keystroke, and handles
 * Enter, Backspace, Ctrl+W (delete word), Ctrl+C, and control-character filtering.
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

                // Ctrl+C – abort input, return empty string.
                if (char === CTRL_C) {
                    output.write('^C\n');
                    finish('');
                    return;
                }

                // Backspace (DEL / BS) – remove the last character.
                if (char === KEY_DEL || char === KEY_BS) {
                    if (buf.length > 0) {
                        buf.pop();
                        output.write('\b \b');
                    }
                    continue;
                }

                // Ctrl+W – delete the previous word.  Skip trailing
                // whitespace, then remove characters until the next
                // whitespace boundary, erasing the mask echo for each.
                if (char === CTRL_W) {
                    let removed = 0;
                    while (buf.length > 0 && buf[buf.length - 1] === ' ') {
                        buf.pop();
                        removed++;
                    }
                    while (buf.length > 0 && buf[buf.length - 1] !== ' ') {
                        buf.pop();
                        removed++;
                    }
                    for (let i = 0; i < removed; i++) output.write('\b \b');
                    continue;
                }

                // Ignore any other control characters (< 0x20).
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
