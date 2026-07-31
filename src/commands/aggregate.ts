import { Command, PipelineInputAcceptance, type CommandContext } from '../types.js';
import type { CommandArguments } from '../command-arguments.js';
import { getPath } from '../path.js';
import { z } from 'zod';

function compareValues(a: unknown, b: unknown): number {
    if (a === null) return 1;
    if (b === null) return -1;
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a).localeCompare(String(b));
}

/**
 * Measure modes supported by {@link AggregateCommand}.
 */
export enum MeasureMode {
    Count = 'count',
    Min = 'min',
    Max = 'max',
    Sum = 'sum',
    Mean = 'mean',
    Median = 'median'
}

function numericOf(v: unknown, attribute: string, mode: MeasureMode): number {
    if (typeof v === 'number') return v;
    if (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) return Number(v.trim());
    throw new Error(
        `Attribute "${attribute}" must be numeric for mode ${mode}, got ${JSON.stringify(v)}`
    );
}

function roundResult(value: number, round: number | undefined): number {
    return round === undefined ? value : Number(value.toFixed(round));
}

function aggregateValues(
    mode: MeasureMode,
    values: unknown[],
    distinct: boolean,
    round: number | undefined,
    attribute: string
): unknown {
    switch (mode) {
        case MeasureMode.Count:
            return distinct ? new Set(values).size : values.length;
        case MeasureMode.Min:
            return values.length === 0
                ? null
                : values.reduce((a, b) => (compareValues(a, b) <= 0 ? a : b));
        case MeasureMode.Max:
            return values.length === 0
                ? null
                : values.reduce((a, b) => (compareValues(a, b) >= 0 ? a : b));
        case MeasureMode.Sum:
            return roundResult(
                values.reduce((sum: number, v) => sum + numericOf(v, attribute, mode), 0),
                round
            );
        case MeasureMode.Mean: {
            if (values.length === 0) return null;
            const sum = values.reduce((s: number, v) => s + numericOf(v, attribute, mode), 0);
            return roundResult(sum / values.length, round);
        }
        case MeasureMode.Median: {
            if (values.length === 0) return null;
            const nums = values.map((v) => numericOf(v, attribute, mode)).sort((a, b) => a - b);
            const mid = Math.floor(nums.length / 2);
            if (nums.length % 2 === 1) return roundResult(nums[mid]!, round);
            return roundResult((nums[mid - 1]! + nums[mid]!) / 2, round);
        }
    }
}

/**
 * Built-in `aggregate` command. Reduces pipeline objects to a single value
 * or grouped rows using `--mode` (`count`, `min`, `max`, `sum`, `mean`,
 * `median`). Without a mode it counts objects.
 *
 * `min`, `max`, `sum`, `mean` and `median` require `--attribute`, which is
 * looked up per object (dot notation works) and coerced from numeric strings
 * where needed; `null`/missing attribute values are ignored. `--distinct`
 * counts distinct attribute values (count mode only), and `--round <n>`
 * rounds `sum`, `mean` and `median` results.
 *
 * With `--groupBy <key>` one row per group is emitted, sorted by key;
 * missing and `null` group keys collapse into a single `null` group.
 *
 * Intended as an intermediate pipeline command: results are emitted via
 * {@link CommandContext.output} and a hint is printed when run with no
 * downstream pipe.
 *
 * @example
 * ```
 * cmd | aggregate | next_cmd   # { "count": 42 }
 * cmd | aggregate -m mean -a score | next_cmd   # { "mean": 5.33 }
 * cmd | aggregate -m sum -a score -g team | next_cmd   # rows, sorted by team
 * ```
 */
export class AggregateCommand extends Command {
    constructor() {
        super(
            'aggregate',
            'Aggregate pipeline objects (count, min, max, sum, mean, median)',
            [
                {
                    name: 'mode',
                    description: 'Measure mode',
                    aliases: ['m'],
                    schema: z.enum(MeasureMode)
                },
                {
                    name: 'attribute',
                    description: 'Attribute to measure',
                    aliases: ['a'],
                    schema: z.string()
                },
                {
                    name: 'groupBy',
                    description: 'Group by key and measure per value',
                    aliases: ['g'],
                    schema: z.string()
                },
                {
                    name: 'distinct',
                    description: 'Count distinct attribute values',
                    schema: z.boolean()
                },
                {
                    name: 'round',
                    description: 'Round numeric results to this many digits',
                    schema: z.coerce.number().int().min(0)
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
     * @param args - Provides `--mode` (`-m`), `--attribute` (`-a`),
     *   `--groupBy` (`-g`), `--distinct` and `--round`.
     * @throws {Error} On invalid argument combinations (missing attribute for
     *   non-count modes, `--distinct` outside count mode, `--round` outside
     *   sum/mean/median, empty group key) or when a measured attribute value is
     *   not numeric.
     */
    async execute(ctx: CommandContext, args: CommandArguments): Promise<void> {
        if (!ctx.output) {
            ctx.stdout.write(
                'aggregate is an intermediate pipeline command. Use it like: cmd | aggregate [--mode count] [--attribute field] | next\n'
            );
            return;
        }
        const items = await args.requirePipelineArray();
        const mode = args.has('mode') ? await args.require<MeasureMode>('mode') : MeasureMode.Count;
        const attribute = args.has('attribute') ? await args.require<string>('attribute') : null;
        const groupBy = args.has('groupBy') ? await args.require<string>('groupBy') : null;
        const distinct = await args.flag('distinct');
        const round = args.has('round') ? await args.require<number>('round') : undefined;

        if (mode !== MeasureMode.Count && attribute === null) {
            throw new Error(`Attribute is required for mode ${mode}`);
        }
        if (distinct && mode !== MeasureMode.Count) {
            throw new Error('--distinct is only valid with --mode count');
        }
        if (distinct && attribute === null) {
            throw new Error('--attribute is required for --distinct');
        }
        if (
            round !== undefined &&
            mode !== MeasureMode.Sum &&
            mode !== MeasureMode.Mean &&
            mode !== MeasureMode.Median
        ) {
            throw new Error('--round is only valid with --mode sum, mean or median');
        }

        const aggregate = (bucket: Record<string, unknown>[]): unknown => {
            if (mode === MeasureMode.Count && attribute === null) return bucket.length;
            const values = bucket
                .map((item) => getPath(item, attribute!))
                .filter((v) => v !== null && v !== undefined);
            return aggregateValues(mode, values, distinct, round, attribute!);
        };

        if (groupBy !== null) {
            if (groupBy.trim() === '') {
                throw new Error(`Invalid group-by key: ${groupBy}`);
            }
            const groups = new Map<unknown, Record<string, unknown>[]>();
            for (const item of items) {
                const key = getPath(item, groupBy);
                const gkey = key === undefined ? null : key;
                const bucket = groups.get(gkey);
                if (bucket) {
                    bucket.push(item);
                } else {
                    groups.set(gkey, [item]);
                }
            }
            const rows: Record<string, unknown>[] = [...groups.entries()]
                .sort(([a], [b]) => compareValues(a, b))
                .map(([key, bucket]) => ({ [groupBy]: key, [mode]: aggregate(bucket) }));
            ctx.output.submit(rows);
            return;
        }

        ctx.output.submit([{ [mode]: aggregate(items) }]);
    }
}
