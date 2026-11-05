import { Icons } from "@workspace/ui/components/icons"

type BoardImageProps = {
	src: string
	alt: string
	width: number
	height: number
	source?: string
}

const BoardImage = ({ src, alt, width, height, source }: BoardImageProps) => {
	const image = (
		<img
			alt={alt}
			className="rounded-sm object-cover shadow-board-sticky"
			data-slot="board-image"
			height={height}
			src={src}
			style={{ width, height }}
			width={width}
		/>
	)

	if (!source) return image

	return (
		<figure
			className="flex flex-col gap-1.5"
			data-slot="board-image-with-source"
			style={{ width }}
		>
			{image}
			<figcaption
				className="flex items-center gap-1.5 text-board-muted-foreground text-xs"
				data-slot="board-image-source"
			>
				<Icons.Link aria-hidden="true" className="size-3 shrink-0" />
				<span className="min-w-0 truncate">{source}</span>
			</figcaption>
		</figure>
	)
}

export { BoardImage, type BoardImageProps }
