import {
	matchQuery,
	type QueryCacheNotifyEvent,
	type QueryClient,
	type QueryKey,
} from "@tanstack/react-query"

type Subscribable = {
	subscribe: (listener: () => void) => () => void
}

const isSameList = (held: readonly unknown[], list: readonly unknown[]) =>
	held.length === list.length &&
	held.every((entry, index) => Object.is(entry, list[index]))

const isSameInput = (held: unknown, input: unknown) =>
	Object.is(held, input) ||
	(Array.isArray(held) && Array.isArray(input) && isSameList(held, input))

const isSameInputs = (
	held: readonly unknown[],
	inputs: readonly unknown[],
): boolean =>
	held.length === inputs.length &&
	held.every((input, index) => isSameInput(input, inputs[index]))

export const memoizedOn = <Inputs extends unknown[], Snapshot>(
	inputsOf: () => [...Inputs],
	derive: (...inputs: Inputs) => Snapshot,
): (() => Snapshot) => {
	let held: { inputs: Inputs; snapshot: Snapshot } | undefined
	return () => {
		const inputs = inputsOf()
		if (held && isSameInputs(held.inputs, inputs)) {
			return held.snapshot
		}
		held = { inputs, snapshot: derive(...inputs) }
		return held.snapshot
	}
}

const DATA_EVENTS: ReadonlySet<QueryCacheNotifyEvent["type"]> = new Set([
	"added",
	"removed",
	"updated",
])

const onceATick = (listener: () => void) => {
	let isScheduled = false
	let isListening = true
	const notify = () => {
		if (isScheduled) {
			return
		}
		isScheduled = true
		queueMicrotask(() => {
			isScheduled = false
			if (isListening) listener()
		})
	}
	const stop = () => {
		isListening = false
	}
	return { notify, stop }
}

export const subscribeWithQueries =
	(store: Subscribable, queryClient: QueryClient, queryKey: QueryKey) =>
	(listener: () => void): (() => void) => {
		const stopStore = store.subscribe(listener)
		const queryChanges = onceATick(listener)
		const stopQueries = queryClient
			.getQueryCache()
			.subscribe(({ type, query }) => {
				if (DATA_EVENTS.has(type) && matchQuery({ queryKey }, query)) {
					queryChanges.notify()
				}
			})
		return () => {
			stopStore()
			queryChanges.stop()
			stopQueries()
		}
	}
