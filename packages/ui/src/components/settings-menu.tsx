"use client"

import { type ReactNode, useRef } from "react"
import { useTranslation } from "react-i18next"

import type { BotMcpConnectionState } from "@workspace/ui/components/bot-settings"
import { MCP_CONNECTION_DOT } from "@workspace/ui/components/bot-settings-dialog/mcp-connection"
import {
	type FillIconName,
	FillIcons,
	Icons,
} from "@workspace/ui/components/icons"
import { ApplicationMark } from "@workspace/ui/components/plugin-settings/application-mark"
import { useOverlayScrollbars } from "@workspace/ui/hooks/use-overlay-scrollbars"
import { cn } from "@workspace/ui/lib/utils"

const MENU =
	"peer flex w-62 shrink-0 flex-col gap-3 rounded-s-control border-y border-s border-e border-shell-border border-e-shell-divider bg-card p-3"

const FOCUS_RING = "outline-none focus-visible:ring-2 focus-visible:ring-ring"

const ROW = `flex w-full min-w-0 cursor-pointer items-center gap-2.5 p-2 text-start select-none ${FOCUS_RING}`

const BACK = `${ROW} rounded-control font-medium text-compact text-muted-foreground leading-4.5 hover:bg-muted hover:text-foreground`

const ENTRY = `${ROW} rounded-control text-muted-foreground text-sm hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground data-open:font-medium data-open:text-foreground`

const DANGER_ENTRY =
	"text-destructive hover:bg-destructive/10 hover:text-destructive aria-[current=page]:bg-destructive/10 aria-[current=page]:text-destructive"

const SUB_ENTRY = `${ROW} rounded-lg text-compact text-muted-foreground leading-4.5 hover:bg-muted hover:text-foreground aria-[current=page]:bg-muted aria-[current=page]:font-medium aria-[current=page]:text-foreground`

const ROW_DOT = "pointer-events-none size-1.5 shrink-0 rounded-full"

const ROW_LABEL = "min-w-0 flex-1 truncate"

type SettingsMenuProps = {
	avatar: ReactNode
	name: string
	subtitle: string
	onBack: () => void
	footer?: ReactNode
	children: ReactNode
}

const SettingsMenu = ({
	avatar,
	name,
	subtitle,
	onBack,
	footer,
	children,
}: SettingsMenuProps) => {
	const { t } = useTranslation("settings")
	const list = useRef<HTMLDivElement>(null)
	useOverlayScrollbars(list)

	return (
		<nav
			aria-label={t("screen.menu")}
			className={MENU}
			data-slot="settings-menu"
		>
			<button className={BACK} onClick={onBack} type="button">
				<Icons.Previous aria-hidden="true" className="size-4 shrink-0" />
				{t("screen.back")}
			</button>
			<div className="flex min-w-0 items-center gap-2.5 px-2">
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
		</nav>
	)
}

type SettingsMenuEntryProps = {
	icon: FillIconName
	label: string
	isSelected: boolean
	isOpen?: boolean
	isDanger?: boolean
	hasIndicator?: boolean
	onSelect: () => void
	children?: ReactNode
}

const SettingsMenuEntry = ({
	icon,
	label,
	isSelected,
	isOpen = false,
	isDanger = false,
	hasIndicator = false,
	onSelect,
	children,
}: SettingsMenuEntryProps) => {
	const EntryIcon = (isSelected || isOpen ? FillIcons : Icons)[icon]

	return (
		<li className="flex flex-col gap-0.5">
			<button
				aria-current={isSelected ? "page" : undefined}
				className={cn(ENTRY, isDanger && DANGER_ENTRY)}
				data-open={isOpen ? "" : undefined}
				onClick={onSelect}
				type="button"
			>
				<EntryIcon aria-hidden="true" className="size-4 shrink-0" />
				<span className={ROW_LABEL}>{label}</span>
				{hasIndicator ? (
					<span
						aria-hidden="true"
						className={cn(ROW_DOT, "bg-primary")}
						data-slot="settings-menu-indicator"
					/>
				) : null}
			</button>
			{children ? (
				<ul className="ms-4.5 flex list-none flex-col gap-0.5 p-0">
					{children}
				</ul>
			) : null}
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
							className={cn(ROW_DOT, MCP_CONNECTION_DOT[connection])}
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

export {
	SettingsMenu,
	SettingsMenuAddApplication,
	SettingsMenuApplication,
	SettingsMenuEntry,
}
