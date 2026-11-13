import { useTranslation } from "react-i18next"

import {
	type AnswerImage,
	accessibleNameOf,
} from "@workspace/ui/components/answer-blocks/answer-image"
import {
	type ImageMenuActions,
	PressableImageMenu,
} from "@workspace/ui/components/image-menu"
import { cn } from "@workspace/ui/lib/utils"

type WebPageCardProps = {
	domain: string
	title: string
	preview?: AnswerImage
	onOpen?: () => void
	imageMenu?: ImageMenuActions<AnswerImage>
	isSavingToLibrary?: boolean
	className?: string
}

const WebPageCard = ({
	domain,
	title,
	preview,
	onOpen,
	imageMenu,
	isSavingToLibrary,
	className,
}: WebPageCardProps) => {
	const { t } = useTranslation("chat")

	return (
		<article
			aria-label={title}
			data-slot="web-page-card"
			className={cn(
				"flex w-115 max-w-full min-w-0 flex-col overflow-hidden rounded-xl bg-card-raised ring-1 ring-shell-divider",
				className,
			)}
		>
			{preview ? (
				<PressableImageMenu
					{...imageMenu}
					className="flex rounded-t-xl -outline-offset-2"
					isSavingToLibrary={isSavingToLibrary}
					item={preview}
					name={accessibleNameOf(preview, title)}
					picture={
						<img
							src={preview.src}
							alt={preview.alt ?? ""}
							className="h-50 w-full object-cover"
						/>
					}
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
						className="shrink-0 rounded-md p-2 ring-1 ring-foreground/12 text-compact leading-4.5 font-medium outline-offset-2 hover:bg-foreground/8 active:bg-foreground/12"
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
