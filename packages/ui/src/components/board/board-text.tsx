type BoardTextProps =
	| { heading: string; body?: string }
	| { heading?: string; body: string }

const BoardText = ({ heading, body }: BoardTextProps) => (
	<div
		className="flex w-75 flex-col gap-1.5 wrap-break-word"
		data-slot="board-text"
	>
		{heading ? (
			<p
				className="font-bold text-2xl text-board-foreground leading-7.5 tracking-[-0.02em]"
				data-slot="board-text-heading"
			>
				{heading}
			</p>
		) : null}
		{body ? (
			<p
				className="text-board-body-foreground text-reading"
				data-slot="board-text-body"
			>
				{body}
			</p>
		) : null}
	</div>
)

export { BoardText, type BoardTextProps }
