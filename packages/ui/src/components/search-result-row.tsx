"use client"

import type { BotBadge } from "@workspace/ui/components/bot-badge"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import {
	ConversationSubjectIcon,
	type ConversationSubjectIconProps,
} from "@workspace/ui/components/conversation-subject-icon"
import { Icons } from "@workspace/ui/components/icons"
import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import {
	MISSION_AVATAR_SIZE,
	type MissionBot,
} from "@workspace/ui/components/mission"
import type { MissionMark } from "@workspace/ui/components/mission-marks"
import {
	ACTIVITY_ROW_CLASS,
	ROW_GLYPH_CLASS,
	RowAnatomy,
	type RowPart,
	RowParts,
} from "@workspace/ui/components/row-anatomy"
import {
	type ClickModifiers,
	clickHandlersFor,
} from "@workspace/ui/lib/click-modifiers"
import { cn } from "@workspace/ui/lib/utils"

type SearchResultIdentity =
	| { kind: "message"; bot: MissionBot }
	| { kind: "message-from-you"; reader: string }
	| ({ kind: "chat-group"; color?: number | null } & Pick<
			ConversationSubjectIconProps,
			"icon"
	  >)
	| { kind: "chat-solo"; bot: MissionBot }
	| { kind: "mission"; bot: MissionBot; badge?: BotBadge; mark: MissionMark }
	| { kind: "routine"; bot: MissionBot }

type SearchResultKind = SearchResultIdentity["kind"]

type SearchResultTitlePart = RowPart & { isMatch?: boolean }

type SearchResultRowProps = {
	identity: SearchResultIdentity
	title: SearchResultTitlePart[]
	timestamp: string
	parts: RowPart[]
	identifier?: string
	isActive?: boolean
	id?: string
	onOpen: (modifiers?: ClickModifiers) => void
}

const ACTIVATION_CLASS =
	"outline-none hover:bg-muted/50 focus-visible:ring-3 focus-visible:ring-ring/30"

const ACTIVE_CLASS =
	"group/search-result-row data-[active=true]:bg-muted data-[active=true]:[--badge-ring:var(--color-muted)] [@media(hover:hover)]:[&[data-active=true]:hover]:bg-muted"

const MATCH_CLASS = "rounded-xs bg-mark px-[0.15em] py-[0.05em] text-inherit"

const ROW_CLASS_NAME = cn(ACTIVITY_ROW_CLASS, ACTIVATION_CLASS, ACTIVE_CLASS)

const isMessageKind = (identity: SearchResultIdentity) =>
	identity.kind === "message" || identity.kind === "message-from-you"

const glyphOf = (identity: SearchResultIdentity): MissionMark | undefined => {
	if (identity.kind === "mission") return identity.mark
	if (identity.kind === "routine") return Icons.Routine
	return undefined
}

const SearchResultIdentityMark = ({
	identity,
}: {
	identity: SearchResultIdentity
}) => {
	if (identity.kind === "chat-group")
		return (
			<ConversationSubjectIcon
				icon={identity.icon}
				side={MISSION_AVATAR_SIZE}
			/>
		)

	if (identity.kind === "message-from-you")
		return (
			<InitialsAvatar
				className="shrink-0"
				name={identity.reader}
				size={MISSION_AVATAR_SIZE}
			/>
		)

	return (
		<BotIdentityAvatar
			{...identity.bot}
			badge={identity.kind === "mission" ? identity.badge : undefined}
			className="shrink-0"
			size={MISSION_AVATAR_SIZE}
		/>
	)
}

const SearchResultRow = ({
	identity,
	title,
	timestamp,
	parts,
	identifier,
	isActive = false,
	id,
	onOpen,
}: SearchResultRowProps) => {
	const Glyph = glyphOf(identity)

	return (
		<button
			aria-selected={isActive}
			className={ROW_CLASS_NAME}
			data-active={isActive}
			data-slot="search-result-row"
			id={id}
			{...clickHandlersFor(onOpen)}
			role="option"
			tabIndex={-1}
			type="button"
		>
			<RowAnatomy
				geometry="activity"
				isNameRegular={isMessageKind(identity)}
				media={<SearchResultIdentityMark identity={identity} />}
				name={title.map((part) =>
					part.isMatch ? (
						<mark className={MATCH_CLASS} key={part.key}>
							{part.text}
						</mark>
					) : (
						<span key={part.key}>{part.text}</span>
					),
				)}
				nameSlot="search-result-row-title"
				preview={
					<>
						{Glyph ? (
							<Glyph
								aria-hidden="true"
								className={ROW_GLYPH_CLASS}
								data-slot="search-result-row-glyph"
							/>
						) : null}
						<RowParts
							identifier={identifier}
							parts={parts}
							slot="search-result-row-parts"
						/>
					</>
				}
				timestamp={timestamp}
				timestampSlot="search-result-row-timestamp"
			/>
		</button>
	)
}

export {
	type SearchResultIdentity,
	type SearchResultKind,
	SearchResultRow,
	type SearchResultRowProps,
	type SearchResultTitlePart,
}
