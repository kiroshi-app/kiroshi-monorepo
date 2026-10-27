"use client"

import {
	createContext,
	type PropsWithChildren,
	type ReactElement,
	type ReactNode,
	useContext,
} from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import {
	PinGroup,
	type RosterMenuSection,
	type RosterPinActions,
	SectionBranch,
	SpacesBranch,
} from "@workspace/ui/components/roster-menu-items"
import type { Space } from "@workspace/ui/components/space"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuGroup,
	ContextMenuItem,
	ContextMenuLabel,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@workspace/ui/components/ui/context-menu"
import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"

interface CompanionMenuSubject {
	id: string
	name: string
	title?: string
	sectionId?: string | null
}

interface CompanionMenuContentProps extends RosterPinActions {
	companion: CompanionMenuSubject
	isPinned: boolean
	spaces: Space[]
	memberships: string[]
	sections: RosterMenuSection[]
	openSpaceId?: string
	finalFocus?: () => HTMLElement | boolean
	onOpenInNewTab?: (id: string) => void
	onEdit?: (id: string) => void
	onDuplicate?: (id: string) => void
	onAddToSpace?: (botId: string, spaceId: string) => void
	onRemoveFromSpace?: (botId: string, spaceId: string) => void
	onDelete?: (id: string) => void
	onMoveToSection?: (id: string, sectionId: string | null) => void
	onCreateSectionFor?: (id: string) => void
}

const CompanionMenuContent = ({
	companion,
	isPinned,
	spaces,
	memberships,
	sections,
	openSpaceId,
	finalFocus,
	onPin,
	onUnpin,
	onOpenInNewTab,
	onEdit,
	onDuplicate,
	onAddToSpace,
	onRemoveFromSpace,
	onDelete,
	onMoveToSection,
	onCreateSectionFor,
}: CompanionMenuContentProps) => {
	const { t } = useTranslation("bots")

	return (
		<ContextMenuContent
			aria-label={t("roster.actions", { name: companion.name })}
			className={STILL_UNDER_REDUCED_MOTION}
			finalFocus={finalFocus}
		>
			<ContextMenuGroup>
				<ContextMenuLabel>
					{companion.title
						? t("roster.titled", {
								name: companion.name,
								title: companion.title,
							})
						: companion.name}
				</ContextMenuLabel>
				<ContextMenuSeparator />
				{onOpenInNewTab ? (
					<>
						<ContextMenuItem onClick={() => onOpenInNewTab(companion.id)}>
							<Icons.ExternalLink aria-hidden="true" className="size-3.5" />
							{t("roster.openInNewTab")}
						</ContextMenuItem>
						<ContextMenuSeparator />
					</>
				) : null}
				<PinGroup
					id={companion.id}
					isPinned={isPinned}
					onPin={onPin}
					onUnpin={onUnpin}
				/>
				<ContextMenuItem onClick={() => onEdit?.(companion.id)}>
					<Icons.Settings aria-hidden="true" className="size-3.5" />
					{t("roster.settings")}
				</ContextMenuItem>
				<ContextMenuSeparator />
				<ContextMenuItem onClick={() => onDuplicate?.(companion.id)}>
					<Icons.Copy aria-hidden="true" className="size-3.5" />
					{t("roster.duplicate")}
				</ContextMenuItem>
				<SectionBranch
					id={companion.id}
					onCreateSectionFor={onCreateSectionFor}
					onMoveToSection={onMoveToSection}
					sectionId={companion.sectionId}
					sections={sections}
				/>
				<SpacesBranch
					botId={companion.id}
					memberships={memberships}
					onAddToSpace={onAddToSpace}
					onRemoveFromSpace={onRemoveFromSpace}
					openSpaceId={openSpaceId}
					spaces={spaces}
				/>
				<ContextMenuSeparator />
				<ContextMenuItem
					onClick={() => onDelete?.(companion.id)}
					variant="destructive"
				>
					<Icons.Delete aria-hidden="true" className="size-3.5" />
					{t("roster.delete")}
				</ContextMenuItem>
			</ContextMenuGroup>
		</ContextMenuContent>
	)
}

type CompanionMenuLookup = (companionId: string) => ReactNode

const NO_COMPANION_MENU: CompanionMenuLookup = () => null

const CompanionMenuContext =
	createContext<CompanionMenuLookup>(NO_COMPANION_MENU)

type CompanionMenuProviderProps = PropsWithChildren<{
	menuFor: CompanionMenuLookup
}>

const CompanionMenuProvider = ({
	menuFor,
	children,
}: CompanionMenuProviderProps) => (
	<CompanionMenuContext.Provider value={menuFor}>
		{children}
	</CompanionMenuContext.Provider>
)

type CompanionMenuHostProps = {
	companionId?: string
	children: ReactElement<Record<string, unknown>>
}

const CompanionMenuHost = ({
	companionId,
	children,
}: CompanionMenuHostProps) => {
	const menuFor = useContext(CompanionMenuContext)
	const menu = companionId ? menuFor(companionId) : null

	if (!menu) return children

	return (
		<ContextMenu>
			<ContextMenuTrigger render={children} />
			{menu}
		</ContextMenu>
	)
}

export {
	CompanionMenuContent,
	CompanionMenuHost,
	type CompanionMenuLookup,
	CompanionMenuProvider,
	type CompanionMenuSubject,
}
