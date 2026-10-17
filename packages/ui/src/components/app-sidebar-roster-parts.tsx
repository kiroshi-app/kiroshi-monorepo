import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import {
	type AppSidebarBot,
	type AppSidebarConversation,
	type AppSidebarRowMission,
	isBusy,
	poseOf,
	ROW_AVATAR_SIZE,
} from "@workspace/ui/components/app-sidebar-model"
import { BotMissionStrip } from "@workspace/ui/components/bot-badge"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { ConversationSubjectIcon } from "@workspace/ui/components/conversation-subject-icon"
import { DitheredFieldAvatar } from "@workspace/ui/components/dithered-field-avatar"
import { dropArea } from "@workspace/ui/hooks/use-roster-lift"
import { cn } from "@workspace/ui/lib/utils"

const ROW_ITEM = "flex flex-col gap-1"

const SECTION_DROP =
	"flex items-center justify-center gap-2 rounded-xl border border-sidebar-border border-dashed px-3 py-3 text-center text-muted-foreground text-xs"

const SECTION_DROP_AVATAR = "block opacity-40"

const DROP_AREA =
	"group/roster-drop relative rounded-2xl transition-colors duration-150 ease-out motion-reduce:transition-none"

const DROP_AREA_LANDING = "bg-sidebar-accent/60"

const DROP_AREA_LIFTED =
	"pointer-events-none z-10 origin-top scale-90 bg-sidebar shadow-lg translate-y-[var(--lift-dy,0px)]"

const INSERTION_LINE =
	"pointer-events-none absolute inset-x-2 z-20 h-0.5 rounded-full bg-sidebar-primary"

const ZONE_SEPARATOR =
	"mx-1.5 my-1 block h-px shrink-0 rounded-full bg-sidebar-border"

const INSERTION_ABOVE = "-top-0.5"

const INSERTION_BELOW = "-bottom-0.5"

const LIFTED_BOT =
	"pointer-events-none fixed top-0 left-0 z-[100] drop-shadow-lg translate-x-[calc(var(--lift-x,0px)-50%)] translate-y-[calc(var(--lift-y,0px)-50%)]"

const DROP_AVATAR_SIZE = 28

const missionStripsOf = (missions: AppSidebarRowMission[] | undefined) =>
	missions?.length
		? missions.map(({ id, state, ticket, objective, isLive }) => (
				<BotMissionStrip
					key={id}
					isLive={isLive}
					objective={objective}
					state={state}
					ticket={ticket}
				/>
			))
		: undefined

interface BotRowAvatarProps {
	bot: AppSidebarBot
}

const BotRowAvatar = ({ bot }: BotRowAvatarProps) => (
	<BotIdentityAvatar
		blot={bot.blot}
		image={bot.image}
		kind={poseOf(bot)}
		name={bot.name}
		seed={bot.id}
		size={ROW_AVATAR_SIZE}
		working={isBusy(bot)}
	/>
)

type InsertionEdge = "above" | "below"

interface InsertionLineProps {
	edge?: InsertionEdge
}

const InsertionLine = ({ edge }: InsertionLineProps) =>
	edge ? (
		<span
			className={cn(
				INSERTION_LINE,
				edge === "above" ? INSERTION_ABOVE : INSERTION_BELOW,
			)}
			data-slot="roster-insertion"
		/>
	) : null

const RosterZoneSeparator = () => (
	<span
		aria-hidden="true"
		className={ZONE_SEPARATOR}
		data-slot="roster-zone-separator"
	/>
)

interface RosterRowSlot {
	insertion?: InsertionEdge
	isPinned: boolean
	slotRef?: (node: HTMLElement | null) => void
}

interface SectionDropZoneProps {
	name: string
	label?: string
}

const SectionDropZone = ({ name, label }: SectionDropZoneProps) => {
	const { t } = useTranslation("bots")

	return (
		<div className={SECTION_DROP} data-slot="roster-section-drop">
			<span aria-hidden="true" className={SECTION_DROP_AVATAR}>
				<DitheredFieldAvatar name={name} size={DROP_AVATAR_SIZE} />
			</span>
			{label ?? t("roster.section.empty")}
		</div>
	)
}

interface RosterDropAreaProps {
	landing: string
	isLanding: boolean
	isLifted?: boolean
	insertion?: InsertionEdge
	className?: string
	ref?: (node: HTMLElement | null) => void
	children: ReactNode
}

const RosterDropArea = ({
	landing,
	isLanding,
	isLifted = false,
	insertion,
	className,
	ref,
	children,
}: RosterDropAreaProps) => (
	<div
		{...dropArea(landing)}
		className={cn(
			DROP_AREA,
			isLanding && DROP_AREA_LANDING,
			isLifted && DROP_AREA_LIFTED,
			className,
		)}
		data-landing={isLanding || undefined}
		data-slot="roster-drop-area"
		data-tauri-drag-region="false"
		ref={ref}
	>
		<InsertionLine edge={insertion} />
		{children}
	</div>
)

interface LiftedConversationMarkProps {
	conversation: AppSidebarConversation
}

const LiftedConversationMark = ({
	conversation,
}: LiftedConversationMarkProps) =>
	conversation.participants.length > 1 ? (
		<ConversationSubjectIcon
			color={conversation.color}
			icon={conversation.icon}
			side={ROW_AVATAR_SIZE}
		/>
	) : (
		conversation.participants.map((bot) => (
			<BotRowAvatar bot={bot} key={bot.id} />
		))
	)

interface LiftedRowProps {
	bot?: AppSidebarBot
	conversation?: AppSidebarConversation
	ref: (node: HTMLElement | null) => void
}

const LiftedRow = ({ bot, conversation, ref }: LiftedRowProps) => (
	<span
		aria-hidden="true"
		className={LIFTED_BOT}
		data-slot="roster-lifted-bot"
		ref={ref}
	>
		{conversation ? (
			<LiftedConversationMark conversation={conversation} />
		) : null}
		{bot ? <BotRowAvatar bot={bot} /> : null}
	</span>
)

export {
	BotRowAvatar,
	type InsertionEdge,
	InsertionLine,
	LiftedRow,
	missionStripsOf,
	ROW_ITEM,
	RosterDropArea,
	type RosterRowSlot,
	RosterZoneSeparator,
	SectionDropZone,
}
