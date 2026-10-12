import { useRef, useState } from "react"

import { RelayError, type RelayFailure } from "./relay"

type RelayCall = () => Promise<void>

const failureOf = (error: unknown): RelayFailure => {
	if (error instanceof RelayError) return error.failure
	console.error(error)
	return "server"
}

export const useRelayCall = () => {
	const [failure, setFailure] = useState<RelayFailure | null>(null)
	const [isPending, setIsPending] = useState(false)
	const lastCall = useRef<RelayCall>(null)

	const run = async (call: RelayCall) => {
		lastCall.current = call
		setFailure(null)
		setIsPending(true)
		try {
			await call()
		} catch (error) {
			setFailure(failureOf(error))
		} finally {
			setIsPending(false)
		}
	}

	const retry = () => {
		if (lastCall.current) void run(lastCall.current)
	}

	return { failure, isPending, run, retry }
}
