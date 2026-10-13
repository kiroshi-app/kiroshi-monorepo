"use client"

import { useTranslation } from "react-i18next"

import { type Icon, Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

type EditorNoticeProps = {
	icon: Icon
	text: string
	danger?: boolean
}

const EditorNotice = ({
	icon: NoticeIcon,
	text,
	danger,
}: EditorNoticeProps) => (
	<p
		className={cn(
			"flex shrink-0 items-start gap-2 rounded-xl border p-3 text-xs leading-relaxed",
			danger
				? "border-destructive/40 bg-destructive/5 text-destructive"
				: "border-border bg-muted/40 text-muted-foreground",
		)}
	>
		<NoticeIcon
			aria-hidden="true"
			className={cn(
				"mt-0.5 size-3.5 shrink-0",
				danger ? "text-destructive" : "text-foreground",
			)}
		/>
		{text}
	</p>
)

const UnreadableConfigNotice = () => {
	const { t } = useTranslation("bots")

	return (
		<EditorNotice
			danger
			icon={Icons.Error}
			text={t("applications.config.invalid")}
		/>
	)
}

export { EditorNotice, UnreadableConfigNotice }
