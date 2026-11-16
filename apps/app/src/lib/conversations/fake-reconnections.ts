export const createFakeReconnections = () => {
	const listeners = new Set<() => void>()
	return {
		onReconnected: (listener: () => void) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},
		reconnect: () => {
			for (const listener of [...listeners]) {
				listener()
			}
		},
	}
}
