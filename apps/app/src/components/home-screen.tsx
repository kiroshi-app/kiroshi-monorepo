import type { MouseEvent, ReactNode } from "react"

import { greetingPeriodOf } from "@workspace/ui/components/greeting-period"
import type { HomeAgent } from "@workspace/ui/components/home-agent-picker"
import { HomeComposer } from "@workspace/ui/components/home-composer"
import { HomeGreeting } from "@workspace/ui/components/home-greeting"
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
import { faceOfBot } from "@/lib/chat/thread-contract"
import type { ConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import { toConversationLook } from "@/lib/conversations/roster-conversations"
import type { Bot, Conversation } from "@/lib/conversations/store-contract"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { useConversation } from "@/lib/conversations/use-conversation"
import { homeMissionLinesOf } from "@/lib/home/home-mission-lines"
import type { HomeArchive } from "@/lib/home/home-renewals"
import { useRoomLines } from "@/lib/home/home-room-lines"
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
	onOpenRoom: OpenRoom
}

export const HomeLines = ({
	agent,
	bots,
	conversations,
	store,
	runtimes,
	spaceId,
	onOpenRoom,
}: HomeLinesProps) => {
	const roomLines = useRoomLines(useAgentRooms(store, spaceId, agent.id))
	const missions = useSpaceMissions(spaceId)
	const missionLines = homeMissionLinesOf(
		[
			...missions.waitingOnYou,
			...missions.inProgress,
			...missions.earlierToday,
		],
		agent.id,
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

type HomeSend = {
	draft: string
	onDraftChange: (draft: string) => void
	onSubmit: (text: string) => void
	onAttach: (files: File[]) => void
}

export type ThreadHome = {
	lines: ReactNode
	emptyStage: (send: HomeSend) => ReactNode
}

export type HomeEmptyStageProps = HomeSend & {
	agent: Bot
	agents: Bot[]
	readerName: string
	archive: HomeArchive | null
	lines: ReactNode
	onOpenArchive: (conversationId: string) => void
	onSelectAgent: (botId: string) => void
}

export const HomeEmptyStage = ({
	agent,
	agents,
	readerName,
	archive,
	lines,
	onOpenArchive,
	onSelectAgent,
	draft,
	onDraftChange,
	onSubmit,
	onAttach,
}: HomeEmptyStageProps) => (
	<HomeLayout stage="empty">
		<HomeGreeting
			agent={homeAgentOf(agent)}
			firstName={firstNameOf(readerName)}
			period={periodAt(Date.now())}
		/>
		<HomeComposer
			agents={agents.map(homeAgentOf)}
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
