import { describe, it, expect } from 'vitest';
import { getPath } from '../../src/path.js';

describe('getPath', () => {
    it('returns top-level keys', () => {
        expect(getPath({ name: 'Alice', age: 30 }, 'name')).toBe('Alice');
        expect(getPath({ name: 'Alice' }, 'age')).toBeUndefined();
    });

    it('traverses nested dot paths', () => {
        expect(getPath({ user: { profile: { name: 'Alice' } } }, 'user.profile.name')).toBe('Alice');
    });

    it('returns undefined for missing segments', () => {
        expect(getPath({ user: { name: 'Alice' } }, 'user.age')).toBeUndefined();
    });

    it('returns undefined when traversal hits null or undefined', () => {
        expect(getPath({ user: null }, 'user.name')).toBeUndefined();
        expect(getPath({}, 'user.name')).toBeUndefined();
    });

    it('returns undefined when traversal hits a non-object value', () => {
        expect(getPath({ user: 'alice' }, 'user.name')).toBeUndefined();
    });

    it('returns undefined when traversal hits an array', () => {
        expect(getPath({ users: [{ name: 'Alice' }] }, 'users.name')).toBeUndefined();
    });
});
