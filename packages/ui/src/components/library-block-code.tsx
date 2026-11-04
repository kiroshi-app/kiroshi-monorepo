"use client"

import { type KeyboardEvent, useId, useState } from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import {
	codeLanguageOf,
	fenceOf,
	type SourceEdit,
	withCodeBody,
	withCodeLanguage,
} from "@workspace/ui/components/library-document-blocks"
import { GrowingField } from "@workspace/ui/components/library-document-view"
import { MarkdownFence } from "@workspace/ui/components/markdown/code"
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@workspace/ui/components/ui/popover"
import {
	type CodeLanguage,
	resolveCodeLanguage,
} from "@workspace/ui/lib/code-highlight"
import { cn } from "@workspace/ui/lib/utils"

type LibraryCodeEditorProps = {
	source: string
	onEdit: SourceEdit
}

type LanguagePickerProps = {
	chosen: CodeLanguage
	onChoose: (language: CodeLanguage) => void
}

const LANGUAGES: readonly CodeLanguage[] = [
	"text",
	"bash",
	"json",
	"typescript",
	"python",
	"css",
	"diff",
	"html",
	"markdown",
	"rust",
	"tsx",
	"yaml",
]

const BLOCK_POPUP = "library-document-block-popup"

const STEPS: Readonly<Record<string, number>> = { ArrowDown: 1, ArrowUp: -1 }

const LanguagePicker = ({ chosen, onChoose }: LanguagePickerProps) => {
	const { t } = useTranslation("common")
	const listId = useId()
	const [isOpen, setOpen] = useState(false)
	const [query, setQuery] = useState("")
	const [active, setActive] = useState(0)
	const nameOf = (language: CodeLanguage) =>
		t(`library.editor.blocks.code.languages.${language}`)
	const matches = LANGUAGES.filter((language) =>
		nameOf(language).toLowerCase().includes(query.trim().toLowerCase()),
	)
	const highlighted = Math.min(active, matches.length - 1)

	const open = (next: boolean) => {
		setOpen(next)
		setQuery("")
		setActive(Math.max(LANGUAGES.indexOf(chosen), 0))
	}

	const choose = (language: CodeLanguage) => {
		onChoose(language)
		setOpen(false)
	}

	const keyInSearch = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.nativeEvent.isComposing) return
		const step = STEPS[event.key]
		if (step) {
			event.preventDefault()
			setActive((highlighted + step + matches.length) % matches.length)
			return
		}
		if (event.key === "Enter") {
			event.preventDefault()
			const language = matches[highlighted]
			if (language) choose(language)
		}
	}

	return (
		<Popover onOpenChange={open} open={isOpen}>
			<PopoverTrigger
				aria-label={t("library.editor.blocks.code.language", {
					name: nameOf(chosen),
				})}
				className="flex h-6 items-center gap-1 rounded-sm bg-foreground/6 p-1 font-medium font-sans text-foreground text-xs leading-4 outline-offset-2 hover:bg-foreground/10 active:bg-foreground/14 aria-expanded:bg-foreground/10"
				data-slot="library-code-language"
			>
				{nameOf(chosen)}
				<Icons.Expand aria-hidden="true" className="size-3" />
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-50 gap-0 rounded-xl p-1"
				data-slot={BLOCK_POPUP}
				sideOffset={2}
			>
				<label className="flex h-8 items-center gap-2 p-2 text-muted-foreground">
					<Icons.Search aria-hidden="true" className="size-3.5 shrink-0" />
					<input
						aria-activedescendant={
							matches.length > 0 ? `${listId}-${highlighted}` : undefined
						}
						aria-autocomplete="list"
						aria-controls={listId}
						aria-expanded="true"
						aria-label={t("library.editor.blocks.code.search")}
						className="min-w-0 flex-1 bg-transparent text-compact text-foreground leading-4 outline-none placeholder:text-placeholder-foreground"
						data-slot="library-code-language-search"
						onChange={(event) => {
							setQuery(event.target.value)
							setActive(0)
						}}
						onKeyDown={keyInSearch}
						placeholder={t("library.editor.blocks.code.search")}
						role="combobox"
						type="text"
						value={query}
					/>
				</label>
				<span aria-hidden="true" className="-mx-1 my-1 h-px bg-border" />
				<div
					aria-label={t("library.editor.blocks.code.search")}
					className="flex max-h-60 flex-col overflow-y-auto"
					id={listId}
					role="listbox"
				>
					{matches.length === 0 ? (
						<p className="flex h-8 items-center p-2 text-compact text-muted-foreground leading-4">
							{t("library.editor.blocks.code.noMatch")}
						</p>
					) : (
						matches.map((language, index) => (
							<div
								aria-selected={language === chosen}
								className={cn(
									"flex h-8 shrink-0 cursor-default items-center justify-between gap-2 rounded-lg p-2 text-compact text-foreground leading-4",
									index === highlighted && "bg-foreground/5",
								)}
								data-highlighted={index === highlighted ? "" : undefined}
								id={`${listId}-${index}`}
								key={language}
								onClick={() => choose(language)}
								onPointerMove={() => setActive(index)}
								role="option"
								tabIndex={-1}
							>
								{nameOf(language)}
								{language === chosen ? (
									<Icons.Check
										aria-hidden="true"
										className="size-3.5 shrink-0 text-primary"
									/>
								) : null}
							</div>
						))
					)}
				</div>
			</PopoverContent>
		</Popover>
	)
}

const LibraryCodeEditor = ({ source, onEdit }: LibraryCodeEditorProps) => {
	const { t } = useTranslation("common")
	const language = codeLanguageOf(source)
	const { body } = fenceOf(source)

	return (
		<MarkdownFence
			body={
				<GrowingField
					aria-label={t("library.editor.blocks.code.body")}
					className="mr-8"
					data-slot="library-document-block-field"
					fieldClassName="w-full"
					onChange={(event) =>
						onEdit((current) => withCodeBody(current, event.target.value))
					}
					spellCheck={false}
					value={body}
				/>
			}
			code={body}
			header={
				<span className="-ms-1 -mt-1 mb-2 flex">
					<LanguagePicker
						chosen={resolveCodeLanguage(language)}
						onChoose={(chosen) =>
							onEdit((current) =>
								withCodeLanguage(current, chosen === "text" ? "" : chosen),
							)
						}
					/>
				</span>
			}
			language={language || undefined}
		/>
	)
}

export { BLOCK_POPUP, LibraryCodeEditor }
