import { type CSSProperties, type ReactNode, useId } from "react"
import { useTranslation } from "react-i18next"

import type { ConversationParticipant } from "@workspace/ui/components/avatar-group"
import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { CAP_CENTRE_RATIO } from "@workspace/ui/components/hive-layout"
import {
	OUTER,
	roundedHexagonPath,
} from "@workspace/ui/components/kiroshi-hexagon"

const PILE_LIMIT = 3
const HEXAGON_SIDE = 14
const STEP = 10
const KNOCKOUT_WIDTH = 1.5
const COUNTER_FONT_SIZE = 6.3
const INSIDE_STROKE_WIDTH = 2

const HEXAGON = {
	halfWidth: HEXAGON_SIDE / 2,
	halfHeight: (OUTER.halfHeight * HEXAGON_SIDE) / (OUTER.halfWidth * 2),
}
const HEXAGON_PATH = roundedHexagonPath(HEXAGON)

const HOLE = {
	halfWidth: HEXAGON.halfWidth + KNOCKOUT_WIDTH,
	halfHeight: HEXAGON.halfHeight + KNOCKOUT_WIDTH,
}
const HOLE_SIDE = HOLE.halfWidth * 2
const HOLE_IMAGE = `url("data:image/svg+xml,${encodeURIComponent(
	`<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${HOLE_SIDE} ${HOLE_SIDE}'><path d='${roundedHexagonPath(HOLE)}'/></svg>`,
)}")`

const KNOCKED_OUT_UNDER_NEXT: CSSProperties = {
	maskImage: `linear-gradient(#000, #000), ${HOLE_IMAGE}`,
	maskPosition: `0 0, ${STEP - KNOCKOUT_WIDTH}px ${-KNOCKOUT_WIDTH}px`,
	maskSize: `100% 100%, ${HOLE_SIDE}px ${HOLE_SIDE}px`,
	maskRepeat: "no-repeat",
	maskComposite: "exclude",
}

const PILE = "relative block h-4 shrink-0"

const SLOT = "absolute top-px size-3.5"

const SLOT_ART = "pointer-events-none absolute inset-0 size-full"

const COUNTER_TEXT = "font-bold tabular-nums"

type PileBot = Omit<ConversationParticipant, "isPerson">

type ConversationBotPileProps = {
	bots: PileBot[]
}

type PileHexagonProps = {
	fill: string
	children?: ReactNode
}

const PileHexagon = ({ fill, children }: PileHexagonProps) => {
	const edgeClipId = useId()
	return (
		<svg
			aria-hidden="true"
			className={SLOT_ART}
			viewBox={`0 0 ${HEXAGON_SIDE} ${HEXAGON_SIDE}`}
		>
			<path
				clipPath={`url(#${edgeClipId})`}
				d={HEXAGON_PATH}
				strokeWidth={INSIDE_STROKE_WIDTH}
				style={{ fill, stroke: "var(--image-outline)" }}
			/>
			<clipPath id={edgeClipId}>
				<path d={HEXAGON_PATH} />
			</clipPath>
			{children}
		</svg>
	)
}

type PileSlotProps = {
	index: number
	isCovered: boolean
	slot: string
	children: ReactNode
}

const PileSlot = ({ index, isCovered, slot, children }: PileSlotProps) => (
	<span
		className={SLOT}
		data-slot={slot}
		style={{
			left: index * STEP,
			...(isCovered ? KNOCKED_OUT_UNDER_NEXT : undefined),
		}}
	>
		{children}
	</span>
)

const ConversationBotPile = ({ bots }: ConversationBotPileProps) => {
	const { t } = useTranslation("bots")
	const isOverflowing = bots.length > PILE_LIMIT
	const shown = isOverflowing ? bots.slice(0, PILE_LIMIT - 1) : bots
	const slotCount = isOverflowing ? PILE_LIMIT : shown.length

	if (slotCount === 0) return null

	return (
		<span
			aria-hidden="true"
			className={PILE}
			data-slot="conversation-bot-pile"
			style={{ width: HEXAGON_SIDE + STEP * (slotCount - 1) }}
		>
			{shown.map((bot, index) => (
				<PileSlot
					index={index}
					isCovered={index < slotCount - 1}
					key={bot.id}
					slot="conversation-bot-pile-bot"
				>
					<BotIdentityAvatar
						blot={bot.blot}
						image={bot.image}
						kind={bot.kind}
						name={bot.name}
						seed={bot.id}
						size={HEXAGON_SIDE}
						working={bot.working}
					/>
					<PileHexagon fill="none" />
				</PileSlot>
			))}
			{isOverflowing ? (
				<PileSlot
					index={PILE_LIMIT - 1}
					isCovered={false}
					slot="conversation-bot-pile-overflow"
				>
					<PileHexagon fill="var(--conversation-pile-overflow)">
						<text
							className={COUNTER_TEXT}
							fontSize={COUNTER_FONT_SIZE}
							style={{ fill: "var(--conversation-pile-overflow-foreground)" }}
							textAnchor="middle"
							x="50%"
							y={HEXAGON.halfWidth + COUNTER_FONT_SIZE * CAP_CENTRE_RATIO}
						>
							{t("roster.conversation.others", {
								count: bots.length - shown.length,
							})}
						</text>
					</PileHexagon>
				</PileSlot>
			) : null}
		</span>
	)
}

export { ConversationBotPile, type ConversationBotPileProps }
