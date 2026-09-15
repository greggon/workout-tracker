/**
 * The small amount of state that has to outlive a page load: the workout in
 * progress, and any finished workouts still waiting to reach the server.
 *
 * Behind an interface so the queue can be tested in node, where IndexedDB does
 * not exist, against the same code path the browser uses.
 */

export type StoreName = 'live' | 'queue';
export const STORES: StoreName[] = ['live', 'queue'];

export type Entry<T> = { key: string; value: T };

export interface OfflineStore {
	get<T>(store: StoreName, key: string): Promise<T | undefined>;
	put(store: StoreName, key: string, value: unknown): Promise<void>;
	delete(store: StoreName, key: string): Promise<void>;
	all<T>(store: StoreName): Promise<Entry<T>[]>;
}

const DB_NAME = 'workout-tracker';
const DB_VERSION = 1;

function request<T>(req: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

function openDatabase(): Promise<IDBDatabase> {
	return new Promise((resolve, reject) => {
		const req = indexedDB.open(DB_NAME, DB_VERSION);
		req.onupgradeneeded = () => {
			for (const name of STORES) {
				if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
			}
		};
		req.onsuccess = () => resolve(req.result);
		req.onerror = () => reject(req.error);
	});
}

export function indexedDbStore(): OfflineStore {
	let db: Promise<IDBDatabase> | null = null;
	const handle = () => (db ??= openDatabase());

	const tx = async <T>(
		store: StoreName,
		mode: IDBTransactionMode,
		run: (s: IDBObjectStore) => Promise<T>
	): Promise<T> => {
		const database = await handle();
		return run(database.transaction(store, mode).objectStore(store));
	};

	return {
		get: (store, key) => tx(store, 'readonly', (s) => request(s.get(key))),
		put: (store, key, value) =>
			tx(store, 'readwrite', async (s) => {
				await request(s.put(value, key));
			}),
		delete: (store, key) =>
			tx(store, 'readwrite', async (s) => {
				await request(s.delete(key));
			}),
		all: async (store) =>
			tx(store, 'readonly', async (s) => {
				const [keys, values] = await Promise.all([request(s.getAllKeys()), request(s.getAll())]);
				return keys.map((key, i) => ({ key: String(key), value: values[i] }));
			})
	};
}

/** In-memory equivalent, for tests and for browsers that refuse IndexedDB. */
export function memoryStore(): OfflineStore {
	const data = new Map<StoreName, Map<string, unknown>>(STORES.map((s) => [s, new Map()]));
	const of = (store: StoreName) => data.get(store)!;

	return {
		async get(store, key) {
			return of(store).get(key) as never;
		},
		async put(store, key, value) {
			// Structured-clone semantics: the caller must not be able to mutate
			// what was stored, the way IndexedDB behaves.
			of(store).set(key, structuredClone(value));
		},
		async delete(store, key) {
			of(store).delete(key);
		},
		async all(store) {
			return [...of(store)].map(([key, value]) => ({ key, value: value as never }));
		}
	};
}
