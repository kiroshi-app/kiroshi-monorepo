import type { Mission, MissionEvent } from "./mission-contract"

import {
	cutAtCodePoints,
	fenced,
	untrustedNoticeOf,
} from "@/lib/untrusted-data"

export type MissionRunCause = "done" | "failed" | "status"

export type MissionRunCall = {
	cause: MissionRunCause
	mission: Mission
	events: MissionEvent[]
	rosterBlock?: string | null
}

const INSTRUCTION_OF: Record<MissionRunCause, string> = {
	done: "Your mission is finished. Close it if it is still open, report in a few lines where it landed, and mention whoever takes it from here.",
	failed:
		"Your mission is blocked and cannot go further. Close it if it is still open, report in a few lines what blocks it, and mention whoever takes it from here.",
	status:
		"Report in a few lines where your mission stands right now and mention whoever picks the work up next. Name no step, no tool, no merge, no ticket and no pull request.",
}

const UNATTENDED_NOTICE =
	"Nobody answers a question during this run. When a question blocks you, ask it through mission_escalate and never ask one any other way. No permission is granted during this run either: a tool call that needs one is refused, so work with the tools you already may use."

const UNTRUSTED_NOTICE = untrustedNoticeOf(
	"the mission, its events and the last message of the agent",
)

const EVENT_LIMIT = 20

const PAYLOAD_LIMIT = 1000

const droppedEventsNoticeOf = (count: number) =>
	`The block below holds only the ${EVENT_LIMIT} most recent mission events, the most recent one last. Older events left out: ${count}.`

const cutPayloadsNoticeOf = (count: number) =>
	`Event payloads in the block below are cut at ${PAYLOAD_LIMIT} characters. Payloads cut: ${count}.`

const messageIn = (payload: unknown): string | null => {
	if (typeof payload !== "object" || payload === null) {
		return null
	}

	const { message } = payload as { message?: unknown }

	return typeof message === "string" && message.trim().length > 0
		? message
		: null
}

const agentLastMessageIn = (events: MissionEvent[]): string | null =>
	events
		.filter((event) => event.kind === "agent_asked")
		.map((event) => messageIn(event.payload))
		.filter((message) => message !== null)
		.at(-1) ?? null

const cutEventOf = (event: MissionEvent): MissionEvent => {
	const { text, isCut } = cutAtCodePoints(
		JSON.stringify(event.payload) ?? "",
		PAYLOAD_LIMIT,
	)

	return isCut ? { ...event, payload: text } : event
}

type ShortenedEvents = {
	events: MissionEvent[]
	droppedCount: number
	cutCount: number
}

const shortenedEventsOf = (events: MissionEvent[]): ShortenedEvents => {
	const recent = events.slice(-EVENT_LIMIT)
	const cut = recent.map(cutEventOf)

	return {
		events: cut,
		droppedCount: events.length - recent.length,
		cutCount: cut.filter(
			(event, index) => event.payload !== recent[index].payload,
		).length,
	}
}

const payloadTextOf = (
	{ mission, events }: MissionRunCall,
	kept: MissionEvent[],
) =>
	JSON.stringify(
		{ mission, events: kept, agentLastMessage: agentLastMessageIn(events) },
		null,
		2,
	)

const noticesOf = ({ droppedCount, cutCount }: ShortenedEvents) => [
	...(droppedCount > 0 ? [droppedEventsNoticeOf(droppedCount)] : []),
	...(cutCount > 0 ? [cutPayloadsNoticeOf(cutCount)] : []),
]

export const missionRunPromptFor = (call: MissionRunCall): string => {
	const shortEvents = shortenedEventsOf(call.events)

	return [
		INSTRUCTION_OF[call.cause],
		UNATTENDED_NOTICE,
		...(call.rosterBlock ? [call.rosterBlock] : []),
		UNTRUSTED_NOTICE,
		...noticesOf(shortEvents),
		fenced(payloadTextOf(call, shortEvents.events)),
	].join("\n\n")
}
