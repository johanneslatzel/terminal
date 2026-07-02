import { Command, CommandContainer } from '../types.js';
import { CommandTree } from '../command-tree.js';
import { tokenize } from '../input/parser.js';

export interface Completion {
    /** Matching command names. */
    matches: string[];
    /** The partial token that was matched against. */
    partial: string;
}

/**
 * Tab-completion engine powered by the command tree.
 * Walks the tree to find commands matching the current input
 * prefix, supporting multi-level completion through containers
 * and --flag completion for commands with argument definitions.
 */
export class Completer {
    constructor(private tree: CommandTree) {}

    /**
     * Compute completions for a partial input line.
     */
    complete(line: string): Completion {
        const tokens = tokenize(line);
        const trailingSpace = line.endsWith(' ');

        if (tokens.length === 0 && !trailingSpace) {
            return { matches: this.tree.getRoots().map((c) => c.name()), partial: '' };
        }

        const partial = trailingSpace ? '' : tokens[tokens.length - 1]!;
        const prefix = trailingSpace ? tokens : tokens.slice(0, -1);

        let lastMatched: Command | null = null;
        let commands = this.tree.getRoots();
        for (const token of prefix) {
            if (token.startsWith('--')) continue;
            const cmd = commands.find((command) => command.name() === token);
            if (!cmd) return { matches: [], partial: line };
            lastMatched = cmd;
            if (!(cmd instanceof CommandContainer)) break;
            commands = cmd.commands();
        }

        if (lastMatched && !(lastMatched instanceof CommandContainer)) {
            const flagPartial = partial.startsWith('--') ? partial : partial === '' ? '--' : null;
            if (flagPartial !== null) {
                const matches = lastMatched
                    .definitions()
                    .filter((a) => `--${a.name}`.startsWith(flagPartial))
                    .map((a) => `--${a.name}`);
                return { matches, partial };
            }
            return { matches: [], partial };
        }

        const matches = commands
            .filter((command) => command.name().startsWith(partial))
            .map((c) => c.name());

        return { matches, partial };
    }
}
