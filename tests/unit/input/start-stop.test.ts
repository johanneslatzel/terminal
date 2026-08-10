import { describe, it, expect } from 'vitest';
import { InputManager } from '../../../src/input-manager.js';
import { makeManager, makeMockRl, makeTtyStreams } from '../../helpers/make-input-manager.js';

describe('InputManager', () => {
    describe('constructor', () => {
        it('creates an instance with no errors', () => {
            const { im } = makeManager();
            expect(im).toBeInstanceOf(InputManager);
        });

        it('getReadline returns null before start', () => {
            const { im } = makeManager();
            expect(im.getReadline()).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // start / stop
    // -----------------------------------------------------------------------

    describe('start', () => {
        it('attaches readline and returns it via getReadline', () => {
            const { im, rl } = makeManager();
            im.start(rl);
            expect(im.getReadline()).toBe(rl);
        });

        it('routes lines to onCommand in command mode', () => {
            const received: string[] = [];
            const { im, rl } = makeManager((line) => received.push(line));
            im.start(rl);
            rl.emit('line', 'hello');
            rl.emit('line', 'world');
            expect(received).toEqual(['hello', 'world']);
        });

        it('writes ^C and re-prompts on SIGINT', () => {
            const { im, rl, stdoutChunks } = makeManager();
            let prompted = false;
            rl.prompt = () => { prompted = true; };
            im.start(rl);
            rl.emit('SIGINT');
            expect(stdoutChunks.join('')).toContain('^C');
            expect(prompted).toBe(true);
        });

        it('does not write ^C on SIGINT when silentSigint is true', () => {
            const { im, rl, stdoutChunks } = makeManager(undefined, undefined, true, true);
            let prompted = false;
            rl.prompt = () => { prompted = true; };
            im.start(rl);
            rl.emit('SIGINT');
            expect(stdoutChunks.join('')).not.toContain('^C');
            expect(prompted).toBe(true);
        });

        it('still clears the line on SIGINT when silentSigint is true', () => {
            const { im, rl, stdoutChunks } = makeManager(undefined, undefined, true, true);
            let cleared = false;
            rl.clearLine = () => { cleared = true; };
            rl.prompt = () => {};
            im.start(rl);
            rl.emit('SIGINT');
            expect(cleared).toBe(true);
            expect(stdoutChunks.join('')).not.toContain('^C');
        });

        it('clears the current line before writing ^C on SIGINT', () => {
            const { im, rl, stdoutChunks } = makeManager();
            let cleared = false;
            rl.clearLine = () => { cleared = true; };
            im.start(rl);
            rl.emit('SIGINT');
            expect(cleared).toBe(true);
            expect(stdoutChunks.join('')).toContain('^C');
        });

        it('writes newline and calls onClose on close', () => {
            let closed = false;
            const { im, rl, stdoutChunks } = makeManager(undefined, () => { closed = true; });
            im.start(rl);
            rl.emit('close');
            expect(stdoutChunks.join('')).toContain('\n');
            expect(closed).toBe(true);
        });

        it('writes error message on readline error', () => {
            const { im, rl, stdoutChunks } = makeManager();
            im.start(rl);
            rl.emit('error', new Error('bad input'));
            expect(stdoutChunks.join('')).toContain('Readline error: bad input');
        });
    });

    describe('stop', () => {
        it('closes rl and pauses stdin', () => {
            let closed = false;
            let paused = false;
            const { im, rl, stdin } = makeManager();
            rl.close = () => { closed = true; };
            stdin.pause = () => { paused = true; };
            im.start(rl);
            im.stop();
            expect(closed).toBe(true);
            expect(paused).toBe(true);
            expect(im.getReadline()).toBeNull();
        });

        it('is safe to call when not started', () => {
            const { im } = makeManager();
            // should not throw
            im.stop();
            expect(im.getReadline()).toBeNull();
        });

        it('is safe to call twice', () => {
            const { im, rl } = makeManager();
            im.start(rl);
            im.stop();
            im.stop(); // second call should be a no-op
            expect(im.getReadline()).toBeNull();
        });

        it('resets mode to command', () => {
            const received: string[] = [];
            const { stdin, stdout } = makeTtyStreams();
            const im = new InputManager(stdin, stdout, (line) => received.push(line));
            const rl1 = makeMockRl();
            im.start(rl1);
            im.drop();
            im.stop();
            // After stop, mode is reset to command — use a fresh rl
            const rl2 = makeMockRl();
            im.start(rl2);
            rl2.emit('line', 'test');
            expect(received).toEqual(['test']);
        });
    });

    // -----------------------------------------------------------------------
    // prompt / setPrompt
    // -----------------------------------------------------------------------

});
