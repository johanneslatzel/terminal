import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { Command, PipelineInputAcceptance, type CommandContext } from '../types.js';
import type { CommandArguments } from '../command-arguments.js';
import { z } from 'zod';
import { parseJson } from './json.js';
import { parseCsv } from './csv.js';

/** Supported file formats, inferred from the file extension. */
export type FileFormat = 'json' | 'csv';

const SUPPORTED_EXTENSIONS: Record<string, FileFormat> = {
    '.json': 'json',
    '.csv': 'csv'
};

/**
 * Resolve a file path's extension to a supported format.
 *
 * @param path - The file path.
 * @returns The format.
 * @throws {Error} For an unsupported extension.
 */
export function formatForPath(path: string): FileFormat {
    const ext = extname(path).toLowerCase();
    const format = SUPPORTED_EXTENSIONS[ext];
    if (!format) {
        throw new Error(`Unsupported file extension "${ext}". Supported formats: json, csv`);
    }
    return format;
}

/**
 * Built-in `from` command. Reads a JSON or CSV file (format inferred from
 * the extension) and submits each record as a pipeline object. CSV files
 * default to the terminal's configured delimiter (`;` by default);
 * pass `--delimiter` to override.  Intended as a pipeline source.
 *
 * @example
 * ```
 * from data.csv | sort name | table
 * from data.csv --delimiter ',' | table
 * from out.json | filter role=admin
 * ```
 */
export class FromCommand extends Command {
    constructor() {
        super(
            'from',
            'Read pipeline objects from a JSON/CSV file',
            [
                {
                    name: 'file',
                    description: 'Path to the file to read (format by extension)',
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
            PipelineInputAcceptance.None,
            true
        );
    }

    async execute(ctx: CommandContext, args: CommandArguments): Promise<void> {
        const file = await args.require<string>('file');
        let text: string;
        try {
            text = await readFile(file, 'utf8');
        } catch (error) {
            throw new Error(`Failed to read ${file}: ${(error as Error).message}`, {
                cause: error
            });
        }
        const format = formatForPath(file);
        const delimiter = args.has('delimiter')
            ? await args.require<string>('delimiter')
            : ctx.terminal.defaultDelimiter;
        const records = format === 'json' ? parseJson(text, file) : parseCsv(text, file, delimiter);
        if (ctx.output) {
            ctx.output.submit(records);
        }
    }
}
