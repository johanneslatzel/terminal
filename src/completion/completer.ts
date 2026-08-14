import { Command, CommandContainer, PipelineInputAcceptance } from '../types.js';
import { CommandTree } from '../command-tree.js';
import { tokenize } from '../input/parser.js';
import { buildAliasMap } from '../input/alias-map.js';
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

/**
 * Collect the names and aliases of the given commands into a deduplicated
 * list of completion candidates (insertion order).
 */
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

/**
 * Whether a token looks like a short flag: `-x` (single dash, single char).
 * A loose shape check used where the exact classification does not matter —
 * skipping flag-like tokens while walking the command tree, resolving `-x`
 * to a flag definition, or collecting used flags. Unlike
 * {@link isShortFlagToken} it does not exclude digits, so `-1` is treated as
 * short flag-shaped and skipped rather than mismatched as a command token.
 */
function isShortFlagPrefix(s: string): boolean {
    return s.startsWith('-') && !s.startsWith('--') && s.length === 2;
}

/**
 * Whether the args-parser classifies a token as a short flag: `-x` (single
 * dash, single non-digit char). Mirrors the parser's rule exactly — digits
 * are excluded because negative-number lookalikes like `-1` are parsed as
 * positional values, not flags. Used to count bare tokens in
 * {@link countBareArgTokens}. Delegates to {@link isShortFlagPrefix} and
 * adds the digit guard.
 */
function isShortFlagToken(s: string): boolean {
    return isShortFlagPrefix(s) && !/[0-9]/.test(s[1]!);
}

/**
 * Count the bare (positional) tokens among the argument tokens that follow
 * the command name, mirroring the args-parser: `--name`/`-x` flag tokens and
 * their immediately following value tokens are skipped.
 *
 * @returns The number of positional tokens consumed so far.
 */
function countBareArgTokens(tokens: string[]): number {
    let count = 0;
    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]!;
        if (token.startsWith('--') || isShortFlagToken(token)) {
            const next = tokens[i + 1];
            if (next !== undefined && !next.startsWith('--') && !isShortFlagToken(next)) {
                i++;
            }
            continue;
        }
        count++;
    }
    return count;
}

/**
 * Build a set of canonical argument names that have already been provided
 * on the command line, by scanning prefix tokens for --name and -x patterns.
 *
 * @returns The canonical names of flags already present in the prefix.
 */
function collectUsedFlags(prefix: string[], definitions: CommandArgumentDefinition[]): Set<string> {
    const used = new Set<string>();
    const aliasMap = buildAliasMap(definitions);

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
     *
     * Never throws: when the line cannot be tokenized (e.g. an unclosed
     * quote) it returns a no-op completion instead of propagating the parse
     * error. This keeps readline's tab handler from being left in a paused,
     * unusable state when a quote is still open.
     */
    complete(line: string): Completion {
        let tokens: string[];
        try {
            tokens = tokenize(line);
        } catch {
            return { matches: [], partial: line };
        }
        const trailingSpace = line.endsWith(' ');

        if (tokens.length === 0 && !trailingSpace) {
            return { matches: collectAllNames(this.tree.getRoots()), partial: '' };
        }

        const partial = trailingSpace ? '' : tokens[tokens.length - 1]!;
        const prefix = trailingSpace ? tokens : tokens.slice(0, -1);

        // Split the completed prefix into pipeline segments at `|` boundaries.
        // After a `|` the completion context restarts at the root command
        // level, so only the last segment drives the rest of the walk.
        const segments: string[][] = [[]];
        for (const token of prefix) {
            if (token === '|') {
                segments.push([]);
            } else {
                segments[segments.length - 1]!.push(token);
            }
        }

        if (segments.length > 1) {
            const lastSegment = segments[segments.length - 1]!;
            if (lastSegment.length === 0) {
                // The user just typed `|`: suggest commands that can consume
                // pipeline input for the next stage of the pipeline.
                const pipelineCommands = this.tree
                    .getRoots()
                    .filter(
                        (command) => command.acceptsPipelineInput() !== PipelineInputAcceptance.None
                    );
                const matches = collectAllNames(pipelineCommands).filter((name) =>
                    name.startsWith(partial)
                );
                return { matches, partial };
            }
            return this.completeSegment(lastSegment, partial, line);
        }

        return this.completeSegment(prefix, partial, line);
    }

    /**
     * Complete a single pipeline segment. Walks the prefix tokens through the
     * command tree to find the deepest matched command, then completes the
     * current position: a flag's enum value, a positional slot's enum value,
     * a `--flag`/alias name, or a nested command name. A prefix token that
     * matches no command bails with an empty completion.
     */
    private completeSegment(prefix: string[], partial: string, line: string): Completion {
        let lastMatched: Command | null = null;
        let commandTokenCount = 0;
        let commands = this.tree.getRoots();
        for (const token of prefix) {
            if (token.startsWith('--')) continue;
            if (isShortFlagPrefix(token)) continue;
            const cmd = commands.find((command) => command.matches(token));
            if (!cmd) return { matches: [], partial: line };
            lastMatched = cmd;
            commandTokenCount++;
            if (!(cmd instanceof CommandContainer)) break;
            commands = cmd.commands();
        }

        if (lastMatched && !(lastMatched instanceof CommandContainer)) {
            const lastPrefixToken = prefix[prefix.length - 1]!;
            const defs = lastMatched.definitions();
            let flagDef: CommandArgumentDefinition | undefined;

            if (lastPrefixToken.startsWith('--')) {
                flagDef = defs.find((d) => d.name === lastPrefixToken.slice(2));
            } else if (isShortFlagPrefix(lastPrefixToken)) {
                const shortChar = lastPrefixToken[1]!;
                flagDef = defs.find((d) => d.aliases?.includes(shortChar));
            }

            if (flagDef) {
                const enumVals = extractEnumValues(flagDef.schema);
                if (enumVals && enumVals.length > 0) {
                    const matches = enumVals.filter((v) => v.startsWith(partial));
                    return { matches, partial };
                }
            }

            const flagPartial =
                partial.startsWith('--') || partial.startsWith('-')
                    ? partial
                    : partial === ''
                      ? '--'
                      : null;

            if (!partial.startsWith('-')) {
                const positionalDefs = defs
                    .filter((d) => d.position !== undefined)
                    .sort((a, b) => a.position! - b.position!);
                const bareCount = countBareArgTokens(prefix.slice(commandTokenCount));
                const positionalDef = positionalDefs[bareCount];
                if (positionalDef) {
                    const enumVals = extractEnumValues(positionalDef.schema);
                    if (enumVals && enumVals.length > 0) {
                        const matches = enumVals.filter((v) => v.startsWith(partial));
                        return { matches, partial };
                    }
                }
            }

            if (flagPartial !== null) {
                const defs = lastMatched.definitions();
                const usedFlags = collectUsedFlags(prefix, defs);
                const matches: string[] = [];
                for (const def of defs) {
                    if (usedFlags.has(def.name)) continue;
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
