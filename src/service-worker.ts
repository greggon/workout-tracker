/// <reference types="@sveltejs/kit" />
/// <reference lib="webworker" />
import { build, files, version } from '$service-worker';

/**
 * Shell cache, so the app opens in a basement with no signal.
 *
 * Deliberately narrow. The only thing cached is the built shell: hashed assets
 * that can never go stale, plus a navigation fallback. Workout data does not
 * come through here — it lives in IndexedDB, because a cache is something the
 * browser may evict at will and a logged session is not.
 */

const worker = self as unknown as ServiceWorkerGlobalScope;
const CACHE = `shell-${version}`;
const PRECACHE = [...build, ...files];

worker.addEventListener('install', (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((cache) => cache.addAll(PRECACHE))
			.then(() => worker.skipWaiting())
	);
});

worker.addEventListener('activate', (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => worker.clients.claim())
	);
});

worker.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== location.origin) return;

	// Never serve the API from cache. A stale bootstrap is misleading, and a
	// cached redirect to the Access login page would be worse.
	if (url.pathname.startsWith('/api/')) return;

	// Hashed build output is immutable, so the cache is always right.
	if (PRECACHE.includes(url.pathname)) {
		event.respondWith(caches.match(request).then((hit) => hit ?? fetch(request)));
		return;
	}

	if (request.mode === 'navigate') {
		event.respondWith(
			(async () => {
				try {
					const response = await fetch(request);
					// An Access redirect is not a page worth keeping.
					if (response.redirected) return response;
					const cache = await caches.open(CACHE);
					cache.put(request, response.clone());
					return response;
				} catch {
					const cached = await caches.match(request);
					if (cached) return cached;
					return new Response('Offline, and this page has not been opened before.', {
						status: 503,
						headers: { 'content-type': 'text/plain' }
					});
				}
			})()
		);
	}
});
