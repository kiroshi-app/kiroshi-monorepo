import type { Mission, MissionChanged, MissionDetail } from "./mission-contract"
import {
	createMissionEventRead,
	type ReadMissionOfEvent,
} from "./mission-event-read"
import type { OpenedMission } from "./opened-mission-controller"

import type { MissionRunClaim } from "../bindings"

export type FakeMissions = {
	board: () => Promise<{ mission: Mission }[]>
	unreported: () => Promise<{ mission: Mission }[]>
	reported: (missionId: string, turnId: string | null) => Promise<void>
	reports: [missionId: string, turnId: string | null][]
	answered: (missionId: string, seq: number) => Promise<void>
	answers: [missionId: string, seq: number][]
	refuseAnswered: () => void
	onChanged: (
		listener: (changed: MissionChanged, hostId?: string | null) => void,
	) => Promise<() => void>
	detail: (missionId: string) => Promise<MissionDetail>
	detailCalls: string[]
	read: ReadMissionOfEvent
	readSides: [missionId: string, side: string | null][]
	rosterBlock: (conversationId: string, botId: string) => Promise<string | null>
	rosterCalls: [conversationId: string, botId: string][]
	holdRosterBlock: (block: string | null) => void
	refuseRosterBlock: () => void
	claimRun: (missionId: string) => Promise<MissionRunClaim>
	releaseRun: (token: string) => Promise<void>
	claims: string[]
	releases: string[]
	claimElsewhere: (missionId: string) => void
	refuseClaim: () => void
	refuseRelease: () => void
	open: (opened: OpenedMission) => void
	opened: OpenedMission[]
	hold: (detail: MissionDetail) => void
	place: (missions: Mission[]) => void
	stall: () => void
	release: () => void
	stallDetail: () => void
	releaseDetail: () => void
	refuseOnce: (missionId: string) => void
	refuseBoard: () => void
	stallUnreported: () => void
	releaseUnreported: () => void
	refuseUnreported: () => void
	refuseReported: () => void
	refuse: (missionId: string) => void
	change: (changed: MissionChanged, hostId?: string | null) => void
}

export const createFakeMissions = (): FakeMissions => {
	const details = new Map<string, MissionDetail>()
	const refused = new Set<string>()
	const refusedOnce = new Set<string>()
	const listeners = new Set<
		(changed: MissionChanged, hostId?: string | null) => void
	>()
	const opened: OpenedMission[] = []
	const rosterCalls: [conversationId: string, botId: string][] = []
	const reports: [missionId: string, turnId: string | null][] = []
	const answers: [missionId: string, seq: number][] = []
	const detailCalls: string[] = []
	const readSides: [missionId: string, side: string | null][] = []
	let rosterBlock: string | null = null
	let isRosterRefused = false
	let placed: Mission[] = []
	let isBoardRefused = false
	let readable = Promise.resolve()
	let makeReadable: () => void = () => undefined
	let unreportedReadable = Promise.resolve()
	let makeUnreportedReadable: () => void = () => undefined
	let isUnreportedRefused = false
	let isReportedRefused = false
	let isAnsweredRefused = false
	let detailGate: Promise<void> | null = null
	const claims: string[] = []
	const releases: string[] = []
	const tokenOfMission = new Map<string, string>()
	let isClaimRefused = false
	let isReleaseRefused = false
	let openDetailGate: () => void = () => undefined

	const isOpen = ({ closedAt }: Mission) => closedAt === null

	const isStillOwingAReport = (mission: Mission) =>
		!isOpen(mission) && !reports.some(([missionId]) => missionId === mission.id)

	const fake: FakeMissions = {
		opened,
		rosterCalls,
		reports,
		answers,
		detailCalls,
		readSides,
		claims,
		releases,

		read: createMissionEventRead({
			detailOn: (hostId, missionId) => {
				readSides.push([missionId, hostId])
				return fake.detail(missionId)
			},
		}),

		rosterBlock: async (conversationId, botId) => {
			rosterCalls.push([conversationId, botId])
			if (isRosterRefused) {
				throw new Error("the roster block could not be read")
			}
			return rosterBlock
		},

		holdRosterBlock: (block) => {
			rosterBlock = block
		},

		refuseRosterBlock: () => {
			isRosterRefused = true
		},

		claimRun: async (missionId) => {
			claims.push(missionId)
			if (isClaimRefused) {
				throw new Error("the mission run could not be claimed")
			}
			if (tokenOfMission.has(missionId)) {
				return { kind: "alreadyRunning" }
			}
			const token = `token-${claims.length}`
			tokenOfMission.set(missionId, token)
			return { kind: "claimed", token }
		},

		releaseRun: async (token) => {
			releases.push(token)
			if (isReleaseRefused) {
				throw new Error("the mission run could not be released")
			}
			for (const [missionId, held] of tokenOfMission) {
				if (held === token) {
					tokenOfMission.delete(missionId)
				}
			}
		},

		claimElsewhere: (missionId) => {
			tokenOfMission.set(missionId, "token-of-another-window")
		},

		refuseClaim: () => {
			isClaimRefused = true
		},

		refuseRelease: () => {
			isReleaseRefused = true
		},

		board: async () => {
			await readable
			if (isBoardRefused) {
				throw new Error("the board could not be read")
			}
			return placed.filter(isOpen).map((mission) => ({ mission }))
		},

		place: (next) => {
			placed = next
		},

		stall: () => {
			readable = new Promise<void>((resolve) => {
				makeReadable = resolve
			})
		},

		release: () => {
			makeReadable()
		},

		refuseBoard: () => {
			isBoardRefused = true
		},

		unreported: async () => {
			await unreportedReadable
			if (isUnreportedRefused) {
				throw new Error("the unreported missions could not be read")
			}
			return placed.filter(isStillOwingAReport).map((mission) => ({ mission }))
		},

		reported: async (missionId, turnId) => {
			if (isReportedRefused) {
				throw new Error("the mission report could not be recorded")
			}
			if (reports.some(([reportedId]) => reportedId === missionId)) {
				throw { kind: "missionAlreadyReported", id: missionId }
			}
			reports.push([missionId, turnId])
		},

		stallUnreported: () => {
			unreportedReadable = new Promise<void>((resolve) => {
				makeUnreportedReadable = resolve
			})
		},

		releaseUnreported: () => {
			makeUnreportedReadable()
		},

		refuseUnreported: () => {
			isUnreportedRefused = true
		},

		refuseReported: () => {
			isReportedRefused = true
		},

		answered: async (missionId, seq) => {
			if (isAnsweredRefused) {
				throw new Error("the mission answer could not be recorded")
			}
			answers.push([missionId, seq])
		},

		refuseAnswered: () => {
			isAnsweredRefused = true
		},

		onChanged: async (listener) => {
			listeners.add(listener)
			return () => {
				listeners.delete(listener)
			}
		},

		detail: async (missionId) => {
			detailCalls.push(missionId)
			if (detailGate) {
				await detailGate
			}
			const held = details.get(missionId)
			const isRefusedOnce = refusedOnce.delete(missionId)
			if (isRefusedOnce || refused.has(missionId) || !held) {
				throw new Error(`no mission answers ${missionId}`)
			}
			return held
		},

		stallDetail: () => {
			detailGate = new Promise<void>((resolve) => {
				openDetailGate = resolve
			})
		},

		releaseDetail: () => {
			openDetailGate()
			detailGate = null
		},

		refuseOnce: (missionId) => {
			refusedOnce.add(missionId)
		},

		open: (next) => {
			opened.push(next)
		},

		hold: (detail) => {
			details.set(detail.mission.id, detail)
		},

		refuse: (missionId) => {
			refused.add(missionId)
		},

		change: (changed, hostId = null) => {
			for (const listener of [...listeners]) {
				listener(changed, hostId)
			}
		},
	}

	return fake
}
