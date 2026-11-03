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
	LINKED_IMAGE_PROPERTY,
	SOURCED_IMAGE_PROPERTY,
} from "@workspace/ui/components/markdown/answer-marks"
import { cn } from "@workspace/ui/lib/utils"

type MarkdownBlockquoteProps = ComponentPropsWithoutRef<"blockquote"> &
	ExtraProps

type MarkdownFigureProps = ComponentPropsWithoutRef<"figure"> & ExtraProps

type MarkdownImageProps = ComponentPropsWithoutRef<"img"> & ExtraProps

type ImageOpenButtonProps = {
	image: LibraryLightboxImage
	isInline?: boolean
	children: ReactNode
}

const ImageOpenButton = ({
	image,
	isInline = false,
	children,
}: ImageOpenButtonProps) => {
	const actions = useMarkdownAnswerActions()
	if (!actions) return children

	return (
		<button
			type="button"
			aria-label={image.name}
			data-slot="markdown-image-open"
			className={cn(
				"max-w-full outline-offset-2",
				isInline ? "inline-block" : "block w-full text-start",
			)}
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

	if (!isCalloutTone(tone))
		return <blockquote {...props}>{children}</blockquote>

	return (
		<AnswerBlockFrame>
			<Callout title={t(`answerBlock.callout.${tone}`)} tone={tone}>
				{children}
			</Callout>
		</AnswerBlockFrame>
	)
}

export const MarkdownFigure = ({
	node,
	children,
	...props
}: MarkdownFigureProps) => {
	const properties = node?.properties
	if (!properties?.[SOURCED_IMAGE_PROPERTY]) {
		return <figure {...props}>{children}</figure>
	}

	const alt = String(properties.alt)
	const src = String(properties.src)
	const sourceName = String(properties.dataSourceName)

	return (
		<AnswerBlockFrame>
			<ImageOpenButton image={{ id: src, name: alt, src, detail: sourceName }}>
				<SourcedImage
					image={{ src, alt }}
					source={{ domain: sourceName }}
					title={alt}
				/>
			</ImageOpenButton>
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
			isInline
		>
			{image}
		</ImageOpenButton>
	)
}
