import { describe, it, expect } from 'vitest';
import { tokenize } from '../../src/input/parser.js';
import { ParseError } from '../../src/errors.js';

describe('tokenize', () => {
    describe('unquoted (regression)', () => {
        it('returns empty array for empty input', () => {
            expect(tokenize('')).toEqual([]);
        });

        it('returns empty array for whitespace-only input', () => {
            expect(tokenize('   ')).toEqual([]);
        });

        it('splits single token', () => {
            expect(tokenize('hello')).toEqual(['hello']);
        });

        it('splits tokens on whitespace', () => {
            expect(tokenize('a b c')).toEqual(['a', 'b', 'c']);
        });

        it('handles multiple consecutive whitespace chars', () => {
            expect(tokenize('a  b   c')).toEqual(['a', 'b', 'c']);
        });

        it('trims leading and trailing whitespace', () => {
            expect(tokenize('  hello world  ')).toEqual(['hello', 'world']);
        });

        it('handles mixed whitespace types', () => {
            expect(tokenize('a\tb\nc')).toEqual(['a', 'b', 'c']);
        });
    });

    describe('double-quoted strings', () => {
        it('treats double-quoted content as a single token', () => {
            expect(tokenize('"hello world"')).toEqual(['hello world']);
        });

        it('strips double quotes from token', () => {
            expect(tokenize('"hello"')).toEqual(['hello']);
        });

        it('handles empty double quotes', () => {
            expect(tokenize('""')).toEqual(['']);
        });

        it('mixes double-quoted tokens with unquoted tokens', () => {
            expect(tokenize('--message "hello world"')).toEqual(['--message', 'hello world']);
        });

        it('preserves internal whitespace in quoted string', () => {
            expect(tokenize('"a   b"')).toEqual(['a   b']);
        });
    });

    describe('single-quoted strings', () => {
        it('treats single-quoted content as a single token', () => {
            expect(tokenize("'hello world'")).toEqual(['hello world']);
        });

        it('strips single quotes from token', () => {
            expect(tokenize("'hello'")).toEqual(['hello']);
        });

        it('handles empty single quotes', () => {
            expect(tokenize("''")).toEqual(['']);
        });

        it('preserves internal whitespace in single-quoted string', () => {
            expect(tokenize("'a   b'")).toEqual(['a   b']);
        });
    });

    describe('both quote types', () => {
        it('treats single and double quotes identically', () => {
            expect(tokenize('"hello world"')).toEqual(['hello world']);
            expect(tokenize("'hello world'")).toEqual(['hello world']);
        });

        it('allows double quote inside single quotes', () => {
            expect(tokenize('\'she said "hello"\'')).toEqual(['she said "hello"']);
        });

        it('allows single quote inside double quotes', () => {
            expect(tokenize('"it\'s fine"')).toEqual(["it's fine"]);
        });
    });

    describe('escaped quotes', () => {
        it('handles escaped double-quotes inside double-quoted string', () => {
            const input = String.raw`"foo \"bar\" baz"`;
            expect(tokenize(input)).toEqual(['foo "bar" baz']);
        });

        it('handles escaped single-quotes inside single-quoted string', () => {
            const input = String.raw`'foo \'bar\' baz'`;
            expect(tokenize(input)).toEqual(["foo 'bar' baz"]);
        });

        it('handles escaped backslash before quote', () => {
            const input = String.raw`"foo\\bar"`;
            expect(tokenize(input)).toEqual(['foo\\bar']);
        });

        it('handles multiple escaped sequences', () => {
            const input = String.raw`"a\"b\\c\"d"`;
            expect(tokenize(input)).toEqual(['a"b\\c"d']);
        });

        it('produces literal double-quote with \\" at end of quoted string', () => {
            const input = String.raw`"foo\""`;
            expect(tokenize(input)).toEqual(['foo"']);
        });
    });

    describe('backslash at end inside quotes', () => {
        it('treats trailing backslash as literal then errors on unclosed quote', () => {
            expect(() => tokenize('"foo\\')).toThrow(ParseError);
            expect(() => tokenize('"foo\\')).toThrow('Unclosed');
        });
    });

    describe('adjacent character errors', () => {
        it('throws ParseError for chars before opening double quote', () => {
            expect(() => tokenize('foo"bar"')).toThrow(ParseError);
        });

        it('throws ParseError for chars before opening single quote', () => {
            expect(() => tokenize("foo'bar'")).toThrow(ParseError);
        });

        it('throws ParseError for chars after closing double quote', () => {
            expect(() => tokenize('"bar"foo')).toThrow(ParseError);
        });

        it('throws ParseError for chars after closing single quote', () => {
            expect(() => tokenize("'bar'foo")).toThrow(ParseError);
        });

        it('throws ParseError for chars on both sides of quotes', () => {
            expect(() => tokenize('a"b"c')).toThrow(ParseError);
        });

        it('includes the problematic character in the error for after-quote', () => {
            expect(() => tokenize('"bar"foo')).toThrow('"f"');
        });

        it('includes the current token in the error for before-quote', () => {
            expect(() => tokenize('foo"bar"')).toThrow('"foo"');
        });
    });

    describe('unclosed quotes', () => {
        it('throws ParseError for unclosed double quote', () => {
            expect(() => tokenize('"unclosed')).toThrow(ParseError);
        });

        it('throws ParseError for unclosed single quote', () => {
            expect(() => tokenize("'unclosed")).toThrow(ParseError);
        });

        it('includes the quote type in the error', () => {
            expect(() => tokenize('"unclosed')).toThrow('Unclosed "');
            expect(() => tokenize("'unclosed")).toThrow("Unclosed '");
        });
    });

    describe('multiple quoted strings', () => {
        it('handles two quoted strings', () => {
            expect(tokenize('"foo" "bar"')).toEqual(['foo', 'bar']);
        });

        it('mixes quoted strings with --flags', () => {
            expect(tokenize('--arg1 "val 1" --arg2 "val 2"')).toEqual([
                '--arg1',
                'val 1',
                '--arg2',
                'val 2'
            ]);
        });

        it('handles quoted, unquoted, and flags together', () => {
            expect(tokenize("cmd 'pos arg' --flag value")).toEqual([
                'cmd',
                'pos arg',
                '--flag',
                'value'
            ]);
        });
    });

    describe('real-world command patterns', () => {
        it('tokenizes a quoted --message argument', () => {
            expect(tokenize('print --message "hello world"')).toEqual([
                'print',
                '--message',
                'hello world'
            ]);
        });

        it('tokenizes a command with a quoted long argument', () => {
            const input = String.raw`config set --value "some \"quoted\" text"`;
            expect(tokenize(input)).toEqual(['config', 'set', '--value', 'some "quoted" text']);
        });
    });
});
