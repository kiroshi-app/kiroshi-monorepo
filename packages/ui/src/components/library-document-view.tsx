"use client"

import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import { Markdown } from "@workspace/ui/components/markdown"
import { TooltipButton } from "@workspace/ui/components/tooltip-button"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type LibraryDocument = {
	id: string
	name: string
	detail: string
	body: string
}

const DOCUMENT_TYPE = cn(
	"max-w-none text-reading text-soft-foreground leading-6 [--typeset-flow:0.875rem] [&>:first-child]:mt-0",
	"[&_h2]:mt-6 [&_h2]:text-[1.0625rem] [&_h2]:leading-6 [&_:is(h1,h2,h3)+*]:mt-3.5",
	"[&_li]:mt-1.5 [&_li]:ps-1",
)

type LibraryDocumentViewProps = {
	document: LibraryDocument
	onBack: () => void
	onMore: (document: LibraryDocument) => void
}

const LibraryDocumentView = ({
	document,
	onBack,
	onMore,
}: LibraryDocumentViewProps) => {
	const { t } = useTranslation("common")

	return (
		<div
			className="flex size-full min-h-0 flex-col"
			data-slot="library-document-view"
		>
			<div className="flex h-13 shrink-0 items-center justify-between gap-4 px-3">
				<nav className="flex min-w-0 items-center gap-1.5">
					<Button
						className="h-7 shrink-0 gap-1 rounded-full ps-1.5 pe-2.5 font-medium text-compact text-muted-foreground leading-4 transition-none hover:bg-foreground/6 hover:text-foreground dark:hover:bg-foreground/6"
						onClick={onBack}
						variant="ghost"
					>
						<Icons.Previous aria-hidden="true" />
						{t("library.document.back")}
					</Button>
					<span
						aria-hidden="true"
						className="text-compact text-muted-foreground leading-4"
					>
						/
					</span>
					<span
						aria-current="page"
						className="truncate ps-1 font-medium text-compact text-foreground leading-4"
						title={document.name}
					>
						{document.name}
					</span>
				</nav>
				<TooltipButton
					aria-label={t("library.document.more")}
					className="size-8 shrink-0 rounded-full border-input bg-foreground/3 transition-none hover:bg-foreground/8 dark:bg-foreground/3 dark:hover:bg-foreground/8"
					onClick={() => onMore(document)}
					size="icon"
					tooltip={t("library.document.more")}
					tooltipSide="bottom"
					variant="outline"
				>
					<Icons.More aria-hidden="true" />
				</TooltipButton>
			</div>
			<div className="min-h-0 flex-1 overflow-y-auto px-10 pt-10 pb-10">
				<article className="mx-auto flex w-full max-w-160 flex-col gap-3.5">
					<header className="flex flex-col gap-1.5 pb-1.5">
						<h1 className="break-words font-heading font-semibold text-[1.75rem] text-foreground leading-[2.125rem] tracking-[-0.02em]">
							{document.name}
						</h1>
						<p className="text-compact text-muted-foreground leading-4.5 tabular-nums">
							{document.detail}
						</p>
					</header>
					<Markdown className={DOCUMENT_TYPE}>{document.body}</Markdown>
				</article>
			</div>
		</div>
	)
}

export {
	type LibraryDocument,
	LibraryDocumentView,
	type LibraryDocumentViewProps,
}
