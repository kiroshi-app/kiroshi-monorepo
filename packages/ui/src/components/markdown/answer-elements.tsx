"use client"

import type { ComponentPropsWithoutRef, ReactNode } from "react"
import { useTranslation } from "react-i18next"
import type { ExtraProps } from "react-markdown"

import {
	Callout,
	type CalloutTone,
} from "@workspace/ui/components/answer-blocks/callout"
import { SourcedImage } from "@workspace/ui/components/answer-blocks/sourced-image"
import type { LibraryLightboxImage } from "@workspace/ui/components/library-lightbox"
import { useMarkdownAnswerActions } from "@workspace/ui/components/markdown/answer-actions"
import { AnswerBlockFrame } from "@workspace/ui/components/markdown/answer-block"
import {
	CALLOUT_PROPERTY,
	CALLOUT_TITLE_PROPERTY,
	LINKED_IMAGE_PROPERTY,
	SOURCED_IMAGE_PROPERTY,
} from "@workspace/ui/components/markdown/answer-marks"

type MarkdownBlockquoteProps = ComponentPropsWithoutRef<"blockquote"> &
	ExtraProps

type MarkdownFigureProps = ComponentPropsWithoutRef<"figure"> & ExtraProps

type MarkdownImageProps = ComponentPropsWithoutRef<"img"> & ExtraProps

type ImageOpenButtonProps = {
	image: LibraryLightboxImage
	children: ReactNode
}

const ImageOpenButton = ({ image, children }: ImageOpenButtonProps) => {
	const actions = useMarkdownAnswerActions()
	if (!actions) return children

	return (
		<button
			type="button"
			aria-label={image.name}
			data-slot="markdown-image-open"
			className="inline-block max-w-full outline-offset-2"
			onClick={() => actions.onOpenImage([image], 0)}
		>
			{children}
		</button>
	)
}

const CALLOUT_TONES: readonly unknown[] = [
	"note",
	"warning",
] satisfies CalloutTone[]

const isCalloutTone = (value: unknown): value is CalloutTone =>
	CALLOUT_TONES.includes(value)

export const MarkdownBlockquote = ({
	node,
	children,
	...props
}: MarkdownBlockquoteProps) => {
	const { t } = useTranslation("chat")
	const tone = node?.properties?.[CALLOUT_PROPERTY]
	const title = node?.properties?.[CALLOUT_TITLE_PROPERTY]

	if (!isCalloutTone(tone))
		return <blockquote {...props}>{children}</blockquote>

	return (
		<AnswerBlockFrame>
			<Callout
				title={
					typeof title === "string" ? title : t(`answerBlock.callout.${tone}`)
				}
				tone={tone}
			>
				{children}
			</Callout>
		</AnswerBlockFrame>
	)
}

const optionalString = (value: unknown) =>
	typeof value === "string" ? value : undefined

export const MarkdownFigure = ({
	node,
	children,
	...props
}: MarkdownFigureProps) => {
	const actions = useMarkdownAnswerActions()
	const properties = node?.properties
	if (!properties?.[SOURCED_IMAGE_PROPERTY]) {
		return <figure {...props}>{children}</figure>
	}

	const alt = String(properties.alt)
	const src = String(properties.src)
	const sourceName = String(properties.dataSourceName)
	const onSaveImage = actions?.onSaveImage
	const image = { id: src, name: alt, src, detail: sourceName }

	return (
		<AnswerBlockFrame>
			<SourcedImage
				chips={
					Array.isArray(properties.dataChips)
						? properties.dataChips.map(String)
						: undefined
				}
				image={{ src, alt }}
				onOpen={actions ? () => actions.onOpenImage([image], 0) : undefined}
				onSave={onSaveImage ? () => onSaveImage(src) : undefined}
				source={{
					domain: sourceName,
					favicon: optionalString(properties.dataFavicon),
				}}
				status={optionalString(properties.dataStatus)}
				title={optionalString(properties.dataTitle) ?? alt}
			/>
		</AnswerBlockFrame>
	)
}

export const MarkdownImage = ({
	node,
	alt,
	src,
	...props
}: MarkdownImageProps) => {
	const { t } = useTranslation("chat")
	const image = <img {...props} alt={alt} src={src} />
	if (typeof src !== "string" || node?.properties?.[LINKED_IMAGE_PROPERTY]) {
		return image
	}

	return (
		<ImageOpenButton
			image={{
				id: src,
				name: alt || t("answerBlock.image.untitled"),
				src,
				detail: "",
			}}
		>
			{image}
		</ImageOpenButton>
	)
}
