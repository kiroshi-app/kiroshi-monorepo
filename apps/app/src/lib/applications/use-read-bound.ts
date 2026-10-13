import { useEffect, useState } from "react"

export const READ_BOUND_MS = 15_000

export const useReadBound = (isWaitingWithNoRows: boolean): boolean => {
	const [hasOverrun, setOverrun] = useState(false)

	useEffect(() => {
		if (!isWaitingWithNoRows) return
		const bound = setTimeout(() => setOverrun(true), READ_BOUND_MS)
		return () => {
			clearTimeout(bound)
			setOverrun(false)
		}
	}, [isWaitingWithNoRows])

	return hasOverrun && isWaitingWithNoRows
}
