import * as readline from 'node:readline';
import { readRawTerminal } from './hidden-input.js';
import { InterruptedError } from './errors.js';

export enum InputMode {
    Command = 'command',
    Drop = 'drop',
    Accept = 'accept'
}

/**
 * Manages the flow of terminal input between the REPL command loop and
 * interactive prompts (e.g. `require()` argument prompting).
 *
 * Sits between the readline interface and the rest of the system.
 * Routes lines based on the current {@link InputMode}:
 *
 * - **command**: lines forwarded to the `onCommand` callback (normal REPL)
 * - **drop**: lines silently discarded (echo suppressed on TTY)
 * - **accept**: lines forwarded to a one-shot callback (`acceptInput` /
 *   `acceptSecret`), echo restored
 *
 * @example
 * ```ts
 * const im = new InputManager(stdin, stdout, (line) => handleLine(line));
 * im.start(rl);
 * // later, inside a command:
 * const name = await im.acceptInput('name: ');
 * ```
 */
export class InputManager {
    private mode: InputMode = InputMode.Command;
    private rl: readline.Interface | null = null;
    private pendingResolve: ((line: string) => void) | null = null;
    private pendingReject: ((error: Error) => void) | null = null;
    private pendingOnClose: (() => void) | null = null;
    private previousMode: InputMode = InputMode.Command;
    private savedRawMode = false;
    private echo = true;

    constructor(
        private stdin: NodeJS.ReadStream,
        private stdout: NodeJS.WriteStream,
        private onCommand: (line: string) => void,
        private onClose?: () => void,
        private silentSigint = false
    ) {}

    /**
     * Attach to a readline interface and install the line-routing listener.
     */
    start(rl: readline.Interface): void {
        this.rl = rl;

        rl.on('line', (line: string) => {
            this.onLine(line);
        });

        rl.on('SIGINT', () => {
            readline.clearLine(this.stdout, -1);
            readline.cursorTo(this.stdout, 0);
            if (!this.silentSigint) {
                this.stdout.write('^C\n');
            }
            if (this.mode === InputMode.Accept && this.pendingResolve && this.pendingReject) {
                const reject = this.pendingReject;
                const restore = this.previousMode;
                this.pendingResolve = null;
                this.pendingReject = null;
                this.stdin.removeListener('end', this.pendingOnClose!);
                this.pendingOnClose = null;
                this.restoreMode(restore);
                reject(new InterruptedError());
                return;
            }
            rl.prompt();
        });

        rl.on('close', () => {
            this.stdout.write('\n');
            this.onClose?.();
        });

        rl.on('error', (err: Error) => {
            this.stdout.write(`Readline error: ${err.message}\n`);
        });
    }

    /**
     * Close the readline interface and reset state.
     */
    stop(): void {
        if (this.rl) {
            this.rl.close();
            this.rl = null;
        }
        this.stdin.pause();
        this.mode = InputMode.Command;
        this.pendingResolve = null;
        this.pendingReject = null;
        this.pendingOnClose = null;
    }

    /**
     * Redraw the prompt.
     */
    prompt(): void {
        this.rl?.prompt();
    }

    /**
     * Update the prompt string on the live readline interface.
     */
    setPrompt(prompt: string): void {
        this.rl?.setPrompt(prompt);
    }

    /**
     * Switch to **drop** mode: all incoming lines are silently discarded.
     * Echo is suppressed on TTY (raw mode + stdin pause).
     */
    drop(): void {
        this.mode = InputMode.Drop;
        this.pendingResolve = null;
        this.pendingReject = null;
        this.pendingOnClose = null;

        if (!this.rl) return;

        if (this.stdin.isTTY) {
            this.savedRawMode = (this.stdin as unknown as { isRaw: boolean }).isRaw ?? false;
            (this.stdin as unknown as { setRawMode(mode: boolean): void }).setRawMode(true);
        }
    }

    /**
     * Switch to **accept** mode: the next line of input resolves the
     * returned promise.  Echo is restored so the user can see what they type.
     *
     * @param prompt - Text to write before reading.
     * @param echo   - Whether to echo typed characters (default `true`).
     * @returns The line entered by the user (without trailing newline).
     */
    acceptInput(prompt: string, echo = true): Promise<string> {
        if (!this.rl) throw new Error('InputManager not started');

        const previousMode = this.mode;

        return new Promise<string>((resolve, reject) => {
            this.mode = InputMode.Accept;
            this.echo = echo;
            this.previousMode = previousMode;
            this.pendingReject = reject;

            if (this.stdin.isTTY && !echo) {
                (this.stdin as unknown as { setRawMode(mode: boolean): void }).setRawMode(true);
            }
            // Resume stdin so the stdin → filter → readline pipeline
            // can deliver data after a previous pause.
            if (this.stdin.isTTY) {
                this.stdin.resume();
            }
            this.rl!.resume();

            this.stdout.write(prompt);

            const cleanup = () => {
                this.restoreMode(previousMode);
            };

            const onResolve = (line: string) => {
                this.pendingResolve = null;
                this.pendingReject = null;
                cleanup();
                resolve(line);
            };
            this.pendingResolve = onResolve;

            const onClose = () => {
                this.pendingResolve = null;
                this.pendingReject = null;
                this.pendingOnClose = null;
                cleanup();
                reject(new Error('stdin closed'));
            };
            this.pendingOnClose = onClose;
            this.stdin.once('end', onClose);

            const originalResolve = onResolve;
            this.pendingResolve = (line: string) => {
                this.stdin.removeListener('end', onClose);
                this.pendingOnClose = null;
                originalResolve(line);
            };
        });
    }

    /**
     * Switch to **accept** mode for hidden input (no echo or mask echo).
     * On TTY, suspends readline and reads raw character-by-character.
     * Falls back to {@link acceptInput} with echo off on non-TTY.
     *
     * @param prompt - Text to write before reading.
     * @param mask   - Character echoed per keystroke (default `'*'`).
     *                 Pass `''` for no echo at all.
     * @returns The accumulated input. Empty string on Ctrl+C.
     */
    async acceptSecret(prompt: string, mask = '*'): Promise<string> {
        if (!this.stdin.isTTY) {
            try {
                return await this.acceptInput(prompt, false);
            } catch (e) {
                if (e instanceof InterruptedError) return '';
                throw e;
            }
        }
        if (!this.rl) throw new Error('InputManager not started');

        const previousMode = this.mode;
        this.mode = InputMode.Accept;

        const dataListeners = this.stdin.rawListeners('data') as ((...args: unknown[]) => void)[];
        this.rl.pause();
        this.stdin.removeAllListeners('data');

        return readRawTerminal(this.stdin, this.stdout, prompt, mask, this.silentSigint).finally(
            () => {
                for (const listener of dataListeners) this.stdin.on('data', listener);
                this.restoreMode(previousMode);
            }
        );
    }

    /**
     * Restore mode to **command** after a command finishes executing.
     * Undoes the effect of {@link drop} so the REPL can accept new input.
     *
     * Resumes both stdin and the readline interface.  This is necessary
     * because with the `stdin → filter → readline` pipe introduced for
     * Ctrl+Backspace handling, `rl.resume()` only resumes the filter
     * (readline's immediate input) — stdin at the source must be
     * resumed separately so data can flow through the entire pipeline.
     */
    restoreCommandMode(): void {
        this.mode = InputMode.Command;
        // With the stdin → filter → readline pipe, rl.resume() only
        // resumes the filter — stdin must be resumed at the source
        // so data can flow through the pipeline.
        if (this.stdin.isTTY) {
            this.stdin.resume();
        }
        if (this.rl) {
            this.rl.resume();
        }
    }

    /**
     * Set echo on or off without changing mode.
     */
    setEcho(on: boolean): void {
        this.echo = on;
        if (!this.rl || !this.stdin.isTTY) return;
        (this.stdin as unknown as { setRawMode(mode: boolean): void }).setRawMode(!on);
    }

    /** The underlying readline interface. */
    getReadline(): readline.Interface | null {
        return this.rl;
    }

    private onLine(line: string): void {
        switch (this.mode) {
            case InputMode.Command:
                this.onCommand(line);
                break;
            case InputMode.Accept:
                if (this.pendingResolve) {
                    const resolve = this.pendingResolve;
                    this.pendingResolve = null;
                    resolve(line);
                }
                break;
            case InputMode.Drop:
                break;
        }
    }

    private restoreMode(mode: InputMode): void {
        this.mode = mode;
        if (mode === InputMode.Drop) {
            if (this.stdin.isTTY) {
                (this.stdin as unknown as { setRawMode(mode: boolean): void }).setRawMode(true);
                // With the stdin → filter → readline pipe, rl.resume() only
                // resumes the filter — stdin must be resumed at the source
                // so data can flow through the pipeline.
                this.stdin.resume();
            }
        } else if (mode === InputMode.Command) {
            // readRawTerminal calls input.pause() when it finishes,
            // which stops the stdin → filter → readline pipeline at the
            // source.  Resume stdin so the REPL can accept keystrokes
            // again.
            if (this.stdin.isTTY) {
                this.stdin.resume();
            }
            if (this.rl) {
                this.rl.resume();
            }
        }
    }
}
