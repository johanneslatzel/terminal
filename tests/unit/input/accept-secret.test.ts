import { describe, it, expect } from 'vitest';
import { makeManager } from '../../helpers/make-input-manager.js';

describe('InputManager', () => {
    describe('acceptSecret', () => {
        it('falls back to acceptInput on non-TTY', async () => {
            const { im, rl } = makeManager(undefined, undefined, false);
            im.start(rl);
            const promise = im.acceptSecret('password: ');
            rl.emit('line', 'secret123');
            expect(await promise).toBe('secret123');
        });

        it('throws when not started on TTY', async () => {
            const { im } = makeManager();
            await expect(im.acceptSecret('p: ')).rejects.toThrow('InputManager not started');
        });

        it('removes data listeners and restores them after resolve', async () => {
            const { im, rl, stdin } = makeManager();
            const dataListener = () => {};
            stdin.on('data', dataListener);
            const originalCount = stdin.listenerCount('data');

            im.start(rl);
            // acceptSecret on TTY uses readRawTerminal which reads raw
            // We can test the listener preservation by checking the count after
            const promise = im.acceptSecret('p: ');
            // Simulate the secret input by writing a line
            stdin.write('secret\n');
            await promise;

            // data listeners should be restored
            expect(stdin.listenerCount('data')).toBe(originalCount);
        });

        it('restores previous mode after resolve', async () => {
            const { im, rl, stdin } = makeManager();
            im.start(rl);
            im.drop(); // start in drop mode
            const promise = im.acceptSecret('p: ');
            stdin.write('secret\n');
            await promise;
            // should be back in drop mode
            expect(stdin.isRaw).toBe(true);
        });

        it('falls back to acceptInput with echo=false for non-TTY acceptSecret', async () => {
            const { im, rl } = makeManager(undefined, undefined, false);
            im.start(rl);
            const promise = im.acceptSecret('p: ');
            rl.emit('line', 'data');
            expect(await promise).toBe('data');
        });

        it('returns empty string on SIGINT in non-TTY mode', async () => {
            const { im, rl } = makeManager(undefined, undefined, false);
            im.start(rl);
            const promise = im.acceptSecret('p: ');
            rl.emit('SIGINT');
            expect(await promise).toBe('');
        });

        it('propagates non-InterruptedError from acceptInput on non-TTY', async () => {
            const { im, rl, stdin } = makeManager(undefined, undefined, false);
            im.start(rl);
            const promise = im.acceptSecret('p: ');
            stdin.emit('end');
            await expect(promise).rejects.toThrow('stdin closed');
        });
    });

    // -----------------------------------------------------------------------
    // setEcho
    // -----------------------------------------------------------------------

});
