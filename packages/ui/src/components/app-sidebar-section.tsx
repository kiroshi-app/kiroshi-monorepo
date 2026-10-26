import { type ReactNode, useCallback, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import type { AppSidebarSection } from "@workspace/ui/components/app-sidebar-model"
import { Icons } from "@workspace/ui/components/icons"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuItem,
	ContextMenuTrigger,
} from "@workspace/ui/components/ui/context-menu"
import {
	SidebarGroup,
	SidebarGroupContent,
	SidebarGroupLabel,
} from "@workspace/ui/components/ui/sidebar"
import type { Lifter } from "@workspace/ui/hooks/use-roster-lift"
import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"
import { cn } from "@workspace/ui/lib/utils"

const SECTION_GROUP = "px-0 py-0"

const SECTION_PAD = "px-[4.5px] pb-[4.5px]"

const SECTION_CARD =
	"rounded-xl [@media(hover:hover)]:has-[[data-slot=roster-section-trigger]:hover]:bg-sidebar-accent/70"

const SECTION_CARD_OPEN =
	"bg-sidebar-accent/50 group-data-[landing]/roster-drop:bg-sidebar-accent"

const SECTION_LABEL =
	"mb-0 h-auto px-0 font-semibold text-sidebar-foreground text-xs normal-case tracking-normal"

const SECTION_TRIGGER =
	"flex w-full min-w-0 select-none items-center gap-1.5 rounded-xl px-[10.5px] py-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"

const SECTION_NAME = "min-w-0 truncate"

const SECTION_CHEVRON =
	"size-3.5 shrink-0 text-sidebar-foreground/50 transition-transform duration-150 ease-out motion-reduce:transition-none"

const SECTION_BODY =
	"grid transition-[grid-template-rows,visibility] duration-200 ease-out motion-reduce:transition-none"

const SECTION_BODY_OPEN = "visible grid-rows-[1fr]"

const SECTION_BODY_CLOSED = "invisible grid-rows-[0fr]"

const SECTION_BODY_INNER = "min-h-0 overflow-hidden"

const SECTION_FIELD =
	"w-full min-w-0 border-none bg-transparent px-[10.5px] py-2.5 text-sidebar-foreground text-xs outline-none"

interface SectionLabelProps {
	ref?: (node: HTMLElement | null) => void
	children: ReactNode
}

const SectionLabel = ({ ref, children }: SectionLabelProps) => (
	<SidebarGroupLabel className={SECTION_LABEL} ref={ref}>
		{children}
	</SidebarGroupLabel>
)

interface SectionNameFieldProps {
	ariaLabel: string
	initialName: string
	onCommit: (name: string) => void
	onCancel: () => void
}

const SectionNameField = ({
	ariaLabel,
	initialName,
	onCommit,
	onCancel,
}: SectionNameFieldProps) => {
	const [draft, setDraft] = useState(initialName)
	const isSettled = useRef(false)
	const selectAll = useCallback((node: HTMLInputElement | null) => {
		node?.select()
	}, [])

	const settle = () => {
		if (isSettled.current) return
		isSettled.current = true
		const named = draft.trim()
		if (named) onCommit(named)
		else onCancel()
	}

	const abandon = () => {
		isSettled.current = true
		onCancel()
	}

	return (
		<input
			aria-label={ariaLabel}
			className={SECTION_FIELD}
			data-slot="roster-section-field"
			onBlur={settle}
			onChange={(event) => setDraft(event.target.value)}
			onKeyDown={(event) => {
				event.stopPropagation()
				if (event.key === "Enter") settle()
				if (event.key === "Escape") abandon()
			}}
			ref={selectAll}
			value={draft}
		/>
	)
}

interface RosterSectionProps {
	section: AppSidebarSection
	isFirst: boolean
	isLast: boolean
	isOpen: boolean
	onOpenChange: (isOpen: boolean) => void
	onRename?: (id: string, name: string) => void
	onMove?: (id: string, by: number) => void
	onDelete?: (id: string) => void
	lift: Lifter
	headRef?: (node: HTMLElement | null) => void
	children: ReactNode
}

const RosterSection = ({
	section,
	isFirst,
	isLast,
	isOpen,
	onOpenChange,
	lift,
	headRef,
	onRename,
	onMove,
	onDelete,
	children,
}: RosterSectionProps) => {
	const { t } = useTranslation("bots")
	const bodyId = useId()
	const [isRenaming, setIsRenaming] = useState(false)

	return (
		<SidebarGroup
			className={cn(SECTION_GROUP, SECTION_CARD, isOpen && SECTION_CARD_OPEN)}
		>
			<SectionLabel ref={headRef}>
				{isRenaming ? (
					<SectionNameField
						ariaLabel={t("roster.section.renameField", { name: section.name })}
						initialName={section.name}
						onCancel={() => setIsRenaming(false)}
						onCommit={(name) => {
							setIsRenaming(false)
							onRename?.(section.id, name)
						}}
					/>
				) : (
					<ContextMenu>
						<ContextMenuTrigger
							render={
								<button
									{...lift.handlersFor(section.id)}
									aria-controls={bodyId}
									aria-expanded={isOpen}
									className={SECTION_TRIGGER}
									data-slot="roster-section-trigger"
									onClick={() => {
										if (lift.hasJustDropped()) return
										onOpenChange(!isOpen)
									}}
									type="button"
								>
									<span
										className={SECTION_NAME}
										data-slot="roster-section-name"
									>
										{section.name}
									</span>
									<Icons.Next
										aria-hidden="true"
										className={cn(SECTION_CHEVRON, isOpen && "rotate-90")}
									/>
								</button>
							}
						/>
						<ContextMenuContent
							aria-label={t("roster.section.actions", { name: section.name })}
							className={STILL_UNDER_REDUCED_MOTION}
						>
							<ContextMenuItem onClick={() => setIsRenaming(true)}>
								<Icons.Edit aria-hidden="true" className="size-3.5" />
								{t("roster.section.rename")}
							</ContextMenuItem>
							<ContextMenuItem
								disabled={isFirst}
								onClick={() => onMove?.(section.id, -1)}
							>
								<Icons.ArrowUp aria-hidden="true" className="size-3.5" />
								{t("roster.section.moveUp")}
							</ContextMenuItem>
							<ContextMenuItem
								disabled={isLast}
								onClick={() => onMove?.(section.id, 1)}
							>
								<Icons.ArrowDown aria-hidden="true" className="size-3.5" />
								{t("roster.section.moveDown")}
							</ContextMenuItem>
							<ContextMenuItem
								onClick={() => onDelete?.(section.id)}
								variant="destructive"
							>
								<Icons.Delete aria-hidden="true" className="size-3.5" />
								{t("roster.section.delete")}
							</ContextMenuItem>
						</ContextMenuContent>
					</ContextMenu>
				)}
			</SectionLabel>
			<SidebarGroupContent
				className={cn(
					SECTION_BODY,
					isOpen ? SECTION_BODY_OPEN : SECTION_BODY_CLOSED,
				)}
				id={bodyId}
			>
				<div className={SECTION_BODY_INNER}>
					<div className={SECTION_PAD}>{children}</div>
				</div>
			</SidebarGroupContent>
		</SidebarGroup>
	)
}

export { RosterSection, SECTION_GROUP, SectionLabel, SectionNameField }
