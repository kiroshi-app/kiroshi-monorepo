"use client"

import type { ComponentPropsWithoutRef } from "react"
import { useTranslation } from "react-i18next"
import type { ExtraProps } from "react-markdown"

import {
	Callout,
	type CalloutTone,
} from "@workspace/ui/components/answer-blocks/callout"
import { SourcedImage } from "@workspace/ui/components/answer-blocks/sourced-image"
import { AnswerBlockFrame } from "@workspace/ui/components/markdown/answer-block"
import {
	CALLOUT_PROPERTY,
	SOURCED_IMAGE_PROPERTY,
} from "@workspace/ui/components/markdown/answer-marks"

type MarkdownBlockquoteProps = ComponentPropsWithoutRef<"blockquote"> &
	ExtraProps

type MarkdownFigureProps = ComponentPropsWithoutRef<"figure"> & ExtraProps

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

	return (
		<AnswerBlockFrame>
			<SourcedImage
				image={{ src: String(properties.src), alt }}
				source={{ domain: String(properties.dataSourceName) }}
				title={alt}
			/>
		</AnswerBlockFrame>
	)
}
