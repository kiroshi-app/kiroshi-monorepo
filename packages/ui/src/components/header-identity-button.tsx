"use client"

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import {
	APP_HEADER_TITLE,
	AppHeaderButton,
	AppHeaderText,
} from "@workspace/ui/components/app-header"
import {
	type ActivityIndicatorKind,
	BotIdentityAvatar,
} from "@workspace/ui/components/bot-identity-avatar"
import {
	ConnectionStatus,
	type ConnectionStatusState,
} from "@workspace/ui/components/connection-status"
import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

const AVATAR_SIZE = 32

type HeaderSubjectButtonProps = {
	"aria-label": string
	"data-slot": string
	isSettingsOpen: boolean
	onOpenSettings?: () => void
	className?: string
	children: ReactNode
}

const HeaderSubjectButton = ({
	"aria-label": settingsLabel,
	isSettingsOpen,
	onOpenSettings,
	className,
	children,
	...props
}: HeaderSubjectButtonProps) => (
	<div
		className={cn("flex min-w-0 items-center gap-2.5", className)}
		{...props}
	>
		{children}
		<AppHeaderButton
			aria-expanded={isSettingsOpen}
			aria-label={settingsLabel}
			kind="subject"
			onClick={onOpenSettings}
		>
			<Icons.Settings aria-hidden="true" />
		</AppHeaderButton>
	</div>
)

type HeaderIdentityButtonProps = {
	name: string
	title?: string
	blot?: number | null
	seed?: string
	image?: string
	working?: boolean
	kind?: ActivityIndicatorKind
	connection: ConnectionStatusState
	version?: string | null
	isSettingsOpen?: boolean
	onOpenSettings?: () => void
	className?: string
}

const HeaderIdentityButton = ({
	name,
	title,
	blot,
	seed,
	image,
	working,
	kind,
	connection,
	version,
	isSettingsOpen = false,
	onOpenSettings,
	className,
}: HeaderIdentityButtonProps) => {
	const { t } = useTranslation("chat")

	const shownName = <span className={APP_HEADER_TITLE}>{name}</span>
	const besidePresence = (line: ReactNode) => (
		<span className="flex min-w-0 items-center gap-1.5">
			{line}
			<ConnectionStatus
				className="shrink-0"
				name={name}
				state={connection}
				version={version}
			/>
		</span>
	)

	return (
		<HeaderSubjectButton
			aria-label={t("screen.identity", { name })}
			className={className}
			data-slot="header-identity-button"
			isSettingsOpen={isSettingsOpen}
			onOpenSettings={onOpenSettings}
		>
			<BotIdentityAvatar
				hue={blot}
				image={image}
				kind={kind}
				name={name}
				seed={seed}
				size={AVATAR_SIZE}
				working={working}
			/>
			<AppHeaderText
				topLine={
					title
						? besidePresence(<span className="truncate">{title}</span>)
						: undefined
				}
			>
				{title ? shownName : besidePresence(shownName)}
			</AppHeaderText>
		</HeaderSubjectButton>
	)
}

export { HeaderIdentityButton, HeaderSubjectButton }
