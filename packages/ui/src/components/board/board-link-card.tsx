type BoardLinkCardProps = {
	preview: string
	title: string
	description: string
	domain: string
}

const BoardLinkCard = ({
	preview,
	title,
	description,
	domain,
}: BoardLinkCardProps) => (
	<div
		className="flex w-75 flex-col overflow-hidden rounded-lg border border-board-card-border bg-board-card-surface shadow-board-card"
		data-slot="board-link-card"
	>
		<img
			alt=""
			className="h-18 w-full bg-board-card-inset object-cover"
			data-slot="board-link-card-preview"
			src={preview}
		/>
		<div className="flex min-w-0 flex-col gap-1 p-3">
			<p
				className="truncate font-semibold text-board-card-foreground text-sm leading-4.5"
				data-slot="board-link-card-title"
			>
				{title}
			</p>
			<p
				className="line-clamp-2 wrap-break-word text-board-card-soft-foreground text-xs leading-4.25"
				data-slot="board-link-card-description"
			>
				{description}
			</p>
			<p
				className="flex items-center gap-1.5 pt-1 text-board-muted-foreground text-xs"
				data-slot="board-link-card-source"
			>
				<span
					aria-hidden="true"
					className="grid size-3.5 shrink-0 place-items-center rounded-full bg-board-card-inset font-bold text-[8px] text-board-card-soft-foreground uppercase leading-2.5"
				>
					{Array.from(domain)[0]}
				</span>
				<span className="min-w-0 truncate">{domain}</span>
			</p>
		</div>
	</div>
)

export { BoardLinkCard, type BoardLinkCardProps }
