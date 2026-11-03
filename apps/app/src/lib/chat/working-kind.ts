import type {
	ActivityIndicatorKind,
	ActivityIndicatorWait,
} from "@workspace/ui/components/activity-indicator"

import type { ActivityEvent, ActivityStatus, TurnHold } from "../agent/contract"

export type WorkingState = {
	kind: ActivityIndicatorKind
	label?: string
	waitingOn?: ActivityIndicatorWait
	backgroundTasks?: number
	startedAt?: number
}

const SEARCH_TOOLS = new Set([
	"glob",
	"grep",
	"ls",
	"read",
	"webfetch",
	"websearch",
])

const WRITE_TOOLS = new Set(["edit", "multiedit", "notebookedit", "write"])

const ACTIVITY_RANK: Record<ActivityStatus, number> = {
	pending: 0,
	running: 1,
	succeeded: 2,
	failed: 2,
}

export const withActivity = (
	activities: ActivityEvent[],
	activity: ActivityEvent,
): ActivityEvent[] => {
	const index = activities.findIndex((entry) => entry.id === activity.id)
	if (index === -1) {
		return [...activities, activity]
	}
	if (
		ACTIVITY_RANK[activity.status] < ACTIVITY_RANK[activities[index].status]
	) {
		return activities
	}
	return activities.with(index, activity)
}

const runningActivityIn = (
	activities: ActivityEvent[],
): ActivityEvent | undefined =>
	activities.findLast(
		(activity) =>
			activity.status === "running" || activity.status === "pending",
	)

const kindForTool = (title: string): ActivityIndicatorKind => {
	const tool = title.split(/[\s·:(]/, 1)[0].toLowerCase()
	if (SEARCH_TOOLS.has(tool)) return "searching"
	if (WRITE_TOOLS.has(tool)) return "writing"
	return "working"
}

export const workingFor = (
	activities: ActivityEvent[],
	isWriting: boolean,
): WorkingState => {
	const active = runningActivityIn(activities)
	if (active) {
		return { kind: kindForTool(active.title), label: active.title || undefined }
	}
	return { kind: isWriting ? "writing" : "thinking" }
}

export const heldWorkFor = ({ count }: TurnHold): WorkingState => ({
	kind: "working",
	backgroundTasks: count,
})
