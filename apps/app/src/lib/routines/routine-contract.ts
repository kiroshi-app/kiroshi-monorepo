import type { ReportedRun } from "@/lib/bindings"

export type {
	ReportedRun,
	Routine_Serialize as Routine,
	RoutineDraft_Deserialize as RoutineDraft,
	RoutineEdit_Deserialize as RoutineEdit,
	RoutineError,
	RoutineKey_Serialize as RoutineKey,
	RoutineRun,
	RoutineRuns as RunsOfRoutine,
	RunOutcome,
	TriggerDecision,
} from "@/lib/bindings"

// read as text by every_refusal_of_a_reported_turn_carries_the_kind_the_front_declares
// in apps/app/src-tauri/src/routines/contract.rs
export type ReportRefusal =
	| "unknownTurn"
	| "turnOfAnotherConversation"
	| "turnAlreadyReported"
	| "turnWithoutReport"

export type ReportedRunsByTurnId = ReadonlyMap<string, ReportedRun>

export const NO_REPORTED_RUNS: ReportedRunsByTurnId = new Map()

export const indexedByTurnId = (
	reported: ReportedRun[],
): ReportedRunsByTurnId => new Map(reported.map((run) => [run.turnId, run]))

export type RunReportDraft = {
	conversationId: string
	botId: string
	runtimeSessionId: string
	text: string
	routineTitle: string
	triggerSourceId: string
}

export type RoutineChanged = {
	conversationId: string
}
