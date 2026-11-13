"use client"

import type { ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { BotTitleBadge } from "@workspace/ui/components/bot-badge"
import {
	type ActivityIndicatorKind,
	BotIdentityAvatar,
} from "@workspace/ui/components/bot-identity-avatar"
import {
	ConnectionStatus,
	type ConnectionStatusState,
} from "@workspace/ui/components/connection-status"
import {
	HEADER_ISLAND_CONTROL,
	useIsInHeaderIsland,
} from "@workspace/ui/components/header-island"
import { Icons } from "@workspace/ui/components/icons"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

const AVATAR_SIZE = 24

const HEADER_IDENTITY_CLASS = "h-9 min-w-0 shrink gap-2 pr-2.5 pl-1.5"

type HeaderSubjectButtonProps = {
	"aria-label": string
	"data-slot": string
	isSettingsOpen: boolean
	onOpenSettings?: () => void
	className?: string
	children: ReactNode
}

const HeaderSubjectButton = ({
	isSettingsOpen,
	onOpenSettings,
	className,
	children,
	...props
}: HeaderSubjectButtonProps) => {
	const isInIsland = useIsInHeaderIsland()

	if (!isInIsland)
		return (
			<Button
				aria-expanded={isSettingsOpen}
				className={cn(HEADER_IDENTITY_CLASS, className)}
				onClick={onOpenSettings}
				variant="ghost"
				{...props}
			>
				{children}
				<Icons.Settings aria-hidden="true" className="text-muted-foreground" />
			</Button>
		)

	return (
		<button
			aria-expanded={isSettingsOpen}
			className={cn(
				HEADER_ISLAND_CONTROL,
				"flex h-8 min-w-0 items-center gap-0.5 ps-1 text-foreground",
				className,
			)}
			onClick={onOpenSettings}
			type="button"
			{...props}
		>
			<span className="flex min-w-0 items-center gap-2 pe-1">{children}</span>
			<span className="flex w-8 shrink-0 justify-center">
				<Icons.Settings
					aria-hidden="true"
					className="size-4 text-muted-foreground"
				/>
			</span>
		</button>
	)
}

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
			<span className="min-w-0 truncate">{name}</span>
			<BotTitleBadge
				className="in-data-[slot=header-island]:@max-md:hidden in-data-[slot=header-island]:bg-muted"
				title={title}
				variant="line"
			/>
			<ConnectionStatus
				className="shrink-0"
				name={name}
				state={connection}
				version={version}
			/>
		</HeaderSubjectButton>
	)
}

export { HeaderIdentityButton, HeaderSubjectButton }
