const callsByReason = new WeakMap<object, string>()

const isObject = (reason: unknown): reason is object =>
	typeof reason === "object" && reason !== null

const nameCall = (command: string, reason: unknown) => {
	if (isObject(reason) && !callsByReason.has(reason)) {
		callsByReason.set(reason, command)
	}
}

export const nameCallOnFailure = <T>(
	command: string,
	sent: Promise<T>,
): Promise<T> => {
	sent.then(undefined, (reason: unknown) => nameCall(command, reason))
	return sent
}

export const failedCallOf = (reason: unknown): string | undefined =>
	isObject(reason) ? callsByReason.get(reason) : undefined
