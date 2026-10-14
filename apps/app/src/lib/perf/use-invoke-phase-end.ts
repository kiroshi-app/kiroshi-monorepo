import { useEffect } from "react"

import type { InvokePhase } from "./invoke-tally"
import { endInvokePhase } from "./invoke-tally-devtools"

const useEndPhaseOnceSettled = (
	phase: InvokePhase,
	settledOn: string | null,
) => {
	useEffect(() => {
		if (settledOn !== null) {
			endInvokePhase(phase)
		}
	}, [phase, settledOn])
}

export const useInvokePhaseEnd: (
	phase: InvokePhase,
	settledOn: string | null,
) => void = import.meta.env.DEV ? useEndPhaseOnceSettled : () => {}
