import {
	matchQuery,
	type QueryClient,
	type QueryKey,
} from "@tanstack/react-query"

type Subscribable = {
	subscribe: (listener: () => void) => () => void
}

const isSameInputs = (
	held: readonly unknown[],
	inputs: readonly unknown[],
): boolean =>
	held.length === inputs.length &&
	held.every((input, index) => Object.is(input, inputs[index]))

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

export const subscribeWithQueries =
	(store: Subscribable, queryClient: QueryClient, queryKey: QueryKey) =>
	(listener: () => void): (() => void) => {
		const stopStore = store.subscribe(listener)
		const stopQueries = queryClient.getQueryCache().subscribe(({ query }) => {
			if (matchQuery({ queryKey }, query)) listener()
		})
		return () => {
			stopStore()
			stopQueries()
		}
	}
