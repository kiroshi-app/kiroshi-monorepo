import type { TFunction } from "i18next"
import type { ComponentProps, ReactNode } from "react"
import { useTranslation } from "react-i18next"

import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import { EmptyStateShell } from "@workspace/ui/components/empty-state-shell"
import { Icons } from "@workspace/ui/components/icons"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type ChatEmptyStateStatus = "ready" | "unavailable" | "notConnected"

interface ChatEmptyStateProps extends Omit<ComponentProps<"div">, "children"> {
	status?: ChatEmptyStateStatus
	onSetup?: () => void
	onSignIn?: () => void
	onOpenSettings?: () => void
	name?: string
	blot?: number | null
	seed?: string
	image?: string
}

const MARK_SIZE = 64

type ChatEmptyStateCopyInput = {
	status: ChatEmptyStateStatus
	name?: string
	t: TFunction<"chat">
}

const chatEmptyStateCopy = ({ status, name, t }: ChatEmptyStateCopyInput) => {
	if (!name || status === "notConnected")
		return {
			title: t(`emptyState.${status}.title`),
			description: t(`emptyState.${status}.description`),
		}

	if (status === "ready")
		return {
			title: name,
			description: t("emptyState.ready.descriptionNamed", { name }),
		}

	return {
		title: t("emptyState.unavailable.titleNamed", { name }),
		description: t("emptyState.unavailable.descriptionNamed", { name }),
	}
}

function ChatEmptyState({
	status = "ready",
	onSetup,
	onSignIn,
	onOpenSettings,
	name,
	blot,
	seed,
	image,
	className,
	...props
}: ChatEmptyStateProps) {
	const { t } = useTranslation("chat")
	const isReady = status === "ready"
	const copy = chatEmptyStateCopy({ status, name, t })

	const settingsAction = onOpenSettings ? (
		<Button onClick={onOpenSettings} variant="outline">
			<Icons.Settings aria-hidden="true" />
			{t("emptyState.settings")}
		</Button>
	) : null

	const actions: Record<ChatEmptyStateStatus, ReactNode> = {
		ready: settingsAction,
		unavailable: <Button onClick={onSetup}>{t("emptyState.setup")}</Button>,
		notConnected: <Button onClick={onSignIn}>{t("emptyState.signIn")}</Button>,
	}

	const botMark = (
		<BotIdentityAvatar
			hue={blot}
			image={image}
			name={name}
			seed={seed}
			size={MARK_SIZE}
		/>
	)

	const alertMark = (
		<span className="flex size-12 items-center justify-center rounded-2xl border border-destructive bg-destructive/10 text-destructive">
			<Icons.Alert aria-hidden="true" className="size-6" />
		</span>
	)

	return (
		<EmptyStateShell
			action={actions[status]}
			className={cn("m-auto", className)}
			data-slot="chat-empty-state"
			data-status={status}
			description={copy.description}
			hint={isReady ? t("emptyState.hint") : undefined}
			mark={isReady ? botMark : alertMark}
			title={copy.title}
			{...props}
		/>
	)
}

export { ChatEmptyState, type ChatEmptyStateStatus }
