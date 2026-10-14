export type InvokePhase = "boot" | "space switch" | "thread open" | "agent turn"

type TalliedPhase = InvokePhase | "idle"

type InvokeCount = { command: string; count: number }

export type PhaseTally = { phase: TalliedPhase; counts: InvokeCount[] }

type InvokeTally = {
	count: (command: string) => void
	start: (phase: InvokePhase) => void
	end: (phase: InvokePhase) => void
}

const byCountDescending = (left: InvokeCount, right: InvokeCount) =>
	right.count - left.count

const countsOf = (counts: Map<string, number>): InvokeCount[] =>
	[...counts]
		.map(([command, count]) => ({ command, count }))
		.sort(byCountDescending)

export const createInvokeTally = (
	print: (tally: PhaseTally) => void,
): InvokeTally => {
	const counts = new Map<string, number>()
	let openPhase: TalliedPhase = "boot"

	const close = (next: TalliedPhase) => {
		print({ phase: openPhase, counts: countsOf(counts) })
		counts.clear()
		openPhase = next
	}

	return {
		count: (command) => {
			counts.set(command, (counts.get(command) ?? 0) + 1)
		},
		start: (phase) => {
			if (openPhase !== phase) {
				close(phase)
			}
		},
		end: (phase) => {
			if (openPhase === phase) {
				close("idle")
			}
		},
	}
}
