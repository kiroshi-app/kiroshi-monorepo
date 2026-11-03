import { useTranslation } from "react-i18next"

import type { AnswerImage } from "@workspace/ui/components/answer-blocks/answer-image"
import { cn } from "@workspace/ui/lib/utils"

type WebPageCardProps = {
	domain: string
	title: string
	preview?: AnswerImage
	onOpen?: () => void
	className?: string
}

const WebPageCard = ({
	domain,
	title,
	preview,
	onOpen,
	className,
}: WebPageCardProps) => {
	const { t } = useTranslation("chat")

	return (
		<article
			aria-label={title}
			data-slot="web-page-card"
			className={cn(
				"flex w-115 max-w-full min-w-0 flex-col overflow-hidden rounded-xl border border-shell-divider bg-card-raised",
				className,
			)}
		>
			{preview ? (
				<img
					src={preview.src}
					alt={preview.alt ?? ""}
					className="h-50 w-full object-cover"
				/>
			) : null}
			<div
				className={cn(
					"flex items-center gap-3 p-3",
					preview && "border-t border-shell-border",
				)}
			>
				<div className="flex min-w-0 flex-1 flex-col gap-0.5">
					<p className="truncate text-xs text-muted-foreground">{domain}</p>
					<p className="text-sm font-semibold wrap-anywhere">{title}</p>
				</div>
				{onOpen ? (
					<button
						type="button"
						className="shrink-0 rounded-md border border-foreground/12 p-2 text-compact leading-4.5 font-medium outline-offset-2 hover:bg-foreground/8 active:bg-foreground/12"
						onClick={onOpen}
					>
						{t("answerBlock.webPage.open")}
					</button>
				) : null}
			</div>
		</article>
	)
}

export { WebPageCard, type WebPageCardProps }
