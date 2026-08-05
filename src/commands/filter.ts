import { Command, PipelineInputAcceptance, type CommandContext } from '../types.js';
import type { CommandArguments } from '../command-arguments.js';
import { getPath } from '../path.js';
import { z } from 'zod';

type Op =
    | 'eq'
    | 'ne'
    | 'gt'
    | 'gte'
    | 'lt'
    | 'lte'
    | 'contains'
    | 'startsWith'
    | 'endsWith'
    | 'regex'
    | 'exists';

interface ParsedCondition {
    key: string;
    op: Op;
    value: string;
    negate: boolean;
    regex?: RegExp;
}

function isKeyChar(c: string): boolean {
    return /[A-Za-z0-9_.-]/.test(c);
}

function isWhitespace(c: string): boolean {
    return /\s/.test(c);
}

function skipWs(s: string, from: number): number {
    let i = from;
    while (i < s.length && isWhitespace(s[i]!)) i++;
    return i;
}

function tokenize(raw: string): ParsedCondition {
    let negate = false;
    let body = raw.trim();
    while (body.startsWith('!')) {
        negate = !negate;
        body = body.slice(1);
    }
    if (body === '') {
        throw new Error(`Invalid filter condition: ${raw}`);
    }
    let i = 0;
    while (i < body.length && isKeyChar(body[i]!)) i++;
    const key = body.slice(0, i);
    if (key === '') {
        throw new Error(`Invalid filter condition: ${raw}`);
    }
    const opStart = skipWs(body, i);
    if (opStart >= body.length) {
        return { key, op: 'exists', value: '', negate };
    }
    const c = body[opStart]!;
    let op: Op;
    let opEnd = opStart;
    if (c === '=') {
        const k = skipWs(body, opStart + 1);
        if (body[k] === '=') {
            throw new Error(`Invalid filter condition: ${raw}`);
        }
        if (body[k] === '~') {
            op = 'regex';
            opEnd = k;
        } else {
            op = 'eq';
        }
    } else if (c === '>') {
        const k = skipWs(body, opStart + 1);
        if (body[k] === '=') {
            op = 'gte';
            opEnd = k;
        } else {
            op = 'gt';
        }
    } else if (c === '<') {
        const k = skipWs(body, opStart + 1);
        if (body[k] === '=') {
            op = 'lte';
            opEnd = k;
        } else {
            op = 'lt';
        }
    } else if (c === '!') {
        const k = skipWs(body, opStart + 1);
        if (body[k] === '=') {
            op = 'ne';
            opEnd = k;
        } else {
            throw new Error(`Invalid filter condition: ${raw}`);
        }
    } else if (c === '~') {
        op = 'contains';
    } else if (c === '^') {
        op = 'startsWith';
    } else if (c === '$') {
        op = 'endsWith';
    } else {
        throw new Error(`Invalid filter condition: ${raw}`);
    }
    return { key, op, value: body.slice(opEnd + 1).trim(), negate };
}

function parseCondition(raw: string, icase: boolean): ParsedCondition {
    const cond = tokenize(raw);
    if (cond.op === 'regex') {
        if (cond.value === '') {
            throw new Error(`Invalid filter condition: ${raw}`);
        }
        try {
            cond.regex = new RegExp(cond.value, icase ? 'i' : undefined);
        } catch {
            throw new Error(`Invalid filter condition: ${raw}`);
        }
    }
    if (cond.op !== 'eq' && cond.op !== 'ne' && cond.op !== 'exists' && cond.value === '') {
        throw new Error(`Invalid filter condition: ${raw}`);
    }
    return cond;
}

function strOf(v: unknown): string {
    return String(v ?? '');
}

function coerceRhs(lhs: unknown, raw: string, icase: boolean): unknown {
    const t = raw.trim();
    if (typeof lhs === 'boolean') {
        const low = t.toLowerCase();
        if (low === 'true' || low === '1') return true;
        if (low === 'false' || low === '0') return false;
        return icase ? t.toLowerCase() : t;
    }
    if (/^-?\d+(\.\d+)?$/.test(t)) return Number(t);
    return icase ? t.toLowerCase() : t;
}

function valuesEqual(lhs: unknown, rhs: unknown, icase: boolean): boolean {
    if (typeof lhs === 'number') return typeof rhs === 'number' && lhs === rhs;
    if (typeof lhs === 'boolean') return typeof rhs === 'boolean' && lhs === rhs;
    const a = strOf(lhs);
    const b = strOf(rhs);
    return icase ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function compare(lhs: unknown, raw: string, icase: boolean): number {
    if (typeof lhs === 'number') {
        const rhs = Number(raw.trim());
        if (Number.isNaN(rhs)) return String(lhs).localeCompare(raw);
        return lhs < rhs ? -1 : lhs > rhs ? 1 : 0;
    }
    const a = strOf(lhs);
    const b = raw;
    return icase ? a.toLowerCase().localeCompare(b.toLowerCase()) : a.localeCompare(b);
}

function matches(item: Record<string, unknown>, cond: ParsedCondition, icase: boolean): boolean {
    const lhs = getPath(item, cond.key);
    let result: boolean;
    switch (cond.op) {
        case 'exists':
            result = lhs !== null && lhs !== undefined;
            break;
        case 'eq':
            if (lhs === null || lhs === undefined) {
                result = false;
                break;
            }
            result = valuesEqual(lhs, coerceRhs(lhs, cond.value, icase), icase);
            break;
        case 'ne':
            if (lhs === null || lhs === undefined) {
                result = true;
                break;
            }
            result = !valuesEqual(lhs, coerceRhs(lhs, cond.value, icase), icase);
            break;
        case 'gt':
        case 'gte':
        case 'lt':
        case 'lte': {
            if (lhs === null || lhs === undefined) {
                result = false;
                break;
            }
            const cmp = compare(lhs, cond.value, icase);
            result =
                cond.op === 'gt'
                    ? cmp > 0
                    : cond.op === 'gte'
                      ? cmp >= 0
                      : cond.op === 'lt'
                        ? cmp < 0
                        : cmp <= 0;
            break;
        }
        case 'contains': {
            const hay = strOf(lhs);
            const needle = cond.value;
            result = icase
                ? hay.toLowerCase().includes(needle.toLowerCase())
                : hay.includes(needle);
            break;
        }
        case 'startsWith': {
            const hay = strOf(lhs);
            const needle = cond.value;
            result = icase
                ? hay.toLowerCase().startsWith(needle.toLowerCase())
                : hay.startsWith(needle);
            break;
        }
        case 'endsWith': {
            const hay = strOf(lhs);
            const needle = cond.value;
            result = icase
                ? hay.toLowerCase().endsWith(needle.toLowerCase())
                : hay.endsWith(needle);
            break;
        }
        case 'regex':
            result = cond.regex!.test(strOf(lhs));
            break;
    }
    return cond.negate ? !result : result;
}

/**
 * Built-in `filter` command. Keeps only pipeline objects that match
 * comma-separated conditions, e.g. `role=admin,age>=18`.
 *
 * Each condition is `key<operator>value`; nested paths use dot notation
 * (`user.name=Alice`). Supported operators:
 *
 * | Operator | Meaning |
 * |---|---|
 * | `key=value` | Equal (numbers, booleans and strings; numeric strings coerce to numbers) |
 * | `key!=value` | Not equal |
 * | `key>value`, `key>=value`, `key<value`, `key<=value` | Relational comparison |
 * | `key~value` | Contains substring |
 * | `key^value` | Starts with |
 * | `key$value` | Ends with |
 * | `key=~regex` | Regular expression match |
 * | `key` | Key exists (non-null) |
 *
 * A leading `!` negates a single condition and `!!` cancels out. `null`/missing
 * values fail equality and relational conditions, pass `!=`, and read as empty
 * strings for string operators. Conditions combine with AND unless `--any` is
 * given; `--not` inverts the whole predicate and `--icase` enables
 * case-insensitive string comparison.
 *
 * Intended as an intermediate pipeline command: matching objects are emitted via
 * {@link CommandContext.output}, and a hint is printed when run with no
 * downstream pipe.
 *
 * @example
 * ```
 * cmd | filter role=admin,state=running | next_cmd
 * cmd | filter !name=~^X --any | next_cmd
 * cmd | filter name=~^bot|^host | next_cmd
 * ```
 */
export class FilterCommand extends Command {
    constructor() {
        super(
            'filter',
            'Filter pipeline objects by conditions',
            [
                {
                    name: 'conditions',
                    description: 'Comma-separated conditions, e.g. role=admin,age>=18',
                    position: 0,
                    schema: z.array(z.string())
                },
                {
                    name: 'any',
                    description: 'Match records satisfying any condition (OR)',
                    schema: z.boolean()
                },
                { name: 'not', description: 'Invert the whole predicate', schema: z.boolean() },
                {
                    name: 'icase',
                    description: 'Case-insensitive string comparison',
                    schema: z.boolean()
                }
            ],
            undefined,
            PipelineInputAcceptance.Array,
            true
        );
    }

    /**
     * @param ctx - Execution context. When `ctx.output` is absent (no downstream
     *   `|` segment) a usage hint is written to stdout instead.
     * @param args - Provides the positional `conditions` argument plus the
     *   `--any`, `--not` and `--icase` flags.
     * @throws {Error} When a condition cannot be parsed (empty key or value,
     *   unknown operator, or invalid regex).
     */
    async execute(ctx: CommandContext, args: CommandArguments): Promise<void> {
        if (!ctx.output) {
            ctx.stdout.write(
                'filter is an intermediate pipeline command. Use it like: cmd | filter role=admin,state=running | next\n'
            );
            return;
        }
        const items = await args.requirePipelineArray();
        if (items.length === 0) return;
        const conditions = (
            args.has('conditions') ? await args.require<string[]>('conditions') : []
        )
            .map((s) => s.trim())
            .filter((s) => s !== '');
        if (conditions.length === 0) {
            ctx.output.submit(items);
            return;
        }
        const any = await args.flag('any');
        const not = await args.flag('not');
        const icase = await args.flag('icase');
        const parsed: ParsedCondition[] = conditions.map((c) => parseCondition(c, icase));
        const filtered = items.filter((item) => {
            const ok = any
                ? parsed.some((cond) => matches(item, cond, icase))
                : parsed.every((cond) => matches(item, cond, icase));
            return not ? !ok : ok;
        });
        ctx.output.submit(filtered);
    }
}
