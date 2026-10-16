import { useId } from "react"

import conversationIcons from "@workspace/shared/conversation-icons.json"
import type { BotAvatarBlot } from "@workspace/ui/components/companion-colour"
import {
	type ConversationIconName,
	ConversationIcons,
} from "@workspace/ui/components/icons"
import {
	OUTER,
	roundedHexagonPath,
} from "@workspace/ui/components/kiroshi-hexagon"

const CELL_SIDE = 40

const CELL_PATH = roundedHexagonPath({
	halfWidth: CELL_SIDE / 2,
	halfHeight: (OUTER.halfHeight * CELL_SIDE) / (OUTER.halfWidth * 2),
})

const INSIDE_STROKE_WIDTH = 2

const CELL = "relative grid size-10 shrink-0 place-items-center"

const CELL_ART = "pointer-events-none absolute inset-0 size-full"

const PICTOGRAM = "relative size-5"

type ConversationSubjectIconProps = {
	icon?: string
	color?: BotAvatarBlot
}

const isConversationIcon = (
	icon: string | undefined,
): icon is ConversationIconName =>
	icon !== undefined && conversationIcons.includes(icon)

const pairTokenOf = (color: BotAvatarBlot | undefined) =>
	color ? `--conversation-icon-${color}` : "--conversation-icon"

const ConversationSubjectIcon = ({
	icon,
	color,
}: ConversationSubjectIconProps) => {
	const edgeClipId = useId()
	const token = pairTokenOf(color)
	const Pictogram =
		ConversationIcons[isConversationIcon(icon) ? icon : "MessageSquare"]

	return (
		<span
			aria-hidden="true"
			className={CELL}
			data-slot="conversation-subject-icon"
			style={{ color: `var(${token}-foreground)` }}
		>
			<svg
				aria-hidden="true"
				className={CELL_ART}
				viewBox={`0 0 ${CELL_SIDE} ${CELL_SIDE}`}
			>
				<path
					clipPath={`url(#${edgeClipId})`}
					d={CELL_PATH}
					data-slot="conversation-subject-icon-cell"
					strokeWidth={INSIDE_STROKE_WIDTH}
					style={{ fill: `var(${token})`, stroke: "var(--image-outline)" }}
				/>
				<clipPath id={edgeClipId}>
					<path d={CELL_PATH} />
				</clipPath>
			</svg>
			<span className={PICTOGRAM}>
				<Pictogram
					className="size-full"
					data-slot="conversation-subject-icon-pictogram"
				/>
			</span>
		</span>
	)
}

export { ConversationSubjectIcon, type ConversationSubjectIconProps }
