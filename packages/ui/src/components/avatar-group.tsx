"use client"

import { motion, useReducedMotionConfig } from "motion/react"
import { useTranslation } from "react-i18next"

import { type BotBadge, BotBadgeDot } from "@workspace/ui/components/bot-badge"
import {
	BotIdentityAvatar,
	type BotIdentityAvatarProps,
} from "@workspace/ui/components/bot-identity-avatar"
import {
	HIVE_DEFAULT_SIZE,
	type HiveCell,
	type HiveOverflow,
	hiveCellOrigin,
	hiveLayout,
} from "@workspace/ui/components/hive-layout"
import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import { OutlinedHexagon } from "@workspace/ui/components/outlined-hexagon"
import { SPRING_LAYOUT, TRANSITION_NONE } from "@workspace/ui/lib/ease"

const FRAME = "relative grid shrink-0"

const MEMBER_CELL = "absolute"

const OVERFLOW_CELL = "pointer-events-none absolute"

const COUNTER_TEXT = "font-bold tabular-nums"

type ConversationParticipant = Pick<
	BotIdentityAvatarProps,
	"name" | "blot" | "image" | "working" | "kind"
> & { id: string; isPerson?: boolean }

type AvatarGroupProps = {
	participants: ConversationParticipant[]
	size?: number
	badge?: BotBadge
}

type MemberCellProps = {
	participant: ConversationParticipant
	cell: HiveCell
	isStill: boolean
}

const MemberCell = ({ participant, cell, isStill }: MemberCellProps) => (
	<motion.span
		className={MEMBER_CELL}
		data-slot="conversation-avatar-member"
		layout="position"
		style={hiveCellOrigin(cell)}
		transition={isStill ? TRANSITION_NONE : SPRING_LAYOUT}
	>
		{participant.isPerson ? (
			<InitialsAvatar
				image={participant.image}
				name={participant.name}
				size={cell.side}
			/>
		) : (
			<BotIdentityAvatar
				blot={participant.blot}
				image={participant.image}
				kind={participant.kind}
				name={participant.name}
				seed={participant.id}
				size={cell.side}
				working={participant.working}
			/>
		)}
	</motion.span>
)

type OverflowCellProps = {
	label: string
	overflow: HiveOverflow
}

const OverflowCell = ({ label, overflow }: OverflowCellProps) => (
	<span
		className={OVERFLOW_CELL}
		data-slot="conversation-avatar-overflow"
		style={{
			...hiveCellOrigin(overflow),
			width: overflow.side,
			height: overflow.side,
		}}
	>
		<OutlinedHexagon
			fill="var(--secondary)"
			path={overflow.path}
			side={overflow.side}
		>
			<text
				className={COUNTER_TEXT}
				fontSize={overflow.fontSize}
				style={{ fill: "var(--muted-foreground)" }}
				textAnchor="middle"
				x="50%"
				y={overflow.baseline}
			>
				{label}
			</text>
		</OutlinedHexagon>
	</span>
)

const AvatarGroup = ({
	participants,
	size = HIVE_DEFAULT_SIZE,
	badge,
}: AvatarGroupProps) => {
	const { t } = useTranslation("bots")
	const isStill = useReducedMotionConfig() ?? false
	const layout = hiveLayout({ participants, size })
	const overflowLabel = layout.overflow
		? t("roster.conversation.others", { count: layout.overflow.hiddenCount })
		: null

	return (
		<span
			aria-hidden={overflowLabel ? undefined : "true"}
			aria-label={overflowLabel ?? undefined}
			className={FRAME}
			data-slot="conversation-avatar"
			role="img"
			style={{ width: size, height: size }}
		>
			{layout.cells.map((cell) => (
				<MemberCell
					cell={cell}
					isStill={isStill}
					key={cell.id}
					participant={
						participants.find(
							({ id }) => id === cell.id,
						) as ConversationParticipant
					}
				/>
			))}
			{layout.overflow && overflowLabel ? (
				<OverflowCell label={overflowLabel} overflow={layout.overflow} />
			) : null}
			{badge ? (
				<BotBadgeDot
					badge={badge}
					data-slot="bot-activity-dot"
					placement="avatar"
				/>
			) : null}
		</span>
	)
}

export { AvatarGroup, type AvatarGroupProps, type ConversationParticipant }
