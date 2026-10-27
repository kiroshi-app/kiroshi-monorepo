"use client"

import { useLayoutEffect, useRef } from "react"
import { useTranslation } from "react-i18next"

import {
	type BotBadge,
	BotBadgeDot,
	botBadgeRingVariants,
} from "@workspace/ui/components/bot-badge"
import {
	ContextMenuPressTrigger,
	openBelow,
} from "@workspace/ui/components/context-menu-press-trigger"
import type { SpaceHost } from "@workspace/ui/components/host-pill"
import { hueStyle } from "@workspace/ui/components/hue-palette"
import { Icons } from "@workspace/ui/components/icons"
import type { Space } from "@workspace/ui/components/space"
import {
	SpaceAvatar,
	spaceAvatarStateOf,
} from "@workspace/ui/components/space-avatar"
import {
	type SpaceInvitation,
	type SpaceInvitationCallbacks,
	SpaceInvitations,
} from "@workspace/ui/components/space-invitations"
import { Button } from "@workspace/ui/components/ui/button"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuRadioGroup,
	ContextMenuRadioItem,
	ContextMenuSeparator,
	ContextMenuShortcut,
} from "@workspace/ui/components/ui/context-menu"
import {
	dropArea,
	dropAreaAt,
	useLiftLanding,
	useRosterLift,
} from "@workspace/ui/hooks/use-roster-lift"
import { SPACE_RANK_LIMIT } from "@workspace/ui/hooks/use-space-shortcut"
import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"
import { cn } from "@workspace/ui/lib/utils"

const SWITCHER =
	"relative h-8 min-w-0 max-w-64 shrink gap-2 rounded-md px-2 font-normal text-compact text-muted-foreground leading-4 aria-expanded:bg-sidebar-accent"

const SWITCHER_NAME = "min-w-0 truncate"

const SWITCHER_CHEVRON = "size-3 shrink-0 stroke-2!"

const SWITCHER_INVITATION =
	"pointer-events-none absolute end-0.25 top-1 size-1.75 rounded-full bg-primary-strong ring-2 ring-background"

const MENU_RESTING = "max-w-64"

const MENU_INVITED = "w-70"

const ROW_NAME = "min-w-0 grow truncate"

const DOT = "h-2.5 w-2.5 shrink-0 rounded-full"

const DOTS =
	"flex flex-wrap items-center justify-center group-data-[collapsible=icon]:hidden"

const DOT_BUTTON =
	"group/space-dot relative grid size-5 shrink-0 touch-none select-none place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/40"

const DOT_LIFTED =
	"pointer-events-none z-10 scale-125 drop-shadow-md translate-x-[var(--lift-dx,0px)] translate-y-[var(--lift-dy,0px)]"

const INSERTION_LINE =
	"pointer-events-none absolute inset-y-1 z-20 w-0.5 rounded-full bg-sidebar-primary"

const INSERTION_BEFORE = "start-0"

const INSERTION_AFTER = "end-0"

const DOT_MOTION =
	"transition-[width] duration-150 ease-out motion-reduce:transition-none"

const DOT_OPEN = "w-4 bg-sidebar-foreground"

const DOT_CLOSED = "group-hover/space-dot:bg-sidebar-foreground"

const DOT_UNTINTED = "bg-sidebar-foreground/30"

const BADGE_RANK: BotBadge[] = ["attention", "failed", "done"]

const badgeElsewhere = (
	spaces: Space[],
	currentSpaceId: string | undefined,
	badgesBySpaceId: Record<string, BotBadge> = {},
) => {
	const badges = spaces
		.filter((space) => space.id !== currentSpaceId)
		.map((space) => badgesBySpaceId[space.id])
	return BADGE_RANK.find((badge) => badges.includes(badge))
}

const placedOrder = (spaces: Space[], id: string, at: number) => {
	const order = spaces
		.filter((space) => space.id !== id)
		.map((space) => space.id)
	order.splice(at, 0, id)
	return order.every((held, rank) => held === spaces[rank]?.id) ? null : order
}

type SpaceDotProps = {
	colour?: number | null
	badge?: BotBadge
	isFilled?: boolean
	className?: string
}

const SpaceDot = ({
	colour,
	badge,
	isFilled = true,
	className,
}: SpaceDotProps) => {
	const hue = isFilled ? (colour ?? undefined) : undefined

	return (
		<span
			aria-hidden="true"
			className={cn(
				DOT,
				DOT_MOTION,
				hue === undefined && DOT_UNTINTED,
				badge && botBadgeRingVariants({ badge }),
				className,
			)}
			data-badge={badge}
			data-hue={hue}
			data-slot="space-dot"
			style={
				hue === undefined
					? undefined
					: { ...hueStyle(hue), backgroundColor: "var(--primary-strong)" }
			}
		/>
	)
}

type SpaceSelection = {
	spaces: Space[]
	selectedSpaceId?: string
	badgesBySpaceId?: Record<string, BotBadge>
	onSelectSpace?: (id: string) => void
	onReorderSpaces?: (ids: string[]) => void
}

type SpaceSwitcherProps = Omit<SpaceSelection, "onReorderSpaces"> &
	SpaceInvitationCallbacks & {
		hostBySpaceId?: Record<string, SpaceHost>
		invitations?: SpaceInvitation[]
		open?: boolean
		focusedInvitationId?: string
		onCreateSpace?: () => void
		onOpenChange?: (isOpen: boolean) => void
	}

type SpaceMenuRowsProps = Pick<
	SpaceSwitcherProps,
	"spaces" | "badgesBySpaceId" | "hostBySpaceId" | "onSelectSpace"
> & {
	selectedSpaceId?: string
	rowClassName?: string
}

const SpaceMenuRows = ({
	spaces,
	selectedSpaceId,
	badgesBySpaceId,
	hostBySpaceId,
	onSelectSpace,
	rowClassName,
}: SpaceMenuRowsProps) => {
	const { t } = useTranslation("bots")

	return (
		<ContextMenuRadioGroup
			onValueChange={(value) => onSelectSpace?.(value)}
			value={selectedSpaceId}
		>
			{spaces.map((space, index) => {
				const rowHost = hostBySpaceId?.[space.id]
				return (
					<ContextMenuRadioItem
						className={rowClassName}
						closeOnClick
						key={space.id}
						label={space.name}
						value={space.id}
					>
						<SpaceAvatar
							colour={space.colour}
							hasAttention={badgesBySpaceId?.[space.id] === "attention"}
							size={14}
							spaceId={space.avatarSeed}
							state={spaceAvatarStateOf(rowHost)}
						/>
						<span className={ROW_NAME}>{space.name}</span>
						{rowHost ? (
							<span className="sr-only">{t(`spaces.host.${rowHost}`)}</span>
						) : null}
						{index < SPACE_RANK_LIMIT ? (
							<ContextMenuShortcut>
								{t("spaces.shortcut", { rank: index + 1 })}
							</ContextMenuShortcut>
						) : null}
					</ContextMenuRadioItem>
				)
			})}
		</ContextMenuRadioGroup>
	)
}

const SpaceSwitcher = ({
	spaces,
	selectedSpaceId,
	badgesBySpaceId,
	hostBySpaceId,
	invitations = [],
	open,
	focusedInvitationId,
	onSelectSpace,
	onCreateSpace,
	onAcceptInvitation,
	onDeclineInvitation,
	onRetryInvitation,
	onOpenChange,
}: SpaceSwitcherProps) => {
	const { t } = useTranslation("bots")
	const triggerRef = useRef<HTMLElement>(null)
	const isAnchoredRef = useRef(false)
	const selected =
		spaces.find((space) => space.id === selectedSpaceId) ?? spaces[0]

	useLayoutEffect(() => {
		if (!open) isAnchoredRef.current = false
		else if (!isAnchoredRef.current && triggerRef.current)
			openBelow(triggerRef.current)
	}, [open])

	if (!selected) return null

	const host = hostBySpaceId?.[selected.id]
	const isInvited = invitations.length > 0
	const switchLabel = isInvited
		? host
			? "spaces.switchHostedInvited"
			: "spaces.switchInvited"
		: host
			? "spaces.switchHosted"
			: "spaces.switch"

	const elsewhere = isInvited
		? undefined
		: badgeElsewhere(spaces, selected.id, badgesBySpaceId)

	return (
		<ContextMenu
			onOpenChange={(isOpen) => {
				isAnchoredRef.current = isOpen
				onOpenChange?.(isOpen)
			}}
			open={open}
		>
			<ContextMenuPressTrigger
				ref={triggerRef}
				render={
					<Button
						aria-label={t(switchLabel, {
							count: invitations.length,
							host: host ? t(`spaces.host.${host}`) : "",
							name: selected.name,
						})}
						className={SWITCHER}
						data-slot="space-switcher"
						size="sm"
						variant="ghost"
					>
						<SpaceAvatar
							colour={selected.colour}
							size={12}
							spaceId={selected.avatarSeed}
							state={spaceAvatarStateOf(host)}
						/>
						<span className={SWITCHER_NAME} data-slot="space-switcher-name">
							{selected.name}
						</span>
						<Icons.Expand aria-hidden="true" className={SWITCHER_CHEVRON} />
						{elsewhere ? (
							<BotBadgeDot
								badge={elsewhere}
								data-slot="space-switcher-badge"
								placement="switcher"
							/>
						) : null}
						{isInvited ? (
							<span
								aria-hidden="true"
								className={SWITCHER_INVITATION}
								data-slot="space-switcher-invitation"
							/>
						) : null}
					</Button>
				}
			/>
			<ContextMenuContent
				aria-label={t("spaces.label")}
				className={cn(
					isInvited ? MENU_INVITED : MENU_RESTING,
					STILL_UNDER_REDUCED_MOTION,
				)}
			>
				<SpaceMenuRows
					badgesBySpaceId={badgesBySpaceId}
					hostBySpaceId={hostBySpaceId}
					onSelectSpace={onSelectSpace}
					selectedSpaceId={selected.id}
					spaces={spaces}
				/>
				<SpaceInvitations
					focusedInvitationId={focusedInvitationId}
					invitations={invitations}
					onAcceptInvitation={onAcceptInvitation}
					onDeclineInvitation={onDeclineInvitation}
					onRetryInvitation={onRetryInvitation}
				/>
				<ContextMenuSeparator />
				<ContextMenuItem onClick={onCreateSpace}>
					<Icons.Add aria-hidden="true" className="size-3.5" />
					{t("spaces.create")}
				</ContextMenuItem>
			</ContextMenuContent>
		</ContextMenu>
	)
}

const SpaceDots = ({
	spaces,
	selectedSpaceId,
	badgesBySpaceId,
	onSelectSpace,
	onReorderSpaces,
}: SpaceSelection) => {
	const { t } = useTranslation("bots")

	const placeSpace = (id: string, at: number) => {
		const order = placedOrder(spaces, id, at)
		if (order) onReorderSpaces?.(order)
	}

	const insertionAt = (x: number, y: number) => {
		const over = dropAreaAt(x, y)
		const rank = spaces.findIndex((space) => space.id === over)
		return rank < 0 ? null : rank
	}

	const lift = useRosterLift({
		isEnabled: spaces.length > 1,
		landingAt: insertionAt,
		onLand: placeSpace,
	})
	const insertion = useLiftLanding(lift)

	if (spaces.length < 2) return null

	const liftedId = lift.lift?.id
	const placed = spaces.filter((space) => space.id !== liftedId)
	const insertsBefore = insertion === null ? null : placed[insertion]?.id
	const insertsAfter =
		insertion !== null && insertion >= placed.length
			? placed[placed.length - 1]?.id
			: null

	return (
		<span
			aria-label={t("spaces.label")}
			className={DOTS}
			data-slot="space-dots"
			data-tauri-drag-region="false"
			role="group"
		>
			{spaces.map((space) => {
				const isSelected = space.id === selectedSpaceId
				const isLifted = space.id === liftedId
				const edge =
					insertsBefore === space.id
						? INSERTION_BEFORE
						: insertsAfter === space.id
							? INSERTION_AFTER
							: null
				return (
					<button
						{...dropArea(space.id)}
						{...lift.handlersFor(space.id)}
						aria-current={isSelected}
						aria-label={t("spaces.open", { name: space.name })}
						className={cn(DOT_BUTTON, isLifted && DOT_LIFTED)}
						data-slot="space-dot-button"
						key={space.id}
						onClick={() => {
							if (lift.hasJustDropped()) return
							onSelectSpace?.(space.id)
						}}
						ref={isLifted ? lift.followRef : undefined}
						type="button"
					>
						{edge ? (
							<span
								className={cn(INSERTION_LINE, edge)}
								data-slot="space-insertion"
							/>
						) : null}
						<SpaceDot
							badge={badgesBySpaceId?.[space.id]}
							className={isSelected ? DOT_OPEN : DOT_CLOSED}
							colour={space.colour}
							isFilled={isSelected}
						/>
					</button>
				)
			})}
		</span>
	)
}

export {
	badgeElsewhere,
	SpaceDots,
	SpaceMenuRows,
	SpaceSwitcher,
	type SpaceSwitcherProps,
}
