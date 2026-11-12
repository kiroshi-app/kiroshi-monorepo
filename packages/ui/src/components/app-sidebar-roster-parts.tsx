import type { KeyboardEvent, ReactNode, Ref } from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import {
	type AppSidebarBot,
	type AppSidebarRowMission,
	isBusy,
	poseOf,
	ROW_AVATAR_SIZE,
} from "@workspace/ui/components/app-sidebar-model"
import { BotMissionStrip } from "@workspace/ui/components/bot-badge"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { dropArea } from "@workspace/ui/hooks/use-roster-lift"
import {
	SHIFTABLE,
	SLIDING,
	type SlideShift,
} from "@workspace/ui/hooks/use-sliding-lift"
import { cn } from "@workspace/ui/lib/utils"

const ROW_ITEM = "flex flex-col gap-1"

const ROSTER_SLOT = "data-roster-slot"

const LIFT_FRAME = "group/roster-lift contents"

const LIFTED =
	"pointer-events-none relative z-10 rounded-2xl bg-sidebar shadow-lg"

const LIFTED_IN_ZONE = cn(
	LIFTED,
	"translate-y-[clamp(var(--lift-min),var(--lift-dy,0px),var(--lift-max))]",
)

const LIFTED_LOOSE = cn(LIFTED, "translate-y-(--lift-dy)")

const SECTION_DROP =
	"flex items-center rounded-lg border border-input border-dashed p-3 text-compact text-faint-foreground leading-5"

const SECTION_DROP_ALIGN = {
	center: "justify-center text-center",
	start: "justify-start text-start",
}

const DROP_AREA = "group/roster-drop relative rounded-2xl"

const DROP_AREA_LANDING = "bg-sidebar-accent/60"

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
	size?: number
}

const BotRowAvatar = ({ bot, size = ROW_AVATAR_SIZE }: BotRowAvatarProps) => (
	<BotIdentityAvatar
		hue={bot.blot}
		image={bot.image}
		kind={poseOf(bot)}
		name={bot.name}
		seed={bot.id}
		size={size}
		working={isBusy(bot)}
	/>
)

const rosterSlot = (id: string) => ({ [ROSTER_SLOT]: id })

interface RosterSlide {
	shift?: SlideShift
	isSliding?: boolean
	isLifted?: boolean
}

const slideClassOf = (
	{ shift, isSliding = false, isLifted = false }: RosterSlide,
	lifted: string,
) => ({
	className: cn(SHIFTABLE.y, isSliding && SLIDING, isLifted && lifted),
	"data-shift": shift,
	"data-lifted": isLifted || undefined,
})

interface RosterRowSlot extends RosterSlide {
	isPinned: boolean
	keepFocus?: (id: string, node: HTMLElement | null) => void
	onMoveKey?: (id: string, event: KeyboardEvent<HTMLElement>) => void
}

const rosterRowSlotOf = (id: string, row: RosterRowSlot) => {
	const slide = slideClassOf(row, row.isPinned ? LIFTED_IN_ZONE : LIFTED_LOOSE)
	return {
		...rosterSlot(id),
		...slide,
		className: cn(ROW_ITEM, slide.className),
		onKeyDown: row.onMoveKey
			? (event: KeyboardEvent<HTMLElement>) => row.onMoveKey?.(id, event)
			: undefined,
	}
}

interface RosterLiftFrameProps {
	isLifting: boolean
	ref: Ref<HTMLDivElement>
	children: ReactNode
}

const RosterLiftFrame = ({
	isLifting,
	ref,
	children,
}: RosterLiftFrameProps) => (
	<div
		className={LIFT_FRAME}
		data-lifting={isLifting || undefined}
		data-slot="roster-lift-frame"
		ref={ref}
	>
		{children}
	</div>
)

type RosterMove = {
	name: string
	position: number
	count: number
	section?: string
}

interface RosterMoveAnnouncementProps {
	move: RosterMove | null
}

const RosterMoveAnnouncement = ({ move }: RosterMoveAnnouncementProps) => {
	const { t } = useTranslation("bots")
	return createPortal(
		<span
			aria-live="polite"
			className="sr-only"
			data-slot="roster-move-announcement"
		>
			{move?.section
				? t("roster.movedInSection", { ...move, section: move.section })
				: move
					? t("roster.moved", move)
					: ""}
		</span>,
		document.body,
	)
}

interface SectionDropZoneProps {
	align?: keyof typeof SECTION_DROP_ALIGN
	label?: string
	slotId?: string
}

const SectionDropZone = ({
	align = "center",
	label,
	slotId,
}: SectionDropZoneProps) => {
	const { t } = useTranslation("bots")

	return (
		<div
			{...(slotId ? rosterSlot(slotId) : undefined)}
			className={cn(SECTION_DROP, SECTION_DROP_ALIGN[align])}
			data-slot="roster-section-drop"
		>
			{label ?? t("roster.section.empty")}
		</div>
	)
}

interface RosterDropAreaProps extends RosterSlide {
	landing: string
	isLanding: boolean
	isReceiving?: boolean
	isGiving?: boolean
	slotId?: string
	className?: string
	ref?: (node: HTMLElement | null) => void
	children: ReactNode
}

const RosterDropArea = ({
	landing,
	isLanding,
	isReceiving = false,
	isGiving = false,
	slotId,
	className,
	ref,
	children,
	...slide
}: RosterDropAreaProps) => {
	const { className: slideClass, ...slideState } = slideClassOf(
		slide,
		LIFTED_IN_ZONE,
	)
	return (
		<div
			{...dropArea(landing)}
			{...(slotId ? rosterSlot(slotId) : undefined)}
			{...slideState}
			className={cn(
				DROP_AREA,
				isLanding && DROP_AREA_LANDING,
				slideClass,
				className,
			)}
			data-giving={isGiving || undefined}
			data-landing={isLanding || undefined}
			data-receiving={isReceiving || undefined}
			data-slot="roster-drop-area"
			data-tauri-drag-region="false"
			ref={ref}
		>
			{children}
		</div>
	)
}

export {
	BotRowAvatar,
	missionStripsOf,
	ROSTER_SLOT,
	RosterDropArea,
	type RosterDropAreaProps,
	RosterLiftFrame,
	type RosterMove,
	RosterMoveAnnouncement,
	type RosterRowSlot,
	rosterRowSlotOf,
	rosterSlot,
	SectionDropZone,
}
