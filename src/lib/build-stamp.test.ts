import { describe, expect, it } from 'vitest';
import { formatBuildTime } from './build-stamp';

describe('formatBuildTime', () => {
	it('renders a CI timestamp readably in UTC', () => {
		expect(formatBuildTime('2026-09-14T21:55:03+00:00')).toBe('14 Sep 2026, 21:55 UTC');
	});

	it('converts an offset timestamp to UTC rather than trusting its wall clock', () => {
		// 17:55 in New York is 21:55 UTC — the same instant as the case above.
		expect(formatBuildTime('2026-09-14T17:55:03-04:00')).toBe('14 Sep 2026, 21:55 UTC');
	});

	it('pads single-digit days and hours so the column does not jitter', () => {
		expect(formatBuildTime('2026-01-05T04:07:00Z')).toBe('05 Jan 2026, 04:07 UTC');
	});

	it('passes through the values that are not dates', () => {
		// `local` is the dev fallback; `unknown` is the Dockerfile's default.
		expect(formatBuildTime('local')).toBe('local');
		expect(formatBuildTime('unknown')).toBe('unknown');
		expect(formatBuildTime('')).toBe('');
	});
});
