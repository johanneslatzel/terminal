import { describe, it, expect } from 'vitest';
import { Command, PipelineInputAcceptance } from '../../../src/types.js';
describe('PipelineInputAcceptance on Command', () => {
    it('defaults to None on Command subclass', () => {
        const cmd = new (class extends Command {
            async execute() {}
        })('test');
        expect(cmd.acceptsPipelineInput()).toBe(PipelineInputAcceptance.None);
        expect(cmd.providesPipelineOutput()).toBe(false);
    });

    it('accepts custom pipeline attributes via constructor', () => {
        const cmd = new (class extends Command {
            async execute() {}
        })(
            'test',
            undefined,
            undefined,
            undefined,
            PipelineInputAcceptance.Array,
            true
        );
        expect(cmd.acceptsPipelineInput()).toBe(PipelineInputAcceptance.Array);
        expect(cmd.providesPipelineOutput()).toBe(true);
    });

    it('accepts Single', () => {
        const cmd = new (class extends Command {
            async execute() {}
        })('test', undefined, undefined, undefined, PipelineInputAcceptance.Single);
        expect(cmd.acceptsPipelineInput()).toBe(PipelineInputAcceptance.Single);
    });

    it('accepts Array', () => {
        const cmd = new (class extends Command {
            async execute() {}
        })('test', undefined, undefined, undefined, PipelineInputAcceptance.Array);
        expect(cmd.acceptsPipelineInput()).toBe(PipelineInputAcceptance.Array);
    });
});
