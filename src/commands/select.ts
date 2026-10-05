import { Command, PipelineInputAcceptance, type CommandContext } from '../types.js';
import type { CommandArguments } from '../command-arguments.js';
import { getPath } from '../path.js';
import { InvalidArgumentsError } from '../errors.js';
import { z } from 'zod';

/**
 * A parsed projection from the comma-separated attributes list. Each projection
 * emits exactly one output key per item.
 *
 * - `keep` reads an own top-level key from the item into the same-named output.
 * - `rename` resolves a (possibly dotted) source path on the item into a new
 *   output key.
 * - `literal` emits a constant (empty-string) value for the output key.
 */
interface Projection {
    output: string;
    kind: 'keep' | 'rename' | 'literal';
    source?: string;
}

/**
 * Parse a single projection token.
 *
 * A token without `=` is a keep of that own top-level key. A token with `=` is
 * `new=old`: the left side is the output (new) key and the right side is the
 * source. A non-empty source is resolved via getPath (rename); an empty source
 * (`new=`) emits an empty-string literal. An empty output key is rejected.
 *
 * @param raw - The raw projection token.
 * @returns The parsed projection.
 * @throws {InvalidArgumentsError} When the output key is empty.
 */
function parseProjection(raw: string): Projection {
    const eq = raw.indexOf('=');
    if (eq === -1) {
        return { output: raw.trim(), kind: 'keep' };
    }
    const output = raw.slice(0, eq).trim();
    if (output.length === 0) {
        throw new InvalidArgumentsError(`Invalid select pair "${raw}": new key must not be empty`);
    }
    const source = raw.slice(eq + 1).trim();
    if (source.length === 0) {
        return { output, kind: 'literal' };
    }
    return { output, kind: 'rename', source };
}

/**
 * Built-in `select` command. Picks attributes from pipeline objects, passing
 * only those attributes downstream, and can rename or set them.
 *
 * Each comma-separated item is one projection:
 *
 * | Form | Meaning |
 * |---|---|
 * | `key` | Keep the item's own top-level `key` as-is |
 * | `new=old` | Rename: resolve source `old` (dot-notation supported) into output `new` |
 * | `new=` | Emit `new` as an empty string (literal) |
 *
 * A rename source may be a nested path (`user.name`), matching `filter`; a
 * missing source path is silently ignored. Pairs apply against the original
 * item keys (no chaining), so `a=b, b=a` swaps both values. Empty keep lists
 * pass the input through unchanged. Intended as an intermediate pipeline
 * command.
 *
 * @example
 * ```
 * cmd | select name,age | next_cmd
 * cmd | select id=taskId | next_cmd
 * cmd | select author=, user.name=owner | next_cmd
 * ```
 */
export class SelectCommand extends Command {
    constructor() {
        super(
            'select',
            'Pick, rename and set attributes on pipeline objects',
            [
                {
                    name: 'attributes',
                    description:
                        'Attribute names, renames (new=old) or literals (new=), comma-separated',
                    position: 0,
                    schema: z.array(z.string())
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
     * @param args - Provides the positional `attributes` argument.
     * @throws {InvalidArgumentsError} When a projection has an empty output key.
     */
    async execute(ctx: CommandContext, args: CommandArguments): Promise<void> {
        if (!ctx.output) {
            ctx.stdout.write(
                'select is an intermediate pipeline command. Use it like: cmd | select attr1,attr2 | next_cmd\n'
            );
            return;
        }

        const items = await args.requirePipelineArray();
        if (items.length === 0) return;

        const attrs: string[] = args.has('attributes')
            ? await args.require<string[]>('attributes')
            : [];

        if (attrs.length === 0) {
            ctx.output.submit(items);
            return;
        }

        const projections = attrs.map(parseProjection);

        for (const item of items) {
            const picked: Record<string, unknown> = {};
            for (const proj of projections) {
                if (proj.kind === 'keep') {
                    if (Object.hasOwn(item, proj.output)) {
                        picked[proj.output] = item[proj.output];
                    }
                } else if (proj.kind === 'literal') {
                    picked[proj.output] = '';
                } else {
                    const value = getPath(item, proj.source!);
                    if (value !== undefined) {
                        picked[proj.output] = value;
                    }
                }
            }
            ctx.output.submit(picked);
        }
    }
}
