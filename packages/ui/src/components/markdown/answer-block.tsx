"use client"

import { type ReactNode, useContext, useState } from "react"
import { useTranslation } from "react-i18next"

import { CollapsibleSections } from "@workspace/ui/components/answer-blocks/collapsible-sections"
import { Gallery } from "@workspace/ui/components/answer-blocks/gallery"
import { IllustratedList } from "@workspace/ui/components/answer-blocks/illustrated-list"
import { MapCard } from "@workspace/ui/components/answer-blocks/map-card"
import { VideoPlayer } from "@workspace/ui/components/answer-blocks/video-player"
import { WebPageCard } from "@workspace/ui/components/answer-blocks/web-page-card"
import {
	InteractiveView,
	type InteractiveViewMode,
	type InteractiveViewValues,
} from "@workspace/ui/components/interactive-view"
import { useMarkdownAnswerActions } from "@workspace/ui/components/markdown/answer-actions"
import type {
	AnswerBlock,
	AnswerBlockLabel,
	InteractiveBlock,
} from "@workspace/ui/components/markdown/answer-block-source"
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

const RESULT_FORMAT = new Intl.NumberFormat("en", { maximumFractionDigits: 2 })

const formatNumber = (value: number) => RESULT_FORMAT.format(value)

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
		formatValue: formatNumber,
	}))

const InteractiveBlockView = ({ block }: BlockProps<"interactive">) => {
	const { t } = useTranslation("chat")
	const actions = useMarkdownAnswerActions()
	const [mode, setMode] = useState<InteractiveViewMode>("inline")

	const totalAt = (values: InteractiveViewValues) => {
		const value = block.result(values)
		return Number.isFinite(value)
			? formatNumber(value)
			: t("answerBlock.interactive.notDefined")
	}

	const summaryOf = (values: InteractiveViewValues) =>
		t("answerBlock.interactive.summary", {
			values: block.sliders
				.map(({ name, label }) => `${label}: ${formatNumber(values[name])}`)
				.join(", "),
			label: block.resultLabel,
			result: totalAt(values),
		})

	return (
		<InteractiveView
			agentName={actions?.agentName ?? ""}
			mode={mode}
			onModeChange={setMode}
			onSend={(values) => actions?.onUseValues(summaryOf(values))}
			result={(values) => ({
				caption: t("answerBlock.interactive.result"),
				total: totalAt(values),
			})}
			sendLabel={t("answerBlock.interactive.use")}
			sliders={sliderViewsOf(block)}
			title={block.resultLabel}
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
		items={block.items.map(({ title, image, text }, index) => ({
			id: `${index}`,
			title,
			image: { src: image, alt: title },
			description: text,
		}))}
	/>
)

const CollapsibleBlockView = ({ block }: BlockProps<"collapsible">) => {
	const NestedMarkdown = useContext(NestedMarkdownContext)

	return (
		<CollapsibleSections
			sections={[
				{
					id: "content",
					label: block.title,
					body: NestedMarkdown ? (
						<NestedMarkdown>{block.content}</NestedMarkdown>
					) : (
						block.content
					),
				},
			]}
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
