import type {
	ReportedRun,
	Routine,
	RoutineChanged,
	RoutineDraft,
	RoutineEdit,
	RoutineKey,
	RoutineRun,
	RunsOfRoutine,
	TriggerDecision,
} from "./routine-contract"

import { invoke, listen } from "../host"

const CHANGED_EVENT = "routine://changed"

export const DEFAULT_RUN_PAGE = 50

export const routinesTransport = {
	create: (draft: RoutineDraft) => invoke<Routine>("routine_create", { draft }),
	update: (id: string, edit: RoutineEdit) =>
		invoke<Routine>("routine_update", { id, edit }),
	delete: (id: string) => invoke<void>("routine_delete", { id }),
	list: (conversationId: string) =>
		invoke<Routine[]>("routine_list", { conversationId }),
	runs: (routineId: string, limit = DEFAULT_RUN_PAGE) =>
		invoke<RoutineRun[]>("routine_runs", { routineId, limit }),
	runsOfSpace: (spaceId: string, limit = DEFAULT_RUN_PAGE) =>
		invoke<RunsOfRoutine[]>("routine_runs_of_space", { spaceId, limit }),
	reportedRuns: (conversationId: string) =>
		invoke<ReportedRun[]>("routine_reported_runs", { conversationId }),
	runNow: (id: string) => invoke<TriggerDecision>("routine_run_now", { id }),
	key: (id: string) => invoke<RoutineKey>("routine_key", { id }),
	onChanged: (listener: (changed: RoutineChanged) => void) =>
		listen<RoutineChanged>(CHANGED_EVENT, ({ payload }) => listener(payload)),
}
