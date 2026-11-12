"use client"

import { Combobox } from "@base-ui/react/combobox"
import { type ChangeEvent, useId, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { DocumentGlyph } from "@workspace/ui/components/document-panel"
import { Icons } from "@workspace/ui/components/icons"
import { FOCUS_OUTLINE } from "@workspace/ui/components/library-document-agents"
import { LABELLED_PILL } from "@workspace/ui/components/prompt-attach-button"
import { Button } from "@workspace/ui/components/ui/button"
import { libraryDisplayName } from "@workspace/ui/lib/library-display-name"
import { cn } from "@workspace/ui/lib/utils"

type LibraryPickerDocument = {
	id: string
	name: string
	detail: string
}

type PromptLibraryPickerProps = {
	documents: LibraryPickerDocument[]
	onPick: (document: LibraryPickerDocument) => void
	onAttach: (files: File[]) => void
	disabled?: boolean
	hasLabel?: boolean
}

const PromptLibraryPicker = ({
	documents,
	onPick,
	onAttach,
	disabled,
	hasLabel = false,
}: PromptLibraryPickerProps) => {
	const { t } = useTranslation("common")
	const { t: tChat } = useTranslation("chat")
	const [isOpen, setOpen] = useState(false)
	const [query, setQuery] = useState("")
	const fileRef = useRef<HTMLInputElement>(null)
	const sectionId = useId()
	const triggerLabel = hasLabel
		? tChat("attachments.add")
		: tChat("attachments.attach")

	const nameOf = (document: LibraryPickerDocument) =>
		libraryDisplayName(document.name, t)

	const changeOpen = (open: boolean) => {
		setOpen(open)
		if (!open) setQuery("")
	}

	const pick = (document: LibraryPickerDocument | null) => {
		if (document) onPick(document)
	}

	const browse = () => {
		changeOpen(false)
		fileRef.current?.click()
	}

	const handleBrowsed = (event: ChangeEvent<HTMLInputElement>) => {
		const files = Array.from(event.target.files ?? [])
		if (files.length > 0) onAttach(files)
		event.target.value = ""
	}

	return (
		<>
			<Combobox.Root
				autoHighlight
				inputValue={query}
				itemToStringLabel={nameOf}
				itemToStringValue={(document: LibraryPickerDocument) => document.id}
				items={documents}
				onInputValueChange={setQuery}
				onOpenChange={changeOpen}
				onValueChange={pick}
				open={isOpen}
				value={null}
			>
				<Combobox.Trigger
					aria-label={triggerLabel}
					disabled={disabled}
					render={
						<Button
							className={cn(
								"size-8 rounded-full border-foreground/12 text-soft-foreground transition-none",
								hasLabel && LABELLED_PILL,
							)}
							size="icon"
							variant="ghost"
						/>
					}
				>
					<Icons.Add aria-hidden="true" />
					{hasLabel ? triggerLabel : null}
				</Combobox.Trigger>
				<Combobox.Portal>
					<Combobox.Positioner
						align="start"
						className="isolate z-50"
						side="top"
						sideOffset={8}
					>
						<Combobox.Popup
							aria-label={t("library.documentPicker.label")}
							className="flex w-100 max-w-[calc(100vw-2rem)] flex-col rounded-xl bg-prompt-menu p-1 text-foreground shadow-popover outline-none"
							data-slot="prompt-library-picker"
						>
							<div className="flex h-10 shrink-0 items-center gap-2 border-foreground/7 border-b px-2.5">
								<Icons.Search
									aria-hidden="true"
									className="size-4 shrink-0 text-muted-foreground"
								/>
								<Combobox.Input
									aria-label={t("library.documentPicker.search")}
									className="min-w-0 flex-1 bg-transparent text-sm leading-5 outline-none placeholder:text-placeholder-foreground"
									placeholder={t("library.documentPicker.search")}
								/>
							</div>
							<p
								className="px-2.5 pt-2 pb-1 font-medium text-muted-foreground text-xs leading-4"
								id={sectionId}
							>
								{t("library.filters.documents")}
							</p>
							<Combobox.Empty className="px-2.5 py-3 text-compact text-muted-foreground leading-4 empty:hidden">
								{t("library.noResult.search", { query })}
							</Combobox.Empty>
							<Combobox.List
								aria-labelledby={sectionId}
								className="max-h-72 overflow-y-auto empty:hidden"
							>
								{(document: LibraryPickerDocument) => {
									const name = nameOf(document)
									return (
										<Combobox.Item
											className="group/row flex h-12 min-w-0 cursor-default items-center gap-2.5 rounded-lg px-2.5 outline-none data-highlighted:bg-foreground/5"
											key={document.id}
											value={document}
										>
											<DocumentGlyph />
											<span className="flex min-w-0 flex-1 flex-col">
												<span
													className="truncate font-medium text-sm leading-5"
													title={name}
												>
													{name}
												</span>
												<span className="truncate text-muted-foreground text-xs leading-4 tabular-nums">
													{document.detail}
												</span>
											</span>
											<span
												aria-hidden="true"
												className="hidden h-5 shrink-0 items-center rounded-sm border border-border px-1.5 text-muted-foreground group-data-highlighted/row:flex"
												data-slot="prompt-library-picker-hint"
											>
												<Icons.Return className="size-3" />
											</span>
										</Combobox.Item>
									)
								}}
							</Combobox.List>
							<button
								className={cn(
									"mt-1 flex h-9 w-full shrink-0 items-center gap-2 rounded-b-lg border-foreground/7 border-t px-2.5 text-start text-compact text-soft-foreground leading-4 hover:bg-foreground/5 active:bg-foreground/8",
									FOCUS_OUTLINE,
								)}
								data-slot="prompt-library-picker-files"
								onClick={browse}
								type="button"
							>
								<Icons.Add aria-hidden="true" className="size-3.5 shrink-0" />
								<span className="truncate">
									{t("library.documentPicker.attachFiles")}
								</span>
							</button>
						</Combobox.Popup>
					</Combobox.Positioner>
				</Combobox.Portal>
			</Combobox.Root>
			<input
				aria-label={tChat("attachments.attach")}
				className="hidden"
				multiple
				onChange={handleBrowsed}
				ref={fileRef}
				type="file"
			/>
		</>
	)
}

export {
	type LibraryPickerDocument,
	PromptLibraryPicker,
	type PromptLibraryPickerProps,
}
