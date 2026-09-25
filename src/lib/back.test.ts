import { describe, expect, it } from 'vitest';
import { safeBack } from './back';

describe('safeBack', () => {
	it('keeps a path on this site, query and all', () => {
		expect(safeBack('/workout/abc', '/routine')).toBe('/workout/abc');
		expect(safeBack('/', '/routine')).toBe('/');
		expect(safeBack('/routine/x?back=%2F', '/routine')).toBe('/routine/x?back=%2F');
	});

	it('falls back for anything that could leave the site, or nothing at all', () => {
		expect(safeBack('//evil.example', '/routine')).toBe('/routine');
		expect(safeBack('https://evil.example', '/routine')).toBe('/routine');
		expect(safeBack('', '/routine')).toBe('/routine');
		expect(safeBack(null, '/routine')).toBe('/routine');
	});
});
