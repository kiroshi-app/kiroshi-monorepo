import {
	ConversationSubjectIcon,
	conversationIconOf,
} from "@workspace/ui/components/conversation-subject-icon"
import { ConversationIcons } from "@workspace/ui/components/icons"

const TAB_GLYPH_SIDE = 15

type ConversationTabIconProps = {
	icon?: string
	hue?: number | null
}

const ConversationTabIcon = ({ icon, hue }: ConversationTabIconProps) => {
	if (hue == null) {
		const Glyph = ConversationIcons[conversationIconOf(icon)]
		return <Glyph />
	}
	return (
		<ConversationSubjectIcon
			hue={hue}
			icon={icon}
			isBare
			isFilled
			side={TAB_GLYPH_SIDE}
		/>
	)
}

export { ConversationTabIcon, type ConversationTabIconProps }
