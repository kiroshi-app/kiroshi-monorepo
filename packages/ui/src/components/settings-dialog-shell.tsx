"use client"

import { Tabs } from "@base-ui/react/tabs"
import { type ReactNode, useState } from "react"
import { useTranslation } from "react-i18next"

import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { DialogSurface } from "@workspace/ui/components/dialog-surface"
import { Icons } from "@workspace/ui/components/icons"
import type {
	SessionPages,
	SettingsPages,
} from "@workspace/ui/components/plugin-settings/settings-pages"
import {
	RAIL_LABELS_MIN_WIDTH,
	SettingsRail,
} from "@workspace/ui/components/settings-rail"
import { SETTINGS_HEADER_CLASS } from "@workspace/ui/components/settings-styles"
import { Dialog, DialogTitle } from "@workspace/ui/components/ui/dialog"
import { useIsNarrowerThan } from "@workspace/ui/hooks/use-is-narrower-than"
import { useSettingsTab } from "@workspace/ui/hooks/use-settings-tab"
import { cn } from "@workspace/ui/lib/utils"

type SettingsSession = {
	pages: SessionPages
	isUnsaved?: boolean
	discard: () => void
}

const WORDED_SESSION_KINDS = ["skills", "applications"] as const

type WordedSessionKind = (typeof WORDED_SESSION_KINDS)[number]

type SettingsSessions = Partial<
	Record<WordedSessionKind | "history", SettingsSession>
>

type SettingsDialogShellProps = {
	open: boolean
	onClose: () => void
	tab: string
	onTabChange?: (tab: string) => void
	mark: ReactNode
	name: string
	breadcrumb: string
	pages?: SettingsPages
	sessions?: SettingsSessions
	rail: (iconsOnly: boolean) => ReactNode
	children: ReactNode
	className?: string
}

const DEFAULT_LEAVE_KIND: WordedSessionKind = "skills"

const wordedKindOf = (sessions: SettingsSessions, pages?: SettingsPages) => {
	const top = pages?.top
	const holder = WORDED_SESSION_KINDS.find(
		(kind) => top && top in (sessions[kind]?.pages ?? {}),
	)
	return holder ?? DEFAULT_LEAVE_KIND
}

const SettingsDialogShell = ({
	open,
	onClose,
	tab,
	onTabChange,
	mark,
	name,
	breadcrumb,
	pages,
	sessions = {},
	rail,
	children,
	className,
}: SettingsDialogShellProps) => {
	const { t } = useTranslation("bots")
	const [tabs, setTabs] = useState<HTMLDivElement | null>(null)
	const [isLeaving, setLeaving] = useState(false)
	const iconsOnly = useIsNarrowerThan(tabs, RAIL_LABELS_MIN_WIDTH)
	const activeTab = useSettingsTab(open, tab, onTabChange)
	const declared = Object.values(sessions)
	const wordedKind = wordedKindOf(sessions, pages)

	const leave = () => {
		for (const session of declared) session.discard()
		onClose()
	}

	const close = () =>
		declared.some((session) => session.isUnsaved) ? setLeaving(true) : leave()

	return (
		<Dialog onOpenChange={(next) => !next && close()} open={open}>
			<DialogSurface
				className={cn(
					"h-[34rem] w-[52rem] gap-0 overflow-hidden p-0",
					className,
				)}
			>
				<header className={SETTINGS_HEADER_CLASS}>
					{mark}
					<DialogTitle className="flex min-w-0 items-center gap-1.5 pr-0 font-semibold">
						<span className="truncate">{name}</span>
						<Icons.Next
							aria-hidden="true"
							className="size-3.5 shrink-0 text-muted-foreground"
						/>
						<span className="shrink-0 text-muted-foreground">{breadcrumb}</span>
					</DialogTitle>
				</header>

				{pages?.shown(
					declared.reduce<SessionPages>(
						(shown, session) => ({ ...shown, ...session.pages }),
						{},
					),
				) ?? (
					<Tabs.Root
						className="flex min-h-0 flex-1"
						onValueChange={activeTab.onValueChange}
						orientation="vertical"
						value={activeTab.value}
						ref={setTabs}
					>
						<SettingsRail iconsOnly={iconsOnly}>{rail(iconsOnly)}</SettingsRail>
						{children}
					</Tabs.Root>
				)}

				<ConfirmDialog
					confirmLabel={t(`${wordedKind}.leave.action`)}
					description={t(`${wordedKind}.leave.description`)}
					onConfirm={leave}
					onOpenChange={setLeaving}
					open={isLeaving}
					title={t(`${wordedKind}.leave.title`)}
				/>
			</DialogSurface>
		</Dialog>
	)
}

export {
	SettingsDialogShell,
	type SettingsDialogShellProps,
	type SettingsSession,
	wordedKindOf,
}
