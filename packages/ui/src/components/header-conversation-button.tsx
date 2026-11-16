"use client"

import { useTranslation } from "react-i18next"

import {
	APP_HEADER_TITLE,
	AppHeaderText,
} from "@workspace/ui/components/app-header"
import {
	ConversationSubjectIcon,
	type ConversationSubjectIconProps,
} from "@workspace/ui/components/conversation-subject-icon"
import { HeaderSubjectButton } from "@workspace/ui/components/header-identity-button"

const AVATAR_SIZE = 32

type HeaderConversationButtonProps = Pick<
	ConversationSubjectIconProps,
	"icon"
> & {
	color?: number | null
	name: string
	isSettingsOpen?: boolean
	onOpenSettings?: () => void
	className?: string
}

const HeaderConversationButton = ({
	name,
	icon,
	color,
	isSettingsOpen = false,
	onOpenSettings,
	className,
}: HeaderConversationButtonProps) => {
	const { t } = useTranslation("chat")

	return (
		<HeaderSubjectButton
			aria-label={t("screen.conversationIdentity", { name })}
			className={className}
			data-slot="header-conversation-button"
			isSettingsOpen={isSettingsOpen}
			onOpenSettings={onOpenSettings}
		>
			<ConversationSubjectIcon
				hue={color}
				icon={icon}
				isSquare
				side={AVATAR_SIZE}
			/>
			<AppHeaderText>
				<span className={APP_HEADER_TITLE}>{name}</span>
			</AppHeaderText>
		</HeaderSubjectButton>
	)
}

export { HeaderConversationButton }
