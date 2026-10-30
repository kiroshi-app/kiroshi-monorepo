import type { NoticeMessage } from "@workspace/ui/components/notice-surface"
import { i18n } from "@workspace/ui/lib/i18n"

import { exitDetailOf } from "./onboarding-failure"

import { failureReporterIn } from "../failure-report"
import { createStore } from "../store"
import type {
	ClaudeImportOutcome,
	ClaudeImportProgress,
	ClaudeImportResult,
} from "@/lib/bindings"

type ClaudeImportResults = Record<string, ClaudeImportResult>

export type ClaudeImportSession = {
	unchecked: string[]
	selection: string[]
	results: ClaudeImportResults
	isImporting: boolean
}

export type ClaudeImported = {
	companions: string[]
	hasInstructions: boolean
	skillCount: number
}

export type ClaudeImportPort = {
	run: (selection: string[], spaceId: string) => Promise<ClaudeImportOutcome[]>
	onProgress: (
		onProgress: (progress: ClaudeImportProgress) => void,
	) => Promise<() => void>
}

export type ClaudeImportWorld = {
	spaceId: () => string | null
	markSeen: () => Promise<void>
	leave: (imported: ClaudeImported) => void
}

export type ClaudeImportScene = Omit<ClaudeImportWorld, "leave">

export type ClaudeImportController = {
	getState: () => ClaudeImportSession
	subscribe: (listener: () => void) => () => void
	toggle: (key: string, isChecked: boolean) => void
	importPicked: (keys: string[]) => Promise<void>
	retryFailed: () => Promise<void>
	leave: (imported: ClaudeImported) => void
}

export type ClaudeImportOptions = {
	reportFailure?: (notice: NoticeMessage) => void
}

const initialSession: ClaudeImportSession = {
	unchecked: [],
	selection: [],
	results: {},
	isImporting: false,
}

const failedKeysOf = (results: ClaudeImportResults) =>
	Object.keys(results).filter((key) => results[key]?.kind === "failed")

const resultsOf = (outcomes: ClaudeImportOutcome[]): ClaudeImportResults =>
	Object.fromEntries(outcomes.map(({ key, result }) => [key, result]))

const spaceIdIn = (world: ClaudeImportWorld) => {
	const spaceId = world.spaceId()
	if (!spaceId) {
		throw new Error("No space on this computer to import into")
	}
	return spaceId
}

export const createClaudeImportController = (
	port: ClaudeImportPort,
	world: ClaudeImportWorld,
	{
		reportFailure = failureReporterIn("claude-import-controller"),
	}: ClaudeImportOptions = {},
): ClaudeImportController => {
	const stateStore = createStore(initialSession)
	const current = stateStore.getState
	let hasMarkedSeen = false

	const set = (fields: Partial<ClaudeImportSession>) =>
		stateStore.setState({ ...current(), ...fields })

	const report = (reason: unknown) =>
		reportFailure({
			title: i18n.t("chat:screen.notice.failed"),
			description: exitDetailOf(reason),
		})

	const record = (keys: string[]) => (progress: ClaudeImportProgress) => {
		if (keys.includes(progress.key)) {
			set({
				results: { ...current().results, [progress.key]: progress.result },
			})
		}
	}

	const runImport = async (keys: string[], selection: string[]) => {
		const { isImporting, ...before } = current()
		if (isImporting || keys.length === 0) {
			return
		}
		set({ selection, isImporting: true })
		let stopListening: () => void = () => undefined
		try {
			stopListening = await port.onProgress(record(keys))
			const outcomes = await port.run(keys, spaceIdIn(world))
			set({ results: { ...current().results, ...resultsOf(outcomes) } })
		} catch (reason) {
			set(before)
			report(reason)
		} finally {
			stopListening()
			set({ isImporting: false })
		}
	}

	return {
		getState: current,

		subscribe: stateStore.subscribe,

		toggle: (key, isChecked) => {
			const others = current().unchecked.filter(
				(unchecked) => unchecked !== key,
			)
			set({ unchecked: isChecked ? others : [...others, key] })
		},

		importPicked: (keys) => runImport(keys, keys),

		retryFailed: () =>
			runImport(failedKeysOf(current().results), current().selection),

		leave: (imported) => {
			if (!hasMarkedSeen) {
				hasMarkedSeen = true
				world.markSeen().catch(report)
			}
			world.leave(imported)
		},
	}
}
