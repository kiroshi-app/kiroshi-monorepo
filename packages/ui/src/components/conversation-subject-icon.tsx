import conversationIcons from "@workspace/shared/conversation-icons.json"
import type { BotAvatarBlot } from "@workspace/ui/components/companion-colour"
import {
	type ConversationIconName,
	ConversationIcons,
} from "@workspace/ui/components/icons"
import { OutlinedHexagon } from "@workspace/ui/components/outlined-hexagon"

const CELL = "relative grid shrink-0 place-items-center"

const PICTOGRAM = "relative"

type ConversationSubjectIconProps = {
	icon?: string
	color?: BotAvatarBlot
	side?: number
}

const isConversationIcon = (
	icon: string | undefined,
): icon is ConversationIconName =>
	icon !== undefined && conversationIcons.includes(icon)

const conversationIconOf = (icon: string | undefined): ConversationIconName =>
	isConversationIcon(icon) ? icon : "MessageSquare"

const pairTokenOf = (color: BotAvatarBlot | undefined) =>
	color ? `--conversation-icon-${color}` : "--conversation-icon"

const ConversationSubjectIcon = ({
	icon,
	color,
	side = 40,
}: ConversationSubjectIconProps) => {
	const token = pairTokenOf(color)
	const Pictogram = ConversationIcons[conversationIconOf(icon)]

	return (
		<span
			aria-hidden="true"
			className={CELL}
			data-slot="conversation-subject-icon"
			style={{
				color: `var(${token}-foreground)`,
				width: side,
				height: side,
			}}
		>
			<OutlinedHexagon fill={`var(${token})`} side={side} />
			<span className={PICTOGRAM} style={{ width: side / 2, height: side / 2 }}>
				<Pictogram
					className="size-full"
					data-slot="conversation-subject-icon-pictogram"
				/>
			</span>
		</span>
	)
}

export {
	ConversationSubjectIcon,
	type ConversationSubjectIconProps,
	conversationIconOf,
}
