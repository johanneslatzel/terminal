import { Command, CommandContainer, type CommandContext } from './types.js';
import type { CommandArguments } from './command-arguments.js';
import { globalHelp } from './commands/help.js';

/**
 * Root of the command tree. Maintains the full set of registered
 * commands and provides lookup, traversal, and completion support.
 */
export class CommandTree extends CommandContainer {
    constructor() {
        super('__root__');
    }

    /**
     * Remove a root-level command by name.
     * Delegates to {@link CommandContainer.remove}.
     *
     * @param name - Name of the command to remove.
     * @returns `true` when a command with that name was found and removed.
     */
    remove(name: string): boolean {
        return super.remove(name);
    }

    /**
     * Default execution: prints a global help listing of all
     * registered root commands.
     */
    async execute(ctx: CommandContext, _args: CommandArguments): Promise<void> {
        const output = globalHelp(this.commands());
        ctx.stdout.write(output + '\n');
    }

    /**
     * Walk the command tree by matching input tokens against
     * command names. Returns the deepest matching command and
     * any remaining (unmatched) tokens.
     *
     * @param tokens - Tokenized input (e.g. `["config", "set", "--theme", "dark"]`).
     * @returns The matched command and unused tokens, or `null` when
     *   no command matches.
     */
    find(tokens: string[]): { command: Command; args: string[] } | null {
        if (tokens.length === 0) return null;

        let level: Command[] = this.commands();
        let matched: Command | null = null;
        let tokenIndex = 0;

        for (const token of tokens) {
            const cmd = level.find((c) => c.matches(token));
            if (!cmd) break;
            matched = cmd;
            tokenIndex++;
            if (cmd instanceof CommandContainer) {
                const children = cmd.commands();
                if (children.length > 0) {
                    level = children;
                } else {
                    break;
                }
            } else {
                break;
            }
        }

        if (!matched) return null;
        return { command: matched, args: tokens.slice(tokenIndex) };
    }

    /**
     * Returns a shallow copy of all root-level commands.
     * Used by the help system and completer.
     */
    getRoots(): Command[] {
        return [...this.commands()];
    }

    /**
     * Find command names that match a case-insensitive prefix.
     * Used for error suggestions when a command is not found.
     *
     * @param prefix - The user's typed (partial) command name.
     */
    findSuggestions(prefix: string): string[] {
        const lower = prefix.toLowerCase();
        const results = new Set<string>();
        for (const c of this.commands()) {
            if (c.name().toLowerCase().startsWith(lower)) {
                results.add(c.name());
            }
            for (const alias of c.aliases()) {
                if (alias.toLowerCase().startsWith(lower)) {
                    results.add(alias);
                }
            }
        }
        return [...results];
    }
}
