import * as readline from 'node:readline';
import { Command, CommandContainer, type CommandContext, type TerminalOptions } from './types.js';
import { CommandTree } from './command-tree.js';
import { tokenize } from './input/parser.js';
import { parseFlags } from './input/args-parser.js';
import { CommandArguments } from './command-arguments.js';
import { Completer } from './completion/completer.js';
import { CommandNotFoundError } from './errors.js';
import { HelpCommand } from './commands/help.js';
import { ExitCommand } from './commands/exit.js';
import { ClearCommand } from './commands/clear.js';
import { Hook } from './hook.js';
import { TerminalHookBuilder } from './terminal-hook-builder.js';
import {
    TypedHook,
    BeforeParseHook,
    AfterParseHook,
    BeforeExecuteHook,
    AfterExecuteHook,
    BeforeExitHook,
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
    private _onErrorHooks: OnErrorHook[] = [];
    private running = false;
    private static readonly DEFAULT_OPTIONS: Required<TerminalOptions> = {
        prompt: '> ',
        stdin: process.stdin,
        stdout: process.stdout,
        historySize: 100
    };

    private options: Required<TerminalOptions>;
    private ctx: CommandContext;
    private ctxState: Record<string, unknown> = {};

    /**
     * @param options - Prompt, I/O streams, history size, etc.
     *                  Defaults to stdin/stdout with prompt `"> "`.
     */
    constructor(options?: TerminalOptions) {
        this.options = { ...Terminal.DEFAULT_OPTIONS, ...options };
        this.tree = new CommandTree();
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
     * Register a command at the root level or as a subcommand of a
     * parent container specified by a dot-separated path.
     *
     * @param command    - The command to register.
     * @param parentPath - Optional dot-separated path to a parent
     *                     container (e.g. `"config.set"`). All
     *                     intermediate containers must already exist.
     * @throws When the parent path does not resolve to a container.
     *
     * @example
     * ```
     * term.register(cmd)                  // root level
     * term.register(cmd, 'config')         // under root "config"
     * term.register(cmd, 'config.set')     // under config > set
     * ```
     */
    register(command: Command, parentPath?: string): void {
        if (!parentPath) {
            this.tree.add(command);
            return;
        }

        const segments = parentPath.split('.');
        let container: CommandContainer = this.tree;
        let level: Command[] = this.tree.commands();

        for (const seg of segments) {
            const parent = level.find((c) => c.name() === seg);
            if (!parent || !(parent instanceof CommandContainer)) {
                throw new Error(
                    `Cannot register "${command.name()}": parent path "${parentPath}" does not resolve to a container at segment "${seg}"`
                );
            }
            container = parent;
            level = parent.commands();
        }

        container.add(command);
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
     * Start the terminal loop. Idempotent — safe to call multiple times.
     */
    async start(): Promise<void> {
        if (this.running) return;
        this.running = true;

        this.rl = this.createReadline();
        this.bindEvents(this.rl);
        this.rl.prompt();
    }

    private createReadline(): readline.Interface {
        const completer = new Completer(this.tree);

        return readline.createInterface({
            input: this.options.stdin,
            output: this.options.stdout,
            prompt: this.options.prompt,
            historySize: this.options.historySize,
            completer: (line: string) => {
                const { matches, partial } = completer.complete(line);
                return [matches, partial] as [string[], string];
            },
            terminal: this.options.stdin.isTTY
        });
    }

    private bindEvents(rl: readline.Interface): void {
        rl.on('line', (line: string) => {
            void this.handleLine(line);
        });

        rl.on('SIGINT', () => {
            this.options.stdout.write('^C\n');
            rl.prompt();
        });

        rl.on('close', () => {
            if (this.running) {
                this.options.stdout.write('\n');
                void this.stop();
            }
        });

        rl.on('error', (err: Error) => {
            this.options.stdout.write(`Readline error: ${err.message}\n`);
        });
    }

    /**
     * Stop the terminal loop. Closes the readline interface.
     */
    async stop(): Promise<void> {
        if (this.running) {
            for (const hook of this._beforeExitHooks) {
                await hook.exec();
            }
        }
        this.running = false;
        this.rl?.close();
        this.rl = null;
        this.options.stdin.pause();
    }

    private async handleLine(input: string): Promise<void> {
        try {
            const tokens = await this.processInput(input);
            if (tokens.length === 0) {
                this.rl?.prompt();
                return;
            }

            const resolved = this.resolveCommand(tokens);
            const record = parseFlags(resolved.args, resolved.command.definitions());
            const args = new CommandArguments(record, this.rl, resolved.command.definitions());
            await this.executeWithHooks(resolved.command, args);
        } catch (error) {
            await this.handleError(error);
        } finally {
            if (this.running) {
                this.rl?.prompt();
            }
        }
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
