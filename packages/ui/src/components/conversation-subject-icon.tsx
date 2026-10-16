import conversationIcons from "@workspace/shared/conversation-icons.json"
import type { BotAvatarBlot } from "@workspace/ui/components/companion-colour"
import {
	type ConversationIconName,
	ConversationIcons,
} from "@workspace/ui/components/icons"
import { OutlinedHexagon } from "@workspace/ui/components/outlined-hexagon"

const CELL_SIDE = 40

const CELL = "relative grid size-10 shrink-0 place-items-center"

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
			<OutlinedHexagon fill={`var(${token})`} side={CELL_SIDE} />
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
