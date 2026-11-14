"use client"

import {
	type CSSProperties,
	createContext,
	type FocusEvent,
	type ReactNode,
	useContext,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { formatElapsed } from "@workspace/ui/components/activity-indicator"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { companionHue } from "@workspace/ui/components/companion-avatar"
import { hueStyle } from "@workspace/ui/components/hue-palette"
import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import { Button } from "@workspace/ui/components/ui/button"
import {
	Popover,
	PopoverContent,
	PopoverTitle,
	PopoverTrigger,
} from "@workspace/ui/components/ui/popover"
import { cn } from "@workspace/ui/lib/utils"

type LibraryDocumentAgent = {
	id: string
	name: string
	hue?: number | null
	image?: string
}

type LibraryDocumentEdit = {
	agent: LibraryDocumentAgent
	start: number
	end: number
}

type LibraryDocumentWriter = LibraryDocumentEdit & {
	elapsedSeconds: number
	sentenceCount: number
	section: string
}

type LibraryDocumentPerson = {
	id: string
	name: string
	image?: string
	caret: number
}

const STACK_LIMIT = 3

const ISLAND_AVATAR_SIZE = 22

const LibraryPresenceInIsland = createContext(false)

const CARD_CLOSE_DELAY = 150

const FOCUS_OUTLINE =
	"focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring focus-visible:outline-offset-2"

const CHIP = cn(
	"gap-1.5 rounded-full bg-foreground/8 ps-2 pe-2.5 font-medium text-foreground transition-none hover:bg-foreground/12 dark:bg-foreground/8 dark:hover:bg-foreground/12",
	FOCUS_OUTLINE,
)

const CARD_SHADOW =
	"shadow-popover dark:shadow-[0_1px_2px_rgb(0_0_0/0.4),0_12px_32px_rgb(0_0_0/0.5)]"

const WRITTEN_RUN_LOOK =
	"rounded-[3px] border-primary/50 border-b bg-primary/12 py-0.5 text-foreground box-decoration-clone"

const agentScopeOf = ({ name, hue }: LibraryDocumentAgent) =>
	hue === null || hue === undefined
		? undefined
		: {
				"data-hue": hue,
				style: hueStyle(companionHue(name, hue)) as CSSProperties,
			}

type AgentAvatarProps = {
	agent: LibraryDocumentAgent
	size: number
	className?: string
}

const AgentAvatar = ({ agent, size, className }: AgentAvatarProps) => (
	<BotIdentityAvatar
		className={className}
		hue={agent.hue}
		image={agent.image}
		name={agent.name}
		seed={agent.id}
		size={size}
	/>
)

type AgentStackProps = {
	agents: LibraryDocumentAgent[]
}

const AgentStack = ({ agents }: AgentStackProps) => {
	const isInIsland = useContext(LibraryPresenceInIsland)

	return (
		<span
			aria-hidden="true"
			className={cn("flex shrink-0", isInIsland && "gap-0.5")}
		>
			{agents.slice(0, STACK_LIMIT).map((agent, index) => (
				<AgentAvatar
					agent={agent}
					className={cn(!isInIsland && index > 0 && "-ms-1.5")}
					key={agent.id}
					size={isInIsland ? ISLAND_AVATAR_SIZE : 24}
				/>
			))}
		</span>
	)
}

const StopSquare = () => (
	<span aria-hidden="true" className="size-2 shrink-0 rounded-xs bg-current" />
)

type PresencePerson = Omit<LibraryDocumentPerson, "caret">

type PeopleStackProps = {
	people: PresencePerson[]
}

const PeopleStack = ({ people }: PeopleStackProps) => {
	const isInIsland = useContext(LibraryPresenceInIsland)

	return (
		<span
			className={cn("flex shrink-0", isInIsland && "gap-0.5 p-1")}
			data-slot="library-document-people"
		>
			{people.slice(0, STACK_LIMIT).map((person, index) => (
				<span
					aria-label={person.name}
					className={cn("flex", !isInIsland && index > 0 && "-ms-1.5")}
					key={person.id}
					role="img"
				>
					<InitialsAvatar
						className={cn(!isInIsland && "border-2 border-card")}
						image={person.image}
						name={person.name}
						size={isInIsland ? ISLAND_AVATAR_SIZE : 26}
					/>
				</span>
			))}
		</span>
	)
}

type PresenceActivity = "writing" | "drawing"

const ACTIVITY_LABEL = {
	writing: "library.document.agents.writing",
	drawing: "board.presence.drawing",
} as const satisfies Record<PresenceActivity, string>

type LibraryDocumentPresenceProps = {
	writers: Pick<LibraryDocumentWriter, "agent">[]
	people?: PresencePerson[]
	activity?: PresenceActivity
	onStopAll?: () => void
}

const LibraryDocumentPresence = ({
	writers,
	people = [],
	activity = "writing",
	onStopAll,
}: LibraryDocumentPresenceProps) => {
	const { t } = useTranslation("common")
	const isInIsland = useContext(LibraryPresenceInIsland)

	return (
		<>
			{people.length > 0 ? <PeopleStack people={people} /> : null}
			{writers.length > 0 ? (
				<div
					className={cn(
						"flex h-8 shrink-0 items-center rounded-full border border-foreground/8 bg-foreground/4",
						isInIsland ? "gap-0.5 p-1" : "gap-2 ps-1 pe-2.5 has-[button]:pe-1",
					)}
					data-slot="library-document-presence"
				>
					<AgentStack agents={writers.map(({ agent }) => agent)} />
					<span
						className={cn(
							"whitespace-nowrap font-medium text-compact text-soft-foreground leading-4",
							isInIsland && "px-1.5",
						)}
					>
						{t(ACTIVITY_LABEL[activity], { count: writers.length })}
					</span>
					{onStopAll ? (
						<Button
							className={cn(CHIP, "h-6 text-xs leading-4")}
							onClick={onStopAll}
							variant="ghost"
						>
							<StopSquare />
							{t("library.document.agents.stopAll")}
						</Button>
					) : null}
				</div>
			) : null}
		</>
	)
}

type WriterActions = {
	onStop?: (agent: LibraryDocumentAgent) => void
	onOpenConversation?: (agent: LibraryDocumentAgent) => void
}

type AgentCardProps = WriterActions & {
	writer: LibraryDocumentWriter
}

const AgentCard = ({ writer, onStop, onOpenConversation }: AgentCardProps) => {
	const { t } = useTranslation("common")
	const { agent } = writer

	return (
		<>
			<div className="flex min-w-0 items-center gap-2">
				<AgentAvatar agent={agent} size={28} />
				<PopoverTitle className="min-w-0 flex-1 truncate font-semibold text-compact text-foreground leading-4">
					{t("library.document.agents.title", { name: agent.name })}
				</PopoverTitle>
				<span className="shrink-0 text-muted-foreground text-xs leading-4 tabular-nums">
					{formatElapsed(writer.elapsedSeconds)}
				</span>
			</div>
			<div className="flex min-w-0 items-center gap-2">
				<span
					aria-hidden="true"
					className="size-2.5 shrink-0 rounded-xs border border-primary/50 bg-primary/20"
				/>
				<p className="min-w-0 break-words text-compact text-soft-foreground leading-4.5">
					{t("library.document.agents.summary", {
						count: writer.sentenceCount,
						section: writer.section,
					})}
				</p>
			</div>
			{onStop || onOpenConversation ? (
				<div className="flex items-center gap-2">
					{onStop ? (
						<Button
							className={cn(CHIP, "h-7 text-compact leading-4")}
							onClick={() => onStop(agent)}
							variant="ghost"
						>
							<StopSquare />
							{t("library.document.agents.stop", { name: agent.name })}
						</Button>
					) : null}
					{onOpenConversation ? (
						<Button
							className={cn(
								"h-7 rounded-full px-2 font-medium text-compact text-muted-foreground leading-4 transition-none hover:bg-foreground/6 hover:text-foreground dark:hover:bg-foreground/6",
								FOCUS_OUTLINE,
							)}
							onClick={() => onOpenConversation(agent)}
							variant="ghost"
						>
							{t("library.document.agents.openConversation")}
						</Button>
					) : null}
				</div>
			) : null}
		</>
	)
}

const AgentCaret = ({ writer, onStop, onOpenConversation }: AgentCardProps) => {
	const { t } = useTranslation("common")
	const [isOpen, setOpen] = useState(false)
	const { agent } = writer

	const openOnKeyboardFocus = (event: FocusEvent<HTMLElement>) => {
		if (event.currentTarget.matches(":focus-visible")) setOpen(true)
	}

	return (
		<span
			className="relative inline-block h-6 w-0.5 rounded-[1px] bg-primary align-top"
			data-slot="library-document-caret"
		>
			<Popover onOpenChange={setOpen} open={isOpen}>
				<PopoverTrigger
					aria-label={t("library.document.agents.caret", { name: agent.name })}
					closeDelay={CARD_CLOSE_DELAY}
					className={cn(
						"absolute start-0 -top-5.5 flex h-5 items-center gap-1 whitespace-nowrap rounded-[5px] rounded-es-none bg-primary ps-0.5 pe-1.75 text-(--bot-avatar-ground) data-popup-open:ring-2 data-popup-open:ring-primary/30",
						FOCUS_OUTLINE,
					)}
					data-slot="library-document-flag"
					onFocus={openOnKeyboardFocus}
					openOnHover
				>
					<span aria-hidden="true" className="contents">
						<AgentAvatar agent={agent} size={16} />
					</span>
					<span className="max-w-40 truncate font-semibold text-xs leading-4">
						{agent.name}
					</span>
				</PopoverTrigger>
				<PopoverContent
					{...agentScopeOf(agent)}
					align="start"
					className={cn(
						"w-75 max-w-[calc(100vw-2rem)] gap-3 rounded-[12px] bg-card-raised p-3 text-foreground",
						CARD_SHADOW,
					)}
					data-slot="library-document-agent-card"
					initialFocus={false}
					sideOffset={30}
				>
					<AgentCard
						onOpenConversation={onOpenConversation}
						onStop={onStop}
						writer={writer}
					/>
				</PopoverContent>
			</Popover>
		</span>
	)
}

type LibraryDocumentWrittenRunProps = AgentCardProps & {
	isEnd: boolean
	children: ReactNode
}

const LibraryDocumentWrittenRun = ({
	writer,
	isEnd,
	children,
	onStop,
	onOpenConversation,
}: LibraryDocumentWrittenRunProps) => (
	<span {...agentScopeOf(writer.agent)}>
		<span className={WRITTEN_RUN_LOOK} data-slot="library-document-run">
			{children}
		</span>
		{isEnd ? (
			<AgentCaret
				onOpenConversation={onOpenConversation}
				onStop={onStop}
				writer={writer}
			/>
		) : null}
	</span>
)

type LibraryDocumentPersonCaretProps = {
	person: LibraryDocumentPerson
}

const LibraryDocumentPersonCaret = ({
	person,
}: LibraryDocumentPersonCaretProps) => (
	<span
		aria-label={person.name}
		className="relative -me-0.5 inline-block h-6 w-0.5 rounded-[1px] bg-primary align-top"
		data-slot="library-document-person-caret"
		role="img"
	>
		<span
			aria-hidden="true"
			className="absolute start-0 -bottom-5.5 flex h-5 items-center gap-1 whitespace-nowrap rounded-[5px] rounded-ss-none bg-primary ps-0.5 pe-1.75 text-primary-foreground"
			data-slot="library-document-person-flag"
		>
			<InitialsAvatar image={person.image} name={person.name} size={16} />
			<span className="max-w-40 truncate font-semibold text-xs leading-4">
				{person.name}
			</span>
		</span>
	</span>
)

export {
	AgentCaret as LibraryDocumentAgentCaret,
	agentScopeOf,
	FOCUS_OUTLINE,
	type LibraryDocumentAgent,
	type LibraryDocumentEdit,
	type LibraryDocumentPerson,
	LibraryDocumentPersonCaret,
	LibraryDocumentPresence,
	type LibraryDocumentWriter,
	LibraryDocumentWrittenRun,
	LibraryPresenceInIsland,
	WRITTEN_RUN_LOOK,
	type WriterActions,
}
