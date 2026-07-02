import { describe, it, expect } from 'vitest';
import { Hook } from '../../src/hook.js';

class TestHook extends Hook {
    protected onDispose(): void {}

    checkDisposed(): boolean {
        return this.isDisposed();
    }
}

describe('Hook', () => {
    describe('isDisposed', () => {
        it('returns false before dispose', () => {
            const hook = new TestHook();
            expect(hook.checkDisposed()).toBe(false);
        });

        it('returns true after dispose', () => {
            const hook = new TestHook();
            hook.dispose();
            expect(hook.checkDisposed()).toBe(true);
        });
    });

    describe('dispose', () => {
        it('calls onDispose exactly once', () => {
            let count = 0;
            const hook = new (class extends Hook {
                protected onDispose(): void {
                    count++;
                }
            })();
            expect(count).toBe(0);
            hook.dispose();
            expect(count).toBe(1);
            hook.dispose();
            expect(count).toBe(1);
        });
    });
});
