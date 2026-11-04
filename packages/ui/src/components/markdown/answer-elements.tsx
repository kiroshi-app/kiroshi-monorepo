"use client"

import type { ComponentPropsWithoutRef, ReactElement } from "react"
import { useTranslation } from "react-i18next"
import type { ExtraProps } from "react-markdown"

import {
	Callout,
	type CalloutTone,
} from "@workspace/ui/components/answer-blocks/callout"
import { SourcedImage } from "@workspace/ui/components/answer-blocks/sourced-image"
import {
	ImageMenu,
	imageMenuActionsFor,
} from "@workspace/ui/components/image-menu"
import type { LibraryLightboxImage } from "@workspace/ui/components/library-lightbox"
import {
	answerImageMenuOf,
	answerImageSavingOf,
	useMarkdownAnswerActions,
} from "@workspace/ui/components/markdown/answer-actions"
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

type MarkdownImageMenuProps = {
	image: LibraryLightboxImage
	isLinked: boolean
	children: ReactElement
}

const MarkdownImageMenu = ({
	image,
	isLinked,
	children,
}: MarkdownImageMenuProps) => {
	const actions = useMarkdownAnswerActions()
	if (!actions) return children

	return (
		<ImageMenu
			{...answerImageMenuOf(actions, [image])}
			isSavingToLibrary={answerImageSavingOf(actions, [image])?.(0)}
			item={0}
			name={image.name}
			trigger={
				isLinked ? (
					children
				) : (
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
		/>
	)
}

const CALLOUT_TONES: readonly unknown[] = [
	"note",
	"tip",
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
	const image = { id: src, name: alt, src, detail: sourceName }
	const imageMenu = answerImageMenuOf(actions, [image])

	return (
		<AnswerBlockFrame>
			<SourcedImage
				chips={
					Array.isArray(properties.dataChips)
						? properties.dataChips.map(String)
						: undefined
				}
				image={{ src, alt }}
				imageMenu={imageMenu && imageMenuActionsFor(imageMenu, () => 0)}
				isSaving={actions?.isSavingImage?.(src)}
				onOpen={actions ? () => actions.onOpenImage([image], 0) : undefined}
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
	if (typeof src !== "string") return image

	return (
		<MarkdownImageMenu
			image={{
				id: src,
				name: alt || t("answerBlock.image.untitled"),
				src,
				detail: "",
			}}
			isLinked={Boolean(node?.properties?.[LINKED_IMAGE_PROPERTY])}
		>
			{image}
		</MarkdownImageMenu>
	)
}
