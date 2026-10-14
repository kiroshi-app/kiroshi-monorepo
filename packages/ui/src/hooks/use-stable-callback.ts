import { useCallback, useLayoutEffect, useRef } from "react"

export const useStableCallback = <Args extends unknown[], Result>(
	callback: (...args: Args) => Result,
) => {
	const latest = useRef(callback)
	useLayoutEffect(() => {
		latest.current = callback
	})
	return useCallback((...args: Args) => latest.current(...args), [])
}
