import * as readline from 'node:readline';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { Transform } from 'node:stream';
import { Mutex } from 'async-mutex';
import { Command, type CommandContext, type TerminalOptions } from './types.js';
import { CommandTree } from './command-tree.js';
import { tokenize } from './input/parser.js';
import { parseFlags } from './input/args-parser.js';
import { CommandArguments } from './command-arguments.js';
import { Completer } from './completion/completer.js';
import { CommandNotFoundError, InterruptedError } from './errors.js';
import { HelpCommand } from './commands/help.js';
import { ExitCommand } from './commands/exit.js';
import { ClearCommand } from './commands/clear.js';
import { Hook } from './hook.js';
import { TerminalHookBuilder } from './terminal-hook-builder.js';
import { InputManager } from './input-manager.js';
import { CTRL_BACKSPACE, CTRL_W } from './keys.js';
import {
    TypedHook,
    BeforeParseHook,
    AfterParseHook,
    BeforeExecuteHook,
    AfterExecuteHook,
    BeforeExitHook,
    OnStartHook,
    OnStopHook,
    OnErrorHook
} from './hooks.js';

/**
 * Interactive terminal/shell that reads input, resolves commands, and
 * dispatches execution through the lifecycle-hook pipeline.
 *
 * Create one, {@link register} commands, then call {@link start}.
 *
 * @example
 * ```ts
 * const term = new Terminal({ prompt: '> ' });
 * term.register(new MyCommand());
 * await term.start();
 * ```
 */
export class Terminal {
    private rl: readline.Interface | null = null;
    private tree: CommandTree;
    private _beforeParseHooks: BeforeParseHook[] = [];
    private _afterParseHooks: AfterParseHook[] = [];
    private _beforeExecuteHooks: BeforeExecuteHook[] = [];
    private _afterExecuteHooks: AfterExecuteHook[] = [];
    private _beforeExitHooks: BeforeExitHook[] = [];
    private _onStartHooks: OnStartHook[] = [];
    private _onStopHooks: OnStopHook[] = [];
    private _onErrorHooks: OnErrorHook[] = [];
    private _history: string[] = [];
    private mutex = new Mutex();
    private running = false;
    private inputManager: InputManager;
    private inputFilter: Transform | null = null;
    private static readonly DEFAULT_OPTIONS = {
        prompt: '> ',
        stdin: process.stdin,
        stdout: process.stdout,
        historySize: 100,
        dropInflightKeystrokes: false
    };

    private options: TerminalOptions & {
        prompt: string;
        stdin: NodeJS.ReadStream;
        stdout: NodeJS.WriteStream;
        historySize: number;
        dropInflightKeystrokes: boolean;
    };
    private ctx: CommandContext;
    private ctxState: Record<string, unknown> = {};

    /**
     * @param options - Prompt, I/O streams, history size, etc.
     *                  Defaults to stdin/stdout with prompt `"> "`.
     */
    constructor(options?: TerminalOptions) {
        this.options = { ...Terminal.DEFAULT_OPTIONS, ...options };
        this.tree = new CommandTree();
        this.inputManager = new InputManager(
            this.options.stdin,
            this.options.stdout,
            (line) => this.handleLine(line),
            () => {
                if (this.running) void this.stop();
            }
        );
        this.ctx = this.createContext();
        this.registerBuiltins();
    }

    private createContext(): CommandContext {
        return {
            terminal: this,
            stdout: this.options.stdout,
            stdin: this.options.stdin,
            state: this.ctxState,
            logger: console,
            exit: () => {
                void this.stop();
            }
        };
    }

    private registerBuiltins(): void {
        this.register(new HelpCommand());
        this.register(new ExitCommand());
        this.register(new ClearCommand());
    }

    /**
     * Register a command at the root level.
     */
    register(command: Command): void {
        this.tree.add(command);
    }

    /**
     * Create a hook builder to register lifecycle callbacks.
     *
     * @example
     * ```
     * const h = term.hook()
     *     .beforeExecute()
     *     .do((command) => console.log(command.name()));
     * // later: h.dispose();
     * ```
     */
    hook(): TerminalHookBuilder {
        return new TerminalHookBuilder({
            beforeParse: (fn) => this._addHook(this._beforeParseHooks, fn),
            afterParse: (fn) => this._addHook(this._afterParseHooks, fn),
            beforeExecute: (fn) => this._addHook(this._beforeExecuteHooks, fn),
            afterExecute: (fn) => this._addHook(this._afterExecuteHooks, fn),
            beforeExit: (fn) => this._addHook(this._beforeExitHooks, fn),
            onStart: (fn) => this._addHook(this._onStartHooks, fn),
            onStop: (fn) => this._addHook(this._onStopHooks, fn),
            onError: (fn) => this._addHook(this._onErrorHooks, fn)
        });
    }

    private _addHook<TArgs extends any[], TReturn>(
        arr: TypedHook<TArgs, TReturn>[],
        fn: (...args: TArgs) => TReturn
    ): Hook {
        let hook: TypedHook<TArgs, TReturn>;
        hook = new TypedHook(fn, () => {
            const idx = arr.indexOf(hook);
            arr.splice(idx, 1);
        });
        arr.push(hook);
        return hook;
    }

    /** Returns all root-level registered commands. */
    getRootCommands(): Command[] {
        return this.tree.getRoots();
    }

    /**
     * Set the prompt string. Takes effect immediately on the running
     * terminal and persists across {@link start}/{@link stop} cycles.
     */
    setPrompt(prompt: string): void {
        this.options.prompt = prompt;
        this.inputManager?.setPrompt(prompt);
    }

    /**
     * Read a single line of hidden input (no echo).
     *
     * Temporarily takes over stdin in raw mode, reads character-by-character,
     * echoes `mask` per keystroke, then restores the readline interface and
     * calls `rl.prompt()`.
     *
     * Falls back to a visible {@link readline.Interface.question} call when
     * stdin is not a TTY.
     *
     * @param prompt - Text displayed before reading input.
     * @param mask   - Character echoed per keystroke (default `'*'`).
     *                 Pass `''` for no echo at all.
     * @returns The accumulated input.  Empty string on Ctrl+C.
     * @throws {Error} If the terminal has not been started (no readline).
     */
    async questionHidden(prompt: string, mask: string = '*'): Promise<string> {
        if (!this.inputManager.getReadline()) {
            throw new Error('Terminal not started');
        }
        return this.inputManager.acceptSecret(prompt, mask);
    }

    /**
     * Read the history file (JSON array of strings), deduplicate (keep the
     * most recent occurrence of each entry), trim to `historySize`, and store
     * the result internally so the next {@link start} call will pass it to
     * Node's readline interface.
     *
     * Returns the parsed (deduplicated, trimmed) array. Safe to call before
     * `start()` — has no effect if called afterwards.
     */
    async loadHistory(): Promise<string[]> {
        const historyPath = this.options.historyPath;
        if (!historyPath) {
            this._history = [];
            return [];
        }
        try {
            const raw = await readFile(historyPath, 'utf-8');
            const parsed: unknown = JSON.parse(raw);
            if (!Array.isArray(parsed)) {
                this._history = [];
                return [];
            }

            // Deduplicate: iterate newest-first, keep first occurrence
            const seen = new Set<string>();
            const deduped: string[] = [];
            for (let i = parsed.length - 1; i >= 0; i--) {
                const item = String(parsed[i]);
                if (!seen.has(item)) {
                    seen.add(item);
                    deduped.push(item);
                }
            }
            deduped.reverse(); // back to oldest-first order

            const trimmed = deduped.slice(-this.options.historySize);
            this._history = trimmed;
            return trimmed;
        } catch {
            this._history = [];
            return [];
        }
    }

    /**
     * Write the current readline history (`rl.history`) to the history file
     * as a JSON array, trimmed to `historySize`. No-op if the terminal
     * hasn't been started yet (no `rl`).
     */
    async saveHistory(): Promise<void> {
        const historyPath = this.options.historyPath;
        if (!historyPath) return;
        if (this._history.length === 0) return;
        const trimmed = this._history.slice(-this.options.historySize);
        try {
            await mkdir(dirname(historyPath), { recursive: true });
            await writeFile(historyPath, JSON.stringify(trimmed, null, 2) + '\n', 'utf-8');
        } catch {
            // Silently ignore — file-write errors should not crash the
            // terminal.
        }
    }

    /**
     * Start the terminal loop. Idempotent — safe to call multiple times.
     */
    async start(): Promise<void> {
        if (this.running) return;
        this.running = true;

        this.rl = this.createReadline();
        this.inputManager.start(this.rl);

        for (const hook of this._onStartHooks) {
            await hook.exec();
        }
        this.inputManager.prompt();
    }

    private createReadline(): readline.Interface {
        const completer = new Completer(this.tree);

        let input: NodeJS.ReadStream = this.options.stdin;

        if (this.options.stdin.isTTY) {
            /**
             * Byte-level filter that sits between stdin and readline.
             *
             * Many terminals send 0x08 (Ctrl+H) when the user presses
             * Ctrl+Backspace.  Readline maps that to `deleteCharBackword`,
             * which only removes a single character.  To get proper
             * word-level deletion we remap 0x08 to 0x17 (Ctrl+W), which
             * readline handles as `unix-word-rubout`.
             */
            this.inputFilter = new Transform({
                transform(chunk: Buffer, _encoding: BufferEncoding, callback) {
                    const filtered = Buffer.alloc(chunk.length);
                    for (let i = 0; i < chunk.length; i++) {
                        const byte = chunk[i]!;
                        filtered[i] = byte === CTRL_BACKSPACE ? CTRL_W.charCodeAt(0) : byte;
                    }
                    callback(null, filtered);
                }
            });
            this.options.stdin.pipe(this.inputFilter, { end: false });
            input = this.inputFilter as unknown as NodeJS.ReadStream;
        }

        const rlOptions: readline.ReadLineOptions = {
            input,
            output: this.options.stdout,
            prompt: this.options.prompt,
            historySize: this.options.historySize,
            completer: (line: string) => {
                const { matches, partial } = completer.complete(line);
                return [matches, partial] as [string[], string];
            },
            terminal: this.options.stdin.isTTY
        };

        if (this._history.length > 0) {
            rlOptions.history = [...this._history];
            rlOptions.removeHistoryDuplicates = true;
        }

        return readline.createInterface(rlOptions);
    }

    /**
     * Stop the terminal loop. Closes the readline interface.
     */
    async stop(): Promise<void> {
        if (!this.running) return;
        this.running = false;
        for (const hook of this._beforeExitHooks) {
            await hook.exec();
        }
        this.inputManager.stop();
        if (this.inputFilter) {
            this.options.stdin.unpipe(this.inputFilter);
            this.inputFilter.destroy();
            this.inputFilter = null;
        }
        this.rl = null;
        for (const hook of this._onStopHooks) {
            await hook.exec();
        }
    }

    /**
     * Process a single line of input: tokenize, resolve the command tree,
     * execute, and persist the input to history (in the `finally` block
     * so it runs regardless of success or failure).
     *
     * History notes:
     * - Skips empty lines and consecutive duplicates (same as the last entry).
     * - If the input already exists earlier in the array, the old occurrence
     *   is removed so the most recent use moves to the end (MRU ordering).
     * - Trims to `historySize` after insertion.
     *
     * This is the only place `_history` gets new entries at runtime.
     *
     * Concurrency is serialised by an async mutex.  When
     * `dropInflightKeystrokes` is enabled, the InputManager switches to drop
     * mode at the start of execution so that any keystrokes arriving while the
     * command runs are silently discarded.
     */
    private async handleLine(input: string): Promise<void> {
        await this.mutex.runExclusive(async () => {
            if (this.options.dropInflightKeystrokes) {
                this.inputManager.drop();
            }

            try {
                const tokens = await this.processInput(input);
                if (tokens.length === 0) {
                    this.inputManager.prompt();
                    return;
                }

                const resolved = this.resolveCommand(tokens);
                const record = parseFlags(resolved.args, resolved.command.definitions());
                const args = new CommandArguments(
                    record,
                    this.inputManager,
                    resolved.command.definitions()
                );
                await this.executeWithHooks(resolved.command, args);
            } catch (error) {
                await this.handleError(error);
            } finally {
                if (input.length > 0 && input !== this._history.at(-1)) {
                    const idx = this._history.indexOf(input);
                    if (idx !== -1) this._history.splice(idx, 1);
                    this._history.push(input);
                    if (this._history.length > this.options.historySize) {
                        this._history = this._history.slice(-this.options.historySize);
                    }
                }
                if (this.running) {
                    this.inputManager.restoreCommandMode();
                    this.inputManager.prompt();
                }
            }
        });
    }

    private async processInput(input: string): Promise<string[]> {
        let processed = input;
        for (const hook of this._beforeParseHooks) {
            processed = await hook.exec(processed);
        }

        const tokens = tokenize(processed);

        let finalTokens = tokens;
        for (const hook of this._afterParseHooks) {
            finalTokens = await hook.exec(finalTokens);
        }

        return finalTokens;
    }

    private resolveCommand(tokens: string[]): { command: Command; args: string[] } {
        const resolved = this.tree.find(tokens);
        if (!resolved) {
            const suggestions = this.tree.findSuggestions(tokens[0]!);
            const msg =
                suggestions.length > 0
                    ? `Unknown command: ${tokens[0]}. Did you mean: ${suggestions.join(', ')}?`
                    : `Unknown command: ${tokens[0]}`;
            throw new CommandNotFoundError(msg, suggestions);
        }
        return resolved;
    }

    private async executeWithHooks(command: Command, args: CommandArguments): Promise<void> {
        for (const hook of this._beforeExecuteHooks) {
            if ((await hook.exec(command, this.ctx, args)) === false) return;
        }

        const result = await command.execute(this.ctx, args);

        for (const hook of this._afterExecuteHooks) {
            await hook.exec(result);
        }
    }

    private async handleError(error: unknown): Promise<void> {
        if (error instanceof InterruptedError) {
            return;
        }

        for (const hook of this._onErrorHooks) {
            try {
                if ((await hook.exec(error as Error)) === true) return;
            } catch (hookError) {
                this.options.stdout.write(
                    `Error in onError hook: ${(hookError as Error).message}\n`
                );
            }
        }

        if (error instanceof CommandNotFoundError) {
            this.options.stdout.write(`${error.message}\n`);
        } else if (error instanceof Error) {
            this.options.stdout.write(`Error: ${error.message}\n`);
        } else {
            this.options.stdout.write(`Error: ${String(error)}\n`);
        }
    }
}
