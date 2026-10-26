"use client"

import { type ReactNode, useId, useRef } from "react"
import { useTranslation } from "react-i18next"

import { BotTitleBadge } from "@workspace/ui/components/bot-badge"
import type { BotMcpConnectionState } from "@workspace/ui/components/bot-settings"
import { MCP_CONNECTION_DOT } from "@workspace/ui/components/bot-settings-dialog/mcp-connection"
import type { BotAvatarBlot } from "@workspace/ui/components/companion-colour"
import type { SpaceHost } from "@workspace/ui/components/host-pill"
import {
	type FillIconName,
	FillIcons,
	Icons,
} from "@workspace/ui/components/icons"
import { ApplicationMark } from "@workspace/ui/components/plugin-settings/application-mark"
import { SidebarListRow } from "@workspace/ui/components/sidebar-list-row"
import { SpaceSquare } from "@workspace/ui/components/space-switcher"
import { Badge } from "@workspace/ui/components/ui/badge"
import { useOverlayScrollbars } from "@workspace/ui/hooks/use-overlay-scrollbars"
import { cn } from "@workspace/ui/lib/utils"

const MENU =
	"peer relative flex w-(--sidebar-width) shrink-0 flex-col gap-3 rounded-s-control border-y border-s border-e border-shell-border border-e-shell-divider bg-card p-3"

const FOCUS_RING = "outline-none focus-visible:ring-2 focus-visible:ring-ring"

const ROW = `flex w-full min-w-0 cursor-pointer items-center gap-2.5 p-2 text-start select-none ${FOCUS_RING}`

const BACK = `${ROW} rounded-control font-medium text-compact text-muted-foreground leading-4.5 hover:bg-muted hover:text-foreground`

const ENTRY = `${ROW} rounded-control text-muted-foreground text-sm hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground data-open:font-medium data-open:text-foreground`

const DANGER_ENTRY =
	"text-destructive hover:bg-destructive-tint hover:text-destructive-tint-foreground aria-[current=page]:bg-destructive-tint aria-[current=page]:text-destructive-tint-foreground"

const DISABLED_ENTRY = "disabled:pointer-events-none disabled:opacity-40"

const ACTION_TONE = {
	danger: DANGER_ENTRY,
	quiet: "text-soft-foreground [&>svg]:text-muted-foreground",
} as const

type SettingsMenuActionTone = keyof typeof ACTION_TONE

const SUB_ENTRY = `${ROW} rounded-lg text-compact text-muted-foreground leading-4.5 hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground`

const ROW_DOT = "pointer-events-none size-1.5 shrink-0 rounded-full"

const ROW_LABEL = "min-w-0 flex-1 truncate"

const ENTRY_COUNT = "bg-card text-muted-foreground tabular-nums transition-none"

const SECTION = "flex flex-col not-first:pt-4"

const SECTION_TITLE_ROW = "flex min-h-8 items-center gap-2 px-2 pb-1"

const SECTION_TITLE =
	"min-w-0 flex-1 truncate font-medium text-muted-foreground text-xs leading-4"

const SECTION_ACTION = `grid size-6 shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground ${FOCUS_RING}`

const SPACE_ROW =
	"[--host-dot-surface:var(--color-card)] hover:[--host-dot-surface:var(--color-muted)]"

const SPACE_INVITATION_MEDIA =
	"size-3.5 rounded-[4px] border border-warning border-dashed"

const SPACE_TRAILING = "ms-auto flex shrink-0 items-center gap-1.5"

const SPACE_PILL = "basis-auto py-0.75"

const SPACE_INVITATION_PILL = "bg-warning/15 text-warning"

const SPACE_ATTENTION_DOT =
	"pointer-events-none size-1.75 rounded-full bg-warning"

type SettingsMenuProps = {
	avatar: ReactNode
	name: string
	subtitle: string
	onBack: () => void
	backLabel?: string
	footer?: ReactNode
	resizeHandle?: ReactNode
	isCompanionPage?: boolean
	children: ReactNode
}

const SettingsMenu = ({
	avatar,
	name,
	subtitle,
	onBack,
	backLabel,
	footer,
	resizeHandle,
	isCompanionPage = false,
	children,
}: SettingsMenuProps) => {
	const { t } = useTranslation("settings")
	const list = useRef<HTMLDivElement>(null)
	useOverlayScrollbars(list)

	return (
		<nav
			aria-label={t("screen.menu")}
			className={MENU}
			data-companion-page={isCompanionPage ? "" : undefined}
			data-slot="settings-menu"
		>
			<button className={BACK} onClick={onBack} type="button">
				<Icons.Previous aria-hidden="true" className="size-4 shrink-0" />
				{backLabel ?? t("screen.back")}
			</button>
			<div
				className="flex min-w-0 items-center gap-2.5"
				data-slot="settings-menu-header"
			>
				{avatar}
				<div className="flex min-w-0 flex-col">
					<span
						className="truncate font-semibold text-foreground text-sm"
						data-slot="settings-menu-name"
					>
						{name}
					</span>
					<span className="truncate text-muted-foreground text-xs">
						{subtitle}
					</span>
				</div>
			</div>
			<div
				className="-m-0.5 min-h-0 flex-1 overflow-y-auto p-0.5"
				data-slot="settings-menu-entries"
				ref={list}
			>
				<ul className="flex list-none flex-col gap-0.5 p-0">{children}</ul>
			</div>
			{footer ? (
				<ul className="flex shrink-0 list-none flex-col gap-1 p-0">
					<li aria-hidden="true" className="mx-1 h-px bg-border" />
					{footer}
				</ul>
			) : null}
			{resizeHandle}
		</nav>
	)
}

type SettingsMenuEntryProps = {
	icon: FillIconName
	label: string
	isSelected: boolean
	isOpen?: boolean
	isDanger?: boolean
	isDisabled?: boolean
	isOutlined?: boolean
	hasIndicator?: boolean
	count?: number
	onSelect: () => void
	children?: ReactNode
}

const SettingsMenuEntry = ({
	icon,
	label,
	isSelected,
	isOpen = false,
	isDanger = false,
	isDisabled = false,
	isOutlined = false,
	hasIndicator = false,
	count,
	onSelect,
	children,
}: SettingsMenuEntryProps) => {
	const isFilled = (isSelected || isOpen) && !isOutlined
	const EntryIcon = (isFilled ? FillIcons : Icons)[icon]

	return (
		<li className="flex flex-col gap-0.5">
			<button
				aria-current={isSelected ? "page" : undefined}
				className={cn(ENTRY, isDanger && DANGER_ENTRY, DISABLED_ENTRY)}
				data-open={isOpen ? "" : undefined}
				disabled={isDisabled}
				onClick={onSelect}
				type="button"
			>
				<EntryIcon aria-hidden="true" className="size-4 shrink-0" />
				<span className={ROW_LABEL}>{label}</span>
				{hasIndicator ? (
					<span
						aria-hidden="true"
						className={cn(ROW_DOT, "bg-primary-strong")}
						data-slot="settings-menu-indicator"
					/>
				) : null}
				{count === undefined || isDisabled ? null : (
					<Badge
						className={ENTRY_COUNT}
						data-slot="settings-menu-count"
						variant="outline"
					>
						{count}
					</Badge>
				)}
			</button>
			{children ? (
				<ul className="ms-4.5 flex list-none flex-col gap-0.5 p-0">
					{children}
				</ul>
			) : null}
		</li>
	)
}

type SettingsMenuActionProps = {
	icon: keyof typeof Icons
	label: string
	tone: SettingsMenuActionTone
	onSelect: () => void
}

const SettingsMenuAction = ({
	icon,
	label,
	tone,
	onSelect,
}: SettingsMenuActionProps) => {
	const ActionIcon = Icons[icon]

	return (
		<li>
			<button
				className={cn(ENTRY, ACTION_TONE[tone])}
				onClick={onSelect}
				type="button"
			>
				<ActionIcon aria-hidden="true" className="size-4 shrink-0" />
				<span className={ROW_LABEL}>{label}</span>
			</button>
		</li>
	)
}

type SettingsMenuApplicationProps = {
	name: string
	mark?: string
	connection?: BotMcpConnectionState
	isSelected: boolean
	onSelect: () => void
}

const SettingsMenuApplication = ({
	name,
	mark,
	connection,
	isSelected,
	onSelect,
}: SettingsMenuApplicationProps) => {
	const { t } = useTranslation("bots")

	return (
		<li>
			<button
				aria-current={isSelected ? "page" : undefined}
				className={SUB_ENTRY}
				onClick={onSelect}
				type="button"
			>
				<ApplicationMark mark={mark} size="xs" />
				<span className={ROW_LABEL}>{name}</span>
				{connection ? (
					<>
						<span className="sr-only">
							{t(`applications.connection.state.${connection}`)}
						</span>
						<span
							aria-hidden="true"
							className={cn(
								ROW_DOT,
								MCP_CONNECTION_DOT[connection],
								connection === "connected" &&
									"in-data-companion-page:bg-presence-online",
							)}
							data-connection={connection}
							data-slot="settings-menu-connection"
						/>
					</>
				) : null}
			</button>
		</li>
	)
}

type SettingsMenuAddApplicationProps = {
	onAdd: () => void
}

const SettingsMenuAddApplication = ({
	onAdd,
}: SettingsMenuAddApplicationProps) => {
	const { t } = useTranslation("bots")

	return (
		<li>
			<button className={SUB_ENTRY} onClick={onAdd} type="button">
				<span className="flex size-5 shrink-0 items-center justify-center">
					<Icons.Add aria-hidden="true" className="size-4" />
				</span>
				<span className={ROW_LABEL}>{t("applications.add")}</span>
			</button>
		</li>
	)
}

type SettingsMenuSectionProps = {
	title: string
	action?: ReactNode
	children?: ReactNode
}

const SettingsMenuSection = ({
	title,
	action,
	children,
}: SettingsMenuSectionProps) => {
	const titleId = useId()

	return (
		<li className={SECTION} data-slot="settings-menu-section">
			<div className={SECTION_TITLE_ROW}>
				<span className={SECTION_TITLE} id={titleId}>
					{title}
				</span>
				{action}
			</div>
			<ul
				aria-labelledby={titleId}
				className="flex list-none flex-col gap-0.5 p-0"
			>
				{children}
			</ul>
		</li>
	)
}

type SettingsMenuAddSpaceProps = {
	onAdd: () => void
}

const SettingsMenuAddSpace = ({ onAdd }: SettingsMenuAddSpaceProps) => {
	const { t } = useTranslation("bots")

	return (
		<button
			aria-label={t("spaces.create")}
			className={SECTION_ACTION}
			data-slot="settings-menu-add-space"
			onClick={onAdd}
			type="button"
		>
			<Icons.Add aria-hidden="true" className="size-3.5" />
		</button>
	)
}

type SettingsMenuSpaceProps = {
	name: string
	colour?: BotAvatarBlot | null
	host?: SpaceHost
	isCurrent?: boolean
	isInvitation?: boolean
	hasAttention?: boolean
	onOpen: () => void
}

const SettingsMenuSpace = ({
	name,
	colour,
	host,
	isCurrent = false,
	isInvitation = false,
	hasAttention = false,
	onOpen,
}: SettingsMenuSpaceProps) => {
	const { t } = useTranslation(["settings", "bots"])

	return (
		<li className={SPACE_ROW}>
			<SidebarListRow
				aria-current={isCurrent ? "true" : undefined}
				geometry="menu"
				media={
					isInvitation ? (
						<span
							aria-hidden="true"
							className={SPACE_INVITATION_MEDIA}
							data-slot="settings-menu-space-invitation"
						/>
					) : (
						<SpaceSquare colour={colour} host={host} size="menu" />
					)
				}
				name={name}
				onSelect={onOpen}
				trailing={
					<span className={SPACE_TRAILING}>
						{host ? (
							<span className="sr-only">{t(`bots:spaces.host.${host}`)}</span>
						) : null}
						{isCurrent ? (
							<BotTitleBadge
								className={SPACE_PILL}
								data-slot="settings-menu-space-current"
								title={t("settings:screen.space.current")}
							/>
						) : null}
						{isInvitation ? (
							<BotTitleBadge
								className={cn(SPACE_PILL, SPACE_INVITATION_PILL)}
								data-slot="settings-menu-space-invitation-pill"
								title={t("settings:screen.space.invitation")}
							/>
						) : null}
						{hasAttention ? (
							<>
								<span className="sr-only">{t("bots:roster.needsYou")}</span>
								<span
									aria-hidden="true"
									className={SPACE_ATTENTION_DOT}
									data-slot="settings-menu-space-attention"
								/>
							</>
						) : null}
					</span>
				}
			/>
		</li>
	)
}

export {
	SettingsMenu,
	SettingsMenuAction,
	SettingsMenuAddApplication,
	SettingsMenuAddSpace,
	SettingsMenuApplication,
	SettingsMenuEntry,
	SettingsMenuSection,
	SettingsMenuSpace,
}
