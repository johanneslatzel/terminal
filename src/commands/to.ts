import { writeFile } from 'node:fs/promises';
import { Command, PipelineInputAcceptance, type CommandContext } from '../types.js';
import type { CommandArguments } from '../command-arguments.js';
import { z } from 'zod';
import { serializeJson } from './json.js';
import { serializeCsv } from './csv.js';
import { formatForPath } from './from.js';

/**
 * Built-in `to` command. Writes pipeline objects to a JSON or CSV file
 * (format inferred from the extension). CSV files default to the
 * terminal's configured delimiter (`;` by default); pass `--delimiter`
 * to override.
 *
 * @example
 * ```
 * cmd | select name,age | to out.csv
 * cmd | select name,age | to out.csv --delimiter ','
 * ls | filter size>1024 | to out.json
 * ```
 */
export class ToCommand extends Command {
    constructor() {
        super(
            'to',
            'Write pipeline objects to a JSON/CSV file',
            [
                {
                    name: 'file',
                    description: 'Path to the file to write (format by extension)',
                    position: 0,
                    schema: z.string()
                },
                {
                    name: 'delimiter',
                    description: 'CSV field separator (single character, default ;)',
                    schema: z.string().length(1)
                }
            ],
            undefined,
            PipelineInputAcceptance.Array,
            false
        );
    }

    async execute(ctx: CommandContext, args: CommandArguments): Promise<void> {
        const file = await args.require<string>('file');
        const rows = await args.requirePipelineArray();
        const format = formatForPath(file);
        const delimiter = args.has('delimiter')
            ? await args.require<string>('delimiter')
            : ctx.terminal.defaultDelimiter;
        const output = format === 'json' ? serializeJson(rows) : serializeCsv(rows, delimiter);
        try {
            await writeFile(file, output, 'utf8');
        } catch (error) {
            throw new Error(`Failed to write ${file}: ${(error as Error).message}`, {
                cause: error
            });
        }
    }
}
