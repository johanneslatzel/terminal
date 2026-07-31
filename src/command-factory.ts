import {
    Command,
    CommandContainer,
    PipelineInputAcceptance,
    type CommandContext
} from './types.js';
import type { CommandArgumentDefinition, CommandArguments } from './command-arguments.js';
import { validateAliases, OwnerType } from './validate-aliases.js';
import type { z } from 'zod';

/**
 * Options for creating a command via the {@link command} factory.
 */
export interface CommandOptions {
    /** Short description shown in help output. */
    description?: string;
    /** Argument definitions for `--name value` pairs (Zod schemas). */
    arguments?: CommandArgumentDefinition[];
    /** Alternate names for this command. */
    aliases?: string[];
    /** How this command consumes piped input (default `None`). */
    acceptsPipelineInput?: PipelineInputAcceptance;
    /** Whether this command can produce pipeline output (default `false`). */
    providesPipelineOutput?: boolean;
}

/**
 * Create a leaf command from a name, a handler callback,
 * and optional {@link CommandOptions}.
 *
 * @param name    - Command name used for matching input tokens.
 * @param execute - Handler invoked when the command runs.
 * @param options - Optional settings (description, arguments, aliases,
 *                  pipeline input/output acceptance).
 */
export function command(
    name: string,
    execute: (ctx: CommandContext, args: CommandArguments) => void | Promise<void>,
    options?: CommandOptions
): Command {
    return new (class extends Command {
        constructor() {
            super(
                name,
                options?.description,
                options?.arguments ?? [],
                options?.aliases,
                options?.acceptsPipelineInput ?? PipelineInputAcceptance.None,
                options?.providesPipelineOutput ?? false
            );
        }
        async execute(ctx: CommandContext, args: CommandArguments): Promise<void> {
            await execute(ctx, args);
        }
    })();
}

/**
 * Options for the {@link container} factory.
 */
export interface ContainerOptions {
    /** Short description shown in help output. */
    description?: string;
    /** Child commands to register under this namespace. */
    children?: Command[];
    /** Alternate names for this container. */
    aliases?: string[];
}

/**
 * Create a namespace container with optional child commands.
 */
export function container(name: string, options?: ContainerOptions): CommandContainer {
    const c = new (class extends CommandContainer {
        constructor() {
            super(name, options?.description, undefined, options?.aliases);
        }
    })();
    if (options?.children) {
        for (const child of options.children) {
            c.add(child);
        }
    }
    return c;
}

/**
 * Options for the {@link arg} factory.
 */
export interface ArgOptions {
    /** Human-readable description shown in help output. */
    description?: string;
    /** 0-based index for positional (bare token) arguments. */
    position?: number;
    /** Alternate names for this argument. Single-char aliases use `-x`, multi-char use `--name`. */
    aliases?: string[];
    /**
     * When `true`, {@link CommandArguments.require} prompts with hidden input (no echo)
     * instead of the normal visible prompt.  Ignored when the argument
     * is provided on the command line.
     */
    secret?: boolean;
    /** Whether the argument must always be provided. */
    required?: boolean;
}

/**
 * Convenience factory for a single argument definition.
 *
 * @param name    - Argument name (without `--` prefix).
 * @param schema  - Zod schema describing the argument's expected type and constraints.
 * @param options - Optional settings (description, position, aliases, secret, required).
 */
export function arg(
    name: string,
    schema: z.ZodType,
    options?: ArgOptions
): CommandArgumentDefinition {
    validateAliases(options?.aliases, OwnerType.Argument, name);
    const def: CommandArgumentDefinition = { name, schema };
    if (options?.description !== undefined) def.description = options.description;
    if (options?.position !== undefined) def.position = options.position;
    if (options?.aliases !== undefined) def.aliases = options.aliases;
    if (options?.secret !== undefined) def.secret = options.secret;
    if (options?.required !== undefined) def.required = options.required;
    return def;
}
