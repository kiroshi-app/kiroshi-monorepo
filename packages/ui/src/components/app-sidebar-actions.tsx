import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import type { AppRailPanel } from "@workspace/ui/components/app-rail"
import { ContextMenuPressTrigger } from "@workspace/ui/components/context-menu-press-trigger"
import { Icons } from "@workspace/ui/components/icons"
import { TooltipButton } from "@workspace/ui/components/tooltip-button"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@workspace/ui/components/ui/context-menu"
import { Kbd } from "@workspace/ui/components/ui/kbd"
import { SidebarHeader } from "@workspace/ui/components/ui/sidebar"
import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"

const HEADER = "left-column-inset py-0"

const HEADER_ROW =
	"left-column-header flex items-center justify-between ps-2 pe-0.5"

const HEADER_TITLE =
	"min-w-0 truncate font-semibold text-foreground text-reading leading-4.5 tracking-[-0.01em]"

const HEADER_ACTIONS = "flex items-center gap-0.5"

const HEADER_ACTION = "rounded-md text-muted-foreground [&_svg]:stroke-2!"

const ROSTER_SURFACE = "min-h-10 flex-1"

type SidebarSearchButtonProps = { onOpenSearch: () => void }

const SidebarSearchButton = ({ onOpenSearch }: SidebarSearchButtonProps) => {
	const { t } = useTranslation("search")
	const label = t("open")

	return (
		<TooltipButton
			aria-label={label}
			className={HEADER_ACTION}
			onClick={onOpenSearch}
			size="icon-sm"
			tooltip={
				<>
					{label}
					<Kbd>{t("chord")}</Kbd>
				</>
			}
			tooltipSide="bottom"
			variant="ghost"
		>
			<Icons.Search aria-hidden="true" />
		</TooltipButton>
	)
}

interface CreateItemsProps {
	onCreateBot?: () => void
	onCreateConversation?: () => void
	onCreateSection?: () => void
}

const CreateItems = ({
	onCreateBot,
	onCreateConversation,
	onCreateSection,
}: CreateItemsProps) => {
	const { t } = useTranslation("bots")

	return (
		<>
			{onCreateBot ? (
				<ContextMenuItem onClick={onCreateBot}>
					<Icons.User aria-hidden="true" className="size-3.5" />
					{t("roster.create")}
				</ContextMenuItem>
			) : null}
			{onCreateConversation ? (
				<ContextMenuItem onClick={onCreateConversation}>
					<Icons.Message aria-hidden="true" className="size-3.5" />
					{t("roster.conversation.create")}
				</ContextMenuItem>
			) : null}
			{onCreateSection ? (
				<ContextMenuItem onClick={onCreateSection}>
					<Icons.Folder aria-hidden="true" className="size-3.5" />
					{t("roster.section.create")}
				</ContextMenuItem>
			) : null}
		</>
	)
}

interface RosterSurfaceProps extends CreateItemsProps {
	children?: ReactNode
}

const RosterSurface = ({
	onCreateBot,
	onCreateConversation,
	onCreateSection,
	children,
}: RosterSurfaceProps) => {
	const { t } = useTranslation("bots")

	if (!onCreateBot && !onCreateConversation && !onCreateSection)
		return <>{children}</>

	return (
		<ContextMenu>
			<ContextMenuTrigger className={ROSTER_SURFACE} data-slot="roster-surface">
				{children}
			</ContextMenuTrigger>
			<ContextMenuContent
				aria-label={t("roster.createMenu")}
				className={STILL_UNDER_REDUCED_MOTION}
			>
				<CreateItems
					onCreateBot={onCreateBot}
					onCreateConversation={onCreateConversation}
					onCreateSection={onCreateSection}
				/>
			</ContextMenuContent>
		</ContextMenu>
	)
}

const CreateMenu = (items: CreateItemsProps) => {
	const { t } = useTranslation("bots")
	const label = t("roster.createMenu")

	return (
		<ContextMenu>
			<ContextMenuPressTrigger
				render={
					<TooltipButton
						aria-label={label}
						className={HEADER_ACTION}
						size="icon-sm"
						tooltip={label}
						tooltipSide="bottom"
						variant="ghost"
					>
						<Icons.Add aria-hidden="true" />
					</TooltipButton>
				}
			/>
			<ContextMenuContent
				aria-label={label}
				className={STILL_UNDER_REDUCED_MOTION}
			>
				<CreateItems {...items} />
			</ContextMenuContent>
		</ContextMenu>
	)
}

interface RosterHeaderActionsProps extends CreateItemsProps {
	onOpenSearch?: () => void
}

const RosterHeaderActions = ({
	onOpenSearch,
	onCreateBot,
	onCreateConversation,
	onCreateSection,
}: RosterHeaderActionsProps) => {
	const { t } = useTranslation("bots")
	const createLabel = t("roster.create")

	return (
		<div className={HEADER_ACTIONS}>
			{onOpenSearch ? (
				<SidebarSearchButton onOpenSearch={onOpenSearch} />
			) : null}
			{onCreateConversation ? (
				<CreateMenu
					onCreateBot={onCreateBot}
					onCreateConversation={onCreateConversation}
					onCreateSection={onCreateSection}
				/>
			) : (
				<TooltipButton
					aria-label={createLabel}
					className={HEADER_ACTION}
					onClick={onCreateBot}
					size="icon-sm"
					tooltip={createLabel}
					tooltipSide="bottom"
					variant="ghost"
				>
					<Icons.Add aria-hidden="true" />
				</TooltipButton>
			)}
		</div>
	)
}

interface MissionsHeaderActionsProps {
	onSearchMissions: () => void
}

const MissionsHeaderActions = ({
	onSearchMissions,
}: MissionsHeaderActionsProps) => {
	const { t } = useTranslation("bots")

	return (
		<div className={HEADER_ACTIONS}>
			<TooltipButton
				aria-label={t("rail.searchMissions")}
				className={HEADER_ACTION}
				onClick={onSearchMissions}
				size="icon-sm"
				tooltip={t("rail.searchMissions")}
				tooltipSide="bottom"
				variant="ghost"
			>
				<Icons.Search aria-hidden="true" />
			</TooltipButton>
		</div>
	)
}

interface AppSidebarHeaderProps extends RosterHeaderActionsProps {
	panel: AppRailPanel
	onSearchMissions?: () => void
}

const AppSidebarHeader = ({
	panel,
	onSearchMissions,
	...roster
}: AppSidebarHeaderProps) => {
	const { t } = useTranslation("bots")

	return (
		<SidebarHeader className={HEADER}>
			<div className={HEADER_ROW}>
				<h2 className={HEADER_TITLE}>{t(`rail.${panel}`)}</h2>
				{panel === "conversations" ? <RosterHeaderActions {...roster} /> : null}
				{panel === "missions" && onSearchMissions ? (
					<MissionsHeaderActions onSearchMissions={onSearchMissions} />
				) : null}
			</div>
		</SidebarHeader>
	)
}

export { AppSidebarHeader, RosterSurface, type RosterSurfaceProps }
