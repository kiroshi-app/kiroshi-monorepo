import { i18n } from "@workspace/ui/lib/i18n"

const NOT_RUNNING = "notRunning"

const NO_REASON = "the agent gave no reason"

const SENTENCE_OF: Record<string, string> = {
	alreadyRunning: "a sign-in is already running",
	notRunning: "no sign-in is running",
	cancelled: "the sign-in was cancelled",
	timedOut: "the sign-in timed out",
	refusedUrl: "the sign-in link was refused",
	flowTimedOut: "the sign-in flow timed out",
	notAuthenticated: "no Claude account is signed in",
	binaryNotFound: "the agent binary wasn’t found",
	spawnFailed: "the agent couldn’t be started",
	startupTimeout: "the agent didn’t start in time",
	crashed: "the agent stopped",
	unknownSpace: "the roster is in no space",
	get unknownBot() {
		return i18n.t("chat:onboarding.arrival.unknownCompanion")
	},
}

export type ConnectFailure =
	| "cancelled"
	| "timedOut"
	| "linkRefused"
	| "agentMissing"

const CONNECT_FAILURE_OF: Record<string, ConnectFailure> = {
	timedOut: "timedOut",
	flowTimedOut: "timedOut",
	startupTimeout: "timedOut",
	refusedUrl: "linkRefused",
	binaryNotFound: "agentMissing",
	spawnFailed: "agentMissing",
}

const fieldIn = (reason: unknown, field: string): string | null => {
	if (typeof reason !== "object" || reason === null || !(field in reason)) {
		return null
	}
	const value = (reason as Record<string, unknown>)[field]
	return typeof value === "string" ? value : null
}

export const isNotRunning = (reason: unknown): boolean =>
	fieldIn(reason, "kind") === NOT_RUNNING

export const exitDetailOf = (reason: unknown): string => {
	const detail = fieldIn(reason, "detail")
	if (detail) {
		return detail
	}
	const kind = fieldIn(reason, "kind")
	if (kind) {
		return SENTENCE_OF[kind] ?? NO_REASON
	}
	return reason instanceof Error ? reason.message : NO_REASON
}

export const connectFailureOf = (reason: unknown): ConnectFailure =>
	CONNECT_FAILURE_OF[fieldIn(reason, "kind") ?? ""] ?? "cancelled"
