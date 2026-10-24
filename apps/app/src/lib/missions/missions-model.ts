import type { AppSidebarRowMission } from "@workspace/ui/components/app-sidebar"
import type {
	BotBadge,
	BotMissionState,
} from "@workspace/ui/components/bot-badge"
import type { MessageAuthor } from "@workspace/ui/components/message"
import type {
	MissionCardModel,
	MissionEventLink,
	MissionEventModel,
	MissionPullRequest,
	MissionEventKind as ShownEventKind,
} from "@workspace/ui/components/mission"
import type {
	MissionsPanelMission,
	MissionsPanelProps,
} from "@workspace/ui/components/missions-panel"
import type { RosterBot } from "@workspace/ui/components/roster"
import type {
	EarlierTodayRow,
	RoutinesPanelMissions,
} from "@workspace/ui/components/routines-panel"
import { i18n } from "@workspace/ui/lib/i18n"
import { formatDateTime } from "@workspace/ui/lib/time-format"

import type {
	Mission,
	MissionChanged,
	MissionEvent,
	MissionInSpace,
	MissionLiveness,
	MissionSpacePage,
	MissionState,
} from "./mission-contract"
import { toMissionFace } from "./mission-thread-model"

import type { SoloThreads } from "@/lib/bots/roster-line"
import { rosterTimestamp } from "@/lib/bots/roster-timestamp"
import type { ThreadFace } from "@/lib/chat/thread-contract"
import type { ReportedRunRead } from "@/lib/routines/routines-model"

const BADGE_BY_STATE: Record<MissionState, BotBadge | null> = {
	working: null,
	waiting_bot: null,
	waiting_human: "attention",
	ready_to_merge: "done",
	failed: "failed",
	done: null,
	closed: null,
}

export const badgeOfMissionState = (state: MissionState): BotBadge | null =>
	BADGE_BY_STATE[state]

const STATE_OF_LIVENESS: Record<MissionLiveness, MissionState | null> = {
	idle: null,
	working: "working",
	needs_you: "waiting_human",
	ready_to_merge: "ready_to_merge",
	failed: "failed",
	done: "done",
	closed: "closed",
}

type MissionStanding = Pick<Mission, "state" | "liveness">

export const missionStateOf = ({ state, liveness }: MissionStanding) =>
	(liveness && STATE_OF_LIVENESS[liveness]) ?? state

export const AGENT_SILENCE_MS = 2 * 60 * 1000

export type LiveMissionIds = ReadonlySet<string>

type SpeakingBotIds = Record<string, string[]>

export type MissionLivenessRead = {
	missions: Mission[]
	speakingBotIds: SpeakingBotIds
	now: number
}

const isOpen = (mission: Mission): boolean => mission.closedAt === null

const speaksOnItsThread = (
	mission: Mission,
	speakingBotIds: SpeakingBotIds,
): boolean =>
	speakingBotIds[mission.threadConversationId]?.includes(mission.botId) ?? false

const hasAgentActivity = (mission: Mission, now: number): boolean =>
	mission.lastActivityAt === null
		? mission.isAgentRunning
		: now - mission.lastActivityAt < AGENT_SILENCE_MS

const isLive = (
	mission: Mission,
	{ speakingBotIds, now }: MissionLivenessRead,
): boolean =>
	isOpen(mission) &&
	(speaksOnItsThread(mission, speakingBotIds) || hasAgentActivity(mission, now))

export const liveMissionsIn = (read: MissionLivenessRead): LiveMissionIds =>
	new Set(
		read.missions
			.filter((mission) => isLive(mission, read))
			.map(({ id }) => id),
	)

export const withMissionChange = (
	mission: Mission,
	{ lastActivityAt, isAgentRunning, liveness }: MissionChanged,
): Mission => ({
	...mission,
	lastActivityAt,
	isAgentRunning,
	liveness: liveness ?? mission.liveness,
})

export const withMissionMove = (
	mission: Mission,
	changed: MissionChanged,
): Mission => {
	const touched = withMissionChange(mission, changed)
	return changed.stateSeq < mission.stateSeq
		? touched
		: { ...touched, state: changed.state, stateSeq: changed.stateSeq }
}

type SpaceMissionGroup = "waitingOnYou" | "inProgress" | "earlierToday"

const SPACE_GROUP_BY_STATE: Record<MissionState, SpaceMissionGroup> = {
	waiting_human: "waitingOnYou",
	working: "inProgress",
	waiting_bot: "inProgress",
	ready_to_merge: "inProgress",
	done: "earlierToday",
	failed: "earlierToday",
	closed: "earlierToday",
}

export type SpaceMissionGroups = Record<SpaceMissionGroup, MissionInSpace[]>

export type SpaceMissionsRead = {
	entries: MissionInSpace[]
	closedSince: number
}

export type SpaceFeedPage = MissionSpacePage & {
	closedSince: number
}

const lastMovedAt = ({ mission }: MissionInSpace): number =>
	Math.max(mission.openedAt, mission.lastActivityAt ?? 0, mission.closedAt ?? 0)

const isShownInSpace = (
	{ mission }: MissionInSpace,
	closedSince: number,
): boolean =>
	SPACE_GROUP_BY_STATE[missionStateOf(mission)] !== "earlierToday" ||
	mission.closedAt === null ||
	mission.closedAt >= closedSince

export const toSpaceMissionGroups = ({
	entries,
	closedSince,
}: SpaceMissionsRead): SpaceMissionGroups => {
	const groups: SpaceMissionGroups = {
		waitingOnYou: [],
		inProgress: [],
		earlierToday: [],
	}
	const shown = entries
		.filter((entry) => isShownInSpace(entry, closedSince))
		.sort((one, other) => lastMovedAt(other) - lastMovedAt(one))
	for (const entry of shown) {
		groups[SPACE_GROUP_BY_STATE[missionStateOf(entry.mission)]].push(entry)
	}
	return groups
}

const TIME_OF_DAY: Intl.DateTimeFormatOptions = {
	hour: "2-digit",
	minute: "2-digit",
	hourCycle: "h23",
}

export const startOfLocalDay = (now: number): number => {
	const day = new Date(now)
	day.setHours(0, 0, 0, 0)
	return day.getTime()
}

type MissionFaces = (botId: string) => ThreadFace | undefined

export const missionFaceOf = (
	faceOf: MissionFaces,
	botId: string,
): ThreadFace =>
	faceOf(botId) ?? {
		id: botId,
		name: i18n.t("chat:transcript.mention.unknown"),
	}

type AgentActivity = {
	lastActivityAt?: number
	commitsAhead?: number
}

const agentActivityOf = (mission: Mission): AgentActivity => ({
	lastActivityAt: mission.lastActivityAt ?? undefined,
	commitsAhead: mission.commitsAhead ?? undefined,
})

export type MissionCardRead = {
	mission: Mission
	identity: RosterBot
	author?: MessageAuthor
	state: MissionState
	isWorking: boolean
	now: number
}

export const toMissionCard = ({
	mission,
	identity,
	author,
	state,
	isWorking,
	now,
}: MissionCardRead): MissionCardModel => ({
	id: mission.id,
	identity,
	author,
	objective: mission.objective,
	ticket: {
		externalId: mission.ticket.externalId,
		title: mission.ticket.title,
		platform: mission.ticket.platform,
		url: mission.ticket.url,
	},
	tools: mission.tools,
	state,
	isWorking,
	isClosed: mission.closedAt !== null,
	timestamp: rosterTimestamp(
		mission.closedAt ?? mission.lastActivityAt ?? mission.openedAt,
		now,
	),
	now,
	status: mission.status ?? undefined,
	commitsAhead: mission.commitsAhead ?? undefined,
	...missionProgressOf(mission),
})

const isMissionWorking = (
	mission: Mission,
	liveMissionIds: LiveMissionIds,
): boolean =>
	mission.liveness === undefined
		? liveMissionIds.has(mission.id)
		: mission.liveness === "working"

const rowsOf = (
	missions: Mission[],
	faceOf: MissionFaces,
	liveMissionIds: LiveMissionIds,
	now: number,
): MissionCardModel[] =>
	missions.map((mission) =>
		toMissionCard({
			mission,
			identity: missionFaceOf(faceOf, mission.botId),
			state: missionStateOf(mission),
			isWorking: isMissionWorking(mission, liveMissionIds),
			now,
		}),
	)

const withoutAgentActivity = ({
	commitsAhead,
	lastActivity,
	...card
}: MissionCardModel): MissionCardModel => card

type EarlierTodayEntry = {
	at: number
	row: EarlierTodayRow
}

const closedTodayEntries = (
	closed: Mission[],
	faceOf: MissionFaces,
	midnight: number,
	now: number,
): EarlierTodayEntry[] =>
	closed.flatMap((mission) => {
		if (mission.closedAt === null || mission.closedAt < midnight) {
			return []
		}

		return [
			{
				at: mission.closedAt,
				row: {
					kind: "mission",
					...withoutAgentActivity(
						toMissionCard({
							mission,
							identity: missionFaceOf(faceOf, mission.botId),
							state: missionStateOf(mission),
							isWorking: false,
							now,
						}),
					),
					timestamp: formatDateTime(mission.closedAt, TIME_OF_DAY),
				},
			},
		]
	})

const reportedTodayEntries = (
	reportedRuns: ReportedRunRead[],
	faceOf: MissionFaces,
	midnight: number,
): EarlierTodayEntry[] =>
	reportedRuns.flatMap((run) => {
		const face = faceOf(run.botId)
		if (!face || run.at < midnight) {
			return []
		}

		return [
			{
				at: run.at,
				row: {
					kind: "run",
					id: run.id,
					routineTitle: run.routineTitle,
					triggerSourceTitle: run.triggerSourceTitle,
					bot: toMissionFace(face),
					timestamp: formatDateTime(run.at, TIME_OF_DAY),
				},
			},
		]
	})

export type ActivityMissionsRead = {
	open: Mission[]
	closed: Mission[]
	reportedRuns: ReportedRunRead[]
	faceOf: MissionFaces
	liveMissionIds: LiveMissionIds
	now: number
}

export const toActivityMissions = ({
	open,
	closed,
	reportedRuns,
	faceOf,
	liveMissionIds,
	now,
}: ActivityMissionsRead): Omit<RoutinesPanelMissions, "onOpen"> => {
	const midnight = startOfLocalDay(now)

	return {
		open: rowsOf(open, faceOf, liveMissionIds, now),
		earlierToday: [
			...closedTodayEntries(closed, faceOf, midnight, now),
			...reportedTodayEntries(reportedRuns, faceOf, midnight),
		]
			.sort((one, other) => other.at - one.at)
			.map((entry) => entry.row),
	}
}

export type MissionHeaderActivity = AgentActivity & {
	pullRequest?: MissionPullRequest
}

const PULL_REQUEST_NUMBER = /^\d+$/

const pullRequestOf = (url: string | null): MissionPullRequest | undefined => {
	const lastSegment = url?.split("/").at(-1)
	if (!url || !lastSegment || !PULL_REQUEST_NUMBER.test(lastSegment)) {
		return undefined
	}

	return { url, number: Number(lastSegment) }
}

const missionProgressOf = (
	mission: Mission,
): Pick<MissionCardModel, "pullRequest" | "lastActivity"> => ({
	pullRequest: pullRequestOf(mission.pullRequestUrl),
	lastActivity: mission.lastActivity ?? undefined,
})

export const toMissionHeaderActivity = (
	mission: Mission,
): MissionHeaderActivity => ({
	...agentActivityOf(mission),
	pullRequest: pullRequestOf(mission.pullRequestUrl),
})

const SPOKEN_KEYS = ["line", "message", "question", "summary"] as const

const payloadRecordOf = (
	payload: unknown,
): Record<string, unknown> | undefined =>
	typeof payload === "object" && payload !== null
		? (payload as Record<string, unknown>)
		: undefined

const spokenTextOf = (payload: unknown): string | undefined => {
	const held = payloadRecordOf(payload)
	if (!held) {
		return undefined
	}

	return SPOKEN_KEYS.map((key) => held[key]).find(
		(value): value is string => typeof value === "string" && value.length > 0,
	)
}

const linkOf = (payload: unknown): MissionEventLink | undefined => {
	const held = payloadRecordOf(payload)
	if (typeof held?.url !== "string") {
		return undefined
	}

	return typeof held.pullRequest === "number"
		? { url: held.url, pullRequest: held.pullRequest }
		: { url: held.url }
}

const SHOWN_EVENT_KINDS: Record<ShownEventKind, true> = {
	opened: true,
	note: true,
	agent_asked: true,
	answered: true,
	escalated: true,
	ready: true,
	checks_failed: true,
	failed: true,
	closed: true,
	dismissed: true,
	reopened: true,
}

const isShown = (
	event: MissionEvent,
): event is MissionEvent & { kind: ShownEventKind } =>
	event.kind in SHOWN_EVENT_KINDS

export const toMissionEventModels = (
	events: MissionEvent[],
): MissionEventModel[] =>
	events.filter(isShown).map((event) => ({
		id: event.id,
		kind: event.kind,
		source: event.source,
		createdAt: event.createdAt,
		text: spokenTextOf(event.payload),
		link: linkOf(event.payload),
	}))

export type MissionsByRow = Record<string, AppSidebarRowMission[]>

type MissionCarrier = {
	missions?: AppSidebarRowMission[]
}

const CHIP_STATE_OF: Partial<Record<MissionState, BotMissionState>> = {
	waiting_human: "waiting",
	failed: "failed",
	ready_to_merge: "ready",
	working: "working",
	waiting_bot: "working",
}

const MOST_URGENT_FIRST: BotMissionState[] = [
	"waiting",
	"failed",
	"ready",
	"working",
]

const RING_BADGE_OF: Partial<Record<BotMissionState, BotBadge>> =
	Object.fromEntries(
		Object.entries(CHIP_STATE_OF).flatMap(([state, chip]) => {
			const badge = BADGE_BY_STATE[state as MissionState]
			return badge ? [[chip, badge]] : []
		}),
	)

type ShownMission = {
	state: BotMissionState
	mission: Mission
}

export type MissionEntry = { mission: Mission }

const mostUrgentFirst = (one: ShownMission, other: ShownMission): number =>
	MOST_URGENT_FIRST.indexOf(one.state) -
		MOST_URGENT_FIRST.indexOf(other.state) ||
	other.mission.openedAt - one.mission.openedAt ||
	(one.mission.id < other.mission.id ? -1 : 1)

const toRowMission = ({
	state,
	mission,
}: ShownMission): AppSidebarRowMission => ({
	id: mission.id,
	state,
	ticket: {
		platform: mission.ticket.platform,
		externalId: mission.ticket.externalId,
		title: mission.ticket.title,
	},
})

export const missionRowIdOf = (
	conversationId: string,
	botId: string,
	listedConversationIds: ReadonlySet<string>,
): string =>
	listedConversationIds.has(conversationId) ? conversationId : botId

export const missionsByRow = (
	entries: MissionEntry[],
	listedConversations: { id: string }[],
): MissionsByRow => {
	const listedConversationIds = new Set(
		listedConversations.map((conversation) => conversation.id),
	)
	const open: Record<string, ShownMission[]> = {}
	for (const { mission } of entries) {
		if (mission.closedAt !== null) continue

		const state = CHIP_STATE_OF[missionStateOf(mission)]
		if (!state) continue

		const rowId = missionRowIdOf(
			mission.originConversationId,
			mission.botId,
			listedConversationIds,
		)
		open[rowId] = [...(open[rowId] ?? []), { state, mission }]
	}

	return Object.fromEntries(
		Object.entries(open).map(([rowId, held]) => [
			rowId,
			[...held].sort(mostUrgentFirst).map(toRowMission),
		]),
	)
}

const NO_MISSIONS: MissionsByRow = {}

const conversationSpaces = (
	conversationRosters: Record<string, { id: string }[]>,
	soloThreads: SoloThreads,
): Map<string, string> => {
	const spaces = new Map<string, string>()
	for (const [conversationId, line] of Object.entries(soloThreads)) {
		spaces.set(conversationId, line.spaceId)
	}
	for (const [spaceId, conversations] of Object.entries(conversationRosters)) {
		for (const { id } of conversations) {
			spaces.set(id, spaceId)
		}
	}
	return spaces
}

export type MissionSpaces = {
	entries: MissionEntry[]
	conversationRosters: Record<string, { id: string }[]>
	soloThreads: SoloThreads
}

export const missionsBySpaceId = ({
	entries,
	conversationRosters,
	soloThreads,
}: MissionSpaces): Record<string, MissionsByRow> => {
	const spaces = conversationSpaces(conversationRosters, soloThreads)
	const listed: Record<string, MissionEntry[]> = {}
	for (const entry of entries) {
		const spaceId = spaces.get(entry.mission.originConversationId)
		if (!spaceId) continue
		listed[spaceId] = [...(listed[spaceId] ?? []), entry]
	}

	return Object.fromEntries(
		Object.entries(listed).map(([spaceId, held]) => [
			spaceId,
			missionsByRow(held, conversationRosters[spaceId] ?? []),
		]),
	)
}

export const missionsIn = (
	missions: Record<string, MissionsByRow>,
	spaceId: string | null,
): MissionsByRow =>
	spaceId === null ? NO_MISSIONS : (missions[spaceId] ?? NO_MISSIONS)

export const withMissions = <Row extends MissionCarrier & { id: string }>(
	rows: Row[],
	missions: MissionsByRow,
): Row[] =>
	rows.map((row) =>
		missions[row.id] ? { ...row, missions: missions[row.id] } : row,
	)

export const missionRingBadges = (
	rowsBySpaceId: Record<string, MissionCarrier[]>,
): Record<string, { badge?: BotBadge }[]> =>
	Object.fromEntries(
		Object.entries(rowsBySpaceId).map(([spaceId, rows]) => [
			spaceId,
			rows.map((row) => ({
				badge: row.missions?.[0] && RING_BADGE_OF[row.missions[0].state],
			})),
		]),
	)

type MissionsPanelRowsRead = {
	faceOf: MissionFaces
	liveMissionIds: LiveMissionIds
	now: number
}

type MissionsPanelRead = MissionsPanelRowsRead & {
	groups: SpaceMissionGroups
}

const missionsPanelRowsOf = (
	entries: MissionInSpace[],
	{ faceOf, liveMissionIds, now }: MissionsPanelRowsRead,
): MissionsPanelMission[] =>
	entries.map(({ mission, conversationId }) => ({
		...toMissionCard({
			mission,
			identity: missionFaceOf(faceOf, mission.botId),
			state: missionStateOf(mission),
			isWorking: isMissionWorking(mission, liveMissionIds),
			now,
		}),
		conversationId,
	}))

export const toMissionsPanel = ({
	groups,
	...read
}: MissionsPanelRead): Omit<MissionsPanelProps, "onOpen"> => ({
	open: missionsPanelRowsOf(
		[...groups.waitingOnYou, ...groups.inProgress],
		read,
	),
	earlierToday: missionsPanelRowsOf(groups.earlierToday, read),
})
