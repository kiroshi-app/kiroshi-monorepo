import {
	type ReactNode,
	type RefObject,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react"

import { greetingPeriodOf } from "@workspace/ui/components/greeting-period"
import {
	type HomeAgent,
	HomeAgentPicker,
} from "@workspace/ui/components/home-agent-picker"
import { HomeApplicationsBand } from "@workspace/ui/components/home-applications-band"
import { HomeGreeting } from "@workspace/ui/components/home-greeting"
import { HomeLayout } from "@workspace/ui/components/home-layout"
import { HomeTodayList } from "@workspace/ui/components/home-today-list"
import { PromptAttachButton } from "@workspace/ui/components/prompt-attach-button"
import {
	type PromptAttachment,
	PromptAttachments,
} from "@workspace/ui/components/prompt-attachments"
import { PromptInput } from "@workspace/ui/components/prompt-input"
import { PromptLibraryPicker } from "@workspace/ui/components/prompt-library-picker"
import { ScreenLayout } from "@workspace/ui/components/screen-layout"
import { useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import { botThreadMenu } from "@/components/thread-menu"
import { ConversationApplicationsContext } from "@/lib/applications/use-conversation-installs"
import { useBotCommands } from "@/lib/bots/use-bot-commands"
import { useMcpServers } from "@/lib/bots/use-mcp-servers"
import { watchConversationDrags } from "@/lib/chat/conversation-drags"
import { holdsDismissal } from "@/lib/chat/prompt-commands"
import { faceOfBot } from "@/lib/chat/thread-contract"
import type { Bot } from "@/lib/conversations/store-contract"
import type { TranscriptStore } from "@/lib/conversations/store-port"
import { type TodayRoster, todayRowsOf } from "@/lib/home/today-conversations"
import { useComposerLibrary } from "@/lib/library/use-composer-library"

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

export type HomeSend = {
	draft: string
	isSending: boolean
	onDraftChange: (draft: string) => void
	onSubmit: (text: string) => void
	onAttach: (files: File[]) => void
	onStageDocument: (document: PromptAttachment) => void
	attachments: PromptAttachment[]
	onRemoveAttachment: (id: string) => void
}

type HomeDraftComposerProps = HomeSend & {
	agent: Bot
	bots: Bot[]
	store: Pick<TranscriptStore, "botCommands">
	spaceId: string | null
	band?: ReactNode
	isDropTarget: boolean
	onSelectAgent: (botId: string) => void
	arrivalKey?: string
}

const arrivalAt = (arrivalKey: string | undefined, agent: Bot) =>
	arrivalKey === undefined ? undefined : `${arrivalKey}:${agent.id}`

const HomeDraftComposer = ({
	agent,
	bots,
	store,
	spaceId,
	band,
	isDropTarget,
	onSelectAgent,
	draft,
	isSending,
	onDraftChange,
	onSubmit,
	onAttach,
	onStageDocument,
	attachments,
	onRemoveAttachment,
	arrivalKey,
}: HomeDraftComposerProps) => {
	const t = useChatCopy()
	const fieldRef = useRef<HTMLTextAreaElement>(null)
	const [wasDismissed, setWasDismissed] = useState(false)
	const library = useComposerLibrary(spaceId, onStageDocument)
	const { queryIn, menu } = botThreadMenu({
		commands: useBotCommands(store, agent.id),
		isOverlayOpen: false,
	})
	const selected = homeAgentOf(agent)

	const query = queryIn(draft)
	const isDismissed = holdsDismissal(wasDismissed, query)
	if (wasDismissed !== isDismissed) {
		setWasDismissed(isDismissed)
	}

	const focusField = () => fieldRef.current?.focus({ preventScroll: true })

	const removeAttachment = (id: string) => {
		onRemoveAttachment(id)
		focusField()
	}

	const pickCommand = (text: string) => {
		onDraftChange(text)
		focusField()
	}

	return menu({
		prompt: draft,
		query: query ?? "",
		isOpen: query !== null && !isDismissed,
		onDismiss: () => setWasDismissed(true),
		onPick: pickCommand,
		children: (
			<PromptInput
				arrivalKey={arrivalAt(arrivalKey, agent)}
				attachments={
					<PromptAttachments items={attachments} onRemove={removeAttachment} />
				}
				band={band}
				dropTarget={isDropTarget}
				leading={
					library ? (
						<PromptLibraryPicker
							documents={library.documents}
							hasLabel
							onAttach={onAttach}
							onPick={library.onPick}
						/>
					) : (
						<PromptAttachButton hasLabel onAttach={onAttach} />
					)
				}
				onAttach={onAttach}
				onSubmit={onSubmit}
				onValueChange={onDraftChange}
				placeholder={t("home.composer.placeholder", { name: selected.name })}
				sending={isSending}
				size="large"
				textareaRef={fieldRef}
				trailing={
					<HomeAgentPicker
						agents={bots.map(homeAgentOf)}
						onSelectAgent={onSelectAgent}
						selected={selected}
					/>
				}
				value={draft}
			/>
		),
	})
}

const usePageDrop = (
	page: RefObject<HTMLElement | null>,
	canAttach: boolean,
	onAttach: (files: File[]) => void,
) => {
	const [isDropTarget, setIsDropTarget] = useState(false)

	useEffect(
		() =>
			watchConversationDrags({
				conversation: page,
				onHover: setIsDropTarget,
				onDrop: (files) => {
					if (canAttach) {
						onAttach(files)
					}
				},
			}),
		[page, canAttach, onAttach],
	)

	return isDropTarget
}

export type HomeEmptyStageProps = HomeSend & {
	agent: Bot
	bots: Bot[]
	store: TranscriptStore
	spaceId: string | null
	readerName: string
	isBandDismissed: boolean
	notice: ReactNode
	isReadOnly: boolean
	today: TodayRoster
	onSelectAgent: (botId: string) => void
	onDismissBand: () => void
	onOpenConversation: (conversationId: string) => void
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
	store,
	spaceId,
	readerName,
	isBandDismissed,
	notice,
	isReadOnly,
	today,
	onSelectAgent,
	onDismissBand,
	onOpenConversation,
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
	const page = useRef<HTMLDivElement>(null)
	const isDropTarget = usePageDrop(page, !isReadOnly, send.onAttach)

	return (
		<ScreenLayout ref={page} width="full">
			<HomeLayout
				below={
					<HomeTodayList
						agentName={agent.name}
						onOpenRow={onOpenConversation}
						rows={todayRowsOf(agent.id, today)}
					/>
				}
				stage="empty"
			>
				<HomeGreeting
					agent={homeAgentOf(agent)}
					firstName={firstNameOf(readerName)}
					period={periodAt(Date.now())}
				/>
				{notice}
				{isReadOnly ? null : (
					<HomeDraftComposer
						{...send}
						agent={agent}
						arrivalKey={arrivalKey}
						band={band}
						bots={bots}
						isDropTarget={isDropTarget}
						onSelectAgent={onSelectAgent}
						spaceId={spaceId}
						store={store}
					/>
				)}
			</HomeLayout>
		</ScreenLayout>
	)
}
