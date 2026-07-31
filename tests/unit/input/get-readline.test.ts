import { describe, it, expect } from 'vitest';
import { makeManager, makeMockRl } from '../../helpers/make-input-manager.js';

describe('InputManager', () => {
    describe('getReadline', () => {
        it('returns null before start', () => {
            const { im } = makeManager();
            expect(im.getReadline()).toBeNull();
        });

        it('returns rl after start', () => {
            const { im, rl } = makeManager();
            im.start(rl);
            expect(im.getReadline()).toBe(rl);
        });

        it('returns null after stop', () => {
            const { im, rl } = makeManager();
            im.start(rl);
            im.stop();
            expect(im.getReadline()).toBeNull();
        });
    });

    // -----------------------------------------------------------------------
    // start/stop lifecycle
    // -----------------------------------------------------------------------

    describe('lifecycle', () => {
        it('start after stop re-attaches cleanly', () => {
            const received: string[] = [];
            const { im, rl } = makeManager((line) => received.push(line));
            im.start(rl);
            im.stop();
            const rl2 = makeMockRl();
            im.start(rl2);
            rl2.emit('line', 'restarted');
            expect(received).toEqual(['restarted']);
            expect(im.getReadline()).toBe(rl2);
        });

        it('stop resets pending acceptInput', async () => {
            const { im, rl, stdin } = makeManager();
            im.start(rl);
            const promise = im.acceptInput('p: ');
            im.stop();
            // stdin end triggers reject since pendingResolve is cleared
            stdin.emit('end');
            await expect(promise).rejects.toThrow('stdin closed');
        });
    });
});
