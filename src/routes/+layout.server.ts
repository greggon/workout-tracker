import { env } from '$env/dynamic/private';
import { formatBuildTime } from '$lib/build-stamp';
import type { LayoutServerLoad } from './$types';

/**
 * Build stamp. The Dockerfile bakes GIT_SHA and BUILD_TIME in as build args
 * from the CI workflow, so a deployed page can say exactly which commit it is
 * — the fastest way to tell whether a `docker compose pull` actually took.
 * Unset locally, which is itself the signal that you are looking at dev.
 */
export const load: LayoutServerLoad = async () => ({
	build: {
		sha: (env.GIT_SHA ?? 'dev').slice(0, 7),
		time: formatBuildTime(env.BUILD_TIME ?? 'local'),
		/** Machine-readable original, for the <time> element. */
		timeISO: env.BUILD_TIME ?? ''
	}
});
