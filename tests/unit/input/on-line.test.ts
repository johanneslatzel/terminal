import { describe, it, expect } from 'vitest';
import { InputMode } from '../../../src/input-manager.js';
import { makeManager } from '../../helpers/make-input-manager.js';

describe('InputManager', () => {
    describe('onLine routing', () => {
        it('command mode: forwards to onCommand', () => {
            const received: string[] = [];
            const { im, rl } = makeManager((line) => received.push(line));
            im.start(rl);
            rl.emit('line', 'a');
            rl.emit('line', 'b');
            expect(received).toEqual(['a', 'b']);
        });

        it('drop mode: silently discards', () => {
            const received: string[] = [];
            const { im, rl } = makeManager((line) => received.push(line));
            im.start(rl);
            im.drop();
            rl.emit('line', 'x');
            rl.emit('line', 'y');
            expect(received).toEqual([]);
        });

        it('accept mode: resolves pending promise', async () => {
            const { im, rl } = makeManager();
            im.start(rl);
            const p1 = im.acceptInput('1: ');
            rl.emit('line', 'first');
            expect(await p1).toBe('first');
            const p2 = im.acceptInput('2: ');
            rl.emit('line', 'second');
            expect(await p2).toBe('second');
        });

        it('accept mode with no pendingResolve: no-op', () => {
            const { im, rl } = makeManager();
            im.start(rl);
            // switch to accept but don't call acceptInput
            (im as any).mode = InputMode.Accept;
            // should not throw
            rl.emit('line', 'orphan');
        });

        it('transitions: command -> accept -> command', async () => {
            const commands: string[] = [];
            const { im, rl } = makeManager((line) => commands.push(line));
            im.start(rl);
            rl.emit('line', 'cmd1');
            const p = im.acceptInput('value: ');
            rl.emit('line', 'val');
            await p;
            rl.emit('line', 'cmd2');
            expect(commands).toEqual(['cmd1', 'cmd2']);
        });

        it('transitions: command -> drop -> accept -> drop', async () => {
            const commands: string[] = [];
            const { im, rl } = makeManager((line) => commands.push(line));
            im.start(rl);
            im.drop();
            const p = im.acceptInput('value: ');
            rl.emit('line', 'val');
            await p;
            // should be back in drop
            rl.emit('line', 'dropped');
            expect(commands).toEqual([]);
        });
    });

    // -----------------------------------------------------------------------
    // restoreMode
    // -----------------------------------------------------------------------

    describe('restoreMode', () => {
        it('restores to command: resumes rl', () => {
            let resumed = false;
            const { im, rl } = makeManager();
            rl.resume = () => { resumed = true; };
            im.start(rl);
            im.drop();
            im.acceptInput('p: ');
            rl.emit('line', 'x');
            // acceptInput cleanup calls restoreMode('command')
            expect(resumed).toBe(true);
        });

        it('restores to drop on TTY: sets raw mode and resumes stdin', () => {
            let stdinResumed = false;
            const { im, rl, stdin } = makeManager();
            stdin.resume = () => { stdinResumed = true; };
            im.start(rl);
            // Call acceptInput while in drop mode
            im.drop();
            im.acceptInput('p: ');
            rl.emit('line', 'x');
            // After resolve, mode is restored to drop
            expect(stdin.isRaw).toBe(true);
            expect(stdinResumed).toBe(true);
        });

        it('restores to drop on non-TTY without pausing rl', () => {
            let paused = false;
            const { im, rl } = makeManager(undefined, undefined, false);
            rl.pause = () => { paused = true; };
            im.start(rl);
            im.drop();
            im.acceptInput('p: ');
            rl.emit('line', 'x');
            expect(paused).toBe(false);
        });

        it('restoreMode skips when rl is null on non-TTY drop', async () => {
            const { im, rl, stdin } = makeManager(undefined, undefined, false);
            im.start(rl);
            im.drop();
            const promise = im.acceptInput('p: ');
            im.stop();
            stdin.emit('end');
            await expect(promise).rejects.toThrow('stdin closed');
        });

        it('restoreMode is no-op for unknown mode', () => {
            const { im, rl } = makeManager();
            im.start(rl);
            (im as any).restoreMode(InputMode.Accept);
        });
    });

    // -----------------------------------------------------------------------
    // restoreCommandMode
    // -----------------------------------------------------------------------

    describe('restoreCommandMode', () => {
        it('is a no-op when rl is null', () => {
            const { im } = makeManager();
            // should not throw
            im.restoreCommandMode();
        });

        it('resumes rl and stdin on TTY', () => {
            let rlResumed = false;
            let stdinResumed = false;
            const { im, rl, stdin } = makeManager();
            rl.resume = () => { rlResumed = true; };
            stdin.resume = () => { stdinResumed = true; };
            im.start(rl);
            im.restoreCommandMode();
            expect(rlResumed).toBe(true);
            expect(stdinResumed).toBe(true);
        });

        it('resumes rl but not stdin on non-TTY', () => {
            let rlResumed = false;
            let stdinResumed = false;
            const { im, rl, stdin } = makeManager(undefined, undefined, false);
            rl.resume = () => { rlResumed = true; };
            stdin.resume = () => { stdinResumed = true; };
            im.start(rl);
            im.restoreCommandMode();
            expect(rlResumed).toBe(true);
            expect(stdinResumed).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // getReadline
    // -----------------------------------------------------------------------

});
