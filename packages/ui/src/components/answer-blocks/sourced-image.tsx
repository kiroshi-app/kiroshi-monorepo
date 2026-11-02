import { useTranslation } from "react-i18next"

import {
	type AnswerImage,
	accessibleNameOf,
} from "@workspace/ui/components/answer-blocks/answer-image"
import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

type SourcedImageSource = {
	domain: string
	favicon?: string
}

type SourcedImageProps = {
	image: AnswerImage
	title: string
	source: SourcedImageSource
	status?: string
	chips?: readonly string[]
	onSave?: () => void
	className?: string
}

const CHIP_CLASS = "rounded-full p-1.5 text-xs font-medium wrap-anywhere"

const SourcedImage = ({
	image,
	title,
	source,
	status,
	chips = [],
	onSave,
	className,
}: SourcedImageProps) => {
	const { t } = useTranslation("chat")
	const hasChips = status !== undefined || chips.length > 0

	return (
		<figure
			data-slot="sourced-image"
			className={cn("flex w-full min-w-0 flex-col gap-2", className)}
		>
			<div className="relative h-75 overflow-hidden rounded-xl">
				<img
					src={image.src}
					alt={accessibleNameOf(image, title)}
					className="size-full object-cover"
				/>
				{onSave ? (
					<button
						type="button"
						aria-label={t("answerBlock.sourcedImage.save")}
						className="absolute end-3 top-3 grid size-8 place-items-center rounded-full bg-black/70 text-white outline-offset-2 hover:bg-black/80 active:bg-black/90"
						onClick={onSave}
					>
						<Icons.Bookmark aria-hidden="true" className="size-3.5" />
					</button>
				) : null}
				<p className="absolute start-3 bottom-3 flex max-w-[calc(100%-1.5rem)] items-center gap-1.5 rounded-full bg-black/80 p-1.25 text-xs font-medium text-white">
					{source.favicon ? (
						<img
							src={source.favicon}
							alt=""
							className="size-3.5 shrink-0 rounded-[4px]"
						/>
					) : null}
					<span className="min-w-0 truncate">{source.domain}</span>
				</p>
			</div>
			<figcaption className="flex flex-col gap-2">
				<p className="text-[1.0625rem] leading-6 font-semibold wrap-anywhere">
					{title}
				</p>
				{hasChips ? (
					<ul className="flex flex-wrap gap-1.5">
						{status === undefined ? null : (
							<li
								data-slot="sourced-image-status"
								className={cn(
									CHIP_CLASS,
									"flex items-center gap-1.5 bg-success/12 text-success",
								)}
							>
								<span
									aria-hidden="true"
									className="size-1.5 shrink-0 rounded-full bg-success"
								/>
								{status}
							</li>
						)}
						{chips.map((chip) => (
							<li
								key={chip}
								className={cn(
									CHIP_CLASS,
									"bg-foreground/8 text-soft-foreground",
								)}
							>
								{chip}
							</li>
						))}
					</ul>
				) : null}
			</figcaption>
		</figure>
	)
}

export { SourcedImage, type SourcedImageProps, type SourcedImageSource }
