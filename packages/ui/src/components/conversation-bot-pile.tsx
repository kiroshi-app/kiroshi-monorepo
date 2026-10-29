import type { CSSProperties, ReactNode } from "react"
import { useTranslation } from "react-i18next"

import {
	BotIdentityAvatar,
	type BotIdentityAvatarProps,
} from "@workspace/ui/components/bot-identity-avatar"
import { CAP_CENTRE_RATIO } from "@workspace/ui/components/hive-layout"
import {
	hexagonOfWidth,
	roundedHexagonPath,
} from "@workspace/ui/components/kiroshi-hexagon"
import { OutlinedHexagon } from "@workspace/ui/components/outlined-hexagon"

const PILE_LIMIT = 3
const HEXAGON_SIDE = 14
const STEP = 10
const KNOCKOUT_WIDTH = 1.5

const HEXAGON = hexagonOfWidth(HEXAGON_SIDE)

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

const COUNTER_FONT_SIZE = HEXAGON_SIDE * 0.45
const COUNTER_TEXT = "font-bold tabular-nums"

type ConversationParticipant = Pick<
	BotIdentityAvatarProps,
	"name" | "image" | "working" | "kind"
> & { id: string; isPerson?: boolean; blot?: number | null }

type PileBot = Omit<ConversationParticipant, "isPerson">

type ConversationBotPileProps = {
	bots: PileBot[]
}

type PileSlotProps = {
	style: CSSProperties
	slot: string
	children: ReactNode
}

const PileSlot = ({ style, slot, children }: PileSlotProps) => (
	<span className="absolute top-px size-3.5" data-slot={slot} style={style}>
		{children}
	</span>
)

const ConversationBotPile = ({ bots }: ConversationBotPileProps) => {
	const { t } = useTranslation("bots")
	const isOverflowing = bots.length > PILE_LIMIT
	const shown = isOverflowing ? bots.slice(0, PILE_LIMIT - 1) : bots
	const slotCount = isOverflowing ? PILE_LIMIT : shown.length
	const overflowLabel = isOverflowing
		? t("roster.conversation.others", { count: bots.length - shown.length })
		: null

	if (slotCount === 0) return null

	const slotStyleOf = (index: number): CSSProperties => ({
		left: index * STEP,
		...(index < slotCount - 1 ? KNOCKED_OUT_UNDER_NEXT : undefined),
	})
	const counter = (
		<text
			className={COUNTER_TEXT}
			fontSize={COUNTER_FONT_SIZE}
			style={{ fill: "var(--conversation-pile-overflow-foreground)" }}
			textAnchor="middle"
			x="50%"
			y={HEXAGON_SIDE / 2 + COUNTER_FONT_SIZE * CAP_CENTRE_RATIO}
		>
			{overflowLabel}
		</text>
	)

	return (
		<span
			aria-hidden={overflowLabel ? undefined : "true"}
			aria-label={overflowLabel ?? undefined}
			className="relative block h-4 shrink-0"
			data-slot="conversation-bot-pile"
			role="img"
			style={{ width: HEXAGON_SIDE + STEP * (slotCount - 1) }}
		>
			{shown.map((bot, index) => (
				<PileSlot
					key={bot.id}
					slot="conversation-bot-pile-bot"
					style={slotStyleOf(index)}
				>
					<BotIdentityAvatar
						hue={bot.blot}
						image={bot.image}
						kind={bot.kind}
						name={bot.name}
						seed={bot.id}
						size={HEXAGON_SIDE}
						working={bot.working}
					/>
				</PileSlot>
			))}
			{isOverflowing ? (
				<PileSlot
					slot="conversation-bot-pile-overflow"
					style={slotStyleOf(PILE_LIMIT - 1)}
				>
					<OutlinedHexagon
						fill="var(--conversation-pile-overflow)"
						side={HEXAGON_SIDE}
					>
						{counter}
					</OutlinedHexagon>
				</PileSlot>
			) : null}
		</span>
	)
}

export {
	ConversationBotPile,
	type ConversationBotPileProps,
	type ConversationParticipant,
}
