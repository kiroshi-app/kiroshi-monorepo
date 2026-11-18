"use client"

import { useId } from "react"
import { useTranslation } from "react-i18next"

import {
	APP_HEADER_TITLE,
	AppHeader,
	AppHeaderText,
} from "@workspace/ui/components/app-header"
import { ContextMenuPressTrigger } from "@workspace/ui/components/context-menu-press-trigger"
import { EmptyStateShell } from "@workspace/ui/components/empty-state-shell"
import { Icons } from "@workspace/ui/components/icons"
import { BarAction } from "@workspace/ui/components/library-panel"
import {
	ListSkeleton,
	SkeletonBar,
} from "@workspace/ui/components/list-skeleton"
import { Notice } from "@workspace/ui/components/notice"
import { SpacesBranch } from "@workspace/ui/components/roster-menu-items"
import { ScreenLayout } from "@workspace/ui/components/screen-layout"
import type { Space } from "@workspace/ui/components/space"
import {
	CompanionCard,
	type CompanionSummary,
} from "@workspace/ui/components/space-settings-dialog/companions-section"
import { Button } from "@workspace/ui/components/ui/button"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
} from "@workspace/ui/components/ui/context-menu"
import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"
import { cn } from "@workspace/ui/lib/utils"

const LINE = "text-compact leading-4"

const CREATE_BUTTON = cn("border-input text-foreground transition-none", LINE)

const ACTIONS_BUTTON = "text-muted-foreground transition-none"

const GRID = "grid @4xl:grid-cols-3 @xl:grid-cols-2 grid-cols-1 gap-4"

const SKELETON_LINE = "border-border/60"

const SKELETON_CARDS_PER_ROW = ["a", "b", "c", "d", "e", "f"]

type AgentsPageStatus = "loaded" | "loading" | "failed"

type AgentsPageAgent = CompanionSummary & {
	memberships: string[]
}

type AgentsPageProps = {
	agents: AgentsPageAgent[]
	spaceName: string
	status?: AgentsPageStatus
	spaces: Space[]
	openSpaceId?: string
	onSelect: (id: string) => void
	onCreate: () => void
	onRetry?: () => void
	onOpenInNewTab: (id: string) => void
	onDuplicate: (id: string) => void
	onAddToSpace: (agentId: string, spaceId: string) => void
	onRemoveFromSpace: (agentId: string, spaceId: string) => void
	onDelete: (id: string) => void
}

type CreateAgentButtonProps = Pick<AgentsPageProps, "onCreate">

const CreateAgentButton = ({ onCreate }: CreateAgentButtonProps) => {
	const { t } = useTranslation("settings")

	return (
		<Button className={CREATE_BUTTON} onClick={onCreate} variant="outline">
			<Icons.Add aria-hidden="true" className="size-3.5" />
			{t("space.agents.create")}
		</Button>
	)
}

type AgentActionsProps = Pick<
	AgentsPageProps,
	| "spaces"
	| "openSpaceId"
	| "onSelect"
	| "onOpenInNewTab"
	| "onDuplicate"
	| "onAddToSpace"
	| "onRemoveFromSpace"
	| "onDelete"
> & {
	agent: AgentsPageAgent
}

const AgentActions = ({
	agent,
	spaces,
	openSpaceId,
	onSelect,
	onOpenInNewTab,
	onDuplicate,
	onAddToSpace,
	onRemoveFromSpace,
	onDelete,
}: AgentActionsProps) => {
	const { t } = useTranslation("bots")
	const label = t("roster.actions", { name: agent.name })

	return (
		<ContextMenu>
			<ContextMenuPressTrigger
				edge="end"
				render={
					<Button
						aria-label={label}
						className={ACTIONS_BUTTON}
						data-slot="agents-page-actions"
						size="icon-sm"
						variant="ghost"
					>
						<Icons.More aria-hidden="true" />
					</Button>
				}
			/>
			<ContextMenuContent
				aria-label={label}
				className={cn("w-52", STILL_UNDER_REDUCED_MOTION)}
				side="inline-start"
			>
				<ContextMenuGroup>
					<ContextMenuLabel>
						{agent.title
							? t("roster.titled", { name: agent.name, title: agent.title })
							: agent.name}
					</ContextMenuLabel>
					<ContextMenuSeparator />
					<ContextMenuItem onClick={() => onSelect(agent.id)}>
						<Icons.Settings aria-hidden="true" className="size-3.5" />
						{t("roster.settings")}
					</ContextMenuItem>
					<ContextMenuItem onClick={() => onOpenInNewTab(agent.id)}>
						<Icons.ExternalLink aria-hidden="true" className="size-3.5" />
						{t("roster.openInNewTab")}
					</ContextMenuItem>
					<ContextMenuSeparator />
					<ContextMenuItem onClick={() => onDuplicate(agent.id)}>
						<Icons.Copy aria-hidden="true" className="size-3.5" />
						{t("roster.duplicate")}
					</ContextMenuItem>
					<SpacesBranch
						botId={agent.id}
						memberships={agent.memberships}
						onAddToSpace={onAddToSpace}
						onRemoveFromSpace={onRemoveFromSpace}
						openSpaceId={openSpaceId}
						spaces={spaces}
					/>
					<ContextMenuSeparator />
					<ContextMenuItem
						onClick={() => onDelete(agent.id)}
						variant="destructive"
					>
						<Icons.Delete aria-hidden="true" className="size-3.5" />
						{t("roster.delete")}
					</ContextMenuItem>
				</ContextMenuGroup>
			</ContextMenuContent>
		</ContextMenu>
	)
}

const AgentsPageSkeletonCard = () => (
	<div
		className={cn(
			"flex min-w-0 flex-col gap-3.5 rounded-xl border p-4",
			SKELETON_LINE,
		)}
		data-slot="agents-page-skeleton-card"
	>
		<div className="flex items-center gap-3">
			<SkeletonBar className="size-10 shrink-0 rounded-control" />
			<div className="flex min-w-0 items-center gap-2">
				<SkeletonBar className="h-2.5 w-18" />
				<SkeletonBar className="h-4.5 w-16" isFaint />
			</div>
		</div>
		<div className="flex h-10 flex-col justify-center gap-2.5">
			<SkeletonBar className="h-2.5 w-full" />
			<SkeletonBar className="h-2.5 w-[68%]" />
		</div>
		<div
			className={cn(
				"box-content flex h-4 items-center justify-between gap-3 border-t pt-3",
				SKELETON_LINE,
			)}
		>
			<SkeletonBar className="w-32" isFaint />
			<SkeletonBar className="w-16" isFaint />
		</div>
	</div>
)

const skeletonRowAt = (index: number) => (
	<div className="flex flex-col gap-4">
		{index === 0 ? (
			<div className="flex h-4.5 items-center">
				<SkeletonBar className="h-2.5 w-80 max-w-full" />
			</div>
		) : null}
		<div className={GRID}>
			{SKELETON_CARDS_PER_ROW.map((key) => (
				<AgentsPageSkeletonCard key={key} />
			))}
		</div>
	</div>
)

type AgentsPageBodyProps = AgentsPageProps & { columnClassName: string }

const AgentsPageBody = ({
	columnClassName,
	agents,
	spaceName,
	status = "loaded",
	onCreate,
	onRetry,
	...actions
}: AgentsPageBodyProps) => {
	const { t } = useTranslation("settings")

	if (status === "loading") {
		return (
			<div className="min-h-0 flex-1" data-slot="agents-page-skeleton">
				<ListSkeleton
					className={cn(columnClassName, "@container gap-4")}
					row={skeletonRowAt}
				/>
			</div>
		)
	}

	if (status === "failed") {
		return (
			<div
				className={cn(columnClassName, "min-h-0 flex-1")}
				data-slot="agents-page-failure"
			>
				<Notice
					description={t("space.agents.failure.description")}
					retry={onRetry && { onRetry }}
					title={t("space.agents.failure.title")}
				/>
			</div>
		)
	}

	if (agents.length === 0) {
		return (
			<div className={cn(columnClassName, "min-h-0 flex-1 overflow-y-auto")}>
				<EmptyStateShell
					action={<CreateAgentButton onCreate={onCreate} />}
					className="my-auto"
					data-slot="agents-page-empty"
					description={t("space.agents.emptyDescription")}
					mark={
						<Icons.Companions
							aria-hidden="true"
							className="size-8 text-muted-foreground"
						/>
					}
					title={t("space.agents.empty")}
				/>
			</div>
		)
	}

	return (
		<div
			className={cn(
				columnClassName,
				"@container min-h-0 flex-1 gap-4 overflow-y-auto",
			)}
			data-slot="agents-page-body"
		>
			<p className="wrap-break-word text-compact text-muted-foreground leading-4.5">
				{t("space.agents.caption", { space: spaceName })}
			</p>
			<ul className={cn(GRID, "list-none p-0")}>
				{agents.map((agent) => (
					<CompanionCard
						actions={<AgentActions {...actions} agent={agent} />}
						companion={agent}
						key={agent.id}
						onSelect={actions.onSelect}
					/>
				))}
			</ul>
		</div>
	)
}

const AgentsPage = (props: AgentsPageProps) => {
	const { t } = useTranslation("settings")
	const titleId = useId()
	const { agents, status = "loaded", onCreate } = props
	const hasAgents = status === "loaded" && agents.length > 0

	return (
		<section
			aria-labelledby={titleId}
			className="size-full min-h-0 min-w-0 overflow-hidden"
			data-slot="agents-page"
		>
			<ScreenLayout
				header={
					<AppHeader
						close={
							<BarAction
								icon={<Icons.Add aria-hidden="true" />}
								kind="secondary"
								label={t("space.agents.create")}
								onClick={onCreate}
								slot="agents-page-create"
							/>
						}
						data-tauri-drag-region="deep"
						leading={
							<>
								<AppHeaderText>
									<h1 className={APP_HEADER_TITLE} id={titleId}>
										{t("space.agents.title")}
									</h1>
								</AppHeaderText>
								{hasAgents ? (
									<span
										className="shrink-0 text-muted-foreground text-sm leading-4.5 tabular-nums"
										data-slot="agents-page-count"
									>
										{agents.length}
									</span>
								) : null}
							</>
						}
					/>
				}
				scroller={(columnClassName) => (
					<AgentsPageBody {...props} columnClassName={columnClassName} />
				)}
			/>
		</section>
	)
}

export {
	AgentsPage,
	type AgentsPageAgent,
	type AgentsPageProps,
	type AgentsPageStatus,
}
