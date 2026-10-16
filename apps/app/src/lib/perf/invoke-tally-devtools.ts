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

const startUnlessAlreadyOpen = (
	phase: InvokePhase,
	isAlreadyOpen: () => boolean,
) => {
	if (!isAlreadyOpen()) {
		tally.start(phase)
	}
}

const canReplaceInvoke = (internals: TauriInternals) =>
	Object.getOwnPropertyDescriptor(internals, "invoke")?.writable !== false

const installTally = () => {
	if (!hasTauriInternals()) return
	const internals: TauriInternals = Reflect.get(window, "__TAURI_INTERNALS__")
	if (canReplaceInvoke(internals)) {
		countLocalInvokes(internals)
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

export const startInvokePhaseUnless: (
	phase: InvokePhase,
	isAlreadyOpen: () => boolean,
) => void = import.meta.env.DEV ? startUnlessAlreadyOpen : () => {}

export const endInvokePhase: (phase: InvokePhase) => void = import.meta.env.DEV
	? tally.end
	: () => {}
