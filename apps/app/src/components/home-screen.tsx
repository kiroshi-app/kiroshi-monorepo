import { Fragment, type MouseEvent, type ReactNode, useContext } from "react"

import { greetingPeriodOf } from "@workspace/ui/components/greeting-period"
import type { HomeAgent } from "@workspace/ui/components/home-agent-picker"
import { HomeApplicationsBand } from "@workspace/ui/components/home-applications-band"
import { HomeComposer } from "@workspace/ui/components/home-composer"
import { HomeGreeting } from "@workspace/ui/components/home-greeting"
import { HomeLayout } from "@workspace/ui/components/home-layout"
import {
	HomeAskedByLine,
	HomeMissionLine,
	HomeRequest,
	type HomeRoom,
	HomeRoomLine,
} from "@workspace/ui/components/home-lines"
import type { PromptAttachment } from "@workspace/ui/components/prompt-attachments"
import type { TranscriptItem } from "@workspace/ui/components/transcript"

import { ApprovalPrompt, QuestionPrompt } from "@/components/thread-prompt"
import { ConversationApplicationsContext } from "@/lib/applications/use-conversation-installs"
import { useMcpServers } from "@/lib/bots/use-mcp-servers"
import { faceOfBot } from "@/lib/chat/thread-contract"
import type {
	ConversationController,
	PendingPrompt,
} from "@/lib/conversations/conversation-controller"
import type { ConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import { toConversationLook } from "@/lib/conversations/roster-conversations"
import type { Bot, Conversation } from "@/lib/conversations/store-contract"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import {
	useConversation,
	useHeldRecord,
} from "@/lib/conversations/use-conversation"
import { homeMissionLinesOf } from "@/lib/home/home-mission-lines"
import type { HomeRoomLineModel } from "@/lib/home/home-room-lines"
import { useAgentRooms } from "@/lib/home/use-agent-rooms"
import { useSpaceMissions } from "@/lib/missions/use-space-missions"
import { conversationHrefOf } from "@/lib/tabs/conversation-tab-opening"

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
	href: conversationHrefOf({ conversationId }),
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

type RoomRequest = {
	room: Conversation
	prompt: PendingPrompt
	responder: ConversationController
}

type HomeRoomRequestProps = RoomRequest & {
	bots: Bot[]
	onOpenRoom: OpenRoom
}

const HomeRoomRequest = ({
	room,
	prompt,
	responder,
	bots,
	onOpenRoom,
}: HomeRoomRequestProps) => {
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
				responder={responder}
			/>
		)
	}

	return (
		<HomeRequest askedBy={askedBy}>
			<ApprovalPrompt
				agentName={asker?.name}
				request={prompt.request}
				responder={responder}
			/>
		</HomeRequest>
	)
}

type HomeRoomOpeningProps = {
	room: Conversation
	runtimes: ConversationRuntimes
}

const HomeRoomOpening = ({ room, runtimes }: HomeRoomOpeningProps) => {
	useConversation(runtimes, room)
	return null
}

const pendingPromptIn = (
	runtimes: ConversationRuntimes,
	conversationId: string,
) => runtimes.heldFor(conversationId)?.getState().pendingPrompt ?? null

const promptSignOf = (prompt: PendingPrompt | null) => prompt?.request.id ?? ""

const useRoomRequest = (
	runtimes: ConversationRuntimes,
	rooms: Conversation[],
): RoomRequest | null => {
	const prompts = useHeldRecord(
		runtimes,
		rooms.map(({ id }) => id),
		(conversationId) => pendingPromptIn(runtimes, conversationId),
		promptSignOf,
	)
	const room = rooms.find(({ id }) => prompts[id])
	const prompt = room ? prompts[room.id] : null
	const responder = room ? runtimes.heldFor(room.id) : null
	return room && prompt && responder ? { room, prompt, responder } : null
}

const roomsAmong = (conversationIds: string[], conversations: Conversation[]) =>
	conversations.filter(({ id }) => conversationIds.includes(id))

type HomeRoomsProps = {
	agent: Bot
	conversations: Conversation[]
	store: Pick<TranscriptStore, "agentRooms">
	spaceId: string | null
	onOpenRoom: OpenRoom
}

type HomeRequestsProps = HomeRoomsProps & {
	bots: Bot[]
	runtimes: ConversationRuntimes
}

type HomeComposerSlotProps = HomeRequestsProps & {
	composer: ReactNode
}

const HomeComposerSlot = ({
	agent,
	bots,
	conversations,
	store,
	runtimes,
	spaceId,
	onOpenRoom,
	composer,
}: HomeComposerSlotProps) => {
	const rooms = roomsAmong(
		useAgentRooms(store, spaceId, agent.id),
		conversations,
	)
	const roomRequest = useRoomRequest(runtimes, rooms)
	const shownRequest = roomRequest ? (
		<HomeRoomRequest
			{...roomRequest}
			bots={bots}
			key={roomRequest.prompt.request.id}
			onOpenRoom={onOpenRoom}
		/>
	) : null

	return (
		<>
			{rooms.map((room) => (
				<HomeRoomOpening key={room.id} room={room} runtimes={runtimes} />
			))}
			{shownRequest ?? composer}
		</>
	)
}

export type HomeLinesProps = HomeRoomsProps & {
	openedAt: number | null
	roomLinesOf: (workingIds: string[]) => HomeRoomLineModel[]
}

const useHomeLines = ({
	agent,
	conversations,
	store,
	spaceId,
	openedAt,
	roomLinesOf,
	onOpenRoom,
}: HomeLinesProps): TranscriptItem[] => {
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

	const roomItems = roomLines.flatMap((line): TranscriptItem[] => {
		const room = roomWith(line.conversationId)
		if (!room) {
			return []
		}
		const opens = roomOpenerOf(onOpenRoom, room.id)
		const isWorking = line.state === "working"
		return [
			{
				key: `home-room-${room.id}-${isWorking ? "working" : line.at}`,
				render: () =>
					isWorking ? (
						<HomeRoomLine
							agent={homeAgent}
							onOpenRoom={opens}
							room={homeRoomOf(room)}
							state="working"
						/>
					) : (
						<HomeRoomLine
							agent={homeAgent}
							at={line.at}
							onOpenRoom={opens}
							room={homeRoomOf(room)}
							state="done"
						/>
					),
			},
		]
	})
	const missionItems = missionLines.map((line): TranscriptItem => {
		const room = roomWith(line.roomId)
		return {
			key: `home-mission-${line.missionId}`,
			render: () => (
				<HomeMissionLine
					at={line.at}
					onOpenRoom={roomOpenerOf(onOpenRoom, line.roomId)}
					room={room ? homeRoomOf(room) : roomOf(line.roomId, line.roomTitle)}
					state={line.state}
					title={line.title}
				/>
			),
		}
	})

	return [...roomItems, ...missionItems]
}

export const HomeLines = (props: HomeLinesProps) => (
	<>
		{useHomeLines(props).map(({ key, render }) => (
			<Fragment key={key}>{render()}</Fragment>
		))}
	</>
)

export type HomeSend = {
	draft: string
	isSending: boolean
	onDraftChange: (draft: string) => void
	onSubmit: (text: string) => void
	onAttach: (files: File[]) => void
	attachments: PromptAttachment[]
	onRemoveAttachment: (id: string) => void
}

type HomeDraftComposerProps = HomeSend & {
	agent: Bot
	bots: Bot[]
	band?: ReactNode
	onSelectAgent: (botId: string) => void
	arrivalKey?: string
}

const HomeDraftComposer = ({
	agent,
	bots,
	band,
	onSelectAgent,
	draft,
	isSending,
	onDraftChange,
	onSubmit,
	onAttach,
	attachments,
	onRemoveAttachment,
	arrivalKey,
}: HomeDraftComposerProps) => (
	<HomeComposer
		agents={bots.map(homeAgentOf)}
		arrivalKey={arrivalKey}
		attachments={attachments}
		band={band}
		onAttach={onAttach}
		onRemoveAttachment={onRemoveAttachment}
		onSelectAgent={onSelectAgent}
		onSubmit={onSubmit}
		onValueChange={onDraftChange}
		selectedAgentId={agent.id}
		sending={isSending}
		value={draft}
	/>
)

export type HomeEmptyStageProps = HomeSend &
	HomeRequestsProps & {
		store: TranscriptStore
		readerName: string
		isBandDismissed: boolean
		lines: ReactNode
		notice: ReactNode
		isReadOnly: boolean
		onSelectAgent: (botId: string) => void
		onDismissBand: () => void
		arrivalKey?: string
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

export const HomeEmptyStage = ({
	agent,
	bots,
	conversations,
	store,
	runtimes,
	spaceId,
	readerName,
	isBandDismissed,
	lines,
	notice,
	isReadOnly,
	onOpenRoom,
	onSelectAgent,
	onDismissBand,
	arrivalKey,
	...send
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
			{notice}
			{isReadOnly ? null : (
				<HomeComposerSlot
					agent={agent}
					bots={bots}
					composer={
						<HomeDraftComposer
							{...send}
							agent={agent}
							arrivalKey={arrivalKey}
							band={band}
							bots={bots}
							onSelectAgent={onSelectAgent}
						/>
					}
					conversations={conversations}
					onOpenRoom={onOpenRoom}
					runtimes={runtimes}
					spaceId={spaceId}
					store={store}
				/>
			)}
			{lines}
		</HomeLayout>
	)
}
