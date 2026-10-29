import { type ReactNode, useState } from "react"

import { ActivityIndicator } from "@workspace/ui/components/activity-indicator"
import { AppHeader } from "@workspace/ui/components/app-header"
import type { AppRailPanel } from "@workspace/ui/components/app-rail"
import {
	AppSidebar,
	type AppSidebarConversation,
} from "@workspace/ui/components/app-sidebar"
import { HeaderConversationButton } from "@workspace/ui/components/header-conversation-button"
import { HeaderIdentityButton } from "@workspace/ui/components/header-identity-button"
import type { ListEnd } from "@workspace/ui/components/list-skeleton"
import { Markdown } from "@workspace/ui/components/markdown"
import { MissionTurn } from "@workspace/ui/components/mission-turn"
import {
	type PinnedMessage,
	PinnedMessages,
} from "@workspace/ui/components/pinned-messages"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { type RosterBot, RosterProvider } from "@workspace/ui/components/roster"
import {
	type EarlierTodayRow,
	RoutinesPanel,
	RoutinesPanelTrigger,
} from "@workspace/ui/components/routines-panel"
import type { SpaceInvitation } from "@workspace/ui/components/space-invitations"
import { ThreadLayout } from "@workspace/ui/components/thread-layout"
import type { TranscriptItem } from "@workspace/ui/components/transcript"
import { AssistantTurn, UserTurn } from "@workspace/ui/components/turn"
import { WorkspaceShell } from "@workspace/ui/components/workspace-shell"

import { SCENE_COPY } from "./copy"
import {
	CONVERSATIONS_BY_SPACE,
	MISSIONS_BY_SPACE,
	READER,
	ROSTER_BY_SPACE,
	SCENE_SPACES,
	type SceneLoop,
	SECTIONS_BY_SPACE,
	SPACES,
	spaceOf,
	WORK,
} from "./scene-cast"
import { sceneRailOf } from "./scene-rail"
import { sceneTabsOf } from "./scene-tabs"
import { exchangeOf, type SceneTurn } from "./scene-threads"
import { useReaderAvatar } from "./use-reader-avatar"
import { type SceneFrame, useSceneTimeline } from "./use-scene-timeline"
import { WindowControls } from "./window-controls"

const ROW_ENTER =
	"motion-safe:animate-in motion-safe:fill-mode-backwards motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 motion-safe:ease-out"

const ROW_GROUP_DELAYS = ["", "motion-safe:delay-75", "motion-safe:delay-150"]

const ROWS_PER_GROUP = 2

type RowEntrance = (position: number) => string

const staggeredEntrance: RowEntrance = (position) => {
	const group = Math.min(
		Math.floor(position / ROWS_PER_GROUP),
		ROW_GROUP_DELAYS.length - 1,
	)

	return `${ROW_ENTER} ${ROW_GROUP_DELAYS[group]}`
}

const noEntrance: RowEntrance = () => ""

// The transcript rests its column against the composer; the scene holds every
// row it has played, so it anchors the column to the top of the thread area
// instead. The fold at 1440x900 leaves 297px of thread area, four pixels more
// than the four held rows need: the next step up of the scale spends them.
const TRANSCRIPT_INSET = "justify-start pt-1.5"

const NO_PINS: PinnedMessage[] = []

const NO_ACTIVITY: EarlierTodayRow[] = []

const doNothing = () => {}

const NO_INVITATIONS: SpaceInvitation[] = []

const WHOLE_ROSTER: ListEnd = { hasNextPage: false, isFetchingNextPage: false }

const sceneRow = (
	key: string,
	body: ReactNode,
	entrance: string,
): TranscriptItem => ({
	key,
	render: () => <div className={entrance}>{body}</div>,
})

const loopRows = (
	loop: SceneLoop,
	frame: SceneFrame,
	entranceOf: RowEntrance,
): TranscriptItem[] => {
	const [first, second] = loop.speakers
	const rows: TranscriptItem[] = [
		sceneRow(
			"request",
			<UserTurn>
				<Markdown>{loop.request}</Markdown>
			</UserTurn>,
			entranceOf(0),
		),
	]

	if (frame.hasFirstAnswer) {
		rows.push(
			sceneRow(
				"first-answer",
				<AssistantTurn author={first}>
					<Markdown>{loop.answers[0].slice(0, frame.firstTyped)}</Markdown>
				</AssistantTurn>,
				entranceOf(rows.length),
			),
		)
	}

	if (frame.hasSecondAnswer) {
		rows.push(
			sceneRow(
				"second-answer",
				<AssistantTurn author={second}>
					<Markdown>{loop.answers[1].slice(0, frame.secondTyped)}</Markdown>
				</AssistantTurn>,
				entranceOf(rows.length),
			),
		)
	}

	if (frame.hasMission) {
		rows.push(
			sceneRow(
				"mission",
				<MissionTurn mission={loop.mission} onOpen={doNothing} />,
				entranceOf(rows.length),
			),
		)
	}

	return rows
}

const turnRow = (
	turn: SceneTurn,
	rank: number,
	entranceOf: RowEntrance,
): TranscriptItem => {
	const key = `turn-${rank}`
	const entrance = entranceOf(rank)

	if (turn.kind === "reader") {
		return sceneRow(
			key,
			<UserTurn>
				<Markdown>{turn.text}</Markdown>
			</UserTurn>,
			entrance,
		)
	}

	if (turn.kind === "mission") {
		return sceneRow(
			key,
			<MissionTurn mission={turn.mission} onOpen={doNothing} />,
			entrance,
		)
	}

	return sceneRow(
		key,
		<AssistantTurn author={turn.bot} cause={turn.cause} footer={turn.note}>
			<Markdown>{turn.text}</Markdown>
		</AssistantTurn>,
		entrance,
	)
}

type ThreadTitleProps = {
	bot?: RosterBot
	conversation: AppSidebarConversation
	onOpen: () => void
}

const ThreadTitle = ({ bot, conversation, onOpen }: ThreadTitleProps) =>
	bot ? (
		<HeaderIdentityButton
			blot={bot.blot}
			connection="ready"
			name={bot.name}
			onOpenSettings={onOpen}
			seed={bot.id}
		/>
	) : (
		<HeaderConversationButton
			bots={conversation.participants}
			color={conversation.color}
			icon={conversation.icon}
			name={conversation.name}
			onOpenSettings={onOpen}
		/>
	)

type WorkingRowsProps = {
	loop: SceneLoop
	frame: SceneFrame
	firstPosition: number
	entranceOf: RowEntrance
}

const WorkingRows = ({
	loop,
	frame,
	firstPosition,
	entranceOf,
}: WorkingRowsProps) => {
	const [first, second] = loop.speakers
	const secondPosition = firstPosition + (frame.hasFirstAnswer ? 0 : 1)

	return (
		<>
			{frame.hasFirstAnswer ? null : (
				<ActivityIndicator
					blot={first.blot}
					botId={first.id}
					className={entranceOf(firstPosition)}
					elapsedSeconds={frame.elapsedSeconds}
					kind="thinking"
					name={first.name}
					seed={first.id}
				/>
			)}
			{frame.hasSecondAnswer ? null : (
				<ActivityIndicator
					blot={second.blot}
					botId={second.id}
					className={entranceOf(secondPosition)}
					elapsedSeconds={frame.elapsedSeconds}
					kind={frame.hasFirstAnswer ? "writing" : "thinking"}
					name={second.name}
					seed={second.id}
				/>
			)}
		</>
	)
}

export const AppScene = () => {
	const [spaceId, setSpaceId] = useState(WORK.id)
	const [selectedId, setSelectedId] = useState(WORK.defaultConversation.id)
	const [isPanelOpen, setPanelOpen] = useState(false)
	const [draft, setDraft] = useState("")
	const [hasPicked, setHasPicked] = useState(false)
	const [sidebarPanel, setSidebarPanel] =
		useState<AppRailPanel>("conversations")
	const [collapsedSectionIds, setCollapsedSectionIds] = useState<string[]>([])
	const readerAvatar = useReaderAvatar()
	const space = spaceOf(spaceId)
	const exchange = exchangeOf(selectedId)
	const { frame, engage, cancelIdle } = useSceneTimeline({
		answers: space.loop.answers,
		onIdle: () => {
			setSelectedId(space.defaultConversation.id)
			setPanelOpen(false)
			setDraft("")
		},
		runId: exchange ? null : selectedId,
	})
	const entranceOf = hasPicked ? noEntrance : staggeredEntrance
	const rows = exchange
		? exchange.turns.map((turn, rank) => turnRow(turn, rank, entranceOf))
		: loopRows(space.loop, frame, entranceOf)
	const select = (id: string) => {
		engage()
		setHasPicked(true)
		setSelectedId(id)
	}
	const selectSpace = (id: string) => {
		cancelIdle()
		setHasPicked(true)
		setSpaceId(id)
		setSelectedId(spaceOf(id).defaultConversation.id)
	}
	const openPanel = (isOpen: boolean) => {
		engage()
		setPanelOpen(isOpen)
	}
	const openSidebarPanel = (panel: AppRailPanel) => {
		engage()
		setSidebarPanel(panel)
	}
	const collapseSection = (id: string, isCollapsed: boolean) => {
		engage()
		setCollapsedSectionIds((collapsed) =>
			isCollapsed
				? [...collapsed, id]
				: collapsed.filter((sectionId) => sectionId !== id),
		)
	}

	return (
		<section
			aria-label={SCENE_COPY.sceneLabel}
			className="relative size-full"
			onFocus={engage}
			onKeyDown={engage}
			onPointerDown={engage}
		>
			<WindowControls />
			<RosterProvider bots={space.bots}>
				<WorkspaceShell
					isLandmark={false}
					isResizable
					sidebar={
						<AppSidebar
							{...sceneRailOf(SCENE_SPACES, space)}
							activeTabId={selectedId}
							bots={space.rows}
							botsBySpaceId={ROSTER_BY_SPACE}
							canGoBack={false}
							canGoForward={false}
							collapsedSectionIds={collapsedSectionIds}
							conversations={space.conversations}
							conversationsBySpaceId={CONVERSATIONS_BY_SPACE}
							hasClosedTab={false}
							haveBotsFailedToLoad={false}
							insetWindowControls
							invitations={NO_INVITATIONS}
							isSpaceSwitchingEnabled
							missionsBySpaceId={MISSIONS_BY_SPACE}
							onAcceptInvitation={engage}
							onAddBotToSpace={engage}
							onCloseOtherTabs={engage}
							onCloseTab={engage}
							onCollapseSection={collapseSection}
							onCreateBot={engage}
							onCreateConversation={engage}
							onCreateSection={engage}
							onCreateSpace={engage}
							onDeclineInvitation={engage}
							onDeleteBot={engage}
							onDeleteConversation={engage}
							onDeleteSection={engage}
							onDuplicateBot={engage}
							onDuplicateTab={engage}
							onEditBot={engage}
							onGoBack={engage}
							onGoForward={engage}
							onMoveTabToNewWindow={engage}
							onNewTab={engage}
							onOpenBotInNewTab={engage}
							onOpenConversationInNewTab={engage}
							onOpenConversationSettings={engage}
							onOpenPanelChange={openSidebarPanel}
							onOpenSearch={engage}
							onOpenSpaceSettings={engage}
							onOpenUserSettings={engage}
							onPinRoster={engage}
							onPinTab={engage}
							onRemoveBotFromSpace={engage}
							onRenameSection={engage}
							onReopenClosedTab={engage}
							onReorderSpaces={engage}
							onReorderTabs={engage}
							onTearOffTab={engage}
							onTearOffStart={engage}
							onTearOffMove={engage}
							onTearOffCancel={engage}
							onIncomingTabIndexChange={engage}
							onRetryInvitation={engage}
							onSelectBot={select}
							onSelectConversation={select}
							onSelectSpace={selectSpace}
							onSelectTab={select}
							onSpaceSwitcherOpenChange={engage}
							onUnpinTab={engage}
							openPanel={sidebarPanel}
							rosterListEnd={WHOLE_ROSTER}
							sectionsBySpaceId={SECTIONS_BY_SPACE}
							selectedBotId={exchange?.bot ? selectedId : undefined}
							selectedConversationId={exchange?.bot ? undefined : selectedId}
							selectedSpaceId={space.id}
							spaces={SPACES}
							tabs={sceneTabsOf(space, selectedId)}
							user={{ ...READER, image: readerAvatar }}
						/>
					}
					spaceTint={space.colour}
				>
					<RoutinesPanel
						failure={null}
						isOpen={isPanelOpen}
						missions={{
							earlierToday: NO_ACTIVITY,
							onOpen: doNothing,
							open: space.missions,
						}}
						onDelete={doNothing}
						onEnabledChange={doNothing}
						onOpenChange={openPanel}
						onRetry={doNothing}
						routines={space.routines}
					>
						<ThreadLayout
							autoScroll={false}
							className="h-full"
							composer={
								<PromptInput
									onValueChange={setDraft}
									placeholder={SCENE_COPY.composerPlaceholder}
									value={draft}
								/>
							}
							contentClassName={TRANSCRIPT_INSET}
							header={
								<AppHeader
									leading={
										<ThreadTitle
											bot={exchange?.bot}
											conversation={
												exchange?.conversation ?? space.defaultConversation
											}
											onOpen={engage}
										/>
									}
									trailing={
										<>
											<PinnedMessages
												messages={NO_PINS}
												onJump={doNothing}
												onUnpin={doNothing}
											/>
											<RoutinesPanelTrigger />
										</>
									}
								/>
							}
							rows={rows}
						>
							{exchange ? null : (
								<WorkingRows
									entranceOf={entranceOf}
									firstPosition={rows.length}
									frame={frame}
									loop={space.loop}
								/>
							)}
						</ThreadLayout>
					</RoutinesPanel>
				</WorkspaceShell>
			</RosterProvider>
		</section>
	)
}
