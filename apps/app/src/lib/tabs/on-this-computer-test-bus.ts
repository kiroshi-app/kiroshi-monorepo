type Heard = { payload: unknown }

type Listener = (heard: Heard) => void

export const createOnThisComputerBus = () => {
	const listeners = new Map<string, Set<Listener>>()

	const listenersOf = (event: string) => {
		const heard = listeners.get(event) ?? new Set<Listener>()
		listeners.set(event, heard)
		return heard
	}

	const emit = async (event: string, payload: unknown) => {
		await Promise.resolve()
		for (const listener of [...listenersOf(event)]) {
			listener({ payload })
		}
	}

	const listen = async (event: string, listener: Listener) => {
		listenersOf(event).add(listener)
		return () => {
			listenersOf(event).delete(listener)
		}
	}

	const listenerCount = () =>
		[...listeners.values()].reduce((count, heard) => count + heard.size, 0)

	return { emit, listen, listenerCount }
}
