import { Command, PipelineInputAcceptance, type CommandContext } from '../types.js';
import type { CommandArguments } from '../command-arguments.js';

/**
 * Escape a single CSV cell: wrap in double quotes when it contains the field
 * delimiter, a double quote, newline, or carriage return, escaping embedded
 * quotes by doubling them.
 *
 * @param value - The raw cell value.
 * @param delimiter - The field separator (default `,`).
 * @returns The CSV-escaped cell text.
 */
export function escapeCsvCell(value: string, delimiter = ','): string {
    if (/[",\r\n]/.test(value) || value.includes(delimiter)) {
        return '"' + value.replace(/"/g, '""') + '"';
    }
    return value;
}

/**
 * Split a CSV line into cells respecting double-quoted sections where
 * delimiters and newlines may appear. Quotes inside quoted sections are
 * escaped by doubling.
 *
 * @param line - A single logical CSV row (may contain embedded newlines).
 * @param delimiter - The field separator (default `,`).
 * @returns The parsed cells.
 * @throws {Error} When a quoted field is not terminated or text follows a
 *   closing quote.
 */
export function splitCsvLine(line: string, delimiter = ','): string[] {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    let i = 0;
    while (i < line.length) {
        const c = line[i]!;
        if (inQuotes) {
            if (c === '"') {
                if (line[i + 1] === '"') {
                    current += '"';
                    i += 2;
                    continue;
                }
                inQuotes = false;
                i += 1;
                if (i < line.length && line[i] !== delimiter) {
                    throw new Error('Unexpected character after closing quote in CSV line');
                }
                continue;
            }
            current += c;
            i += 1;
            continue;
        }
        if (c === '"') {
            inQuotes = true;
            i += 1;
            continue;
        }
        if (c === delimiter) {
            cells.push(current);
            current = '';
            i += 1;
            continue;
        }
        current += c;
        i += 1;
    }
    if (inQuotes) {
        throw new Error('Unterminated quoted field in CSV line');
    }
    cells.push(current);
    return cells;
}

/**
 * Parse CSV text into pipeline records. The first non-empty line is the
 * header row naming the columns; every subsequent logical row becomes a
 * record keyed by those headers. All cells are strings per CSV semantics.
 *
 * @param text - The CSV document text.
 * @param source - File name used in error messages.
 * @param delimiter - The field separator (default `,`).
 * @returns The parsed records; empty when the document has no header row.
 * @throws {Error} When a row has more or fewer cells than the header row.
 */
export function parseCsv(text: string, source: string, delimiter = ','): Record<string, unknown>[] {
    const rows = splitCsvRows(text.replace(/^\uFEFF/, ''));
    if (rows.length === 0) return [];
    const headers = splitCsvLine(rows[0]!, delimiter);

    const records: Record<string, unknown>[] = [];
    for (let r = 1; r < rows.length; r++) {
        const cells = splitCsvLine(rows[r]!, delimiter);
        if (cells.length !== headers.length) {
            throw new Error(
                `CSV row ${r} in ${source} has ${cells.length} cells, expected ${headers.length}`
            );
        }
        const record: Record<string, unknown> = {};
        for (let c = 0; c < headers.length; c++) {
            record[headers[c]!] = cells[c]!;
        }
        records.push(record);
    }
    return records;
}

/**
 * Split CSV text into logical rows, respecting quoted sections where newlines
 * and carriage returns do not terminate a row.
 *
 * @param text - The CSV document text.
 * @returns The logical rows (with surrounding whitespace preserved inside
 *   lines, but trailing line breaks removed).
 */
function splitCsvRows(text: string): string[] {
    const rows: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
        const c = text[i]!;
        if (inQuotes) {
            current += c;
            if (c === '"') {
                if (text[i + 1] === '"') {
                    current += text[i + 1]!;
                    i += 1;
                } else {
                    inQuotes = false;
                }
            }
            continue;
        }
        if (c === '"') {
            inQuotes = true;
            current += c;
            continue;
        }
        if (c === '\n' || c === '\r') {
            if (current.trim() !== '') rows.push(current);
            current = '';
            continue;
        }
        current += c;
    }
    if (current.trim() !== '') rows.push(current);
    return rows;
}

/**
 * Compute the union of all keys across the given records, preserving
 * first-seen order.
 *
 * @param rows - The records.
 * @returns The ordered column names.
 */
export function unionKeys(rows: Record<string, unknown>[]): string[] {
    const keys = new Set<string>();
    for (const row of rows) {
        for (const key of Object.keys(row)) {
            keys.add(key);
        }
    }
    return Array.from(keys);
}

/**
 * Serialize pipeline records as a CSV document. The header is the union of
 * all keys; each row emits one cell per column. Cells that are objects or
 * arrays are JSON-stringified; `null`/missing values render as empty cells.
 *
 * @param rows - The records to serialize.
 * @param delimiter - The field separator (default `,`).
 * @returns The CSV document text.
 */
export function serializeCsv(rows: Record<string, unknown>[], delimiter = ','): string {
    if (rows.length === 0) return '';
    const columns = unionKeys(rows);
    if (columns.length === 0) return '';
    const lines = [columns.map((key) => escapeCsvCell(key, delimiter)).join(delimiter)];
    for (const row of rows) {
        const cells = columns.map((key) => {
            const v = row[key];
            const text = typeof v === 'object' && v !== null ? JSON.stringify(v) : String(v ?? '');
            return escapeCsvCell(text, delimiter);
        });
        lines.push(cells.join(delimiter));
    }
    return lines.join('\n') + '\n';
}

/**
 * Built-in `csv` command. Formats pipeline objects as a CSV document with a
 * header row spanning the union of all keys; cells containing commas,
 * quotes, or newlines are quoted.
 */
export class CsvCommand extends Command {
    constructor() {
        super(
            'csv',
            'Format pipeline objects as CSV',
            [],
            undefined,
            PipelineInputAcceptance.Array,
            false
        );
    }

    async execute(ctx: CommandContext, args: CommandArguments): Promise<void> {
        const rows = await args.requirePipelineArray();
        if (rows.length === 0) return;
        const columns = unionKeys(rows);
        if (columns.length === 0) return;
        ctx.stdout.write(serializeCsv(rows));
    }
}
