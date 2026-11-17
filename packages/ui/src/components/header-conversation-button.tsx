"use client"

import { useTranslation } from "react-i18next"

import {
	type ConversationNaming,
	conversationLabelOf,
} from "@workspace/ui/components/conversation-naming"
import {
	ConversationSubjectIcon,
	type ConversationSubjectIconProps,
} from "@workspace/ui/components/conversation-subject-icon"
import { HEADER_IDENTITY_CLASS } from "@workspace/ui/components/header-identity-button"
import { Icons } from "@workspace/ui/components/icons"
import { TextSwap } from "@workspace/ui/components/motion/text-swap"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

const AVATAR_SIZE = 24

const LABEL = "min-w-0 truncate"

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
		<Button
			aria-expanded={isSettingsOpen}
			aria-label={t("chat:screen.conversationIdentity", { name: label })}
			className={cn(HEADER_IDENTITY_CLASS, className)}
			data-slot="header-conversation-button"
			onClick={onOpenSettings}
			variant="ghost"
		>
			<ConversationSubjectIcon
				hue={isNamed ? color : null}
				icon={isNamed ? icon : undefined}
				isMuted={naming === "pending"}
				side={AVATAR_SIZE}
			/>
			{naming ? (
				<TextSwap
					className={LABEL}
					isShimmering={naming === "pending"}
					text={label}
				/>
			) : (
				<span className={LABEL}>{name}</span>
			)}
			<Icons.Settings aria-hidden="true" className="text-muted-foreground" />
		</Button>
	)
}

export { HeaderConversationButton }
