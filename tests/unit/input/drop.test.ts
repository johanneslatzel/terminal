import { describe, it, expect } from 'vitest';
import { PassThrough } from 'node:stream';
import { InputManager } from '../../../src/input-manager.js';
import { makeManager, makeMockRl } from '../../helpers/make-input-manager.js';

describe('InputManager', () => {
    describe('drop', () => {
        it('sets mode to drop — lines are not forwarded', () => {
            const received: string[] = [];
            const { im, rl } = makeManager((line) => received.push(line));
            im.start(rl);
            im.drop();
            rl.emit('line', 'dropped');
            expect(received).toEqual([]);
        });

        it('clears pendingResolve', async () => {
            const { im, rl } = makeManager();
            im.start(rl);
            const promise = im.acceptInput('prompt: ');
            // deliver a line to resolve acceptInput
            rl.emit('line', 'answer');
            await promise;
            // drop should clear any pending — no error after stop/drop
            im.drop();
        });

        it('is a no-op when rl is null (before start)', () => {
            const { im } = makeManager();
            // should not throw, just sets mode
            im.drop();
        });

        it('sets raw mode and pauses stdin on TTY', () => {
            const { im, rl, stdin } = makeManager();
            im.start(rl);
            im.drop();
            expect(stdin.isRaw).toBe(true);
        });

        it('defaults savedRawMode to false when isRaw is undefined', () => {
            const stdin: any = Object.assign(new PassThrough(), {
                isTTY: true,
                setRawMode: function (this: any, mode: boolean) {
                    this.isRaw = mode;
                }
            });
            const stdoutChunks: string[] = [];
            const stdout: any = new PassThrough();
            stdout.on('data', (chunk: Buffer) => stdoutChunks.push(chunk.toString()));
            const im = new InputManager(stdin, stdout, () => {});
            const rl = makeMockRl();
            im.start(rl);
            im.drop();
            expect(stdin.isRaw).toBe(true);
        });

        it('does not pause rl on non-TTY — onLine discards lines in drop mode', () => {
            let paused = false;
            const { im, rl } = makeManager(undefined, undefined, false);
            rl.pause = () => { paused = true; };
            im.start(rl);
            im.drop();
            expect(paused).toBe(false);
        });
    });

    // -----------------------------------------------------------------------
    // acceptInput
    // -----------------------------------------------------------------------

});
