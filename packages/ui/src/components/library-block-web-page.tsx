"use client"

import { type KeyboardEvent, useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import {
	fenceOf,
	type SourceEdit,
	webPageFieldsOf,
	withWebPageFields,
} from "@workspace/ui/components/library-document-blocks"
import { MarkdownAnswerBlock } from "@workspace/ui/components/markdown/answer-block"
import { readAnswerBlock } from "@workspace/ui/components/markdown/answer-block-source"

type LibraryLinkPreview = {
	url: string
	title: string
	site?: string
	image?: string
	alt?: string
}

type LibraryWebPageEditorProps = {
	source: string
	onEdit: SourceEdit
	onLinkPreview?: (url: string) => Promise<LibraryLinkPreview>
}

const fieldsOf = (preview: LibraryLinkPreview) =>
	Object.fromEntries(
		Object.entries(preview).filter(
			(entry): entry is [string, string] =>
				typeof entry[1] === "string" && entry[1].trim() !== "",
		),
	)

const LibraryWebPageEditor = ({
	source,
	onEdit,
	onLinkPreview,
}: LibraryWebPageEditorProps) => {
	const { t } = useTranslation("common")
	const failureId = useId()
	const [draft, setDraft] = useState<string>()
	const [isLoading, setLoading] = useState(false)
	const [hasFailed, setFailed] = useState(false)
	const link = webPageFieldsOf(source).url ?? ""
	const block = readAnswerBlock("web-page", fenceOf(source).body)

	const submit = () => {
		const url = (draft ?? link).trim()
		if (!onLinkPreview || url === "") return
		setFailed(false)
		setLoading(true)
		onLinkPreview(url)
			.then(
				(preview) => {
					onEdit((current) => withWebPageFields(current, fieldsOf(preview)))
					setDraft(undefined)
				},
				() => setFailed(true),
			)
			.finally(() => setLoading(false))
	}

	const keyInField = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.nativeEvent.isComposing) return
		if (event.key === "Enter") {
			event.preventDefault()
			submit()
			return
		}
		if (event.key === "Escape" && draft !== undefined && draft !== link) {
			event.preventDefault()
			event.stopPropagation()
			setDraft(undefined)
			setFailed(false)
		}
	}

	return (
		<div className="flex flex-col gap-2.5" data-slot="library-web-page-editor">
			<div className="flex flex-col">
				<label className="flex h-9 items-center gap-2 rounded-[10px] border border-foreground/15 bg-card p-1.75 text-muted-foreground focus-within:border-primary focus-within:ring-3 focus-within:ring-primary/15">
					<Icons.Link aria-hidden="true" className="size-3.5 shrink-0" />
					<input
						aria-busy={isLoading}
						aria-describedby={hasFailed ? failureId : undefined}
						aria-invalid={hasFailed}
						aria-label={t("library.editor.blocks.webPage.link")}
						className="min-w-0 flex-1 bg-transparent text-foreground text-sm leading-5 outline-none"
						data-slot="library-document-block-field"
						inputMode="url"
						onChange={(event) => setDraft(event.target.value)}
						onKeyDown={keyInField}
						spellCheck={false}
						type="text"
						value={draft ?? link}
					/>
					<span className="flex shrink-0 items-center gap-1 text-xs leading-4">
						<span aria-hidden="true">
							{t("library.editor.blocks.webPage.updateKey")}
						</span>
						{t("library.editor.blocks.webPage.update")}
					</span>
				</label>
				<div aria-live="polite">
					{hasFailed ? (
						<p
							className="mt-1.5 text-destructive text-xs leading-4"
							data-slot="library-web-page-failure"
							id={failureId}
						>
							{t("library.editor.blocks.webPage.failed")}
						</p>
					) : null}
				</div>
			</div>
			{block ? <MarkdownAnswerBlock block={block} /> : null}
		</div>
	)
}

export { type LibraryLinkPreview, LibraryWebPageEditor }
