"use client"

import { type ReactNode, useContext, useState } from "react"
import { useTranslation } from "react-i18next"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"

import { Checklist } from "@workspace/ui/components/answer-blocks/checklist"
import { CollapsibleSections } from "@workspace/ui/components/answer-blocks/collapsible-sections"
import { Gallery } from "@workspace/ui/components/answer-blocks/gallery"
import { IllustratedList } from "@workspace/ui/components/answer-blocks/illustrated-list"
import { MapCard } from "@workspace/ui/components/answer-blocks/map-card"
import { VideoPlayer } from "@workspace/ui/components/answer-blocks/video-player"
import { WebPageCard } from "@workspace/ui/components/answer-blocks/web-page-card"
import {
	InteractiveView,
	type InteractiveViewMode,
	type InteractiveViewResult,
	type InteractiveViewValues,
} from "@workspace/ui/components/interactive-view"
import { useMarkdownAnswerActions } from "@workspace/ui/components/markdown/answer-actions"
import type {
	AnswerBlock,
	AnswerBlockLabel,
	InteractiveBlock,
	InteractiveTemplate,
	Measure,
} from "@workspace/ui/components/markdown/answer-block-source"
import { MarkdownLink } from "@workspace/ui/components/markdown/link"
import { NestedMarkdownContext } from "@workspace/ui/components/markdown/nested-markdown"
import { MARKDOWN_ESCAPED_BLOCK_CLASS } from "@workspace/ui/components/markdown/prose"
import { OptionsCard } from "@workspace/ui/components/options-card"
import { RichBlockPending } from "@workspace/ui/components/rich-block-pending"

type BlockProps<Label extends AnswerBlock["label"]> = {
	block: Extract<AnswerBlock, { label: Label }>
}

type AnswerBlockFrameProps = {
	children: ReactNode
}

type InlineMarkdownProps = {
	children: string
}

type NumberFormat = (value: number) => string

const RESULT_FORMAT = new Intl.NumberFormat("en", { maximumFractionDigits: 2 })

const formatNumber: NumberFormat = (value) => RESULT_FORMAT.format(value)

const formatOf = ({ currency, unit }: Measure): NumberFormat => {
	if (currency) {
		const format = new Intl.NumberFormat("en", {
			style: "currency",
			currency,
			trailingZeroDisplay: "stripIfInteger",
		})
		return (value) => format.format(value)
	}
	return unit ? (value) => `${formatNumber(value)} ${unit}` : formatNumber
}

const INLINE_ELEMENTS = ["p", "strong", "em", "del", "code", "a"]

const INLINE_PLUGINS = [remarkGfm]

const INLINE_COMPONENTS: Components = {
	p: ({ children }) => children,
	a: MarkdownLink,
}

const InlineMarkdown = ({ children }: InlineMarkdownProps) => (
	<ReactMarkdown
		allowedElements={INLINE_ELEMENTS}
		components={INLINE_COMPONENTS}
		remarkPlugins={INLINE_PLUGINS}
		unwrapDisallowed
	>
		{children}
	</ReactMarkdown>
)

export const AnswerBlockFrame = ({ children }: AnswerBlockFrameProps) => (
	<div
		data-slot="markdown-answer-block"
		className={`${MARKDOWN_ESCAPED_BLOCK_CLASS} my-3`}
	>
		{children}
	</div>
)

const OptionsBlockView = ({ block }: BlockProps<"options">) => {
	const { t } = useTranslation("chat")
	const actions = useMarkdownAnswerActions()

	const pick = (id: string | null) => {
		const option = id === null ? undefined : block.options[Number(id)]
		if (option) actions?.onPickOption(option.title)
	}

	return (
		<OptionsCard
			onPick={pick}
			options={block.options.map(({ title, text }, index) => ({
				id: `${index}`,
				label: title,
				description: text,
			}))}
			subtitle={block.subtitle}
			title={block.question ?? t("answerBlock.options.title")}
		/>
	)
}

const sliderViewsOf = ({ sliders }: InteractiveBlock) =>
	sliders.map((slider) => ({
		id: slider.name,
		label: slider.label,
		min: slider.min,
		max: slider.max,
		step: slider.step,
		defaultValue: slider.defaultValue,
		formatValue: formatOf(slider.measure),
	}))

const InteractiveBlockView = ({ block }: BlockProps<"interactive">) => {
	const { t } = useTranslation("chat")
	const actions = useMarkdownAnswerActions()
	const [mode, setMode] = useState<InteractiveViewMode>("inline")
	const sliders = sliderViewsOf(block)
	const formatResult = formatOf(block.measure)

	const shown = (value: number) =>
		Number.isFinite(value)
			? formatResult(value)
			: t("answerBlock.interactive.notDefined")

	const filled = (
		template: InteractiveTemplate,
		values: InteractiveViewValues,
	) =>
		template
			.map((part) => (typeof part === "string" ? part : shown(part(values))))
			.join("")

	const resultAt = (values: InteractiveViewValues): InteractiveViewResult => {
		const ratio = block.meter?.ratio(values) ?? 0
		return {
			caption:
				block.title === undefined
					? t("answerBlock.interactive.result")
					: block.resultLabel,
			total: shown(block.result(values)),
			totalNote: block.note && filled(block.note, values),
			meter: block.meter && {
				ratio: Number.isFinite(ratio) ? ratio : 0,
				caption: filled(block.meter.caption, values),
			},
			breakdown: block.breakdown.map(({ label, value }) => ({
				label,
				value: shown(value(values)),
			})),
		}
	}

	const summaryOf = (values: InteractiveViewValues) =>
		t("answerBlock.interactive.summary", {
			values: sliders
				.map(
					({ id, label, formatValue }) =>
						`${label}: ${formatValue(values[id])}`,
				)
				.join(", "),
			label: block.resultLabel,
			result: shown(block.result(values)),
		})

	return (
		<InteractiveView
			agentName={actions?.agentName ?? ""}
			mode={mode}
			onModeChange={setMode}
			onSend={(values) => actions?.onUseValues(summaryOf(values))}
			result={resultAt}
			sendLabel={t("answerBlock.interactive.use")}
			sliders={sliders}
			source={block.source}
			title={block.title ?? block.resultLabel}
		/>
	)
}

const GalleryBlockView = ({ block }: BlockProps<"gallery">) => {
	const actions = useMarkdownAnswerActions()
	const viewerImages = block.images.map(({ image, alt, caption }, index) => ({
		id: `${index}`,
		name: alt,
		src: image,
		detail: caption ?? "",
	}))

	return (
		<Gallery
			caption={block.images
				.flatMap(({ caption }) => (caption ? [caption] : []))
				.join(" · ")}
			images={block.images.map(({ image, alt }) => ({ src: image, alt }))}
			onOpen={
				actions
					? (index) => actions.onOpenImage(viewerImages, index)
					: undefined
			}
		/>
	)
}

const IllustratedListBlockView = ({
	block,
}: BlockProps<"illustrated-list">) => (
	<IllustratedList
		items={block.items.map(({ title, image, text, badge, meta }, index) => ({
			id: `${index}`,
			title,
			image: { src: image, alt: title },
			badge,
			description: text ? <InlineMarkdown>{text}</InlineMarkdown> : undefined,
			meta,
		}))}
	/>
)

const ChecklistBlockView = ({ block }: BlockProps<"checklist">) => {
	const actions = useMarkdownAnswerActions()
	const [checks, setChecks] = useState(() =>
		block.items.map(({ isDone }) => isDone),
	)
	const items = block.items.map(({ text, assignee }, index) => ({
		id: `${index}`,
		label: text,
		isChecked: checks[index],
		assignee,
	}))
	const onToggleItem = actions?.onToggleChecklistItem
	const onCopyList = actions?.onCopyChecklist

	const toggle = (id: string, isChecked: boolean) => {
		setChecks(
			checks.map((check, index) => (`${index}` === id ? isChecked : check)),
		)
		onToggleItem?.(block.title, Number(id), isChecked)
	}

	const listText = () =>
		[
			block.title,
			...items.map(
				({ label, isChecked, assignee }) =>
					`- [${isChecked ? "x" : " "}] ${label}${assignee ? ` · ${assignee}` : ""}`,
			),
		].join("\n")

	return (
		<Checklist
			items={items}
			onCopy={onCopyList ? () => onCopyList(listText()) : undefined}
			onToggle={onToggleItem ? toggle : undefined}
			title={block.title}
		/>
	)
}

const CollapsibleBlockView = ({ block }: BlockProps<"collapsible">) => {
	const NestedMarkdown = useContext(NestedMarkdownContext)

	return (
		<CollapsibleSections
			sections={block.sections.map(({ title, value, content }, index) => ({
				id: `${index}`,
				label: title,
				value,
				body: NestedMarkdown ? (
					<NestedMarkdown>{content}</NestedMarkdown>
				) : (
					content
				),
			}))}
		/>
	)
}

const hostOf = (url: string) => new URL(url).hostname.replace(/^www\./, "")

const WebPageBlockView = ({ block }: BlockProps<"web-page">) => {
	const onOpenWebPage = useMarkdownAnswerActions()?.onOpenWebPage

	return (
		<WebPageCard
			domain={block.site ?? hostOf(block.url)}
			onOpen={onOpenWebPage ? () => onOpenWebPage(block.url) : undefined}
			preview={block.image ? { src: block.image, alt: block.alt } : undefined}
			title={block.title}
		/>
	)
}

const VideoBlockView = ({ block }: BlockProps<"video">) => (
	<VideoPlayer
		duration={block.duration}
		marker={block.marker}
		poster={block.poster}
		source={block.source}
		src={block.url}
		title={block.title}
	/>
)

const MapBlockView = ({ block }: BlockProps<"map">) => (
	<MapCard
		area={block.area}
		link={block.link}
		places={block.places.map((place, index) => ({
			id: `${index}`,
			...place,
		}))}
		subtitle={block.subtitle}
		title={block.title}
	/>
)

type MarkdownAnswerBlockProps = {
	block: AnswerBlock
}

const blockViewOf = (block: AnswerBlock) => {
	switch (block.label) {
		case "options":
			return <OptionsBlockView block={block} />
		case "interactive":
			return <InteractiveBlockView block={block} />
		case "gallery":
			return <GalleryBlockView block={block} />
		case "illustrated-list":
			return <IllustratedListBlockView block={block} />
		case "checklist":
			return <ChecklistBlockView block={block} />
		case "collapsible":
			return <CollapsibleBlockView block={block} />
		case "web-page":
			return <WebPageBlockView block={block} />
		case "video":
			return <VideoBlockView block={block} />
		case "map":
			return <MapBlockView block={block} />
	}
}

export const MarkdownAnswerBlock = ({ block }: MarkdownAnswerBlockProps) => (
	<AnswerBlockFrame>{blockViewOf(block)}</AnswerBlockFrame>
)

type PendingAnswerBlockProps = {
	label: AnswerBlockLabel
}

export const PendingAnswerBlock = ({ label }: PendingAnswerBlockProps) => {
	const { t } = useTranslation("chat")

	return (
		<AnswerBlockFrame>
			<RichBlockPending title={t(`richBlock.pending.${label}`)} />
		</AnswerBlockFrame>
	)
}
