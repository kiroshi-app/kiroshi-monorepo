"use client"

import { type CSSProperties, type ReactNode, useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { BLOT_TINTS, blotOf } from "@workspace/ui/components/companion-colour"
import { hueStyle, hueTone } from "@workspace/ui/components/hue-palette"
import { HUE_THEMES, type HueTheme } from "@workspace/ui/components/hue-recipe"
import { HUE_PRESETS } from "@workspace/ui/components/hue-tones"
import { Slider } from "@workspace/ui/components/ui/slider"
import { cn } from "@workspace/ui/lib/utils"

type ColourFieldLook = "swatch" | "avatar"

type ColourFieldProps = {
	value: number | null
	onValueChange: (hue: number | null) => void
	mark: (hue: number | null) => ReactNode
	preview: (hue: number | null) => ReactNode
	look?: ColourFieldLook
	noColour?: "first" | "last"
	hint?: string
	className?: string
}

type ColourOption = "none" | "own" | (typeof BLOT_TINTS)[number]

const LAST_HUE = 359

const THUMB_RADIUS = 12

const DEFAULT_OWN_HUE = 320

const RAINBOW_HUES = [
	0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330, 359,
]

const rainbowStops = (theme: HueTheme, at: (hue: number) => string) =>
	RAINBOW_HUES.map(
		(hue) => `${hueTone(hue, theme, "accent").hex} ${at(hue)}`,
	).join(", ")

const trackStopAt = (hue: number) =>
	`calc(${THUMB_RADIUS}px + (100% - ${2 * THUMB_RADIUS}px) * ${hue / LAST_HUE})`

const discStopAt = (hue: number) => `${hue}deg`

const RAINBOW_STYLE = Object.fromEntries(
	HUE_THEMES.flatMap((theme) => [
		[
			`--rainbow-track-${theme}`,
			`linear-gradient(to right, ${rainbowStops(theme, trackStopAt)})`,
		],
		[
			`--rainbow-disc-${theme}`,
			`conic-gradient(${rainbowStops(theme, discStopAt)})`,
		],
	]),
) as CSSProperties

const RAINBOW_DISC_CLASS =
	"rounded-full bg-(image:--rainbow-disc-light) dark:bg-(image:--rainbow-disc-dark)"

const OPTION_CLASS =
	"relative grid cursor-pointer place-items-center rounded-md border border-border hover:bg-muted active:bg-muted has-checked:border-[1.5px] has-focus-visible:outline-2 has-focus-visible:outline-ring has-focus-visible:outline-offset-2"

const OPTION_LOOK_CLASS: Record<ColourFieldLook, string> = {
	swatch: "h-10 w-12 has-checked:border-foreground has-checked:bg-muted",
	avatar:
		"p-1 has-checked:border-(--bot-avatar-field) has-checked:bg-(--bot-avatar-ground)",
}

const SLIDER_CLASS = cn(
	"[&_[data-slot=slider-track]]:h-4 [&_[data-slot=slider-track]]:rounded-md [&_[data-slot=slider-track]]:bg-(image:--rainbow-track-light) dark:[&_[data-slot=slider-track]]:bg-(image:--rainbow-track-dark)",
	"[&_[data-slot=slider-range]]:hidden",
	"[&_[data-slot=slider-thumb]]:size-6 [&_[data-slot=slider-thumb]]:border-3 [&_[data-slot=slider-thumb]]:border-white [&_[data-slot=slider-thumb]]:bg-primary [&_[data-slot=slider-thumb]]:bg-clip-border [&_[data-slot=slider-thumb]]:shadow-[0_0_0_1px_rgb(0_0_0/0.12),0_1px_3px_rgb(0_0_0/0.2)] [&_[data-slot=slider-thumb]]:ring-0 [&_[data-slot=slider-thumb]]:transition-none",
	"[&_[data-slot=slider-thumb]:has(:focus-visible)]:outline-2 [&_[data-slot=slider-thumb]:has(:focus-visible)]:outline-ring [&_[data-slot=slider-thumb]:has(:focus-visible)]:outline-offset-2",
)

const optionOf = (hue: number | null): ColourOption =>
	hue === null ? "none" : (blotOf(hue) ?? "own")

const firstOf = (value: number | readonly number[]) =>
	typeof value === "number" ? value : (value[0] ?? 0)

type OwnHueMarkProps = {
	look: ColourFieldLook
	mark: ReactNode
}

const OwnHueMark = ({ look, mark }: OwnHueMarkProps) =>
	look === "swatch" ? (
		<span
			aria-hidden="true"
			className={cn("grid size-6 place-items-center", RAINBOW_DISC_CLASS)}
		>
			<span className="size-3 rounded-full bg-primary ring-2 ring-card" />
		</span>
	) : (
		<span aria-hidden="true" className="relative flex">
			{mark}
			<span
				className={cn(
					"absolute -end-0.5 -bottom-0.5 size-4.5 ring-2 ring-card",
					RAINBOW_DISC_CLASS,
				)}
			/>
		</span>
	)

const ColourField = ({
	value,
	onValueChange,
	mark,
	preview,
	look = "swatch",
	noColour = "first",
	hint,
	className,
}: ColourFieldProps) => {
	const { t } = useTranslation("bots")
	const groupId = useId()
	const ownLabelId = useId()
	const [isPickingOwnHue, setIsPickingOwnHue] = useState(false)
	const [ownHue, setOwnHue] = useState(value ?? DEFAULT_OWN_HUE)

	const valueOption = optionOf(value)
	const selected = isPickingOwnHue ? "own" : valueOption
	const shownOwnHue = valueOption === "own" && value !== null ? value : ownHue
	const shownHue = selected === "own" ? shownOwnHue : value

	const options: ColourOption[] =
		noColour === "first"
			? ["none", ...BLOT_TINTS, "own"]
			: [...BLOT_TINTS, "none", "own"]

	const choose = (option: ColourOption) => {
		setIsPickingOwnHue(option === "own")
		if (option === "own") {
			setOwnHue(shownOwnHue)
			onValueChange(shownOwnHue)
			return
		}
		onValueChange(option === "none" ? null : HUE_PRESETS[option])
	}

	const slide = (next: number | readonly number[]) => {
		const hue = firstOf(next)
		setIsPickingOwnHue(true)
		setOwnHue(hue)
		onValueChange(hue)
	}

	const labelOf = (option: ColourOption) => {
		if (option === "none") return t("identity.colour.none")
		if (option === "own") return t("identity.colour.own")
		return t(`identity.colour.option.${option}`)
	}

	const hueOfOption = (option: ColourOption) => {
		if (option === "none") return null
		if (option === "own") return shownOwnHue
		return HUE_PRESETS[option]
	}

	return (
		<div
			className={cn("flex min-w-0 flex-col gap-5", className)}
			data-slot="colour-field"
			style={RAINBOW_STYLE}
		>
			<fieldset className="flex min-w-0 flex-col gap-3 border-0 p-0">
				<legend className="mb-2 font-medium text-muted-foreground text-xs in-data-companion-page:text-foreground">
					{t("identity.colour.label")}
				</legend>
				<div className="flex flex-wrap gap-1" data-slot="colour-field-options">
					{options.map((option) => {
						const hue = hueOfOption(option)
						return (
							<label
								className={cn(OPTION_CLASS, OPTION_LOOK_CLASS[look])}
								data-hue={hue ?? undefined}
								data-option={option}
								key={option}
								style={hue === null ? undefined : hueStyle(hue)}
								title={labelOf(option)}
							>
								<input
									checked={selected === option}
									className="sr-only"
									name={`${groupId}-colour`}
									onChange={() => choose(option)}
									type="radio"
									value={option}
								/>
								{option === "own" ? (
									<OwnHueMark look={look} mark={mark(hue)} />
								) : (
									mark(hue)
								)}
								<span className="sr-only">{labelOf(option)}</span>
							</label>
						)
					})}
				</div>

				{selected === "own" ? (
					<div
						className="flex flex-col gap-2.5 rounded-control border border-border p-3.5"
						data-hue={shownOwnHue}
						data-slot="colour-field-hue"
						style={hueStyle(shownOwnHue)}
					>
						<div className="flex items-center justify-between gap-3">
							<span
								className="font-medium text-compact text-foreground leading-4.5"
								id={ownLabelId}
							>
								{t("identity.colour.own")}
							</span>
							<span
								aria-hidden="true"
								className="inline-flex h-7 items-center rounded-md bg-muted px-2.5 font-mono text-compact text-foreground tabular-nums"
								data-slot="colour-field-readout"
							>
								{shownOwnHue}
								<span className="text-muted-foreground">
									{t("identity.colour.degree")}
								</span>
							</span>
						</div>
						<Slider
							aria-labelledby={ownLabelId}
							className={SLIDER_CLASS}
							format={{ style: "unit", unit: "degree" }}
							max={LAST_HUE}
							min={0}
							onValueChange={slide}
							value={[shownOwnHue]}
						/>
						{hint ? (
							<p className="text-muted-foreground text-xs">{hint}</p>
						) : null}
					</div>
				) : null}
			</fieldset>

			<div className="flex min-w-0 flex-col gap-2" data-slot="colour-preview">
				<span className="font-medium text-muted-foreground text-xs">
					{t("identity.colour.preview")}
				</span>
				<div className="min-w-0 rounded-control bg-muted">
					{preview(shownHue)}
				</div>
			</div>
		</div>
	)
}

export { ColourField, type ColourFieldLook, type ColourFieldProps }
