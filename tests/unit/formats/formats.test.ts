import { describe, it, expect } from 'vitest';
import { parseJson, serializeJson } from '../../../src/commands/json.js';
import { escapeCsvCell, splitCsvLine, parseCsv, serializeCsv, unionKeys } from '../../../src/commands/csv.js';

describe('json format helpers', () => {
    it('rejects a JSON array containing non-objects', () => {
        expect(() => parseJson('[1, 2]', 'f.json')).toThrow('must contain only objects');
    });

    it('rejects a JSON document that is neither array nor object', () => {
        expect(() => parseJson('"hello"', 'f.json')).toThrow('must be an array or object');
        expect(() => parseJson('42', 'f.json')).toThrow('must be an array or object');
    });

    it('round-trips records through serializeJson', () => {
        const text = serializeJson([{ a: 1, b: 'x' }]);
        expect(JSON.parse(text)).toEqual([{ a: 1, b: 'x' }]);
    });

    it('parses empty arrays and empty objects', () => {
        expect(parseJson('[]', 'f.json')).toEqual([]);
        expect(parseJson('{}', 'f.json')).toEqual([{}]);
    });

    it('rejects top-level null, booleans, and arrays of non-objects', () => {
        expect(() => parseJson('null', 'f.json')).toThrow('must be an array or object');
        expect(() => parseJson('true', 'f.json')).toThrow('must be an array or object');
        expect(() => parseJson('[[]]', 'f.json')).toThrow('must contain only objects');
        expect(() => parseJson('[null]', 'f.json')).toThrow('must contain only objects');
    });

    it('throws a source-named error on malformed JSON', () => {
        expect(() => parseJson('{ not json', 'data.json')).toThrow(
            'Failed to parse JSON in data.json'
        );
        expect(() => parseJson('', 'data.json')).toThrow('Failed to parse JSON in data.json');
    });

    it('strips a leading UTF-8 BOM', () => {
        expect(parseJson('\uFEFF[{ "a": 1 }]', 'f.json')).toEqual([{ a: 1 }]);
    });

    it('serializes an empty array and preserves value types', () => {
        expect(serializeJson([])).toBe('[]');
        const rows = [{ a: 1, b: 'x', c: true, d: null, e: { f: [1, 2] } }];
        expect(JSON.parse(serializeJson(rows))).toEqual(rows);
    });

    it('lets duplicate keys resolve to the last value (RFC 8259 semi-defined)', () => {
        expect(parseJson('{"role":"user","role":"admin"}', 'f.json')).toEqual([
            { role: 'admin' }
        ]);
    });

    it('parses documents with surrounding whitespace', () => {
        expect(parseJson(' \n\t [ { "a" : 1 } ] \r\n ', 'f.json')).toEqual([{ a: 1 }]);
    });

    it('rejects JSON superset syntax with a source-named error', () => {
        for (const text of [
            '{"a":1,}', // trailing comma
            '// comment\n[]', // comments
            "{'a':1}", // single-quoted strings
            '{a:1}', // unquoted keys
            '[{"a":007}]', // leading zeros
            '[{"a":+1}]', // leading plus
            '[{"a":5.}]', // trailing decimal point
            '[{"a":0x10}]' // hex/octal literals
        ]) {
            expect(() => parseJson(text, 'f.json')).toThrow('Failed to parse JSON in f.json');
        }
    });

    it('documents number overflow to Infinity (RFC 8259 sets no range limit)', () => {
        expect(parseJson('[{"a":1e999}]', 'f.json')).toEqual([{ a: Infinity }]);
        expect(parseJson('[{"a":-1e999}]', 'f.json')).toEqual([{ a: -Infinity }]);
    });

    it('documents silent precision loss above 2^53', () => {
        expect(parseJson('[{"id":9007199254740993}]', 'f.json')).toEqual([
            { id: 9007199254740992 }
        ]);
    });

    it('parses unicode escapes, surrogate pairs, and escaped slashes', () => {
        expect(
            parseJson('{"a":"\\u00E9","b":"\\uD83D\\uDE00","c":"\\/"}', 'f.json')
        ).toEqual([{ a: 'é', b: '😀', c: '/' }]);
        expect(parseJson('{"a":"\\n\\t\\b\\f\\r\\""}', 'f.json')).toEqual([
            { a: '\n\t\b\f\r"' }
        ]);
    });

    it('serializes non-finite numbers as null and drops unsupported values', () => {
        const text = serializeJson([
            { a: 1, b: NaN, c: Infinity, d: -Infinity, e: undefined, f: Symbol('x') }
        ]);
        expect(JSON.parse(text)).toEqual([{ a: 1, b: null, c: null, d: null }]);
    });

    it('throws on BigInt values during serialization', () => {
        expect(() => serializeJson([{ a: 10n }])).toThrow(TypeError);
    });

    it('throws on circular references during serialization', () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        expect(() => serializeJson([circular])).toThrow(TypeError);
    });
});

describe('csv format helpers', () => {
    it('escapes cells containing commas, quotes, and newlines', () => {
        expect(escapeCsvCell('a,b')).toBe('"a,b"');
        expect(escapeCsvCell('say "hi"')).toBe('"say ""hi"""');
        expect(escapeCsvCell('line1\nline2')).toBe('"line1\nline2"');
        expect(escapeCsvCell('plain')).toBe('plain');
    });

    it('splits a quoted line with escaped quotes', () => {
        expect(splitCsvLine('a,"b,c","say ""hi"""')).toEqual(['a', 'b,c', 'say "hi"']);
    });

    it('skips blank lines between rows', () => {
        expect(parseCsv('name,age\nA,30\n\nB,25\n', 'f.csv')).toEqual([
            { name: 'A', age: '30' },
            { name: 'B', age: '25' }
        ]);
    });

    it('throws when a row has a mismatched cell count', () => {
        expect(() => parseCsv('name,age\nA,30\nB\n', 'f.csv')).toThrow('has 1 cells, expected 2');
    });

    it('computes the union of keys in first-seen order', () => {
        expect(unionKeys([{ b: 1 }, { a: 2, b: 3 }, { c: 4 }])).toEqual(['b', 'a', 'c']);
    });

    it('serializes JSON-stringified cells for nested values', () => {
        const text = serializeCsv([
            { name: 'A', meta: { x: 1 }, list: [1, 2], nil: null, missing: undefined }
        ]);
        expect(text).toBe('name,meta,list,nil,missing\nA,"{""x"":1}","[1,2]",,\n');
    });

    it('returns empty records for empty or whitespace-only input', () => {
        expect(parseCsv('', 'f.csv')).toEqual([]);
        expect(parseCsv('  \n\t\n', 'f.csv')).toEqual([]);
    });

    it('parses input without a trailing newline', () => {
        expect(parseCsv('name,age\nA,30', 'f.csv')).toEqual([{ name: 'A', age: '30' }]);
    });

    it('serializes no rows as an empty string', () => {
        expect(serializeCsv([])).toBe('');
    });

    it('escapes cells containing a custom delimiter', () => {
        expect(escapeCsvCell('a;b', ';')).toBe('"a;b"');
        expect(escapeCsvCell('plain', ';')).toBe('plain');
    });

    it('splits and parses with a custom delimiter', () => {
        expect(splitCsvLine('a;b;c', ';')).toEqual(['a', 'b', 'c']);
        expect(parseCsv('name;age\nA;30\n', 'f.csv', ';')).toEqual([{ name: 'A', age: '30' }]);
    });

    it('serializes with a custom delimiter', () => {
        expect(serializeCsv([{ name: 'A', age: 30 }], ';')).toBe('name;age\nA;30\n');
    });

    it('parses quoted cells with commas, newlines, and escaped quotes', () => {
        expect(
            parseCsv('a,b\n"x,y","line1\nline2"\n"say ""hi""",z\n', 'f.csv')
        ).toEqual([
            { a: 'x,y', b: 'line1\nline2' },
            { a: 'say "hi"', b: 'z' }
        ]);
    });

    it('keeps surrounding whitespace inside cells', () => {
        expect(parseCsv('a,b\n x , y \n', 'f.csv')).toEqual([{ a: ' x ', b: ' y ' }]);
    });

    it('parses CRLF line endings', () => {
        expect(parseCsv('a,b\r\n1,2\r\n', 'f.csv')).toEqual([{ a: '1', b: '2' }]);
    });

    it('returns zero records for a header-only file', () => {
        expect(parseCsv('a,b\n', 'f.csv')).toEqual([]);
    });

    it('keeps empty cells as empty strings', () => {
        expect(parseCsv('a,b\n,', 'f.csv')).toEqual([{ a: '', b: '' }]);
    });

    it('throws when a row has too many cells', () => {
        expect(() => parseCsv('a,b\n1,2,3\n', 'f.csv')).toThrow('has 3 cells, expected 2');
    });

    it('throws on an unterminated quoted field', () => {
        expect(() => splitCsvLine('a,"b', ',')).toThrow('Unterminated quoted field');
        expect(() => parseCsv('a,b\n1,"x\n', 'f.csv')).toThrow('Unterminated quoted field');
    });

    it('throws when text follows a closing quote', () => {
        expect(() => splitCsvLine('a,"b"c', ',')).toThrow(
            'Unexpected character after closing quote'
        );
    });

    it('splits a line with empty leading and trailing cells', () => {
        expect(splitCsvLine(',a,b,', ',')).toEqual(['', 'a', 'b', '']);
    });

    it('strips a leading UTF-8 BOM', () => {
        expect(parseCsv('\uFEFFa,b\n1,2\n', 'f.csv')).toEqual([{ a: '1', b: '2' }]);
    });

    it('serializes a row with no keys as an empty string', () => {
        expect(serializeCsv([{}])).toBe('');
    });

    it('quotes cells containing newlines and the custom delimiter when serializing', () => {
        const text = serializeCsv([{ note: 'a\nb', semi: 'x;y' }], ';');
        expect(text).toBe('note;semi\n"a\nb";"x;y"\n');
    });

    it('round-trips tricky cells through parse and serialize', () => {
        const rows = [{ a: 'x,y', b: 'say "hi"', c: 'line1\nline2' }];
        expect(parseCsv(serializeCsv(rows), 'f.csv')).toEqual(rows);
    });

    it('keeps CRLF inside quoted fields', () => {
        expect(parseCsv('a,b\n1,"x\r\ny"\n', 'f.csv')).toEqual([{ a: '1', b: 'x\r\ny' }]);
    });

    it('handles bare CR line endings (classic Mac)', () => {
        expect(parseCsv('a,b\r1,2\r', 'f.csv')).toEqual([{ a: '1', b: '2' }]);
    });

    it('parses a single-column file', () => {
        expect(parseCsv('a\n1\n2\n', 'f.csv')).toEqual([{ a: '1' }, { a: '2' }]);
    });

    it('parses explicitly quoted empty cells', () => {
        expect(parseCsv('a,b\n"",""\n', 'f.csv')).toEqual([{ a: '', b: '' }]);
    });

    it('resolves duplicate headers to the last value', () => {
        expect(parseCsv('name,name\nA,B\n', 'f.csv')).toEqual([{ name: 'B' }]);
    });

    it('keeps empty and whitespace-only header names', () => {
        expect(parseCsv(',b\n1,2\n', 'f.csv')).toEqual([{ '': '1', b: '2' }]);
        expect(parseCsv(' a , b \n1,2\n', 'f.csv')).toEqual([{ ' a ': '1', ' b ': '2' }]);
    });

    it('parses headers containing the delimiter via quoting', () => {
        expect(parseCsv('"first,last",age\n"Doe, John",30\n', 'f.csv')).toEqual([
            { 'first,last': 'Doe, John', age: '30' }
        ]);
    });

    it('strips quotes appearing mid-field (lenient parsing)', () => {
        expect(splitCsvLine('Bob says "hi"', ',')).toEqual(['Bob says hi']);
        expect(parseCsv('a,b\nBob says "hi",x\n', 'f.csv')).toEqual([
            { a: 'Bob says hi', b: 'x' }
        ]);
    });

    it('reports the row number and source in cell-count errors', () => {
        expect(() => parseCsv('h1,h2\n1,2\n3\n', 'data.csv')).toThrow(
            'CSV row 2 in data.csv has 1 cells, expected 2'
        );
    });

    it('escapes, parses, and round-trips tab-delimited data', () => {
        expect(escapeCsvCell('x\ty', '\t')).toBe('"x\ty"');
        expect(parseCsv('a\tb\n1\t2\n', 'f.tsv', '\t')).toEqual([{ a: '1', b: '2' }]);
        const text = serializeCsv([{ a: 'x\ty', b: '2' }], '\t');
        expect(text).toBe('a\tb\n"x\ty"\t2\n');
        expect(parseCsv(text, 'f.tsv', '\t')).toEqual([{ a: 'x\ty', b: '2' }]);
    });

    it('parses pipe-delimited data', () => {
        expect(parseCsv('a|b\n1|2\n', 'f.csv', '|')).toEqual([{ a: '1', b: '2' }]);
    });

    it('quotes header cells containing delimiters or quotes on serialize', () => {
        const text = serializeCsv([{ 'a,b': 1, 'say "x"': 2 }]);
        expect(text).toBe('"a,b","say ""x"""\n1,2\n');
        expect(parseCsv(text, 'f.csv')).toEqual([{ 'a,b': '1', 'say "x"': '2' }]);
    });

    it('serializes numeric-looking strings verbatim, preserving leading zeros', () => {
        expect(serializeCsv([{ zip: '01234', exp: '4.15555e+9' }])).toBe(
            'zip,exp\n01234,4.15555e+9\n'
        );
        expect(parseCsv('zip\n01234\n', 'f.csv')).toEqual([{ zip: '01234' }]);
    });

    it('serializes NaN, Infinity, and bigint cells as their string form', () => {
        expect(serializeCsv([{ nan: NaN, inf: Infinity, big: 10n }])).toBe(
            'nan,inf,big\nNaN,Infinity,10\n'
        );
    });

    it('writes CSV-injection-looking cells verbatim', () => {
        expect(serializeCsv([{ a: '=1+1', b: '+cmd', c: '-x', d: '@x' }])).toBe(
            'a,b,c,d\n=1+1,+cmd,-x,@x\n'
        );
    });

    it('throws on circular values during serialization', () => {
        const circular: Record<string, unknown> = {};
        circular.self = circular;
        expect(() => serializeCsv([circular])).toThrow(TypeError);
    });
});