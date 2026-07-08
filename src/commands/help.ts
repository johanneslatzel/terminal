import { Command, CommandContainer, type CommandContext } from '../types.js';
import type { CommandArgumentDefinition } from '../command-arguments.js';
import type { CommandArguments } from '../command-arguments.js';
import { z } from 'zod';

/** Left-pad a string with spaces to a minimum width. */
function leftPad(str: string, len: number): string {
    return str + ' '.repeat(Math.max(0, len - str.length));
}

/**
 * Render a global help listing for a set of root commands.
 * Each command is shown as `name   description`, names are
 * left-aligned to the longest command name. Aliases appear
 * in parentheses after the name.
 */
export function globalHelp(commands: Command[]): string {
    const maxNameLen = Math.max(...commands.map((c) => c.name().length), 0);

    const lines: string[] = ['Commands:'];
    for (const cmd of commands) {
        const desc = cmd.description() ?? '';
        const aliases = cmd.aliases();
        const aliasStr = aliases.length > 0 ? ` (${aliases.join(', ')})` : '';
        lines.push(`  ${leftPad(cmd.name(), maxNameLen)}${aliasStr}  ${desc}`);
    }
    return lines.join('\n');
}

function renderArgAliases(arg: CommandArgumentDefinition): string {
    if (!arg.aliases || arg.aliases.length === 0) return '';
    const parts = arg.aliases.map((a) => (a.length === 1 ? `-${a}` : `--${a}`));
    return ` (${parts.join(', ')})`;
}

function renderCommandArgumentDefinitions(argDefs: CommandArgumentDefinition[]): string[] {
    if (argDefs.length === 0) return [];
    const lines: string[] = ['', 'Arguments:'];
    const maxNameLen = Math.max(...argDefs.map((a) => a.name.length));
    for (const arg of argDefs) {
        const label = `--${arg.name}`;
        const aliasStr = renderArgAliases(arg);
        const required = arg.required ? ' (required)' : '';
        const desc = arg.description ?? '';
        lines.push(`  ${leftPad(label, maxNameLen + 2)}${aliasStr}  ${desc}${required}`);
    }
    return lines;
}

/**
 * Render detailed help for a single command, including its
 * name, description, argument definitions, and subcommands.
 */
export function commandHelp(command: Command): string {
    const lines: string[] = [];

    const globalDesc = command.description();
    const aliases = command.aliases();
    const aliasStr = aliases.length > 0 ? ` (${aliases.join(', ')})` : '';
    if (globalDesc) {
        lines.push(`${command.name()}${aliasStr} - ${globalDesc}`);
    } else {
        lines.push(`${command.name()}${aliasStr}`);
    }

    lines.push(...renderCommandArgumentDefinitions(command.definitions()));

    if (command instanceof CommandContainer) {
        const subs = command.commands();
        if (subs.length > 0) {
            const maxNameLen = Math.max(...subs.map((c) => c.name().length));
            lines.push('');
            lines.push('Subcommands:');
            for (const sub of subs) {
                const desc = sub.description() ?? '';
                const subAliases = sub.aliases();
                const subAliasStr = subAliases.length > 0 ? ` (${subAliases.join(', ')})` : '';
                lines.push(`  ${leftPad(sub.name(), maxNameLen)}${subAliasStr}  ${desc}`);
            }
        }
    }

    return lines.join('\n');
}

/**
 * Resolve a token path against a command list and render
 * help for the resolved command. Returns an error message
 * if the path does not match any command.
 */
export function scopedHelp(commands: Command[], pathTokens: string[]): string {
    const resolved = resolveCommand(commands, pathTokens);
    if (!resolved) {
        return `Unknown command: ${pathTokens.join(' ')}`;
    }
    return commandHelp(resolved);
}

/**
 * Walk the command tree matching each token to a command name.
 * Returns the deepest matching command, or `undefined` if a token
 * cannot be matched or extra tokens trail a leaf node.
 */
export function resolveCommand(commands: Command[], tokens: string[]): Command | undefined {
    let level: Command[] = commands;
    let matched: Command | undefined;

    for (const token of tokens) {
        matched = level.find((c) => c.matches(token));
        if (!matched) return undefined;
        if (matched instanceof CommandContainer) {
            const subs = matched.commands();
            if (subs.length > 0) {
                level = subs;
                continue;
            }
        }
        if (token !== tokens[tokens.length - 1]) {
            return undefined;
        }
    }

    return matched;
}

/**
 * Built-in `help` command. Lists all commands or shows detailed
 * help for a specific command by name.
 *
 * @example
 * ```
 * > help                     # list all commands
 * > help --command config    # show help for the "config" command
 * ```
 */
export class HelpCommand extends Command {
    constructor() {
        super('help', 'Show help', [
            {
                name: 'command',
                description: 'Show help for a specific command',
                required: false,
                position: 0,
                schema: z.string()
            }
        ]);
    }

    async execute(ctx: CommandContext, args: CommandArguments): Promise<void> {
        const roots = ctx.terminal.getRootCommands();
        if (args.has('command')) {
            const cmdPath = await args.require<string>('command');
            const tokens = cmdPath.split(/\s+/);
            const cmd = resolveCommand(roots, tokens);
            if (!cmd) {
                ctx.stdout.write(`Unknown command: ${cmdPath}\n`);
                return;
            }
            ctx.stdout.write(commandHelp(cmd) + '\n');
        } else {
            ctx.stdout.write(globalHelp(roots) + '\n');
        }
    }
}
