import { ParseError } from '../errors.js';

/**
 * Split a raw input line into tokens, respecting single and double quotes.
 * Leading and trailing whitespace is trimmed; empty or whitespace-only
 * input produces an empty array.
 *
 * Quoted segments are treated as a single token (quotes stripped).
 * Both quote types support `\` escapes and are treated identically.
 * Adjacent non-whitespace characters around quotes are rejected.
 *
 * @param input - Raw input string from the terminal.
 * @throws {ParseError} When quotes are unclosed or adjacent to non-whitespace.
 */
export function tokenize(input: string): string[] {
    const trimmed = input.trim();
    if (trimmed.length === 0) return [];

    const tokens: string[] = [];
    let current = '';
    let inQuote: '"' | "'" | null = null;

    for (let i = 0; i < trimmed.length; i++) {
        const ch = trimmed[i]!;

        if (inQuote && ch === '\\' && i + 1 < trimmed.length) {
            current += trimmed[++i]!;
            continue;
        }

        if (ch === '"' || ch === "'") {
            if (inQuote === null && current.length > 0) {
                throw new ParseError(`Unexpected characters before quote: "${current}"`);
            }
            if (inQuote === ch) {
                inQuote = null;
                tokens.push(current);
                current = '';
                const next = trimmed[i + 1];
                if (next !== undefined && !/\s/.test(next)) {
                    throw new ParseError(`Unexpected character "${next}" after closing quote`);
                }
                continue;
            }
            if (inQuote === null) {
                inQuote = ch;
                continue;
            }
            current += ch;
            continue;
        }

        if (/\s/.test(ch) && inQuote === null) {
            if (current.length > 0) {
                tokens.push(current);
                current = '';
            }
            continue;
        }

        current += ch;
    }

    if (current.length > 0) {
        tokens.push(current);
    }

    if (inQuote !== null) {
        throw new ParseError(`Unclosed ${inQuote} quote`);
    }

    return tokens;
}
