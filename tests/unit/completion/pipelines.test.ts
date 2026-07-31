import { describe, it, expect } from 'vitest';
import { Completer } from '../../../src/completion/completer.js';
import { CommandTree } from '../../../src/command-tree.js';
import { Command, CommandContainer, PipelineInputAcceptance } from '../../../src/types.js';
import { z } from 'zod';
import { ExitCommand } from '../../../src/commands/exit.js';
import { SelectCommand } from '../../../src/commands/select.js';

describe('Completer', () => {
    // -------------------------------------------------------------------
    // pipeline completion
    // -------------------------------------------------------------------

    function pipelineTree() {
        const tree = new CommandTree();
        const list = new (class extends Command {
            async execute() {}
        })('list', 'List', [{ name: 'query', schema: z.string() }]);
        const game = new (class extends CommandContainer {
            async execute() {}
        })('game', 'Game');
        game.add(list);
        tree.add(game);
        tree.add(new SelectCommand());
        tree.add(
            new (class extends Command {
                async execute() {}
            })(
                'sort',
                'Sort',
                [
                    { name: 'column', schema: z.string() },
                    { name: 'order', schema: z.string() }
                ],
                undefined,
                PipelineInputAcceptance.Array,
                true
            )
        );
        tree.add(
            new (class extends Command {
                async execute() {}
            })('table', 'Table', undefined, undefined, PipelineInputAcceptance.Array)
        );
        tree.add(new ExitCommand());
        return tree;
    }

    function consumerTree() {
        const tree = new CommandTree();
        const list = new (class extends Command {
            async execute() {}
        })('list', 'List', [{ name: 'query', schema: z.string() }]);
        const game = new (class extends CommandContainer {
            async execute() {}
        })('game', 'Game');
        game.add(list);
        tree.add(game);
        tree.add(
            new (class extends Command {
                async execute() {}
            })(
                'consumer',
                'Consumer',
                [
                    { name: 'city', schema: z.string() },
                    { name: 'role', schema: z.string() },
                    { name: 'mode', schema: z.enum(['fast', 'slow']) }
                ],
                undefined,
                PipelineInputAcceptance.Array
            )
        );
        return tree;
    }

    it('suggests only pipeline-capable root commands after a pipeline separator', () => {
        const completer = new Completer(pipelineTree());
        const { matches, partial } = completer.complete('game list | ');
        expect(partial).toBe('');
        expect(matches).toContain('sort');
        expect(matches).toContain('table');
        expect(matches).not.toContain('exit');
        expect(matches).not.toContain('--query');
    });

    it('completes partial root command after a pipeline separator', () => {
        const completer = new Completer(pipelineTree());
        const { matches, partial } = completer.complete('game list | so');
        expect(partial).toBe('so');
        expect(matches).toEqual(['sort']);
    });

    it('completes flags of the command after a pipeline separator', () => {
        const completer = new Completer(pipelineTree());
        const { matches, partial } = completer.complete('game list | sort ');
        expect(partial).toBe('');
        expect(matches).toEqual(['--column', '--order']);
    });

    it('scopes used-flag collection to the current pipeline segment', () => {
        const tree = new CommandTree();
        tree.add(
            new (class extends Command {
                async execute() {}
            })(
                'producer',
                'Producer',
                [{ name: 'city', schema: z.string() }],
                undefined,
                PipelineInputAcceptance.None,
                true
            )
        );
        tree.add(
            new (class extends Command {
                async execute() {}
            })(
                'consumer',
                'Consumer',
                [
                    { name: 'city', schema: z.string() },
                    { name: 'role', schema: z.string() }
                ],
                undefined,
                PipelineInputAcceptance.Array
            )
        );

        const completer = new Completer(tree);
        const { matches } = completer.complete('producer --city Paris | consumer --role x --');
        expect(matches).toEqual(['--city']);
    });

    it('completes after a multi-stage pipeline', () => {
        const completer = new Completer(pipelineTree());
        const { matches, partial } = completer.complete('game list | sort --column name | t');
        expect(partial).toBe('t');
        expect(matches).toEqual(['table']);
    });

    it('returns no completions for a pipe without a trailing space', () => {
        const completer = new Completer(pipelineTree());
        const { matches, partial } = completer.complete('game list |');
        expect(partial).toBe('|');
        expect(matches).toEqual([]);
    });

    it('suggests pipeline-capable commands for a leading pipe', () => {
        const completer = new Completer(pipelineTree());
        const { matches, partial } = completer.complete('| ');
        expect(partial).toBe('');
        expect(matches).toContain('sort');
        expect(matches).toContain('table');
        expect(matches).not.toContain('exit');
    });

    it('excludes non-pipeline commands even when they match the prefix', () => {
        const completer = new Completer(pipelineTree());
        const { matches, partial } = completer.complete('game list | e');
        expect(partial).toBe('e');
        expect(matches).toEqual([]);
    });

    it('suggests all pipeline-capable commands sharing the prefix', () => {
        const completer = new Completer(pipelineTree());
        const { matches, partial } = completer.complete('game list | s');
        expect(partial).toBe('s');
        expect(matches).toEqual(['select', 'sort']);
    });

    it('suggests aliases of pipeline-capable commands after a pipe', () => {
        const tree = new CommandTree();
        const list = new (class extends Command {
            async execute() {}
        })('list');
        const game = new (class extends CommandContainer {
            async execute() {}
        })('game');
        game.add(list);
        tree.add(game);
        tree.add(
            new (class extends Command {
                async execute() {}
            })('sorter', 'Sort', [], ['srt'], PipelineInputAcceptance.Array)
        );

        const completer = new Completer(tree);
        const { matches: exact } = completer.complete('game list | srt');
        expect(exact).toEqual(['srt']);
        const { matches: all } = completer.complete('game list | ');
        expect(all).toContain('srt');
        expect(all).toContain('sorter');
    });

    it('completes subcommands of a container typed after a pipe', () => {
        const completer = new Completer(pipelineTree());
        const { matches, partial } = completer.complete('game list | game ');
        expect(partial).toBe('');
        expect(matches).toEqual(['list']);
    });

    it('completes partial flag names of the post-pipe command', () => {
        const completer = new Completer(pipelineTree());
        const { matches, partial } = completer.complete('game list | sort --c');
        expect(partial).toBe('--c');
        expect(matches).toEqual(['--column']);
    });

    it('offers the remaining flags after a flag+value in the post-pipe segment', () => {
        const completer = new Completer(consumerTree());
        const { matches } = completer.complete('game list | consumer --city x ');
        expect(matches).toEqual(['--role', '--mode']);
    });

    it('completes enum values for a flag of the post-pipe command', () => {
        const completer = new Completer(consumerTree());
        const { matches, partial } = completer.complete('game list | consumer --mode f');
        expect(partial).toBe('f');
        expect(matches).toEqual(['fast']);
    });

    it('suggests pipeline commands again after a multi-stage pipe', () => {
        const completer = new Completer(pipelineTree());
        const { matches, partial } = completer.complete('game list | sort --column name | ');
        expect(partial).toBe('');
        expect(matches).toContain('select');
        expect(matches).toContain('sort');
        expect(matches).not.toContain('exit');
    });

    it('returns no matches after a pipe when no command accepts pipeline input', () => {
        const tree = new CommandTree();
        const list = new (class extends Command {
            async execute() {}
        })('list');
        const game = new (class extends CommandContainer {
            async execute() {}
        })('game');
        game.add(list);
        tree.add(game);
        tree.add(new ExitCommand());

        const completer = new Completer(tree);
        const { matches } = completer.complete('game list | ');
        expect(matches).toEqual([]);
    });

    it('does not treat a pipe glued to text as a separator', () => {
        const completer = new Completer(pipelineTree());
        const { matches, partial } = completer.complete('game list |so');
        expect(partial).toBe('|so');
        expect(matches).toEqual([]);
    });

    it('isolates used flags across three pipeline segments', () => {
        const tree = new CommandTree();
        tree.add(
            new (class extends Command {
                async execute() {}
            })(
                'producer',
                'Producer',
                [{ name: 'a', schema: z.string() }],
                undefined,
                PipelineInputAcceptance.None,
                true
            )
        );
        tree.add(
            new (class extends Command {
                async execute() {}
            })(
                'mid',
                'Mid',
                [{ name: 'b', schema: z.string() }],
                undefined,
                PipelineInputAcceptance.Array,
                true
            )
        );
        tree.add(
            new (class extends Command {
                async execute() {}
            })(
                'final',
                'Final',
                [
                    { name: 'a', schema: z.string() },
                    { name: 'c', schema: z.string() }
                ],
                undefined,
                PipelineInputAcceptance.Array
            )
        );

        const completer = new Completer(tree);
        const { matches } = completer.complete('producer --a 1 | mid --b 2 | final ');
        expect(matches).toEqual(['--a', '--c']);
    });

    it('suggests all root commands for a whitespace-only line', () => {
        const completer = new Completer(pipelineTree());
        const { matches, partial } = completer.complete(' ');
        expect(partial).toBe('');
        expect(matches).toContain('game');
        expect(matches).toContain('sort');
        expect(matches).toContain('exit');
    });

    it('suggests flags even when a bare positional token precedes the space', () => {
        const tree = new CommandTree();
        tree.add(
            new (class extends Command {
                async execute() {}
            })('create', 'Create', [
                { name: 'username', schema: z.string() },
                { name: 'role', schema: z.string() }
            ])
        );

        const completer = new Completer(tree);
        const { matches } = completer.complete('create alice ');
        expect(matches).toEqual(['--username', '--role']);
    });

    it('falls back to all root commands when a stray flag follows the pipe', () => {
        const completer = new Completer(pipelineTree());
        const { matches, partial } = completer.complete('game list | --role ');
        expect(partial).toBe('');
        expect(matches).toContain('game');
        expect(matches).toContain('exit');
    });
});
