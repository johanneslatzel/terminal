import { InvalidArgumentsError } from '../errors.js';
import type { CommandArgumentDefinition } from '../command-arguments.js';

/**
 * Parse an array of tokens into a record of `--name value` pairs.
 *
 * - `--name value` produces `{ name: "value" }`
 * - `--flag` (no next token or next token starts with `--`) produces
 *   `{ flag: "true" }` (boolean-shorthand)
 * - When `argDefs` is provided, tokens not starting with `--` are
 *   matched against argument definitions with a `position` index
 *   and consumed in position order.
 *
 * @param tokens - Tokens remaining after command matching.
 * @param argDefs - Optional argument definitions; those with a
 *   `position` field are treated as positional (bare token) args.
 * @returns A record mapping argument names (without `--` prefix) to
 *   their string values.
 * @throws {InvalidArgumentsError} When a token does not start with
 *   `--` (and no positional definition matches), or an empty `--`
 *   is encountered.
 */
export function parseFlags(
    tokens: string[],
    argDefs?: CommandArgumentDefinition[]
): Record<string, string> {
    const args: Record<string, string> = {};
    const positionalDefs = (argDefs ?? [])
        .filter((d) => d.position !== undefined)
        .sort((a, b) => a.position! - b.position!);
    let positionalIdx = 0;

    for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]!;

        if (!token.startsWith('--')) {
            if (positionalIdx < positionalDefs.length) {
                args[positionalDefs[positionalIdx]!.name] = token;
                positionalIdx++;
                continue;
            }
            throw new InvalidArgumentsError(`Unexpected token "${token}", expected --argument`);
        }

        const name = token.slice(2);
        if (name.length === 0) {
            throw new InvalidArgumentsError('Empty argument name (--)');
        }

        const next = tokens[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
            args[name] = next;
            i++;
        } else {
            args[name] = 'true';
        }
    }

    return args;
}
