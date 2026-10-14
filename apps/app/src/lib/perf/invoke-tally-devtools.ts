import {
	createInvokeTally,
	type InvokePhase,
	type PhaseTally,
} from "./invoke-tally"

import { hasTauriInternals } from "../host/tauri-internals"

type TauriInvoke = (command: string, ...rest: unknown[]) => Promise<unknown>

type TauriInternals = { invoke: TauriInvoke }

const printPhaseTally = ({ phase, counts }: PhaseTally) => {
	console.info(`invokes during ${phase}`)
	console.table(counts)
}

const tally = createInvokeTally(printPhaseTally)

const countLocalInvokes = (internals: TauriInternals) => {
	const invoke = internals.invoke
	internals.invoke = (command, ...rest) => {
		tally.count(command)
		return invoke(command, ...rest)
	}
}

const installTally = () => {
	if (hasTauriInternals()) {
		countLocalInvokes(Reflect.get(window, "__TAURI_INTERNALS__"))
	}
}

export const installInvokeTally: () => void = import.meta.env.DEV
	? installTally
	: () => {}

export const countInvoke: (command: string) => void = import.meta.env.DEV
	? tally.count
	: () => {}

export const startInvokePhase: (phase: InvokePhase) => void = import.meta.env
	.DEV
	? tally.start
	: () => {}

export const endInvokePhase: (phase: InvokePhase) => void = import.meta.env.DEV
	? tally.end
	: () => {}
