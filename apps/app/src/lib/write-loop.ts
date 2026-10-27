import type { createQueue } from "./queue"

type WriteLoopOptions<Value, Written> = {
	enqueue: ReturnType<typeof createQueue>
	write: (key: string, value: Value) => Promise<Written | null>
	apply: (key: string, written: Written) => void
	onRefused: (key: string, reason: unknown) => void
}

export type WriteLoop<Value> = {
	push: (key: string, value: Value) => void
	drop: (key: string) => void
	clear: () => void
}

export const createWriteLoop = <Value, Written>({
	enqueue,
	write,
	apply,
	onRefused,
}: WriteLoopOptions<Value, Written>): WriteLoop<Value> => {
	const running = new Set<string>()
	const pending = new Map<string, Value>()

	const flush = async (key: string): Promise<void> => {
		const value = pending.get(key)
		if (value === undefined) {
			return
		}
		pending.delete(key)
		const written = await write(key, value)
		if (written !== null && !pending.has(key)) {
			apply(key, written)
		}
		return flush(key)
	}

	return {
		push: (key, value) => {
			pending.set(key, value)
			if (running.has(key)) {
				return
			}
			running.add(key)
			void enqueue(() => flush(key))
				.catch((reason: unknown) => onRefused(key, reason))
				.finally(() => {
					running.delete(key)
				})
		},

		drop: (key) => {
			pending.delete(key)
		},

		clear: () => pending.clear(),
	}
}
