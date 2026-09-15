import { getContext, setContext } from 'svelte';
import { browser } from '$app/environment';
import { SyncQueue } from './queue.svelte';
import { indexedDbStore, memoryStore, type OfflineStore } from './store';

const KEY = Symbol('offline');

export type Offline = { store: OfflineStore; queue: SyncQueue };

/**
 * Created once in the root layout rather than at module scope: module-level
 * state is shared between concurrent requests on the server, and a queue is
 * per-person.
 *
 * Falls back to memory when IndexedDB is unavailable — a private window, or
 * storage blocked — so the app degrades to milestone 7 behaviour instead of
 * failing to load.
 */
export function provideOffline(): Offline {
	let store: OfflineStore;
	try {
		store = browser && 'indexedDB' in globalThis ? indexedDbStore() : memoryStore();
	} catch {
		store = memoryStore();
	}
	return setContext(KEY, { store, queue: new SyncQueue(store) });
}

export function useOffline(): Offline {
	return getContext<Offline>(KEY);
}
