import { Command, CommandContainer, type CommandContext } from './types.js';
import type { CommandArgumentDefinition, CommandArguments } from './command-arguments.js';
import { validateAliases, OwnerType } from './validate-aliases.js';
import type { z } from 'zod';

/**
 * Create a leaf command from a name, description, argument definitions,
 * and a handler callback — no need to subclass `Command`.
 *
 * When the command has no arguments, omit `argDefs`:
 * `command('greet', 'Say hello', handler)`.
 */
export function command(
    name: string,
    description: string | undefined,
    execute: (ctx: CommandContext, args: CommandArguments) => void | Promise<void>,
    aliases?: string[]
): Command;
export function command(
    name: string,
    description: string | undefined,
    argDefs: CommandArgumentDefinition[],
    execute: (ctx: CommandContext, args: CommandArguments) => void | Promise<void>,
    aliases?: string[]
): Command;
export function command(
    name: string,
    description: string | undefined,
    argDefsOrExecute:
        | CommandArgumentDefinition[]
        | ((ctx: CommandContext, args: CommandArguments) => void | Promise<void>),
    executeOrAliases?:
        ((ctx: CommandContext, args: CommandArguments) => void | Promise<void>) | string[],
    aliases?: string[]
): Command {
    let argDefs: CommandArgumentDefinition[];
    let execute: (ctx: CommandContext, args: CommandArguments) => void | Promise<void>;

    if (Array.isArray(argDefsOrExecute)) {
        argDefs = argDefsOrExecute;
        execute = executeOrAliases as (
            ctx: CommandContext,
            args: CommandArguments
        ) => void | Promise<void>;
    } else {
        argDefs = [];
        execute = argDefsOrExecute;
        aliases = executeOrAliases as string[] | undefined;
    }

    return new (class extends Command {
        constructor() {
            super(name, description, argDefs, aliases);
        }
        async execute(ctx: CommandContext, args: CommandArguments): Promise<void> {
            await execute(ctx, args);
        }
    })();
}

/**
 * Create a namespace container with an optional list of child commands.
 */
export function container(
    name: string,
    description?: string,
    children?: Command[],
    aliases?: string[]
): CommandContainer {
    const c = new (class extends CommandContainer {
        constructor() {
            super(name, description, undefined, aliases);
        }
    })();
    if (children) {
        for (const child of children) {
            c.add(child);
        }
    }
    return c;
}

/**
 * Convenience factory for a single argument definition.
 */
export function arg(
    name: string,
    description: string | undefined,
    schema: z.ZodType,
    position?: number,
    aliases?: string[],
    secret?: boolean
): CommandArgumentDefinition {
    validateAliases(aliases, OwnerType.Argument, name);
    const def: CommandArgumentDefinition = { name, schema };
    if (description !== undefined) def.description = description;
    if (position !== undefined) def.position = position;
    if (aliases !== undefined) def.aliases = aliases;
    if (secret !== undefined) def.secret = secret;
    return def;
}
