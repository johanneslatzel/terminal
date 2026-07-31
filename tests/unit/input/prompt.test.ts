import { describe, it, expect } from 'vitest';
import { makeManager } from '../../helpers/make-input-manager.js';

describe('InputManager', () => {
    describe('prompt', () => {
        it('delegates to rl.prompt()', () => {
            let called = false;
            const { im, rl } = makeManager();
            rl.prompt = () => { called = true; };
            im.start(rl);
            im.prompt();
            expect(called).toBe(true);
        });

        it('is a no-op when rl is null', () => {
            const { im } = makeManager();
            // should not throw
            im.prompt();
        });
    });

    describe('setPrompt', () => {
        it('delegates to rl.setPrompt()', () => {
            let received: string | undefined;
            const { im, rl } = makeManager();
            rl.setPrompt = (p: string) => { received = p; };
            im.start(rl);
            im.setPrompt('new> ');
            expect(received).toBe('new> ');
        });

        it('is a no-op when rl is null', () => {
            const { im } = makeManager();
            // should not throw
            im.setPrompt('new> ');
        });
    });

    // -----------------------------------------------------------------------
    // drop
    // -----------------------------------------------------------------------

    describe('setEcho', () => {
        it('sets raw mode when echo is toggled off on TTY', () => {
            const { im, rl, stdin } = makeManager();
            im.start(rl);
            im.setEcho(false);
            expect(stdin.isRaw).toBe(true);
        });

        it('clears raw mode when echo is toggled on on TTY', () => {
            const { im, rl, stdin } = makeManager();
            im.start(rl);
            im.setEcho(false);
            im.setEcho(true);
            expect(stdin.isRaw).toBe(false);
        });

        it('is a no-op when rl is null', () => {
            const { im } = makeManager();
            im.setEcho(false);
            // no error
        });

        it('is a no-op on non-TTY', () => {
            const { im, rl } = makeManager(undefined, undefined, false);
            im.start(rl);
            im.setEcho(false);
            // no raw mode on non-TTY, just a no-op
        });
    });

    // -----------------------------------------------------------------------
    // onLine routing (direct)
    // -----------------------------------------------------------------------

});
