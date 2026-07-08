import { InvalidArgumentsError } from '../errors.js';
import type { CommandArgumentDefinition } from '../command-arguments.js';

/**
 * Build a map from alias → canonical argument name from arg definitions.
 */
function buildAliasMap(argDefs?: CommandArgumentDefinition[]): Map<string, string> {
    const map = new Map<string, string>();
    for (const def of argDefs ?? []) {
        for (const alias of def.aliases ?? []) {
            map.set(alias, def.name);
        }
    }
    return map;
}

/**
 * Check whether a token looks like a short flag: `-x` (single dash, single non-digit char).
 */
function isShortFlag(token: string): boolean {
    return (
        token.startsWith('-') &&
        !token.startsWith('--') &&
        token.length === 2 &&
        !/[0-9]/.test(token[1]!)
    );
}

/**
 * Parse an array of tokens into a record of `--name value` pairs.
 *
 * - `--name value` produces `{ name: "value" }`
 * - `--flag` (no next token or next token starts with `--`) produces
 *   `{ flag: "true" }` (boolean-shorthand)
 * - `-x` (single dash, single non-digit char) is treated as a short alias;
 *   resolved to the canonical name via arg definition aliases.
 * - When `argDefs` is provided, tokens not starting with `--` are
 *   matched against argument definitions with a `position` index
 *   and consumed in position order.
 *
 * @param tokens - Tokens remaining after command matching.
 * @param argDefs - Optional argument definitions; those with a
 *   `position` field are treated as positional (bare token) args.
 *   Definitions with `aliases` are used to resolve --alias → canonical name.
 * @returns A record mapping argument canonical names to their string values.
 * @throws {InvalidArgumentsError} When a token does not start with
 *   `--` (and no positional definition matches), an empty `--`
 *   is encountered, or an unknown single-dash flag is used.
 */
export function parseFlags(
    tokens: string[],
    argDefs?: CommandArgumentDefinition[]
): Record<string, string> {
    const args: Record<string, string> = {};
    const positionalDefs = (argDefs ?? [])
        .filter((d) => d.position !== undefined)
        .sort((a, b) => a.position! - b.position!);
    const aliasMap = buildAliasMap(argDefs);
    let positionalIdx = 0;
    let lastArgName: string | undefined;

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]!;

        if (!token.startsWith('--') && !isShortFlag(token)) {
            if (positionalIdx < positionalDefs.length) {
                const def = positionalDefs[positionalIdx]!;
                args[def.name] = token;
                lastArgName = def.name;
                positionalIdx++;
                continue;
            }
            if (positionalDefs.length > 0) {
                const last = positionalDefs[positionalDefs.length - 1]!;
                args[last.name] += ' ' + token;
                lastArgName = last.name;
                continue;
            }
            if (lastArgName !== undefined) {
                args[lastArgName] += ' ' + token;
                continue;
            }
            throw new InvalidArgumentsError(`Unexpected token "${token}", expected --argument`);
        }

        let name: string;
        if (token.startsWith('--')) {
            name = token.slice(2);
        } else {
            name = token[1]!;
        }

        if (name.length === 0) {
            throw new InvalidArgumentsError('Empty argument name (--)');
        }

        const isCanonical = argDefs?.find((d) => d.name === name);
        if (!isCanonical && aliasMap.has(name)) {
            name = aliasMap.get(name)!;
        }
        if (isShortFlag(token) && !argDefs?.find((d) => d.name === name)) {
            throw new InvalidArgumentsError(`Unknown flag "${token}"`);
        }

        const next = tokens[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
            args[name] = next;
            lastArgName = name;
            i++;
        } else {
            args[name] = 'true';
            lastArgName = name;
        }
    }

    return args;
}
