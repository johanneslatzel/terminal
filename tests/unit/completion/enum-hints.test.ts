import { describe, it, expect } from 'vitest';
import { Completer } from '../../../src/completion/completer.js';
import { CommandTree } from '../../../src/command-tree.js';
import { Command, PipelineInputAcceptance } from '../../../src/types.js';
import { z } from 'zod';

describe('Completer', () => {
    // -------------------------------------------------------------------

    class AggregateCommand extends Command {
        constructor() {
            super('aggregate', 'Aggregate pipeline objects', [
                {
                    name: 'mode',
                    description: 'Measure mode',
                    aliases: ['m'],
                    schema: z.enum(['count', 'min', 'max', 'sum', 'mean', 'median'])
                },
                {
                    name: 'attribute',
                    description: 'Attribute to measure',
                    aliases: ['a'],
                    schema: z.string()
                }
            ], undefined, PipelineInputAcceptance.Array, true);
        }
        async execute(): Promise<void> {}
    }

    function aggregateCompleter(): Completer {
        const tree = new CommandTree();
        tree.add(new AggregateCommand());
        return new Completer(tree);
    }

    it('completes an enum flag to the bare flag name without the value hint', () => {
        const { matches, partial } = aggregateCompleter().complete('aggregate --mode');
        expect(partial).toBe('--mode');
        expect(matches).toEqual(['--mode']);
    });

    it('completes a short enum flag alias without the value hint', () => {
        const { matches, partial } = aggregateCompleter().complete('aggregate -m');
        expect(partial).toBe('-m');
        expect(matches).toEqual(['-m']);
    });

    it('lists all flags for an enum-typed command without hints in candidates', () => {
        const { matches, partial } = aggregateCompleter().complete('aggregate --');
        expect(partial).toBe('--');
        expect(matches).toEqual(['--mode', '--attribute']);
    });

    it('still suggests all enum values after the flag', () => {
        const { matches, partial } = aggregateCompleter().complete('aggregate --mode ');
        expect(partial).toBe('');
        expect(matches).toEqual(['count', 'min', 'max', 'sum', 'mean', 'median']);
    });

    it('still suggests matching enum values for a partial value', () => {
        const { matches, partial } = aggregateCompleter().complete('aggregate --mode me');
        expect(partial).toBe('me');
        expect(matches).toEqual(['mean', 'median']);
    });

    it('completes a partial enum flag name to the bare flag', () => {
        const { matches } = aggregateCompleter().complete('aggregate --m');
        expect(matches).toEqual(['--mode']);
    });

    it('completes a partial enum value from a short alias', () => {
        const { matches } = aggregateCompleter().complete('aggregate -m c');
        expect(matches).toEqual(['count']);
    });

    it('lists flags and short aliases for a single dash partial without hints', () => {
        const { matches } = aggregateCompleter().complete('aggregate -');
        expect(matches).toEqual(['--mode', '-m', '--attribute', '-a']);
    });

    it('suggests matching enum values preserving declaration order', () => {
        const tree = new CommandTree();
        tree.add(
            new (class extends Command {
                async execute() {}
            })('set', 'Set', [{ name: 'option', schema: z.enum(['hello', 'hella', 'world', 'wald']) }])
        );
        const completer = new Completer(tree);
        expect(completer.complete('set --option w').matches).toEqual(['world', 'wald']);
        expect(completer.complete('set --option wo').matches).toEqual(['world']);
    });

    // -------------------------------------------------------------------
    // pipeline completion
    // -------------------------------------------------------------------

});
