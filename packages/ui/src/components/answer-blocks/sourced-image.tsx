import { useTranslation } from "react-i18next"

import {
	type AnswerImage,
	accessibleNameOf,
} from "@workspace/ui/components/answer-blocks/answer-image"
import { Icons } from "@workspace/ui/components/icons"
import {
	ImageMenu,
	type ImageMenuActions,
} from "@workspace/ui/components/image-menu"
import { cn } from "@workspace/ui/lib/utils"

type SourcedImageSource = {
	domain: string
	url: string
	favicon?: string
}

type SourcedImageProps = {
	image: AnswerImage
	title: string
	source: SourcedImageSource
	status?: string
	chips?: readonly string[]
	onOpen?: () => void
	imageMenu?: ImageMenuActions<AnswerImage>
	isSaving?: boolean
	isUnavailable?: boolean
	className?: string
}

const CHIP_CLASS = "rounded-full p-1.5 text-xs font-medium wrap-anywhere"

const SourcedImage = ({
	image,
	title,
	source,
	status,
	chips = [],
	onOpen,
	imageMenu,
	isSaving = false,
	isUnavailable = false,
	className,
}: SourcedImageProps) => {
	const { t } = useTranslation("chat")
	const hasChips = status !== undefined || chips.length > 0
	const name = accessibleNameOf(image, title)
	const onSaveToLibrary = imageMenu?.onSaveToLibrary
	const picture = (
		<img src={image.src} alt={name} className="size-full object-cover" />
	)
	const openable = onOpen ? (
		<button
			type="button"
			aria-label={name}
			data-slot="sourced-image-open"
			className="block size-full -outline-offset-2"
			onClick={onOpen}
		>
			{picture}
		</button>
	) : (
		picture
	)

	return (
		<figure
			data-slot="sourced-image"
			className={cn("flex w-full min-w-0 flex-col gap-2", className)}
		>
			{isUnavailable ? (
				<div
					className="flex h-75 flex-col items-center justify-center gap-2.5 rounded-xl border border-border bg-muted p-4 text-center"
					data-slot="sourced-image-unavailable"
				>
					<Icons.ImageOff
						aria-hidden="true"
						className="size-6 shrink-0 text-muted-foreground"
					/>
					<p className="text-sm leading-5 font-medium">
						{t("answerBlock.sourcedImage.unavailable")}
					</p>
					<a
						className="inline-flex items-center gap-1 text-compact leading-4.5 font-medium underline decoration-foreground/30 decoration-1 underline-offset-3 outline-offset-2"
						href={source.url}
						rel="noreferrer noopener"
						target="_blank"
					>
						{t("answerBlock.sourcedImage.openOriginal")}
						<Icons.ArrowUpRight
							aria-hidden="true"
							className="size-3 shrink-0"
						/>
					</a>
				</div>
			) : (
				<div className="relative h-75 overflow-hidden rounded-xl">
					<ImageMenu
						{...imageMenu}
						isSavingToLibrary={isSaving}
						item={image}
						name={name}
						trigger={openable}
					/>
					{onSaveToLibrary ? (
						<button
							type="button"
							aria-label={t(
								isSaving
									? "answerBlock.sourcedImage.saving"
									: "answerBlock.sourcedImage.save",
							)}
							aria-disabled={isSaving || undefined}
							aria-busy={isSaving || undefined}
							className={cn(
								"absolute end-3 top-3 grid size-8 place-items-center rounded-full bg-black/70 text-white outline-offset-2",
								!isSaving && "hover:bg-black/80 active:bg-black/90",
							)}
							onClick={isSaving ? undefined : () => onSaveToLibrary(image)}
						>
							{isSaving ? (
								<Icons.Loading
									aria-hidden="true"
									data-slot="sourced-image-saving"
									className="size-3.5 animate-spin motion-reduce:animate-none"
								/>
							) : (
								<Icons.Bookmark aria-hidden="true" className="size-3.5" />
							)}
						</button>
					) : null}
				</div>
			)}
			<figcaption className="flex flex-col gap-2">
				<div className="flex flex-col gap-1">
					<p
						className="flex min-w-0 items-center gap-1.5 text-xs leading-4 font-medium text-muted-foreground"
						data-slot="sourced-image-source"
					>
						{source.favicon ? (
							<img
								src={source.favicon}
								alt=""
								className="size-3.5 shrink-0 rounded-[4px]"
							/>
						) : null}
						<span className="min-w-0 truncate">{source.domain}</span>
					</p>
					<p className="text-[1.0625rem] leading-6 font-semibold wrap-anywhere">
						{title}
					</p>
				</div>
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
						{chips.map((chip, position) => (
							<li
								// biome-ignore lint/suspicious/noArrayIndexKey: chips are a fixed row, two may carry the same label
								key={position}
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
