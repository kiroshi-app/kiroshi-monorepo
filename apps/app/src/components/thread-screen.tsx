import {
	type RefObject,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useSyncExternalStore,
} from "react"

import { ActivityIndicator } from "@workspace/ui/components/activity-indicator"
import { AppHeader } from "@workspace/ui/components/app-header"
import type { BotStopProps } from "@workspace/ui/components/bot-identity-avatar"
import { ChatEmptyState } from "@workspace/ui/components/chat-empty-state"
import {
	type ConversationArrivalInviter,
	ConversationArrivalRow,
} from "@workspace/ui/components/conversation-arrival-row"
import { ConversationEmptyState } from "@workspace/ui/components/conversation-empty-state"
import { DaySeparator } from "@workspace/ui/components/day-separator"
import { HeaderConversationButton } from "@workspace/ui/components/header-conversation-button"
import { HeaderIdentityButton } from "@workspace/ui/components/header-identity-button"
import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import type { QuotedMessage } from "@workspace/ui/components/message-quote"
import type { MissionBot } from "@workspace/ui/components/mission"
import type { MissionCardWrap } from "@workspace/ui/components/mission-card"
import { MissionDetailSkeleton } from "@workspace/ui/components/mission-detail-skeleton"
import { MissionEventRow } from "@workspace/ui/components/mission-event-row"
import { MissionHeader } from "@workspace/ui/components/mission-header"
import { MissionTurn } from "@workspace/ui/components/mission-turn"
import {
	PINNED_AVATAR_SIZE,
	type PinnedMessage,
	PinnedMessages,
} from "@workspace/ui/components/pinned-messages"
import { type RosterBot, RosterProvider } from "@workspace/ui/components/roster"
import { RoutinesPanelTrigger } from "@workspace/ui/components/routines-panel"
import { SpaceAccessBanner } from "@workspace/ui/components/space-access-banner"
import { ThreadLayout } from "@workspace/ui/components/thread-layout"
import { ThreadTranscriptSkeleton } from "@workspace/ui/components/thread-transcript-skeleton"
import type {
	TranscriptHandle,
	TranscriptItem,
	TranscriptNewer,
} from "@workspace/ui/components/transcript"
import { type TurnCauseKind, TurnGroup } from "@workspace/ui/components/turn"
import { type ChatCopy, useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import { ApplicationInstallRow } from "@/components/application-install-row"
import { FaceAvatar } from "@/components/face-avatar"
import { useMissionCardMenus } from "@/components/mission-card-menu"
import { type PromptHandle, ThreadComposer } from "@/components/thread-composer"
import { botThreadMenu, conversationThreadMenu } from "@/components/thread-menu"
import {
	PinsNotice,
	ThreadNotice,
	UnresolvedMentionsNotice,
} from "@/components/thread-notice"
import {
	AnsweredPrompt,
	ApprovalPrompt,
	QuestionPrompt,
	SpokenApproval,
} from "@/components/thread-prompt"
import {
	type ActivityPanel,
	ThreadRoutines,
} from "@/components/thread-routines"
import { QueuedTurn, RefusedTurn, ThreadTurn } from "@/components/thread-turn"
import { titleBarDragRegion } from "@/components/window-caption-controls"
import type { ApplicationInstall } from "@/lib/applications/application-port"
import {
	isLeftOutOf,
	type RefusingSession,
} from "@/lib/applications/install-refusal"
import { installScopeOf } from "@/lib/applications/use-application-installs"
import {
	type ConversationApplications,
	ConversationApplicationsContext,
	useConversationInstalls,
} from "@/lib/applications/use-conversation-installs"
import {
	type SessionApplications,
	SessionApplicationsContext,
} from "@/lib/applications/use-session-application"
import { useRosterClock } from "@/lib/bots/use-roster-clock"
import {
	type AnsweredCards,
	answeredCardsIn,
} from "@/lib/chat/answered-question"
import type { AttachmentsOwner } from "@/lib/chat/attachments-contract"
import type { AttachmentsController } from "@/lib/chat/attachments-controller"
import type { ChatError } from "@/lib/chat/chat-state"
import { canStopTurn } from "@/lib/chat/chat-state"
import type { DraftsController } from "@/lib/chat/drafts-controller"
import { isTableBlock } from "@/lib/chat/markdown-blocks"
import { messageWithAttachments } from "@/lib/chat/message-attachments"
import { pinTimestamp } from "@/lib/chat/pin-timestamp"
import type { PinnedBubble } from "@/lib/chat/pinned-bubbles"
import { isPostedAnswer } from "@/lib/chat/posted-question"
import { type AskedBubble, askedQuestionOf } from "@/lib/chat/question-run"
import {
	bubbleIdOf,
	emptyStateStatusFor,
	opensNewDay,
	type ReplyTarget,
	type RunPresentation,
	runPresentationsOf,
	type TranscriptRow,
	toRuns,
	toTranscriptRows,
} from "@/lib/chat/screen-model"
import { type PersonOf, usePersonOf } from "@/lib/chat/thread-authorship"
import {
	type BotThread,
	type ConversationThread,
	faceOfBot,
	factsOf,
	type LoadedBotThread,
	type LoadedConversationThread,
	type LoadedThread,
	type Thread,
	type ThreadAuthors,
	type ThreadFace,
	type ThreadFacts,
	type ThreadMission,
	type ThreadPermission,
	type ThreadQuotes,
} from "@/lib/chat/thread-contract"
import type { StagedFiles } from "@/lib/chat/use-attachments"
import { useAttachments } from "@/lib/chat/use-attachments"
import { useMessageLanding } from "@/lib/chat/use-message-landing"
import {
	type PinnedBubbles,
	usePinnedMessages,
} from "@/lib/chat/use-pinned-messages"
import {
	type PromptResponder,
	usePromptResponder,
} from "@/lib/chat/use-prompt-responder"
import { useQuestionLanding } from "@/lib/chat/use-question-landing"
import {
	NO_QUOTED_IDS,
	useQuotedMessages,
} from "@/lib/chat/use-quoted-messages"
import { type SentInMount, useSentInMount } from "@/lib/chat/use-sent-in-mount"
import { useSessionFailureNotice } from "@/lib/chat/use-session-failure-notice"
import { useThreadJump } from "@/lib/chat/use-thread-jump"
import {
	useComposerFocus,
	useComposerRequest,
	useThreadReply,
} from "@/lib/chat/use-thread-reply"
import {
	type ThreadNaming,
	useThreadNaming,
	useThreadRoster,
} from "@/lib/chat/use-thread-roster"
import type { WorkingState } from "@/lib/chat/working-kind"
import {
	type PlacedArrival,
	type PlacedBySeq,
	placeArrivals,
	placeBySeq,
} from "@/lib/conversations/arrival-transcript"
import type { SpeakingBot } from "@/lib/conversations/conversation-controller"
import type { ConversationRuntimes } from "@/lib/conversations/conversation-runtimes"
import {
	leadOf,
	mentionableBots,
	toConversationLook,
} from "@/lib/conversations/roster-conversations"
import type {
	Bot,
	Conversation,
	Space,
} from "@/lib/conversations/store-contract"
import type {
	CompanionArrival,
	TranscriptMessage,
} from "@/lib/conversations/transcript-contract"
import { useConversation } from "@/lib/conversations/use-conversation"
import {
	useSeatMentioned,
	useSuggestedBots,
} from "@/lib/conversations/use-conversation-seating"
import type { FailureCorrelation } from "@/lib/failure-report"
import type {
	OpenMission,
	OpenMissionInNewTab,
} from "@/lib/missions/mission-actions"
import type { Mission } from "@/lib/missions/mission-contract"
import type { SummonedMissionState } from "@/lib/missions/mission-summons"
import { toMissionFace } from "@/lib/missions/mission-thread-model"
import {
	BEFORE_FIRST_RUN,
	type MissionSummonsCause,
	type PlacedMission,
	type PlacedMissionEvent,
	placeMissionEvents,
	placeMissions,
	withoutMissionSummons,
} from "@/lib/missions/mission-transcript"
import {
	type LiveMissionIds,
	type MissionCardRead,
	missionFaceOf,
	toMissionCard,
	toMissionHeaderActivity,
} from "@/lib/missions/missions-model"
import { useLiveMissions } from "@/lib/missions/use-live-missions"
import { useMissionSendFailure } from "@/lib/missions/use-mission-failure-notices"
import { useMissions } from "@/lib/missions/use-missions"
import { withoutOnboardingSummons } from "@/lib/onboarding/onboarding-summons"
import {
	type OnboardingTail,
	onboardingTailOf,
	signInTailOf,
} from "@/lib/onboarding/onboarding-tail"
import type { Onboarding } from "@/lib/onboarding/use-onboarding"
import { usePostedOnboardingStep } from "@/lib/onboarding/use-posted-onboarding-step"
import type { SignIn } from "@/lib/onboarding/use-sign-in"
import { useInvokePhaseEnd } from "@/lib/perf/use-invoke-phase-end"
import { useSkeletonSlot } from "@/lib/query/use-skeleton-slot"
import type { ReportedRun } from "@/lib/routines/routine-contract"
import type { MessageLandingController } from "@/lib/search/message-landing-controller"
import {
	OpenJoinedHostContext,
	spaceAccessOf,
} from "@/lib/spaces/open-joined-host"
import { opensInNewTab } from "@/lib/tabs/new-tab-clicks"

const THREAD_TRANSCRIPT_SKELETON = <ThreadTranscriptSkeleton />

const MISSION_TRANSCRIPT_SKELETON = <MissionDetailSkeleton />

type WorkingBotProps = BotStopProps & {
	face: ThreadFace
	work: WorkingState
}

const WorkingBot = ({ face, work, ...stop }: WorkingBotProps) => (
	<ActivityIndicator
		{...stop}
		blot={face.blot}
		botId={face.id}
		image={face.image}
		kind={work.kind}
		label={work.label}
		name={face.name}
		seed={face.id}
		startedAt={work.startedAt}
		waitingOn={work.waitingOn}
	/>
)

const UP_NEXT: WorkingState = { kind: "waiting", waitingOn: "next" }

const writerOf = (row: TranscriptRow, personOf: PersonOf, reader: string) =>
	(row.role === "user" && personOf(row)) || reader

const toPinnedRow = (
	{ id, bubble }: PinnedBubble,
	face: ThreadFace | undefined,
	writer: string,
	toExcerpt: (text: string) => string,
): PinnedMessage => {
	const isBotAuthor = bubble.role === "assistant" && face !== undefined

	return {
		id,
		author: isBotAuthor ? face.name : writer,
		avatar: isBotAuthor ? (
			<FaceAvatar face={face} size={PINNED_AVATAR_SIZE} />
		) : (
			<InitialsAvatar name={writer} size={PINNED_AVATAR_SIZE} />
		),
		timestamp: pinTimestamp(bubble.timestamp),
		excerpt: toExcerpt(messageWithAttachments(bubble.text).text.trim()),
	}
}

type RoutinesScope = {
	conversationId: string | null
	spaceId: string | null
	leadBotId?: string
}

const NO_ROUTINES: RoutinesScope = { conversationId: null, spaceId: null }

const routinesScopeOf = (
	facts: ThreadFacts,
	mainConversationId: string | null,
	spaceId: string | null,
): RoutinesScope => {
	if (facts.mission) {
		return NO_ROUTINES
	}

	return facts.conversation
		? {
				conversationId: facts.conversation.id,
				spaceId,
				leadBotId: leadOf(facts.conversation),
			}
		: { conversationId: mainConversationId, spaceId, leadBotId: facts.bot?.id }
}

const speakerIdOf = (thread: LoadedThread, error: ChatError | undefined) =>
	thread.kind === "bot" ? thread.bot.id : error?.botId

type FailingThread = Pick<ThreadViewProps, "thread" | "bots" | "spaceId">

const failureContextOf = (
	{ thread, bots, spaceId }: FailingThread,
	error: ChatError | undefined,
): FailureCorrelation => {
	const botId = speakerIdOf(thread, error)
	const bot =
		thread.kind === "bot" ? thread.bot : bots.find(({ id }) => id === botId)
	return {
		space: spaceId ?? undefined,
		botId,
		botName: bot?.name,
		conversation: shownConversationIdOf(thread) ?? undefined,
		session:
			thread.kind === "bot" ? (thread.state.sessionId ?? undefined) : undefined,
	}
}

const shownConversationIdOf = (thread: LoadedThread): string | null =>
	thread.kind === "bot" ? thread.state.conversationId : thread.conversation.id

const isClosedMission = (seat: ThreadMission | null): boolean =>
	seat !== null && seat.mission.closedAt !== null

const missionsSeatedIn = (
	missions: Mission[],
	seat: ThreadMission | null,
): Mission[] => (seat ? [...missions, seat.mission] : missions)

const composerPlaceholderOf = (facts: ThreadFacts, t: ChatCopy): string => {
	if (facts.mission) {
		return t("missions.composer.placeholder")
	}

	return facts.bot
		? t("screen.placeholder", { name: facts.bot.name })
		: t("composer.placeholder")
}

type ThreadHeaderProps = {
	thread: LoadedThread
	mission: ThreadMission | null
	liveMissionIds: LiveMissionIds
	botWork: WorkingState | null
	botImage?: string
	present: RosterBot[]
	pinnedRows: PinnedMessage[]
	hasRoutines: boolean
	onJumpToPin: (bubbleId: string) => void
	onUnpin: (bubbleId: string) => void
}

const ThreadHeader = ({
	thread,
	mission,
	liveMissionIds,
	botWork,
	botImage,
	present,
	pinnedRows,
	hasRoutines,
	onJumpToPin,
	onUnpin,
}: ThreadHeaderProps) => {
	if (mission) {
		const missionFace = missionFaceOf(
			(botId) => present.find(({ id }) => id === botId),
			mission.mission.botId,
		)
		return (
			<MissionHeader
				{...toMissionHeaderActivity(mission.mission)}
				bot={toMissionFace(missionFace)}
				isWorking={liveMissionIds.has(mission.mission.id)}
				now={mission.now}
				objective={mission.mission.objective}
				onBack={mission.onLeave}
				openedAt={mission.mission.openedAt}
				state={mission.mission.state}
				ticket={mission.mission.ticket}
				tools={mission.mission.tools}
				dragRegion={titleBarDragRegion()}
			/>
		)
	}

	const pinned = (
		<PinnedMessages
			messages={pinnedRows}
			onJump={onJumpToPin}
			onUnpin={onUnpin}
		/>
	)

	return (
		<AppHeader
			data-tauri-drag-region="deep"
			leading={
				thread.kind === "bot" ? (
					<HeaderIdentityButton
						blot={thread.bot.avatarBlot}
						connection={thread.state.connection}
						image={botImage}
						kind={botWork?.kind}
						name={thread.bot.name}
						onOpenSettings={thread.onToggleSettings}
						seed={thread.bot.id}
						version={thread.state.binaryVersion}
						working={botWork !== null}
					/>
				) : (
					<HeaderConversationButton
						icon={toConversationLook(thread.conversation).icon}
						bots={present}
						name={thread.conversation.title}
						onOpenSettings={() => thread.onOpenSettings(thread.conversation.id)}
					/>
				)
			}
			trailing={
				hasRoutines ? (
					<>
						{pinned}
						<RoutinesPanelTrigger />
					</>
				) : (
					pinned
				)
			}
		/>
	)
}

type ThreadComposerSlotProps = {
	thread: LoadedThread
	composerRef: RefObject<HTMLTextAreaElement | null>
	promptRef: RefObject<PromptHandle | null>
	staged: StagedFiles
	canAttach: boolean
	isDisabled: boolean
	placeholder: string
	bots: Bot[]
	readDraft: () => string
	onPromptChange: (draft: string) => void
	onSubmitPrompt: (text: string) => Promise<boolean>
}

const ThreadComposerSlot = ({
	thread,
	composerRef,
	promptRef,
	staged,
	canAttach,
	isDisabled,
	placeholder,
	bots,
	readDraft,
	onPromptChange,
	onSubmitPrompt,
}: ThreadComposerSlotProps) => {
	const wiring =
		thread.kind === "bot"
			? botThreadMenu({
					commands: thread.state.commands,
					isOverlayOpen: thread.isOverlayOpen,
				})
			: conversationThreadMenu({
					bots: mentionableBots(bots, thread.conversation),
					leadId: leadOf(thread.conversation),
				})

	return (
		<ThreadComposer
			{...wiring}
			key={thread.kind === "bot" ? thread.bot.id : thread.conversation.id}
			attachments={staged.items}
			canAttach={canAttach}
			composerRef={composerRef}
			isDisabled={isDisabled}
			isDropTarget={staged.isDropTarget}
			onAttach={staged.stage}
			onPromptChange={onPromptChange}
			onRemoveAttachment={staged.remove}
			onSubmitPrompt={onSubmitPrompt}
			placeholder={placeholder}
			promptRef={promptRef}
			readDraft={readDraft}
		/>
	)
}

type ThreadApprovalProps = {
	permission: ThreadPermission | null
	authors: ThreadAuthors
	responder: PromptResponder
}

const ThreadApproval = ({
	permission,
	authors,
	responder,
}: ThreadApprovalProps) => {
	if (!permission) {
		return null
	}

	const { request, authorBotId } = permission
	return authorBotId === null ? (
		<ApprovalPrompt request={request} responder={responder} />
	) : (
		<SpokenApproval
			author={authors.get(authorBotId)}
			request={request}
			responder={responder}
		/>
	)
}

type ConversationEmptySlotProps = {
	conversation: Conversation
	present: RosterBot[]
	promptRef: RefObject<PromptHandle | null>
}

const ConversationEmptySlot = ({
	conversation,
	present,
	promptRef,
}: ConversationEmptySlotProps) => {
	const suggestedBots = useSuggestedBots(
		present.length === 0 ? conversation.id : null,
	)

	return (
		<ConversationEmptyState
			icon={toConversationLook(conversation).icon}
			bots={present}
			onSuggestedBotPress={(bot) => promptRef.current?.mention(bot.name)}
			suggestedBots={suggestedBots}
			title={conversation.title}
		/>
	)
}

type ThreadEmptyStateProps = {
	thread: LoadedThread
	botImage?: string
	present: RosterBot[]
	promptRef: RefObject<PromptHandle | null>
	latestError?: ChatError
	onRestart: () => void
	onSignIn?: () => void
}

const ThreadEmptyState = ({
	thread,
	botImage,
	present,
	promptRef,
	latestError,
	onRestart,
	onSignIn,
}: ThreadEmptyStateProps) => {
	if (thread.kind === "conversation") {
		return thread.state.refusedMessage ? null : (
			<ConversationEmptySlot
				conversation={thread.conversation}
				present={present}
				promptRef={promptRef}
			/>
		)
	}

	const status = emptyStateStatusFor(
		thread.state.connection,
		latestError?.error,
	)

	return status ? (
		<ChatEmptyState
			blot={thread.bot.avatarBlot}
			image={botImage}
			name={thread.bot.name}
			onOpenSettings={thread.onToggleSettings}
			onSetup={onRestart}
			onSignIn={onSignIn}
			seed={thread.bot.id}
			status={status}
		/>
	) : null
}

const stopOf = (speaking: SpeakingBot) => () => {
	void speaking.stop?.()
}

type ThreadRunProps = {
	run: TranscriptRow[]
	presentation: RunPresentation
	causes: ThreadCauses
	rejectedPromptId: string | null
	answered: AnsweredCards
	botFace: ThreadFace | null
	authors: ThreadAuthors
	quotes: ThreadQuotes
	pins: PinnedBubbles
	now: number
	readerName: string
	toQuote: ThreadNaming["toQuote"]
	onReply: (target: ReplyTarget) => void
	onRetry?: (messageId: string) => void
}

const ThreadRun = ({
	run,
	presentation,
	causes,
	rejectedPromptId,
	answered,
	botFace,
	authors,
	quotes,
	pins,
	now,
	readerName,
	toQuote,
	onReply,
	onRetry,
}: ThreadRunProps) => (
	<TurnGroup carriesMark={presentation.isMarked}>
		{run.map((row, index) => {
			const bubble = bubbleIdOf(row.messageId, row.blockIndex)
			const card = answered.get(row.messageId)

			return (
				<ThreadTurn
					anchor={bubble}
					card={
						card ? (
							<AnsweredPrompt card={card} readerName={readerName} />
						) : undefined
					}
					author={row.authorBotId ? authors.get(row.authorBotId) : undefined}
					avatarFace={
						presentation.faceIndexes.includes(index)
							? (botFace ?? undefined)
							: undefined
					}
					bare={presentation.hasBareTables && isTableBlock(row.text)}
					botId={botFace?.id}
					cause={causes.get(row.turnId)}
					key={bubble}
					now={now}
					onPin={pins.toggle}
					onReply={onReply}
					onRetry={onRetry}
					pinned={pins.isPinned(bubble)}
					quoted={
						row.quotedMessageId ? quotes.get(row.quotedMessageId) : undefined
					}
					readerName={readerName}
					row={row}
					state={row.messageId === rejectedPromptId ? "failed" : row.completion}
					toQuote={toQuote}
				/>
			)
		})}
	</TurnGroup>
)

type ThreadCause = ReportedRun & { kind?: TurnCauseKind }

type ThreadCauses = ReadonlyMap<string, ThreadCause>

const SUMMONS_TRIGGER_SOURCE = "mission"

const SUMMONS_CAUSE_KEY = {
	working: "missions.summons.working",
	waiting_bot: "missions.summons.waiting_bot",
} as const satisfies Record<SummonedMissionState, string>

const withSummonsCauses = (
	causes: ThreadCauses,
	summonsCauses: MissionSummonsCause[],
	t: ChatCopy,
): ThreadCauses =>
	new Map([
		...causes,
		...summonsCauses.map(({ turnId, state }): [string, ThreadCause] => [
			turnId,
			{
				turnId,
				kind: "mission",
				routineTitle: t(SUMMONS_CAUSE_KEY[state]),
				triggerSourceId: SUMMONS_TRIGGER_SOURCE,
			},
		]),
	])

type ReadRunsProps = {
	messages: TranscriptMessage[]
	missionSeat: ThreadMission | null
	isSoloThread: boolean
	causes: ThreadCauses
	t: ChatCopy
}

type ReadRuns = {
	runs: TranscriptRow[][]
	causes: ThreadCauses
}

const readRuns = ({
	messages,
	missionSeat,
	isSoloThread,
	causes,
	t,
}: ReadRunsProps): ReadRuns => {
	const rows = toTranscriptRows(messages)
	if (!missionSeat) {
		const kept = isSoloThread ? withoutOnboardingSummons(rows) : rows
		return { runs: toRuns(kept, causes), causes }
	}
	const summoned = withoutMissionSummons(rows, missionSeat.mission.botId)
	const summonedCauses = withSummonsCauses(causes, summoned.summonsCauses, t)

	return {
		runs: toRuns(summoned.rows, summonedCauses),
		causes: summonedCauses,
	}
}

const hiddenRowIdsOf = (
	asked: AskedBubble | null,
	answered: AnsweredCards,
): ReadonlySet<string> =>
	new Set([
		...(asked ? [asked.messageId] : []),
		...[...answered.values()].map(({ answer }) => answer.id),
	])

const withoutHiddenRows = (
	{ runs, causes }: ReadRuns,
	hiddenIds: ReadonlySet<string>,
): ReadRuns => ({
	runs: toRuns(
		runs.flat().filter(({ messageId }) => !hiddenIds.has(messageId)),
		causes,
	),
	causes,
})

type RunRowsProps = Omit<ThreadRunProps, "run" | "presentation"> & {
	runs: TranscriptRow[][]
	presentations: RunPresentation[]
	isSentInMount: SentInMount["isSentInMount"]
	personOf: PersonOf
}

const isSentByReader = (row: TranscriptRow, personOf: PersonOf) =>
	row.role === "user" && !isPostedAnswer(row) && personOf(row) === undefined

const toRunRows = ({
	runs,
	presentations,
	isSentInMount,
	personOf,
	...shared
}: RunRowsProps): TranscriptItem[] =>
	runs.map((run, runIndex) => ({
		key: bubbleIdOf(run[0].messageId, run[0].blockIndex),
		messageIds: run.map((row) => bubbleIdOf(row.messageId, row.blockIndex)),
		isAnchor: run.some(
			(row) => isSentByReader(row, personOf) && isSentInMount(row.messageId),
		),
		render: () => (
			<ThreadRun {...shared} presentation={presentations[runIndex]} run={run} />
		),
	}))

type RowsAfterRun = (runIndex: number) => TranscriptItem[]

const daySeparatorRowsAfter =
	(runs: TranscriptRow[][], now: number): RowsAfterRun =>
	(runIndex) => {
		const nextIndex = runIndex + 1
		if (!opensNewDay(runs, nextIndex)) {
			return []
		}
		const opening = runs[nextIndex][0]
		return [
			{
				key: `day-${bubbleIdOf(opening.messageId, opening.blockIndex)}`,
				render: () => <DaySeparator at={opening.timestamp} now={now} />,
			},
		]
	}

const rowsPlacedAfter =
	<Placed extends { runIndex: number }>(
		placed: Placed[],
		toRows: (placed: Placed) => TranscriptItem[],
	): RowsAfterRun =>
	(runIndex) =>
		placed.filter((one) => one.runIndex === runIndex).flatMap(toRows)

const interleavedWithRuns = (
	runRows: TranscriptItem[],
	rowsAfter: RowsAfterRun,
): TranscriptItem[] => [
	...rowsAfter(BEFORE_FIRST_RUN),
	...runRows.flatMap((runRow, runIndex) => [runRow, ...rowsAfter(runIndex)]),
]

const botIn = (bots: Bot[], botId: string) =>
	bots.find(({ id }) => id === botId)

const inviterOf = (
	arrival: CompanionArrival,
	bots: Bot[],
): ConversationArrivalInviter | null => {
	if (arrival.invitedByBotId === null) {
		return { kind: "person" }
	}
	const inviting = botIn(bots, arrival.invitedByBotId)
	return inviting ? { kind: "companion", bot: faceOfBot(inviting) } : null
}

const arrivalRowsAfter = (placed: PlacedArrival[], bots: Bot[]): RowsAfterRun =>
	rowsPlacedAfter(placed, ({ arrival }) => {
		const arriving = botIn(bots, arrival.botId)
		const inviter = inviterOf(arrival, bots)
		if (!arriving || !inviter) {
			return []
		}
		return [
			{
				key: `arrival-${arrival.id}`,
				render: () => (
					<ConversationArrivalRow bot={faceOfBot(arriving)} inviter={inviter} />
				),
			},
		]
	})

type InstallRowsSource = {
	placed: PlacedBySeq<ApplicationInstall>[]
	applications: ConversationApplications | null
	sessionApplications: SessionApplications | null
	bots: Bot[]
	error: ChatError | undefined
	companionId: string | undefined
}

const destinationNameOf = (
	{ scope, destinationId }: ApplicationInstall,
	bots: Bot[],
	spaces: Space[],
) => {
	if (!destinationId) {
		return undefined
	}
	return scope === "companion"
		? botIn(bots, destinationId)?.name
		: spaces.find(({ id }) => id === destinationId)?.name
}

const installRowsAfter = ({
	placed,
	applications,
	sessionApplications,
	bots,
	error,
	companionId,
}: InstallRowsSource): RowsAfterRun => {
	const session: RefusingSession = {
		error,
		companionId,
		spaceId: sessionApplications?.spaceId,
	}
	return rowsPlacedAfter(placed, ({ anchored: install }) => {
		const scope = installScopeOf(install)
		if (!applications || !scope) {
			return []
		}
		const destinationName = destinationNameOf(
			install,
			bots,
			applications.spaces,
		)
		if (scope.kind !== "user" && !destinationName) {
			return []
		}
		return [
			{
				key: `install-${install.id}`,
				render: () => (
					<ApplicationInstallRow
						curated={applications.curated.find(
							({ name }) => name === install.application,
						)}
						destinationName={destinationName}
						install={install}
						isLeftOut={isLeftOutOf({ install, scope }, session)}
						onOpenSettings={() =>
							applications.onOpen(
								scope,
								install.install.kind === "key"
									? install.application
									: undefined,
							)
						}
					/>
				),
			},
		]
	})
}

const composerRequestOf = (seat: ThreadMission | null) =>
	seat?.opening.landing === "composer" ? seat.opening : null

type MissionCardRowsProps = {
	placed: PlacedMission[]
	authors: ThreadAuthors
	faceOf: ThreadNaming["faceOf"]
	liveMissionIds: LiveMissionIds
	now: number
	onOpen: OpenMission
	onOpenInNewTab: OpenMissionInNewTab
	wrap: MissionCardWrap
}

type MissionCardRowRead = MissionCardRead & {
	onOpen: OpenMission
	onOpenInNewTab: OpenMissionInNewTab
	wrap: MissionCardWrap
}

const toMissionCardRow = ({
	onOpen,
	onOpenInNewTab,
	wrap,
	...read
}: MissionCardRowRead): TranscriptItem => ({
	key: `mission-${read.mission.id}`,
	render: () => (
		<MissionTurn
			mission={toMissionCard(read)}
			onOpen={(missionId, modifiers) =>
				opensInNewTab(modifiers) ? onOpenInNewTab(missionId) : onOpen(missionId)
			}
			wrap={wrap}
		/>
	),
})

const missionCardRowsAfter = ({
	placed,
	authors,
	faceOf,
	liveMissionIds,
	now,
	onOpen,
	onOpenInNewTab,
	wrap,
}: MissionCardRowsProps): RowsAfterRun =>
	rowsPlacedAfter(placed, ({ mission }) => [
		toMissionCardRow({
			mission,
			identity: missionFaceOf(faceOf, mission.botId),
			author: authors.get(mission.botId),
			state: mission.state,
			isWorking: liveMissionIds.has(mission.id),
			now,
			onOpen,
			onOpenInNewTab,
			wrap,
		}),
	])

type MissionEventRowsProps = {
	placed: PlacedMissionEvent[]
	tools: string[]
	bot?: MissionBot
	now: number
}

const missionEventRowsAfter = ({
	placed,
	tools,
	bot,
	now,
}: MissionEventRowsProps): RowsAfterRun =>
	rowsPlacedAfter(placed, ({ event }) => [
		{
			key: `mission-event-${event.id}`,
			render: () => (
				<MissionEventRow bot={bot} event={event} now={now} tools={tools} />
			),
		},
	])

type BotThreadTailProps = {
	thread: LoadedBotThread
	face: ThreadFace
	botWork: WorkingState | null
	onboarding: OnboardingTail | null
	readerName: string
	onStop: () => void
}

const BotThreadTail = ({
	thread,
	face,
	botWork,
	onboarding,
	readerName,
	onStop,
}: BotThreadTailProps) => {
	const isStoppable =
		canStopTurn(thread.state.turn) || thread.state.foreignTurn !== null
	const stop: BotStopProps = isStoppable ? { stoppable: true, onStop } : {}
	usePostedOnboardingStep({
		controller: thread.controller,
		botId: thread.bot.id,
		pendingId: thread.state.question?.id ?? null,
		step: onboarding?.step ?? null,
	})

	return (
		<>
			{botWork ? <WorkingBot {...stop} face={face} work={botWork} /> : null}
			{thread.state.outbox.length > 0 ? (
				<TurnGroup>
					{thread.state.outbox.map((entry) => (
						<QueuedTurn
							controller={thread.controller}
							entry={entry}
							key={entry.id}
							readerName={readerName}
						/>
					))}
				</TurnGroup>
			) : null}
		</>
	)
}

type SpeakingRow = {
	seated: RosterBot
	speaking: SpeakingBot
}

const speakingRowsIn = (
	speakers: SpeakingBot[],
	bots: RosterBot[],
): SpeakingRow[] =>
	speakers.flatMap((speaking) => {
		const seated = bots.find(({ id }) => id === speaking.botId)
		return seated ? [{ seated, speaking }] : []
	})

const waitingRowsIn = (
	waitingBotIds: string[],
	speakers: SpeakingBot[],
	bots: RosterBot[],
): RosterBot[] =>
	waitingBotIds
		.filter((botId) => !speakers.some((speaking) => speaking.botId === botId))
		.flatMap((botId) => bots.find(({ id }) => id === botId) ?? [])

type ConversationThreadTailProps = {
	thread: LoadedConversationThread
	bots: RosterBot[]
	readerName: string
	refusedQuote?: QuotedMessage
}

const ConversationThreadTail = ({
	thread,
	bots,
	readerName,
	refusedQuote,
}: ConversationThreadTailProps) => {
	const { refusedMessage, speakers, waitingBotIds } = thread.state

	return (
		<>
			{refusedMessage ? (
				<RefusedTurn
					message={refusedMessage}
					onSendAgain={thread.controller.sendAgain}
					readerName={readerName}
					repliedTo={refusedQuote}
				/>
			) : null}
			{speakingRowsIn(speakers, bots).map(({ seated, speaking }) => (
				<WorkingBot
					face={seated}
					key={seated.id}
					onStop={stopOf(speaking)}
					stoppable={speaking.stop !== null}
					work={speaking.work}
				/>
			))}
			{waitingRowsIn(waitingBotIds, speakers, bots).map((seated) => (
				<WorkingBot face={seated} key={seated.id} work={UP_NEXT} />
			))}
		</>
	)
}

const onboardingTailFor = (
	thread: LoadedThread,
	onboarding: Onboarding | undefined,
	signIn: SignIn | undefined,
): OnboardingTail | null =>
	thread.kind === "bot"
		? (onboardingTailOf(onboarding, thread.state, thread.bot.id) ??
			signInTailOf(signIn, thread.bot.id))
		: null

const signInOfferOf = (
	signIn: SignIn | undefined,
	botId: string | undefined,
) => (signIn && botId ? () => signIn.controller.offer(botId) : undefined)

const showsEmptyState = (
	rows: TranscriptItem[],
	onboarding: OnboardingTail | null,
	isFirstLoadPending: boolean,
) => rows.length === 0 && !onboarding && !isFirstLoadPending

type ThreadTailProps = {
	thread: LoadedThread
	botWork: WorkingState | null
	bots: RosterBot[]
	onboarding: OnboardingTail | null
	readerName: string
	refusedQuote?: QuotedMessage
	onStop: () => void
}

const ThreadTail = ({
	thread,
	botWork,
	bots,
	onboarding,
	readerName,
	refusedQuote,
	onStop,
}: ThreadTailProps) =>
	thread.kind === "bot" ? (
		<BotThreadTail
			botWork={botWork}
			face={faceOfBot(thread.bot)}
			onboarding={onboarding}
			onStop={onStop}
			readerName={readerName}
			thread={thread}
		/>
	) : (
		<ConversationThreadTail
			bots={bots}
			readerName={readerName}
			refusedQuote={refusedQuote}
			thread={thread}
		/>
	)

type ThreadNoticesProps = {
	staged: StagedFiles
	pins: PinnedBubbles
	facts: ThreadFacts
}

const ThreadNotices = ({ staged, pins, facts }: ThreadNoticesProps) => (
	<ThreadNotice
		onDismissRefusal={staged.dismissRefusal}
		refusal={staged.refusal}
	>
		{pins.hasFailed ? <PinsNotice onDismiss={pins.dismissFailure} /> : null}
		{facts.unresolvedMentions.length > 0 ? (
			<UnresolvedMentionsNotice
				mentions={facts.unresolvedMentions}
				onDismiss={facts.dismissUnresolvedMentions}
			/>
		) : null}
	</ThreadNotice>
)

type NewerControl = {
	hasNewer: boolean
	isLoading: boolean
	onLoad: () => void
	onLoadLatest: () => void
}

const newerControlOf = ({
	hasNewer,
	isLoading,
	onLoad,
	onLoadLatest,
}: NewerControl): TranscriptNewer | undefined =>
	hasNewer ? { isLoading, onLoad, onLoadLatest } : undefined

type ThreadViewProps = {
	activityPanel: ActivityPanel
	thread: LoadedThread
	spaceId: string | null
	bots: Bot[]
	runtimes: ConversationRuntimes
	attachments: AttachmentsController
	drafts: DraftsController
	landings: MessageLandingController
	readerName: string
	onboarding?: Onboarding
	signIn?: SignIn
	onOpenMission: OpenMission
	onOpenMissionInNewTab: OpenMissionInNewTab
}

const useThreadSeats = ({
	thread,
	bots: known,
	attachments,
	readerName,
}: ThreadViewProps) => {
	const t = useChatCopy()
	const { state, controller } = thread
	const facts = factsOf(thread)
	const composerRef = useRef<HTMLTextAreaElement>(null)
	const promptRef = useRef<PromptHandle>(null)
	const rootRef = useRef<HTMLDivElement>(null)
	const scrollerRef = useRef<TranscriptHandle>(null)
	const promptResponder = usePromptResponder(controller, scrollerRef)

	const reader = readerName || t("working.name")
	const clock = useRosterClock()
	const missionSeat = facts.mission
	const isMissionClosed = isClosedMission(missionSeat)
	const canAttach = facts.canAttach && !isMissionClosed
	const composerPlaceholder = composerPlaceholderOf(facts, t)
	const roster = useThreadRoster({ ...facts, bots: known })
	const { bots, present, authors, botFace } = roster
	const botImage = botFace?.image
	const isSoloThread = facts.bot !== null

	const owner = useMemo<AttachmentsOwner>(
		() => ({ kind: facts.bot ? "bot" : "conversation", id: facts.id }),
		[facts.bot, facts.id],
	)
	const staged = useAttachments(attachments, owner, canAttach, rootRef)

	return {
		authors,
		botFace,
		botImage,
		bots,
		canAttach,
		clock,
		composerPlaceholder,
		composerRef,
		controller,
		facts,
		isMissionClosed,
		isSoloThread,
		missionSeat,
		present,
		promptRef,
		promptResponder,
		reader,
		roster,
		rootRef,
		scrollerRef,
		staged,
		state,
		t,
	}
}

type ThreadSeats = ReturnType<typeof useThreadSeats>

const useThreadAnnotations = (
	{ runtimes, landings, onOpenMission, spaceId }: ThreadViewProps,
	seats: ThreadSeats,
) => {
	const {
		clock,
		controller,
		facts,
		missionSeat,
		reader,
		roster,
		scrollerRef,
		state,
		t,
	} = seats

	const repliedToRefusal = facts.refused?.repliedToMessageId
	const alsoQuoted = useMemo(
		() => (repliedToRefusal ? [repliedToRefusal] : NO_QUOTED_IDS),
		[repliedToRefusal],
	)
	const quotes = useQuotedMessages(
		facts.botController,
		state.messages,
		alsoQuoted,
	)
	const pins = usePinnedMessages(controller, state.conversationId)
	const routinesScope = routinesScopeOf(facts, state.conversationId, spaceId)
	const missions = useMissions(routinesScope.conversationId)
	const missionsInView = useMemo(
		() => missionsSeatedIn(missions.missions, missionSeat),
		[missions.missions, missionSeat],
	)
	const liveMissionIds = useLiveMissions(runtimes, missionsInView, clock)
	const wrapMissionCard = useMissionCardMenus({
		missions: missions.missions,
		runtimes,
		onOpenMission,
		onChanged: missions.reload,
	})
	const applications = useContext(ConversationApplicationsContext)
	const sessionApplications = useContext(SessionApplicationsContext)
	const installs = useConversationInstalls(state.conversationId)
	const { highlightedMessageId, jumpToMessage, landOnMessage } = useThreadJump(
		controller,
		scrollerRef,
	)
	const landing = useSyncExternalStore(landings.subscribe, landings.getState)

	useMessageLanding({
		conversationId: state.conversationId,
		landOn: controller.landOn,
		landing,
		messages: state.messages,
		onLand: landOnMessage,
		onTaken: landings.forget,
	})
	const personOf = usePersonOf()
	const { faceOf, toExcerpt, toQuote } = useThreadNaming({
		...roster,
		reader,
		unnamed: t("working.name"),
		personOf,
		isConversation: facts.conversation !== null,
		onJump: jumpToMessage,
	})

	const pinnedRows = useMemo(
		() =>
			pins.bubbles.map((shown) =>
				toPinnedRow(
					shown,
					faceOf(shown.bubble.authorBotId),
					writerOf(shown.bubble, personOf, reader),
					toExcerpt,
				),
			),
		[pins.bubbles, faceOf, personOf, reader, toExcerpt],
	)

	return {
		applications,
		faceOf,
		highlightedMessageId,
		installs,
		jumpToMessage,
		liveMissionIds,
		missions,
		pinnedRows,
		personOf,
		pins,
		quotes,
		repliedToRefusal,
		routinesScope,
		sessionApplications,
		toQuote,
		wrapMissionCard,
	}
}

type ThreadAnnotations = ReturnType<typeof useThreadAnnotations>

const useThreadActions = (
	{ thread, bots: known, drafts, signIn, spaceId }: ThreadViewProps,
	seats: ThreadSeats,
) => {
	const {
		composerRef,
		controller,
		facts,
		isSoloThread,
		missionSeat,
		scrollerRef,
		staged,
		state,
		t,
	} = seats

	const seatMentioned = useSeatMentioned({
		conversation: facts.conversation,
		bots: known,
		open: thread.kind === "conversation" ? thread.controller.open : null,
	})
	const submitSeated = useCallback(
		async (text: string, repliedToMessageId?: string) =>
			(await seatMentioned(text)) && staged.submit(text, repliedToMessageId),
		[seatMentioned, staged.submit],
	)
	const { send, isSentInMount } = useSentInMount({
		threadId: facts.id,
		messages: state.messages,
		send: submitSeated,
	})
	const { replyTarget, focusComposer, holdReply, releaseReply, submitPrompt } =
		useThreadReply({ composerRef, scrollerRef, send })

	useComposerFocus({
		threadId: shownConversationIdOf(thread),
		isPromptPending: facts.isPromptPending,
		isOverlayOpen: facts.isOverlayOpen,
		focusComposer,
	})
	useComposerRequest(composerRequestOf(missionSeat), focusComposer)

	const { botController } = facts
	const readDraft = useCallback(() => drafts.read(facts.id), [drafts, facts.id])
	const rememberDraft = useCallback(
		(draft: string) => drafts.remember(facts.id, draft),
		[drafts, facts.id],
	)
	const restart = useCallback(() => {
		void botController?.restart()
	}, [botController])
	const retry = useCallback(
		(messageId: string) => {
			void botController?.retry(messageId)
		},
		[botController],
	)
	const offerSignIn = signInOfferOf(signIn, facts.bot?.id)
	useSessionFailureNotice({
		error: facts.latestError,
		context: failureContextOf(
			{ thread, bots: known, spaceId },
			facts.latestError,
		),
		onDismiss: controller.dismissError,
		onRestart: botController ? restart : undefined,
		onSignIn: offerSignIn,
	})
	const stop = useCallback(() => {
		void controller.stop()
	}, [controller])
	const loadOlder = useCallback(() => {
		void controller.loadOlder()
	}, [controller])
	const loadNewer = useCallback(() => {
		void controller.loadNewer()
	}, [controller])
	const loadLatest = useCallback(() => {
		void controller.loadLatest().then((isLoaded) => {
			if (isLoaded) {
				scrollerRef.current?.scrollToEnd()
			}
		})
	}, [controller, scrollerRef])
	const hasNewer = state.hasNewer

	const readThreadRuns = readRuns({
		messages: state.messages,
		missionSeat,
		isSoloThread,
		causes: facts.causes,
		t,
	})
	const { asked, askerBotId, leadId } = askedQuestionOf(
		facts.question,
		readThreadRuns.runs,
	)
	const answered = answeredCardsIn(state.messages)
	const threadRuns = withoutHiddenRows(
		readThreadRuns,
		hiddenRowIdsOf(asked, answered),
	)
	useQuestionLanding({
		conversationKey: facts.id,
		isAsking: facts.question !== null,
		hasMessages: state.messages.length > 0,
		leadId,
		scrollerRef,
	})

	return {
		answered,
		asked,
		askerBotId,
		botController,
		hasNewer,
		holdReply,
		isSentInMount,
		loadLatest,
		loadNewer,
		loadOlder,
		offerSignIn,
		readDraft,
		releaseReply,
		rememberDraft,
		replyTarget,
		restart,
		retry,
		stop,
		submitPrompt,
		threadRuns,
	}
}

type ThreadActions = ReturnType<typeof useThreadActions>

const threadRowsOf = (
	{
		thread,
		bots: known,
		onboarding,
		signIn,
		onOpenMission,
		onOpenMissionInNewTab,
	}: ThreadViewProps,
	seats: ThreadSeats,
	annotations: ThreadAnnotations,
	actions: ThreadActions,
) => {
	const {
		authors,
		botFace,
		clock,
		facts,
		isSoloThread,
		missionSeat,
		present,
		reader,
		state,
	} = seats
	const {
		applications,
		faceOf,
		installs,
		liveMissionIds,
		missions,
		personOf,
		pins,
		quotes,
		repliedToRefusal,
		sessionApplications,
		toQuote,
		wrapMissionCard,
	} = annotations
	const {
		answered,
		botController,
		holdReply,
		isSentInMount,
		retry,
		threadRuns,
	} = actions
	const { runs, causes } = threadRuns
	const presentations = runPresentationsOf({
		runs,
		workingBotIds: facts.workingBotIds,
		hasSingleBot: isSoloThread,
		isWorking: facts.botWork !== null,
	})
	const runRows = toRunRows({
		answered,
		authors,
		botFace,
		causes,
		isSentInMount,
		now: clock,
		onReply: holdReply,
		onRetry: botController ? retry : undefined,
		personOf,
		pins,
		presentations,
		quotes,
		readerName: reader,
		rejectedPromptId: facts.rejectedPromptId,
		runs,
		toQuote,
	})
	const missionFace = missionSeat
		? present.find(({ id }) => id === missionSeat.mission.botId)
		: undefined
	const missionRowsAfter = missionSeat
		? missionEventRowsAfter({
				bot: missionFace ? toMissionFace(missionFace) : undefined,
				now: missionSeat.now,
				placed: placeMissionEvents(runs, missionSeat.events),
				tools: missionSeat.mission.tools,
			})
		: missionCardRowsAfter({
				authors,
				faceOf,
				liveMissionIds,
				now: clock,
				onOpen: onOpenMission,
				onOpenInNewTab: onOpenMissionInNewTab,
				wrap: wrapMissionCard,
				placed: placeMissions({
					hasOlder: state.hasOlder,
					missions: missions.missions,
					runs,
				}),
			})
	const arrivalsAfter = arrivalRowsAfter(
		placeArrivals({
			arrivals: facts.arrivals,
			hasOlder: state.hasOlder,
			messages: state.messages,
			runs,
		}),
		known,
	)
	const installsAfter = installRowsAfter({
		applications,
		bots: known,
		companionId: speakerIdOf(thread, facts.latestError),
		error: facts.latestError,
		placed: placeBySeq({
			anchored: installs,
			hasOlder: state.hasOlder,
			messages: state.messages,
			runs,
		}),
		sessionApplications,
	})
	const daySeparatorsAfter = daySeparatorRowsAfter(runs, clock)
	const transcriptRows = interleavedWithRuns(runRows, (runIndex) => [
		...arrivalsAfter(runIndex),
		...installsAfter(runIndex),
		...missionRowsAfter(runIndex),
		...daySeparatorsAfter(runIndex),
	])
	const refusedTarget = repliedToRefusal
		? quotes.get(repliedToRefusal)
		: undefined
	const onboardingTail = onboardingTailFor(thread, onboarding, signIn)

	return { onboardingTail, refusedTarget, transcriptRows }
}

const useThreadView = (props: ThreadViewProps) => {
	const seats = useThreadSeats(props)
	const annotations = useThreadAnnotations(props, seats)
	const actions = useThreadActions(props, seats)

	return {
		...seats,
		...annotations,
		...actions,
		...threadRowsOf(props, seats, annotations, actions),
	}
}

type AskerSource = {
	askerBotId?: string | null
	authors: ThreadAuthors
	botFace: ThreadFace | null
}

const askerNameOf = ({ askerBotId, authors, botFace }: AskerSource) =>
	(askerBotId ? authors.get(askerBotId)?.name : undefined) ?? botFace?.name

function ThreadView(props: ThreadViewProps) {
	const {
		activityPanel,
		thread,
		bots: known,
		onOpenMission,
		onOpenMissionInNewTab,
	} = props
	const view = useThreadView(props)
	const joinedHost = useContext(OpenJoinedHostContext)
	const departure = joinedHost?.departure
	const access = spaceAccessOf(joinedHost)
	useInvokePhaseEnd(
		"thread open",
		view.facts.isFirstLoadPending ? null : shownConversationIdOf(thread),
	)
	const transcriptSkeleton = useSkeletonSlot(
		view.facts.isFirstLoadPending && view.state.messages.length === 0,
		view.missionSeat ? MISSION_TRANSCRIPT_SKELETON : THREAD_TRANSCRIPT_SKELETON,
	)

	const layout = (
		<ThreadLayout
			anchorOnSend={view.isSoloThread}
			busy={view.facts.isBusy}
			composer={
				departure ? undefined : view.asked ? (
					<QuestionPrompt
						companionName={askerNameOf(view)}
						key={view.asked.request.id}
						request={view.asked.request}
						responder={view.promptResponder}
					/>
				) : (
					<ThreadComposerSlot
						bots={known}
						canAttach={view.canAttach}
						composerRef={view.composerRef}
						isDisabled={view.isMissionClosed}
						onPromptChange={view.rememberDraft}
						onSubmitPrompt={view.submitPrompt}
						placeholder={view.composerPlaceholder}
						promptRef={view.promptRef}
						readDraft={view.readDraft}
						staged={view.staged}
						thread={thread}
					/>
				)
			}
			header={
				<ThreadHeader
					botImage={view.botImage}
					botWork={view.facts.botWork}
					hasRoutines={view.routinesScope.conversationId !== null}
					liveMissionIds={view.liveMissionIds}
					mission={view.missionSeat}
					onJumpToPin={(bubbleId) =>
						view.jumpToMessage(view.pins.anchorOf(bubbleId))
					}
					onUnpin={view.pins.unpin}
					pinnedRows={view.pinnedRows}
					present={view.present}
					thread={thread}
				/>
			}
			highlightedMessageId={view.highlightedMessageId}
			label={
				view.missionSeat
					? view.t("missions.feed.label")
					: view.t("screen.label")
			}
			notice={
				joinedHost && access ? (
					<SpaceAccessBanner
						host={joinedHost.hostName}
						reason={access.reason}
						space={joinedHost.spaceName}
						waitReason={access.waitReason}
					/>
				) : (
					<ThreadNotices
						facts={view.facts}
						pins={view.pins}
						staged={view.staged}
					/>
				)
			}
			countsNewMessages={!view.isSoloThread}
			marksNewMessages={!view.isSoloThread}
			newer={newerControlOf({
				hasNewer: view.hasNewer,
				isLoading: view.facts.isLoadingNewer,
				onLoad: view.loadNewer,
				onLoadLatest: view.loadLatest,
			})}
			older={
				view.state.messages.length > 0
					? {
							has: view.state.hasOlder,
							isLoading: view.facts.isLoadingOlder,
							onLoad: view.loadOlder,
						}
					: undefined
			}
			onFollowChange={view.controller.follow}
			pending={
				departure ? undefined : (
					<ThreadApproval
						authors={view.authors}
						permission={view.facts.permission}
						responder={view.promptResponder}
					/>
				)
			}
			reply={
				view.replyTarget && !view.asked
					? { ...view.toQuote(view.replyTarget), onDismiss: view.releaseReply }
					: undefined
			}
			rootRef={view.rootRef}
			rows={view.transcriptRows}
			scrollerRef={view.scrollerRef}
			skeleton={transcriptSkeleton}
			transcriptKey={view.facts.id}
		>
			{showsEmptyState(
				view.transcriptRows,
				view.onboardingTail,
				view.facts.isFirstLoadPending,
			) ? (
				<ThreadEmptyState
					botImage={view.botImage}
					latestError={view.facts.latestError}
					onRestart={view.restart}
					onSignIn={view.offerSignIn}
					present={view.present}
					promptRef={view.promptRef}
					thread={thread}
				/>
			) : null}

			<ThreadTail
				botWork={view.facts.botWork}
				bots={view.bots}
				onboarding={view.onboardingTail}
				onStop={view.stop}
				readerName={view.reader}
				refusedQuote={
					view.refusedTarget ? view.toQuote(view.refusedTarget) : undefined
				}
				thread={thread}
			/>
		</ThreadLayout>
	)

	return (
		<RosterProvider bots={view.bots}>
			<ThreadRoutines
				{...view.routinesScope}
				activityPanel={activityPanel}
				faceOf={view.faceOf}
				liveMissionIds={view.liveMissionIds}
				missions={view.missions}
				onOpenMission={onOpenMission}
				onOpenMissionInNewTab={onOpenMissionInNewTab}
				wrapMissionCard={view.wrapMissionCard}
			>
				{layout}
			</ThreadRoutines>
		</RosterProvider>
	)
}

type ThreadScreenProps = {
	activityPanel: ActivityPanel
	thread: Thread
	spaceId: string | null
	bots: Bot[]
	runtimes: ConversationRuntimes
	attachments: AttachmentsController
	drafts: DraftsController
	landings: MessageLandingController
	readerName: string
	onboarding?: Onboarding
	signIn?: SignIn
	onOpenMission: OpenMission
	onOpenMissionInNewTab: OpenMissionInNewTab
}

type ConversationThreadViewProps = Omit<ThreadScreenProps, "thread"> & {
	thread: ConversationThread
}

function ConversationThreadView({
	activityPanel,
	thread,
	bots,
	runtimes,
	attachments,
	drafts,
	landings,
	readerName,
	onOpenMission,
	onOpenMissionInNewTab,
	spaceId,
}: ConversationThreadViewProps) {
	const { state, controller } = useConversation(
		thread.runtimes,
		thread.conversation,
	)

	useMissionSendFailure(thread.mission ? state.refusedMessage : null)

	return (
		<ThreadView
			activityPanel={activityPanel}
			attachments={attachments}
			bots={bots}
			drafts={drafts}
			landings={landings}
			onOpenMission={onOpenMission}
			onOpenMissionInNewTab={onOpenMissionInNewTab}
			readerName={readerName}
			runtimes={runtimes}
			spaceId={spaceId}
			thread={{ ...thread, state, controller }}
		/>
	)
}

type BotThreadViewProps = Omit<ThreadScreenProps, "thread"> & {
	thread: BotThread
}

function BotThreadView({
	activityPanel,
	thread,
	bots,
	runtimes,
	attachments,
	drafts,
	landings,
	readerName,
	onboarding,
	signIn,
	onOpenMission,
	onOpenMissionInNewTab,
	spaceId,
}: BotThreadViewProps) {
	const { controller } = thread.chat
	const botId = thread.bot.id

	useEffect(() => {
		controller.enter(botId)
		return () => controller.leave(botId)
	}, [controller, botId])

	return (
		<ThreadView
			activityPanel={activityPanel}
			attachments={attachments}
			bots={bots}
			drafts={drafts}
			landings={landings}
			onboarding={onboarding}
			onOpenMission={onOpenMission}
			onOpenMissionInNewTab={onOpenMissionInNewTab}
			readerName={readerName}
			runtimes={runtimes}
			signIn={signIn}
			spaceId={spaceId}
			thread={{ ...thread, state: thread.chat.state, controller }}
		/>
	)
}

export function ThreadScreen({
	activityPanel,
	thread,
	bots,
	runtimes,
	attachments,
	drafts,
	landings,
	readerName,
	onboarding,
	signIn,
	onOpenMission,
	onOpenMissionInNewTab,
	spaceId,
}: ThreadScreenProps) {
	if (thread.kind === "conversation") {
		return (
			<ConversationThreadView
				activityPanel={activityPanel}
				attachments={attachments}
				bots={bots}
				drafts={drafts}
				key={thread.conversation.id}
				landings={landings}
				onOpenMission={onOpenMission}
				onOpenMissionInNewTab={onOpenMissionInNewTab}
				readerName={readerName}
				runtimes={runtimes}
				spaceId={spaceId}
				thread={thread}
			/>
		)
	}

	return (
		<BotThreadView
			activityPanel={activityPanel}
			attachments={attachments}
			bots={bots}
			drafts={drafts}
			key={thread.bot.id}
			landings={landings}
			onboarding={onboarding}
			onOpenMission={onOpenMission}
			onOpenMissionInNewTab={onOpenMissionInNewTab}
			readerName={readerName}
			runtimes={runtimes}
			signIn={signIn}
			spaceId={spaceId}
			thread={thread}
		/>
	)
}
