import { type MouseEvent, type ReactNode, useContext } from "react"

import { greetingPeriodOf } from "@workspace/ui/components/greeting-period"
import type { HomeAgent } from "@workspace/ui/components/home-agent-picker"
import { HomeApplicationsBand } from "@workspace/ui/components/home-applications-band"
import {
	HomeComposer,
	HomeComposerSkeleton,
} from "@workspace/ui/components/home-composer"
import {
	HomeGreeting,
	HomeGreetingSkeleton,
} from "@workspace/ui/components/home-greeting"
import { HomeLayout } from "@workspace/ui/components/home-layout"
import {
	HomeArchivedLine,
	HomeAskedByLine,
	HomeMissionLine,
	HomeRequest,
	type HomeRoom,
	HomeRoomLine,
} from "@workspace/ui/components/home-lines"

import { ApprovalPrompt, QuestionPrompt } from "@/components/thread-prompt"
import { ConversationApplicationsContext } from "@/lib/applications/use-conversation-installs"
import { useMcpServers } from "@/lib/bots/use-mcp-servers"
import { faceOfBot } from "@/lib/chat/thread-contract"
import type { ConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import { toConversationLook } from "@/lib/conversations/roster-conversations"
import type { Bot, Conversation } from "@/lib/conversations/store-contract"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { useConversation } from "@/lib/conversations/use-conversation"
import { homeMissionLinesOf } from "@/lib/home/home-mission-lines"
import type { HomeRoomLineModel } from "@/lib/home/home-room-lines"
import type { HomeArchive } from "@/lib/home/home-visits"
import { useAgentRooms } from "@/lib/home/use-agent-rooms"
import { useSpaceMissions } from "@/lib/missions/use-space-missions"

type OpenRoom = (conversationId: string) => void

const homeAgentOf = (bot: Bot): HomeAgent => {
	const face = faceOfBot(bot)
	return {
		id: face.id,
		name: face.name,
		role: face.title,
		hue: face.blot,
		image: face.image,
	}
}

const periodAt = (at: number) => greetingPeriodOf(new Date(at).getHours())

const firstNameOf = (readerName: string) =>
	readerName.trim().split(/\s+/)[0] || undefined

const roomOf = (conversationId: string, title: string): HomeRoom => ({
	title,
	href: `#${conversationId}`,
})

const homeRoomOf = (conversation: Conversation): HomeRoom => {
	const { icon, color } = toConversationLook(conversation)
	return { ...roomOf(conversation.id, conversation.title), icon, hue: color }
}

const roomOpenerOf =
	(onOpenRoom: OpenRoom, conversationId: string) =>
	(event: MouseEvent<HTMLAnchorElement>) => {
		event.preventDefault()
		onOpenRoom(conversationId)
	}

type HomeRoomRequestProps = {
	room: Conversation
	bots: Bot[]
	runtimes: ConversationRuntimes
	onOpenRoom: OpenRoom
}

const HomeRoomRequest = ({
	room,
	bots,
	runtimes,
	onOpenRoom,
}: HomeRoomRequestProps) => {
	const { state, controller } = useConversation(runtimes, room)
	const prompt = state.pendingPrompt
	if (!prompt) {
		return null
	}

	const asker = bots.find(({ id }) => id === prompt.botId)
	const askedBy = asker ? (
		<HomeAskedByLine
			agent={homeAgentOf(asker)}
			onOpenRoom={roomOpenerOf(onOpenRoom, room.id)}
			room={homeRoomOf(room)}
		/>
	) : null

	if (prompt.kind === "question") {
		return (
			<QuestionPrompt
				askedBy={askedBy}
				companionName={asker?.name}
				request={prompt.request}
				responder={controller}
			/>
		)
	}

	return (
		<HomeRequest askedBy={askedBy}>
			<ApprovalPrompt
				agentName={asker?.name}
				request={prompt.request}
				responder={controller}
			/>
		</HomeRequest>
	)
}

export type HomeLinesProps = {
	agent: Bot
	bots: Bot[]
	conversations: Conversation[]
	store: Pick<TranscriptStore, "agentRooms">
	runtimes: ConversationRuntimes
	spaceId: string | null
	openedAt: number | null
	roomLinesOf: (workingIds: string[]) => HomeRoomLineModel[]
	onOpenRoom: OpenRoom
}

export const HomeLines = ({
	agent,
	bots,
	conversations,
	store,
	runtimes,
	spaceId,
	openedAt,
	roomLinesOf,
	onOpenRoom,
}: HomeLinesProps) => {
	const roomLines = roomLinesOf(useAgentRooms(store, spaceId, agent.id))
	const missions = useSpaceMissions(spaceId)
	const missionLines =
		openedAt === null
			? []
			: homeMissionLinesOf(
					[
						...missions.waitingOnYou,
						...missions.inProgress,
						...missions.earlierToday,
					],
					agent.id,
					openedAt,
				)
	const roomWith = (conversationId: string) =>
		conversations.find(({ id }) => id === conversationId)
	const homeAgent = homeAgentOf(agent)

	return (
		<>
			{roomLines.map((line) => {
				const room = roomWith(line.conversationId)
				if (!room) {
					return null
				}
				const opens = roomOpenerOf(onOpenRoom, room.id)
				return line.state === "working" ? (
					<HomeRoomLine
						agent={homeAgent}
						key={`${room.id}-working`}
						onOpenRoom={opens}
						room={homeRoomOf(room)}
						state="working"
					/>
				) : (
					<HomeRoomLine
						agent={homeAgent}
						at={line.at}
						key={`${room.id}-${line.at}`}
						onOpenRoom={opens}
						room={homeRoomOf(room)}
						state="done"
					/>
				)
			})}
			{roomLines.map(({ conversationId, state }) => {
				const room = roomWith(conversationId)
				return room && state === "working" ? (
					<HomeRoomRequest
						bots={bots}
						key={`${conversationId}-request`}
						onOpenRoom={onOpenRoom}
						room={room}
						runtimes={runtimes}
					/>
				) : null
			})}
			{missionLines.map((line) => {
				const room = roomWith(line.roomId)
				return (
					<HomeMissionLine
						at={line.at}
						key={line.missionId}
						onOpenRoom={roomOpenerOf(onOpenRoom, line.roomId)}
						room={room ? homeRoomOf(room) : roomOf(line.roomId, line.roomTitle)}
						state={line.state}
						title={line.title}
					/>
				)
			})}
		</>
	)
}

export type HomeSend = {
	draft: string
	onDraftChange: (draft: string) => void
	onSubmit: (text: string) => void
	onAttach: (files: File[]) => void
}

export type ThreadHome = {
	isSettling: boolean
	lines: ReactNode
	emptyStage: (send: HomeSend) => ReactNode
}

export type HomeEmptyStageProps = HomeSend & {
	agent: Bot
	agents: Bot[]
	store: TranscriptStore
	spaceId: string | null
	readerName: string
	archive: HomeArchive | null
	isBandDismissed: boolean
	lines: ReactNode
	onOpenArchive: (conversationId: string) => void
	onSelectAgent: (botId: string) => void
	onDismissBand: () => void
}

type ApplicationsBandInput = {
	store: TranscriptStore
	agent: Bot
	spaceId: string | null
	isDismissed: boolean
	onDismiss: () => void
}

const useApplicationsBand = ({
	store,
	agent,
	spaceId,
	isDismissed,
	onDismiss,
}: ApplicationsBandInput): ReactNode => {
	const curated = useContext(ConversationApplicationsContext)?.curated ?? []
	const { servers, isPending, hasFailedToLoad } = useMcpServers(
		store,
		spaceId === null ? null : { kind: "bot", id: agent.id, spaceId },
	)
	const hasNoApplication =
		!isPending && !hasFailedToLoad && servers.length === 0
	if (isDismissed || !hasNoApplication) {
		return undefined
	}
	const marks = curated.flatMap(({ logo }) => (logo ? [logo] : []))
	return (
		<HomeApplicationsBand
			agentName={agent.name}
			marks={marks}
			onDismiss={onDismiss}
		/>
	)
}

export const HomeLoadingStage = () => (
	<HomeLayout stage="empty">
		<HomeGreetingSkeleton />
		<HomeComposerSkeleton />
	</HomeLayout>
)

export const HomeEmptyStage = ({
	agent,
	agents,
	store,
	spaceId,
	readerName,
	archive,
	isBandDismissed,
	lines,
	onOpenArchive,
	onSelectAgent,
	onDismissBand,
	draft,
	onDraftChange,
	onSubmit,
	onAttach,
}: HomeEmptyStageProps) => {
	const band = useApplicationsBand({
		store,
		agent,
		spaceId,
		isDismissed: isBandDismissed,
		onDismiss: onDismissBand,
	})

	return (
		<HomeLayout stage="empty">
			<HomeGreeting
				agent={homeAgentOf(agent)}
				firstName={firstNameOf(readerName)}
				period={periodAt(Date.now())}
			/>
			<HomeComposer
				agents={agents.map(homeAgentOf)}
				band={band}
				defaultValue={draft}
				onAttach={onAttach}
				onSelectAgent={onSelectAgent}
				onSubmit={onSubmit}
				onValueChange={onDraftChange}
				selectedAgentId={agent.id}
			/>
			{archive ? (
				<HomeArchivedLine
					agentName={agent.name}
					onOpen={() => onOpenArchive(archive.conversationId)}
					period={periodAt(archive.lastActiveAt)}
				/>
			) : null}
			{lines}
		</HomeLayout>
	)
}
