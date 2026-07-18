import { Command, CommandContainer } from '../types.js';
import { CommandTree } from '../command-tree.js';
import { tokenize } from '../input/parser.js';
import type { CommandArgumentDefinition } from '../command-arguments.js';

/**
 * Extract enum values from a Zod schema by reading `_zod.values`,
 * which is set on `$ZodEnum` and propagated through `.optional()`,
 * `.default()`, `.nullable()`, `.pipe()`, etc.
 *
 * @returns The string values if the schema is an enum, or `null`.
 */
function extractEnumValues(schema: { _zod?: { values?: unknown } }): string[] | null {
    const values = schema._zod?.values;
    if (!(values instanceof Set)) return null;
    const strings = [...values].filter((v): v is string => typeof v === 'string');
    return strings.length > 0 ? strings : null;
}

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
 * Build a set of canonical argument names that have already been provided
 * on the command line, by scanning prefix tokens for --name and -x patterns.
 */
function collectUsedFlags(prefix: string[], definitions: CommandArgumentDefinition[]): Set<string> {
    const used = new Set<string>();
    const aliasMap = new Map<string, string>();
    for (const def of definitions) {
        for (const alias of def.aliases ?? []) {
            aliasMap.set(alias, def.name);
        }
    }

    for (let i = 0; i < prefix.length; i++) {
        const token = prefix[i]!;
        let canonicalName: string | undefined;

        if (token.startsWith('--') && token.length > 2) {
            const flagName = token.slice(2);
            if (definitions.some((d) => d.name === flagName)) {
                canonicalName = flagName;
            } else if (aliasMap.has(flagName)) {
                canonicalName = aliasMap.get(flagName)!;
            }
        } else if (isShortFlagPrefix(token)) {
            const shortChar = token[1]!;
            if (aliasMap.has(shortChar)) {
                canonicalName = aliasMap.get(shortChar)!;
            }
        }

        if (canonicalName) {
            used.add(canonicalName);
            const next = prefix[i + 1];
            if (next !== undefined && !next.startsWith('--') && !isShortFlagPrefix(next)) {
                i++;
            }
        }
    }

    return used;
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
            const flagPartial =
                partial.startsWith('--') || partial.startsWith('-')
                    ? partial
                    : partial === ''
                      ? '--'
                      : null;
            if (flagPartial !== null) {
                const defs = lastMatched.definitions();
                const usedFlags = collectUsedFlags(prefix, defs);
                const matches: string[] = [];
                for (const def of defs) {
                    if (usedFlags.has(def.name)) continue;
                    const enumVals = extractEnumValues(def.schema);
                    const suffix =
                        enumVals && enumVals.length > 0 ? ` [${enumVals.join('|')}]` : '';
                    const candidate = `--${def.name}${suffix}`;
                    if (candidate.startsWith(flagPartial)) matches.push(candidate);
                    for (const alias of def.aliases ?? []) {
                        const aliasCandidate = alias.length === 1 ? `-${alias}` : `--${alias}`;
                        if (aliasCandidate.startsWith(flagPartial))
                            matches.push(aliasCandidate + suffix);
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
