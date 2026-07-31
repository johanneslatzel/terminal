import { describe, it, expect } from 'vitest';
import { PipelineInputAcceptance } from '../../../src/types.js';
import { command } from '../../../src/command-factory.js';
describe('command() factory with pipeline attributes', () => {
    it('accepts pipeline params without argDefs', () => {
        const cmd = command(
            'producer',
            async () => {},
            { description: 'Produces output', acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true }
        );
        expect(cmd.providesPipelineOutput()).toBe(true);
        expect(cmd.acceptsPipelineInput()).toBe(PipelineInputAcceptance.None);
    });

    it('accepts pipeline params with argDefs', () => {
        const cmd = command(
            'consumer',
            async () => {},
            { description: 'Consumes input', acceptsPipelineInput: PipelineInputAcceptance.Array }
        );
        expect(cmd.acceptsPipelineInput()).toBe(PipelineInputAcceptance.Array);
        expect(cmd.providesPipelineOutput()).toBe(false);
    });

    it('accepts pipeline params with aliases (no argDefs)', () => {
        const cmd = command(
            'producer',
            async () => {},
            { description: 'Produces output', aliases: ['p'], acceptsPipelineInput: PipelineInputAcceptance.None, providesPipelineOutput: true }
        );
        expect(cmd.aliases()).toEqual(['p']);
        expect(cmd.providesPipelineOutput()).toBe(true);
    });

    it('accepts pipeline params with aliases and argDefs', () => {
        const cmd = command(
            'consumer',
            async () => {},
            { description: 'Consumes input', aliases: ['c'], acceptsPipelineInput: PipelineInputAcceptance.Array }
        );
        expect(cmd.aliases()).toEqual(['c']);
        expect(cmd.acceptsPipelineInput()).toBe(PipelineInputAcceptance.Array);
    });
});
