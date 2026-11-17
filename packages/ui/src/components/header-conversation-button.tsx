"use client"

import { useTranslation } from "react-i18next"

import {
	APP_HEADER_TITLE,
	AppHeaderText,
} from "@workspace/ui/components/app-header"
import {
	type ConversationNaming,
	conversationLabelOf,
} from "@workspace/ui/components/conversation-naming"
import {
	ConversationSubjectIcon,
	type ConversationSubjectIconProps,
} from "@workspace/ui/components/conversation-subject-icon"
import { HeaderSubjectButton } from "@workspace/ui/components/header-identity-button"
import { TextSwap } from "@workspace/ui/components/motion/text-swap"

const AVATAR_SIZE = 32

type HeaderConversationButtonProps = Pick<
	ConversationSubjectIconProps,
	"icon"
> & {
	color?: number | null
	name: string
	naming?: ConversationNaming
	isSettingsOpen?: boolean
	onOpenSettings?: () => void
	className?: string
}

const HeaderConversationButton = ({
	name,
	naming,
	icon,
	color,
	isSettingsOpen = false,
	onOpenSettings,
	className,
}: HeaderConversationButtonProps) => {
	const { t } = useTranslation(["common", "chat"])
	const label = conversationLabelOf(t, name, naming)
	const isNamed = naming === undefined || naming === "arrived"

	return (
		<HeaderSubjectButton
			aria-label={t("chat:screen.conversationIdentity", { name: label })}
			className={className}
			data-slot="header-conversation-button"
			isSettingsOpen={isSettingsOpen}
			onOpenSettings={onOpenSettings}
		>
			<ConversationSubjectIcon
				hue={isNamed ? color : null}
				icon={isNamed ? icon : undefined}
				isMuted={naming === "pending"}
				isSquare
				side={AVATAR_SIZE}
			/>
			<AppHeaderText>
				<span className={APP_HEADER_TITLE}>
					{naming ? (
						<TextSwap
							className="truncate"
							isShimmering={naming === "pending"}
							text={label}
						/>
					) : (
						name
					)}
				</span>
			</AppHeaderText>
		</HeaderSubjectButton>
	)
}

export { HeaderConversationButton }
