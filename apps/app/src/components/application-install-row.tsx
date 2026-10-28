import type { ApplicationCardProps } from "@workspace/ui/components/application-card"
import { ApplicationInstallTurn } from "@workspace/ui/components/application-install-turn"
import { type ChatCopy, useChatCopy } from "@workspace/ui/hooks/use-chat-copy"

import type {
	Application,
	ApplicationInstall,
} from "@/lib/applications/application-port"

type ApplicationInstallRowProps = {
	install: ApplicationInstall
	curated: Application | undefined
	destinationName: string | undefined
	isLeftOut: boolean
	onOpenSettings: () => void
}

const receiptSentenceOf = (
	t: ChatCopy,
	{ scope, title }: ApplicationInstall,
	destinationName: string | undefined,
) => {
	if (scope === "user") {
		return t("applicationInstall.receipt.user", { name: title })
	}
	const destination = destinationName ?? ""
	if (scope === "space") {
		return t("applicationInstall.receipt.space", { name: title, destination })
	}
	return t("applicationInstall.receipt.agent", { name: title, destination })
}

export const ApplicationInstallRow = ({
	install,
	curated,
	destinationName,
	isLeftOut,
	onOpenSettings,
}: ApplicationInstallRowProps) => {
	const t = useChatCopy()
	const receipt: ApplicationCardProps = {
		description: install.description ?? curated?.description,
		footnote: {
			sentence: receiptSentenceOf(t, install, destinationName),
			actionLabel: t("applicationInstall.openSettings"),
			onAction: onOpenSettings,
		},
		mark: install.logo ?? install.logoUrl ?? curated?.logo ?? curated?.logoUrl,
		name: install.title,
	}

	return (
		<ApplicationInstallTurn
			notice={
				isLeftOut && install.install.kind === "key"
					? {
							title: install.title,
							secrets: install.install.secrets,
							onOpenSettings,
						}
					: undefined
			}
			receipt={receipt}
		/>
	)
}
