import type { Terminal } from './terminal.js';
import type { CommandArguments, CommandArgumentDefinition } from './command-arguments.js';
import { InvalidArgumentsError } from './errors.js';
import { validateAliases, validateArgDefAliases, OwnerType } from './validate-aliases.js';

/**
 * A leaf node in the command tree. Has no subcommand support.
 * Subclasses must implement {@link execute}.
 */
export abstract class Command {
    private _name: string;
    private _aliases: string[];
    private _description: string | undefined;
    private _definitions: CommandArgumentDefinition[];

    /**
     * @param name        - Command name used for matching input tokens.
     * @param description - Short description shown in help output.
     * @param argDefs     - Argument definitions for `--name value` pairs.
     * @param aliases     - Alternate names for this command.
     */
    constructor(
        name: string,
        description?: string,
        argDefs?: CommandArgumentDefinition[],
        aliases?: string[]
    ) {
        if (name.length === 0) {
            throw new InvalidArgumentsError('Command name cannot be empty');
        }
        if (/\s/.test(name)) {
            throw new InvalidArgumentsError(`Command name "${name}" must not contain whitespace`);
        }
        validateAliases(aliases, OwnerType.Command, name);
        this._name = name;
        this._aliases = aliases ?? [];
        this._description = description;
        this._definitions = argDefs ?? [];
        this._validatePositions(name);
        validateArgDefAliases(argDefs ?? [], name);
    }

    private _validatePositions(name: string): void {
        const positions = this._definitions
            .map((d) => d.position)
            .filter((p): p is number => p !== undefined);
        if (positions.length === 0) return;

        const seen = new Set<number>();
        for (const pos of positions) {
            if (seen.has(pos)) {
                throw new InvalidArgumentsError(
                    `Duplicate position index ${pos} in command "${name}"`
                );
            }
            seen.add(pos);
        }

        const sorted = [...positions].sort((a, b) => a - b);
        for (let i = 0; i < sorted.length; i++) {
            if (sorted[i] !== i) {
                throw new InvalidArgumentsError(
                    `Positional arguments must form a contiguous sequence starting at 0. ` +
                        `Expected position ${i}, got ${sorted[i]} in command "${name}"`
                );
            }
        }
    }

    /** Command name (used for matching input tokens). */
    name(): string {
        return this._name;
    }

    /** Alternate names for this command. */
    aliases(): string[] {
        return [...this._aliases];
    }

    /** Check if a token matches this command's name or any alias. */
    matches(token: string): boolean {
        return this._name === token || this._aliases.includes(token);
    }

    /** Shown in `help` output. */
    description(): string | undefined {
        return this._description;
    }

    /** Argument definitions for this command. */
    definitions(): CommandArgumentDefinition[] {
        return this._definitions;
    }

    /**
     * Execute the command.
     * @param ctx - Execution context with streams, state, and lifecycle access.
     * @param args - Parsed `--name value` pairs wrapped in an Args instance.
     */
    abstract execute(ctx: CommandContext, args: CommandArguments): void | Promise<void>;
}

/**
 * A command that acts as a namespace for subcommands.
 * Subcommands are registered via {@link add} and are used for
 * tree traversal and help output.
 *
 * The default {@link execute} implementation prints detailed help
 * for this container (description, arguments, subcommands).
 * Subclasses may override `execute` to provide custom behavior.
 */
export class CommandContainer extends Command {
    private _commands: Command[] = [];

    /** Register a child command. */
    add(command: Command): void {
        const newNames = [command.name(), ...command.aliases()];
        for (const existingCommand of this._commands) {
            const existingNames = [existingCommand.name(), ...existingCommand.aliases()];
            for (const newName of newNames) {
                if (existingNames.includes(newName)) {
                    throw new InvalidArgumentsError(
                        `Cannot add command "${command.name()}": identifier "${newName}" conflicts with existing command "${existingCommand.name()}"`
                    );
                }
            }
        }
        this._commands.push(command);
    }

    /** Returns all registered child commands. */
    commands(): Command[] {
        return this._commands;
    }

    async execute(ctx: CommandContext, _args: CommandArguments): Promise<void> {
        const { commandHelp } = await import('./commands/help.js');
        ctx.stdout.write(commandHelp(this) + '\n');
    }
}

/** Context passed to every command's `execute()`. */
export interface CommandContext {
    /** The running Terminal instance. */
    terminal: Terminal;
    /** Output stream — write command results here. */
    stdout: NodeJS.WriteStream;
    /** Input stream. */
    stdin: NodeJS.ReadStream;
    /** Shared mutable state accessible to all commands. */
    state: Record<string, unknown>;
    /** Console-compatible logger. */
    logger: Logger;
    /** Shortcut for `terminal.stop()`. */
    exit: () => void;
}

/** Console-compatible logger interface. */
export interface Logger {
    info(...args: unknown[]): void;
    warn(...args: unknown[]): void;
    error(...args: unknown[]): void;
}

/** Options for the Terminal constructor. */
export interface TerminalOptions {
    /** Prompt string (default `"> "`). */
    prompt?: string;
    /** Input stream (default `process.stdin`). */
    stdin?: NodeJS.ReadStream;
    /** Output stream (default `process.stdout`). */
    stdout?: NodeJS.WriteStream;
    /** Readline history size (default `100`). */
    historySize?: number;
    /**
     * Path to the JSON file used by {@link Terminal.loadHistory} and
     * {@link Terminal.saveHistory} to persist command history across
     * sessions. When set, `loadHistory()` reads from this file and
     * `saveHistory()` writes to it.
     */
    historyPath?: string;
}
