"use client"

import { useId } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import type { Space } from "@workspace/ui/components/space"
import { SpaceAvatar } from "@workspace/ui/components/space-avatar"
import {
	ContextMenuCheckboxItem,
	ContextMenuItem,
	ContextMenuRadioGroup,
	ContextMenuRadioItem,
	ContextMenuSeparator,
	ContextMenuSub,
	ContextMenuSubContent,
	ContextMenuSubTrigger,
} from "@workspace/ui/components/ui/context-menu"
import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"

const DESTINATION_NAME = "min-w-0 truncate"

const BRANCH_ROW = "gap-2"

const NAMED_PANEL = `max-w-64 ${STILL_UNDER_REDUCED_MOTION}`

const LAST_SPACE_NOTE =
	"px-2.5 pt-0.5 pb-1.5 text-[11px] text-muted-foreground leading-[15px]"

const NO_SECTION = "__none__"

interface RosterMenuSection {
	id: string
	name: string
}

interface RosterPinActions {
	onPin?: (id: string) => void
	onUnpin?: (id: string) => void
}

interface PinGroupProps extends RosterPinActions {
	id: string
	isPinned: boolean
}

const PinGroup = ({ id, isPinned, onPin, onUnpin }: PinGroupProps) => {
	const { t } = useTranslation("bots")

	const toggle = isPinned ? onUnpin : onPin
	if (!toggle) return null

	const PinIcon = isPinned ? Icons.Unpin : Icons.Pin
	return (
		<>
			<ContextMenuItem onClick={() => toggle(id)}>
				<PinIcon aria-hidden="true" className="size-3.5" />
				{t(isPinned ? "roster.unpin" : "roster.pin")}
			</ContextMenuItem>
			<ContextMenuSeparator />
		</>
	)
}

interface SectionBranchProps {
	id: string
	sectionId?: string | null
	sections: RosterMenuSection[]
	onMoveToSection?: (id: string, sectionId: string | null) => void
	onCreateSectionFor?: (id: string) => void
}

const SectionBranch = ({
	id,
	sectionId,
	sections,
	onMoveToSection,
	onCreateSectionFor,
}: SectionBranchProps) => {
	const { t } = useTranslation("bots")

	if (!onMoveToSection && !onCreateSectionFor) return null

	return (
		<ContextMenuSub>
			<ContextMenuSubTrigger className={BRANCH_ROW}>
				<Icons.Folder aria-hidden="true" className="size-3.5" />
				{t("roster.section.moveTo")}
			</ContextMenuSubTrigger>
			<ContextMenuSubContent className={NAMED_PANEL}>
				<ContextMenuRadioGroup
					onValueChange={(value) =>
						onMoveToSection?.(id, value === NO_SECTION ? null : value)
					}
					value={sectionId ?? NO_SECTION}
				>
					<ContextMenuRadioItem
						closeOnClick
						label={t("roster.section.none")}
						value={NO_SECTION}
					>
						<span className={DESTINATION_NAME}>{t("roster.section.none")}</span>
					</ContextMenuRadioItem>
					{sections.map((section) => (
						<ContextMenuRadioItem
							closeOnClick
							key={section.id}
							label={section.name}
							value={section.id}
						>
							<span className={DESTINATION_NAME}>{section.name}</span>
						</ContextMenuRadioItem>
					))}
				</ContextMenuRadioGroup>
				{onCreateSectionFor ? (
					<>
						<ContextMenuSeparator />
						<ContextMenuItem
							label={t("roster.section.create")}
							onClick={() => onCreateSectionFor(id)}
						>
							<Icons.Add aria-hidden="true" className="size-3.5" />
							{t("roster.section.create")}
						</ContextMenuItem>
					</>
				) : null}
			</ContextMenuSubContent>
		</ContextMenuSub>
	)
}

interface SpacesBranchProps {
	botId: string
	spaces: Space[]
	memberships: string[]
	openSpaceId?: string
	onAddToSpace?: (botId: string, spaceId: string) => void
	onRemoveFromSpace?: (botId: string, spaceId: string) => void
}

const SpacesBranch = ({
	botId,
	spaces,
	memberships,
	openSpaceId,
	onAddToSpace,
	onRemoveFromSpace,
}: SpacesBranchProps) => {
	const { t } = useTranslation("bots")
	const reasonId = useId()

	const hasHost = Boolean(onAddToSpace || onRemoveFromSpace)

	if (!hasHost || spaces.length === 0 || memberships.length === 0) return null

	const isHeldByOneSpace = memberships.length === 1
	const reason = t("roster.spaces.lastSpace")

	return (
		<ContextMenuSub>
			{isHeldByOneSpace ? (
				<span className="sr-only" id={reasonId}>
					{reason}
				</span>
			) : null}
			<ContextMenuSubTrigger
				aria-describedby={isHeldByOneSpace ? reasonId : undefined}
				className={BRANCH_ROW}
			>
				<Icons.Spaces aria-hidden="true" className="size-3.5" />
				{t("roster.spaces.label")}
			</ContextMenuSubTrigger>
			<ContextMenuSubContent className={NAMED_PANEL}>
				{spaces.map((space) => {
					const isMember = memberships.includes(space.id)
					const isLocked = isMember && isHeldByOneSpace
					return (
						<ContextMenuCheckboxItem
							aria-describedby={isLocked ? reasonId : undefined}
							checked={isMember}
							closeOnClick={isMember && space.id === openSpaceId}
							disabled={isLocked}
							key={space.id}
							label={space.name}
							onCheckedChange={(checked) =>
								checked
									? onAddToSpace?.(botId, space.id)
									: onRemoveFromSpace?.(botId, space.id)
							}
						>
							<SpaceAvatar
								colour={space.colour}
								size={14}
								spaceId={space.avatarSeed}
							/>
							<span className={DESTINATION_NAME}>{space.name}</span>
						</ContextMenuCheckboxItem>
					)
				})}
				{isHeldByOneSpace ? (
					<>
						<ContextMenuSeparator />
						<p aria-hidden="true" className={LAST_SPACE_NOTE}>
							{reason}
						</p>
					</>
				) : null}
			</ContextMenuSubContent>
		</ContextMenuSub>
	)
}

export {
	PinGroup,
	type RosterMenuSection,
	type RosterPinActions,
	SectionBranch,
	SpacesBranch,
}
