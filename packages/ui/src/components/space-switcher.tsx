"use client"

import { type ReactNode, useLayoutEffect, useRef } from "react"
import { useTranslation } from "react-i18next"

import {
	type BotBadge,
	BotBadgeDot,
	botBadgeRingVariants,
} from "@workspace/ui/components/bot-badge"
import {
	type BotAvatarBlot,
	blotTint,
} from "@workspace/ui/components/companion-colour"
import {
	ContextMenuPressTrigger,
	openBelow,
} from "@workspace/ui/components/context-menu-press-trigger"
import {
	HostDot,
	HostPill,
	type SpaceHost,
} from "@workspace/ui/components/host-pill"
import { Icons } from "@workspace/ui/components/icons"
import type { Space } from "@workspace/ui/components/space"
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
	useRosterLift,
} from "@workspace/ui/hooks/use-roster-lift"
import { SPACE_RANK_LIMIT } from "@workspace/ui/hooks/use-space-shortcut"
import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"
import { cn } from "@workspace/ui/lib/utils"

const SWITCHER =
	"relative h-8 min-w-0 max-w-64 shrink gap-2 rounded-md px-2 font-normal text-compact text-muted-foreground leading-4 aria-expanded:bg-sidebar-accent aria-expanded:[--host-dot-surface:var(--color-sidebar-accent)]"

const SWITCHER_NAME = "min-w-0 truncate"

type SpaceSquareSize = "dot" | "menu" | "avatar" | "header"

type SpaceSquareStyle = {
	square: string
	hostDot: string
}

const SPACE_SQUARE_STYLE = {
	dot: {
		square: "relative rounded-[3px]",
		hostDot:
			"absolute -end-[3.5px] -bottom-[3.5px] ring-2 ring-(--host-dot-surface,var(--shell-surface,var(--background)))",
	},
	menu: {
		square: "relative size-3.5 rounded-[4px]",
		hostDot:
			"absolute -end-[3px] -bottom-[3px] size-2 ring-[1.5px] ring-(--host-dot-surface,var(--color-card))",
	},
	avatar: {
		square: "relative size-9 rounded-[11px]",
		hostDot:
			"absolute -end-0.5 -bottom-0.5 size-2.5 ring-2 ring-(--host-dot-surface) [--host-dot-surface:var(--color-card)]",
	},
	header: {
		square: "relative size-12 rounded-[13px]",
		hostDot:
			"absolute -end-0.75 -bottom-0.75 size-3.5 ring-2 ring-(--host-dot-surface) [--host-dot-surface:var(--color-card)]",
	},
} as const satisfies Record<SpaceSquareSize, SpaceSquareStyle>

const SWITCHER_CHEVRON = "size-3 shrink-0 stroke-2!"

const SWITCHER_INVITATION =
	"pointer-events-none absolute end-0.25 top-1 size-1.75 rounded-full bg-primary-strong ring-2 ring-(--shell-surface,var(--background))"

const MENU_RESTING = "max-w-64"

const MENU_INVITED = "w-70"

const ROW =
	"[--host-dot-surface:var(--color-popover)] focus:[--host-dot-surface:var(--color-accent)]"

const ROW_NAME = "min-w-0 grow truncate"

const DOT = "h-2.5 w-2.5 shrink-0 rounded-full"

const DOTS =
	"flex flex-wrap items-center justify-center group-data-[collapsible=icon]:hidden"

const DOT_BUTTON =
	"group/space-dot relative grid size-5 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/40"

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

const strongestBadge = (badges: (BotBadge | undefined)[]) =>
	BADGE_RANK.find((badge) => badges.includes(badge))

const placedOrder = (spaces: Space[], id: string, at: number) => {
	const order = spaces
		.filter((space) => space.id !== id)
		.map((space) => space.id)
	order.splice(at, 0, id)
	return order.every((held, rank) => held === spaces[rank]?.id) ? null : order
}

type SpaceDotProps = {
	colour?: BotAvatarBlot | null
	badge?: BotBadge
	isFilled?: boolean
	className?: string
	children?: ReactNode
}

const SpaceDot = ({
	colour,
	badge,
	isFilled = true,
	className,
	children,
}: SpaceDotProps) => {
	const tint = isFilled && colour ? blotTint(colour) : undefined

	return (
		<span
			aria-hidden="true"
			className={cn(
				DOT,
				DOT_MOTION,
				!tint && DOT_UNTINTED,
				badge && botBadgeRingVariants({ badge }),
				className,
			)}
			data-badge={badge}
			data-slot="space-dot"
			style={tint ? { backgroundColor: tint } : undefined}
		>
			{children}
		</span>
	)
}

type SpaceSelection = {
	spaces: Space[]
	selectedSpaceId?: string
	badgesBySpaceId?: Record<string, BotBadge>
	onSelectSpace?: (id: string) => void
	onReorderSpaces?: (ids: string[]) => void
}

type SpaceSquareProps = {
	colour?: BotAvatarBlot | null
	badge?: BotBadge
	host?: SpaceHost
	size?: SpaceSquareSize
	isInvitation?: boolean
}

const SpaceSquare = ({
	colour,
	badge,
	host,
	size = "dot",
	isInvitation = false,
}: SpaceSquareProps) => {
	const style = SPACE_SQUARE_STYLE[size]

	return (
		<SpaceDot
			badge={badge}
			className={cn(style.square, isInvitation && "bg-transparent")}
			colour={colour}
			isFilled={!isInvitation}
		>
			{isInvitation ? (
				<span
					className="pointer-events-none absolute inset-0 rounded-[inherit] border-[1.5px] border-muted-foreground border-dashed"
					data-slot="space-invitation-outline"
					style={colour ? { borderColor: blotTint(colour) } : undefined}
				/>
			) : null}
			{host ? <HostDot className={style.hostDot} host={host} /> : null}
		</SpaceDot>
	)
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
		: strongestBadge(
				spaces
					.filter((space) => space.id !== selected.id)
					.map((space) => badgesBySpaceId?.[space.id]),
			)

	return (
		<>
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
							<SpaceSquare colour={selected.colour} host={host} />
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
					<ContextMenuRadioGroup
						onValueChange={(value) => onSelectSpace?.(value)}
						value={selected.id}
					>
						{spaces.map((space, index) => {
							const rowHost = hostBySpaceId?.[space.id]
							return (
								<ContextMenuRadioItem
									className={ROW}
									closeOnClick
									key={space.id}
									label={space.name}
									value={space.id}
								>
									<SpaceSquare
										badge={badgesBySpaceId?.[space.id]}
										colour={space.colour}
										host={rowHost}
									/>
									<span className={ROW_NAME}>{space.name}</span>
									{rowHost ? (
										<span className="sr-only">
											{t(`spaces.host.${rowHost}`)}
										</span>
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
			{host === "connecting" || host === "down" ? (
				<HostPill host={host} />
			) : null}
		</>
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

	if (spaces.length < 2) return null

	const liftedId = lift.lift?.id
	const insertion = lift.lift?.landing ?? null
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
	SpaceDot,
	SpaceDots,
	SpaceSquare,
	SpaceSwitcher,
	type SpaceSwitcherProps,
}
