import type { BotBadge } from "@workspace/ui/components/bot-badge"
import type { BotIdentityAvatarProps } from "@workspace/ui/components/bot-identity-avatar"
import type { MessageAuthor } from "@workspace/ui/components/message"
import type { RosterBot } from "@workspace/ui/components/roster"

type MissionEventKind =
	| "opened"
	| "note"
	| "agent_asked"
	| "answered"
	| "escalated"
	| "ready"
	| "checks_failed"
	| "failed"
	| "closed"
	| "dismissed"
	| "reopened"

type MissionState =
	| "working"
	| "waiting_bot"
	| "waiting_human"
	| "ready_to_merge"
	| "failed"
	| "done"
	| "closed"

const MISSION_AVATAR_SIZE = 32

type MissionBot = Pick<BotIdentityAvatarProps, "image" | "seed"> & {
	name: string
	blot?: number | null
}

type MissionTicket = {
	externalId: string
	title: string
}

type MissionTicketLink = MissionTicket & {
	platform: string
	url: string
}

type MissionStatus = {
	text: string
	writtenAt: number
}

type MissionActivity = {
	tool: string
	target: string
}

type MissionPullRequest = {
	url: string
	number: number
}

type MissionCardModel = {
	id: string
	identity: RosterBot
	author?: MessageAuthor
	objective: string
	ticket: MissionTicketLink
	tools: string[]
	state: MissionState
	isWorking: boolean
	isClosed: boolean
	timestamp: string
	now?: number
	status?: MissionStatus
	commitsAhead?: number
	pullRequest?: MissionPullRequest
	lastActivity?: MissionActivity
}

type ShownMissionStatus = MissionStatus & { now: number }

type MissionEventLink = {
	url: string
	pullRequest?: number
}

type MissionEventModel = {
	id: string
	kind: MissionEventKind
	source: string
	createdAt: number
	text?: string
	link?: MissionEventLink
}

const shownMissionStatus = (
	status: MissionStatus | undefined,
	now: number | undefined,
): ShownMissionStatus | undefined =>
	status?.text.trim() && now !== undefined ? { ...status, now } : undefined

const missionBadgeFor = (state: MissionState): BotBadge | undefined =>
	state === "waiting_human" ? "attention" : undefined

export {
	MISSION_AVATAR_SIZE,
	type MissionActivity,
	type MissionBot,
	type MissionCardModel,
	type MissionEventKind,
	type MissionEventLink,
	type MissionEventModel,
	type MissionPullRequest,
	type MissionState,
	type MissionStatus,
	type MissionTicketLink,
	missionBadgeFor,
	type ShownMissionStatus,
	shownMissionStatus,
}
