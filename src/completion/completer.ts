import { Command, CommandContainer } from '../types.js';
import { CommandTree } from '../command-tree.js';
import { tokenize } from '../input/parser.js';

export interface Completion {
    /** Matching command names. */
    matches: string[];
    /** The partial token that was matched against. */
    partial: string;
}

function collectAllNames(commands: Command[]): string[] {
    const names = new Set<string>();
    for (const c of commands) {
        names.add(c.name());
        for (const alias of c.aliases()) {
            names.add(alias);
        }
    }
    return [...names];
}

function isShortFlagPrefix(s: string): boolean {
    return s.startsWith('-') && !s.startsWith('--') && s.length === 2;
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
            return { matches: collectAllNames(this.tree.getRoots()), partial: '' };
        }

        const partial = trailingSpace ? '' : tokens[tokens.length - 1]!;
        const prefix = trailingSpace ? tokens : tokens.slice(0, -1);

        let lastMatched: Command | null = null;
        let commands = this.tree.getRoots();
        for (const token of prefix) {
            if (token.startsWith('--')) continue;
            if (isShortFlagPrefix(token)) continue;
            const cmd = commands.find((command) => command.matches(token));
            if (!cmd) return { matches: [], partial: line };
            lastMatched = cmd;
            if (!(cmd instanceof CommandContainer)) break;
            commands = cmd.commands();
        }

        if (lastMatched && !(lastMatched instanceof CommandContainer)) {
            const flagPartial = partial.startsWith('--') ? partial : partial === '' ? '--' : null;
            if (flagPartial !== null) {
                const matches: string[] = [];
                for (const def of lastMatched.definitions()) {
                    const candidate = `--${def.name}`;
                    if (candidate.startsWith(flagPartial)) matches.push(candidate);
                    for (const alias of def.aliases ?? []) {
                        const aliasCandidate = alias.length === 1 ? `-${alias}` : `--${alias}`;
                        if (aliasCandidate.startsWith(flagPartial)) matches.push(aliasCandidate);
                    }
                }
                return { matches, partial };
            }
            return { matches: [], partial };
        }

        const allNames = new Set<string>();
        for (const command of commands) {
            allNames.add(command.name());
            for (const alias of command.aliases()) {
                allNames.add(alias);
            }
        }
        const matches = [...allNames].filter((name) => name.startsWith(partial));

        return { matches, partial };
    }
}
