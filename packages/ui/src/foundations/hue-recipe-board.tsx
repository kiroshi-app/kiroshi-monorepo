import { hueStyle } from "@workspace/ui/components/hue-palette"

type HueRecipeBoardProps = { hues: number[] }

const HueRecipeBoard = ({ hues }: HueRecipeBoardProps) => (
	<div className="flex flex-col gap-3 bg-background p-6 text-foreground">
		{hues.map((hue) => (
			<div
				className="grid grid-cols-[3rem_8rem_8rem_6rem_4rem] items-center gap-3 text-sm"
				data-hue={hue}
				data-slot="hue-recipe-row"
				key={hue}
				style={hueStyle(hue)}
			>
				<span className="text-muted-foreground tabular-nums">{hue}</span>
				<span
					className="surface-user-bubble on-user-bubble rounded-2xl px-3 py-1.5 text-user-bubble-foreground"
					data-slot="hue-recipe-bubble"
				>
					Sent at {hue}
				</span>
				<span
					className="rounded-md bg-card px-3 py-1.5 font-medium text-primary-strong"
					data-slot="hue-recipe-accent"
				>
					Accent
				</span>
				<span
					aria-hidden="true"
					className="h-px bg-transcript-new-mark"
					data-slot="hue-recipe-new-line"
				/>
				<span
					aria-hidden="true"
					className="grid size-10 place-items-center rounded-lg bg-(--bot-avatar-ground)"
					data-slot="hue-recipe-avatar-ground"
				>
					<span
						className="size-4 rounded-sm bg-(--bot-avatar-field)"
						data-slot="hue-recipe-avatar-ink"
					/>
				</span>
			</div>
		))}
	</div>
)

export { HueRecipeBoard }
