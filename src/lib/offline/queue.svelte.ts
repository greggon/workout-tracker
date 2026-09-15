import type { SessionInput } from '$lib/session-payload';
import { backoffMs, classifyResponse, type SyncOutcome } from './sync';
import type { OfflineStore } from './store';

/**
 * Finished workouts waiting to reach the server.
 *
 * Every entry is keyed by the session id minted when the workout started, so an
 * item can be submitted any number of times without risking a duplicate — which
 * is what lets this retry freely rather than having to know whether a request
 * that timed out actually landed.
 */

export type QueuedSession = {
	payload: SessionInput;
	queuedAt: number;
	attempts: number;
	/** Set when the server rejected the payload outright. */
	error: string | null;
};

export type QueueStatus = 'idle' | 'syncing' | 'offline' | 'reauth' | 'rejected';

export type Submit = (payload: SessionInput) => Promise<{
	outcome: SyncOutcome;
	error?: string;
}>;

/** Submits through the real endpoint, classifying the answer rather than trusting it. */
export const httpSubmit: Submit = async (payload) => {
	const response = await fetch('/api/sessions', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(payload)
	});

	const outcome = classifyResponse(response.status, response.headers.get('content-type'));
	if (outcome === 'rejected') {
		const body = await response.json().catch(() => ({}));
		return { outcome, error: (body as { error?: string }).error ?? `HTTP ${response.status}` };
	}
	return { outcome };
};

export class SyncQueue {
	pending = $state(0);
	status = $state<QueueStatus>('idle');
	/** Message from the last outright rejection, if any. */
	lastError = $state<string | null>(null);

	#store: OfflineStore;
	#submit: Submit;
	#draining = false;
	#timer: ReturnType<typeof setTimeout> | null = null;

	constructor(store: OfflineStore, submit: Submit = httpSubmit) {
		this.#store = store;
		this.#submit = submit;
	}

	async load(): Promise<void> {
		this.pending = (await this.#store.all<QueuedSession>('queue')).length;
	}

	/** Queues a workout and tries immediately. Storage happens first, always. */
	async add(payload: SessionInput): Promise<void> {
		const entry: QueuedSession = {
			payload,
			queuedAt: Date.now(),
			attempts: 0,
			error: null
		};
		await this.#store.put('queue', payload.id, entry);
		await this.load();
		await this.drain();
	}

	async list(): Promise<QueuedSession[]> {
		return (await this.#store.all<QueuedSession>('queue')).map((e) => e.value);
	}

	/**
	 * Sends everything waiting, oldest first.
	 *
	 * A rejected payload stays in the queue rather than being discarded: it is
	 * still the only copy of a workout somebody did, and throwing it away to
	 * keep the queue tidy is the one unrecoverable mistake available here.
	 */
	async drain(): Promise<void> {
		if (this.#draining) return;
		this.#draining = true;
		this.clearRetry();

		try {
			const items = (await this.#store.all<QueuedSession>('queue')).sort(
				(a, b) => a.value.queuedAt - b.value.queuedAt
			);

			if (items.length === 0) {
				this.status = 'idle';
				this.pending = 0;
				return;
			}

			this.status = 'syncing';
			let blocked: QueueStatus | null = null;

			for (const { key, value } of items) {
				if (value.error) continue; // already refused; do not keep asking

				let result: { outcome: SyncOutcome; error?: string };
				try {
					result = await this.#submit(value.payload);
				} catch {
					// Offline, DNS failure, tunnel down — all the same from here.
					result = { outcome: 'retry' };
				}

				if (result.outcome === 'saved') {
					await this.#store.delete('queue', key);
					continue;
				}

				const attempts = value.attempts + 1;
				if (result.outcome === 'rejected') {
					this.lastError = result.error ?? 'The server refused this workout';
					await this.#store.put('queue', key, {
						...value,
						attempts,
						error: this.lastError
					});
					blocked = 'rejected';
					continue;
				}

				await this.#store.put('queue', key, { ...value, attempts });
				blocked = result.outcome === 'reauth' ? 'reauth' : 'offline';
				// Signing in fixes every remaining item, so stop asking now.
				if (blocked === 'reauth') break;
			}

			await this.load();
			this.status = this.pending === 0 ? 'idle' : (blocked ?? 'offline');

			if (this.status === 'offline') {
				const worst = Math.max(...items.map((i) => i.value.attempts), 1);
				this.scheduleRetry(backoffMs(worst));
			}
		} finally {
			this.#draining = false;
		}
	}

	/** Clears the refusal on an item so the next drain tries it again. */
	async retryRejected(): Promise<void> {
		for (const { key, value } of await this.#store.all<QueuedSession>('queue')) {
			if (value.error) await this.#store.put('queue', key, { ...value, error: null });
		}
		this.lastError = null;
		await this.drain();
	}

	scheduleRetry(delay: number): void {
		this.clearRetry();
		this.#timer = setTimeout(() => void this.drain(), delay);
	}

	clearRetry(): void {
		if (this.#timer !== null) clearTimeout(this.#timer);
		this.#timer = null;
	}
}
