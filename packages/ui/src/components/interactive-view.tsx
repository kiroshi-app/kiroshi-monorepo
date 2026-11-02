"use client"

import { Slider } from "@base-ui/react/slider"
import { useState } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { cn } from "@workspace/ui/lib/utils"

export type InteractiveViewMode = "inline" | "pinned" | "fullscreen"

export type InteractiveViewValues = Record<string, number>

export interface InteractiveViewSlider {
	id: string
	label: string
	min: number
	max: number
	step?: number
	defaultValue: number
	formatValue: (value: number) => string
}

export interface InteractiveViewMeter {
	ratio: number
	caption: string
}

export interface InteractiveViewBreakdownRow {
	label: string
	value: string
}

export interface InteractiveViewResult {
	caption: string
	total: string
	totalNote?: string
	meter?: InteractiveViewMeter
	breakdown?: InteractiveViewBreakdownRow[]
}

export interface InteractiveViewProps {
	title: string
	agentName: string
	sliders: InteractiveViewSlider[]
	result: (values: InteractiveViewValues) => InteractiveViewResult
	mode: InteractiveViewMode
	onModeChange: (mode: InteractiveViewMode) => void
	sendLabel: string
	onSend: (values: InteractiveViewValues) => void
	onValuesChange?: (values: InteractiveViewValues) => void
	source?: string
	className?: string
}

const MODES = [
	{ mode: "inline", Icon: Icons.Inline },
	{ mode: "pinned", Icon: Icons.Pin },
	{ mode: "fullscreen", Icon: Icons.Fullscreen },
] as const satisfies { mode: InteractiveViewMode; Icon: unknown }[]

const SECONDARY_LINE = "text-compact leading-4.5"

const defaultValuesOf = (sliders: InteractiveViewSlider[]) =>
	Object.fromEntries(
		sliders.map((slider) => [slider.id, slider.defaultValue]),
	) as InteractiveViewValues

type ModeControlProps = Pick<InteractiveViewProps, "mode" | "onModeChange">

const ModeControl = ({ mode, onModeChange }: ModeControlProps) => {
	const { t } = useTranslation("chat")

	return (
		<div
			role="group"
			aria-label={t("interactiveView.modes")}
			className="flex shrink-0 gap-0.5 rounded-md bg-foreground/4 p-0.5"
		>
			{MODES.map(({ mode: option, Icon }) => (
				<button
					key={option}
					type="button"
					aria-label={t(`interactiveView.${option}`)}
					aria-pressed={mode === option}
					onClick={() => onModeChange(option)}
					className="flex h-6 w-7 items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-offset-2 aria-pressed:bg-foreground/12 aria-pressed:text-foreground"
				>
					<Icon aria-hidden="true" className="size-3.5" />
				</button>
			))}
		</div>
	)
}

type ViewSliderProps = {
	slider: InteractiveViewSlider
	value: number
	onValueChange: (value: number) => void
}

const ViewSlider = ({ slider, value, onValueChange }: ViewSliderProps) => (
	<div data-slot="interactive-view-slider" className="flex flex-col gap-2.5">
		<div className="flex items-baseline justify-between gap-3 text-sm">
			<span className="min-w-0 wrap-break-word text-soft-foreground">
				{slider.label}
			</span>
			<span
				data-slot="interactive-view-slider-value"
				className="shrink-0 font-semibold text-foreground tabular-nums"
			>
				{slider.formatValue(value)}
			</span>
		</div>
		<Slider.Root
			value={value}
			min={slider.min}
			max={slider.max}
			step={slider.step}
			thumbAlignment="edge"
			onValueChange={onValueChange}
		>
			<Slider.Control className="relative flex h-4 w-full touch-none select-none items-center">
				<Slider.Track className="relative h-1 w-full overflow-hidden rounded-xs bg-foreground/10">
					<Slider.Indicator className="h-full bg-primary" />
				</Slider.Track>
				<Slider.Thumb
					getAriaLabel={() => slider.label}
					getAriaValueText={(_, thumbValue) => slider.formatValue(thumbValue)}
					className="size-4 rounded-full bg-white shadow-sm ring-primary/25 has-[input:focus-visible]:ring-3 data-dragging:ring-3"
				/>
			</Slider.Control>
		</Slider.Root>
	</div>
)

type ResultPanelProps = {
	result: InteractiveViewResult
}

const ResultPanel = ({ result }: ResultPanelProps) => (
	<div
		data-slot="interactive-view-result"
		className="flex min-w-0 flex-[0_1_236px] flex-col gap-3 rounded-lg bg-foreground/3 p-3"
	>
		<p className={cn(SECONDARY_LINE, "text-muted-foreground")}>
			{result.caption}
		</p>
		<div aria-live="polite" className="flex flex-wrap items-baseline gap-x-1.5">
			<span
				data-slot="interactive-view-total"
				className="font-bold text-[32px]/9 text-foreground tabular-nums tracking-[-0.02em]"
			>
				{result.total}
			</span>
			{result.totalNote ? (
				<span className={cn(SECONDARY_LINE, "text-muted-foreground")}>
					{result.totalNote}
				</span>
			) : null}
		</div>
		{result.meter ? (
			<div className="flex flex-col gap-1.5">
				<div
					aria-hidden="true"
					className="h-1.5 overflow-hidden rounded-[3px] bg-foreground/10"
				>
					<div
						className="h-full bg-primary"
						style={{
							width: `${Math.min(Math.max(result.meter.ratio, 0), 1) * 100}%`,
						}}
					/>
				</div>
				<p className={cn(SECONDARY_LINE, "text-muted-foreground")}>
					{result.meter.caption}
				</p>
			</div>
		) : null}
		{result.breakdown?.length ? (
			<dl
				className={cn(
					SECONDARY_LINE,
					"flex flex-col gap-1 border-shell-divider border-t pt-2",
				)}
			>
				{result.breakdown.map((row) => (
					<div key={row.label} className="flex justify-between gap-3">
						<dt className="min-w-0 wrap-break-word text-muted-foreground">
							{row.label}
						</dt>
						<dd className="shrink-0 text-soft-foreground tabular-nums">
							{row.value}
						</dd>
					</div>
				))}
			</dl>
		) : null}
	</div>
)

export const InteractiveView = ({
	title,
	agentName,
	sliders,
	result,
	mode,
	onModeChange,
	sendLabel,
	onSend,
	onValuesChange,
	source,
	className,
}: InteractiveViewProps) => {
	const { t } = useTranslation("chat")
	const [values, setValues] = useState(() => defaultValuesOf(sliders))

	const change = (id: string, value: number) => {
		const next = { ...values, [id]: value }
		setValues(next)
		onValuesChange?.(next)
	}

	return (
		<section
			aria-label={title}
			data-slot="interactive-view"
			className={cn(
				"flex flex-col overflow-hidden rounded-xl border border-shell-divider bg-card-raised",
				className,
			)}
		>
			<header className="flex items-center gap-2.5 border-shell-divider border-b p-3">
				<span
					aria-hidden="true"
					className="flex size-5 shrink-0 items-center justify-center rounded-sm bg-primary/16 text-primary"
				>
					<Icons.Sliders className="size-3" />
				</span>
				<h3 className="min-w-0 wrap-break-word font-semibold text-foreground text-sm">
					{title}
				</h3>
				<p
					className={cn(
						SECONDARY_LINE,
						"min-w-0 flex-1 truncate text-muted-foreground",
					)}
				>
					{t("interactiveView.madeBy", { name: agentName })}
				</p>
				<ModeControl mode={mode} onModeChange={onModeChange} />
			</header>
			<div className="flex flex-wrap gap-5 p-3">
				<div className="flex min-w-0 flex-[1_1_240px] flex-col gap-5.5">
					{sliders.map((slider) => (
						<ViewSlider
							key={slider.id}
							slider={slider}
							value={values[slider.id]}
							onValueChange={(value) => change(slider.id, value)}
						/>
					))}
				</div>
				<ResultPanel result={result(values)} />
			</div>
			<footer className="flex items-center gap-3 border-shell-divider border-t p-3">
				{source ? (
					<p
						className={cn(
							SECONDARY_LINE,
							"min-w-0 flex-1 wrap-break-word text-muted-foreground",
						)}
					>
						{source}
					</p>
				) : null}
				<button
					type="button"
					onClick={() => onSend(values)}
					className={cn(
						SECONDARY_LINE,
						"ms-auto shrink-0 rounded-md bg-primary p-2 font-semibold text-primary-foreground hover:bg-[color-mix(in_oklch,var(--primary),var(--foreground)_20%)] focus-visible:outline-offset-2",
					)}
				>
					{sendLabel}
				</button>
			</footer>
		</section>
	)
}
