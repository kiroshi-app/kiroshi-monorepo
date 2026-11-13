import type { ReactNode } from "react"
import { expect, fn, within } from "storybook/test"

import preview from "@workspace/storybook/preview"
import { hueScopeOf } from "@workspace/storybook/story-utils"
import { ContentCard } from "@workspace/ui/components/content-card"
import { DOCUMENT_BODY } from "@workspace/ui/components/document-panel.fixtures"
import {
	LIBRARY_DRAG_PREVIEW,
	LIBRARY_LIGHTBOX_IMAGES,
} from "@workspace/ui/components/library.fixtures"
import {
	LibraryDocumentDropLine,
	LibraryDocumentStart,
	LibraryFailedImage,
} from "@workspace/ui/components/library-document-states"
import {
	DOCUMENT_PAGE,
	DOCUMENT_TITLE,
	type LibraryDocument,
	LibraryDocumentBar,
	LibraryDocumentBody,
	LibraryDocumentColumn,
} from "@workspace/ui/components/library-document-view"
import { LibraryDragGhost } from "@workspace/ui/components/library-import"
import { ScreenLayout } from "@workspace/ui/components/screen-layout"
import { i18n } from "@workspace/ui/lib/i18n"
import { cn } from "@workspace/ui/lib/utils"

const BRIEF: LibraryDocument = {
	id: "brief",
	name: "Spring launch brief",
	detail: "1,240 words · Edited today at 10:41",
	body: DOCUMENT_BODY,
}

const DROPPED_NAMES = [
	"rooftop-dawn.png",
	"rooftop-noon.png",
	"rooftop-dusk.png",
]

const DROP_LINE_TOP = 252

const GHOST_POSITION = { x: 620, y: 260 }

const FAILED_NAME = "rooftop.heic"

const onStart = fn()

const onChooseAnother = fn()

const onRemove = fn()

type DocumentPageProps = {
	item: LibraryDocument
	isReadOnly?: boolean
	heading?: ReactNode
	children: ReactNode
}

const DocumentPage = ({
	item,
	isReadOnly,
	heading,
	children,
}: DocumentPageProps) => (
	<div
		className="flex h-208 w-320 bg-background ps-15 pe-1.5 pt-2 pb-2"
		{...hueScopeOf("blue")}
	>
		<ContentCard isLandmark={false}>
			<ScreenLayout
				className={DOCUMENT_PAGE}
				header={
					<LibraryDocumentBar
						isReadOnly={isReadOnly}
						item={item}
						onBack={fn()}
						onCopy={fn()}
						onDelete={fn()}
						onDownload={fn()}
						onRename={fn()}
					/>
				}
				isHeaderFloating
				scroller={() => (
					<LibraryDocumentColumn
						detail={item.detail}
						heading={heading ?? <h1 className={DOCUMENT_TITLE}>{item.name}</h1>}
					>
						{children}
					</LibraryDocumentColumn>
				)}
			/>
		</ContentCard>
	</div>
)

const meta = preview.meta({
	title: "Navigation/LibraryDocumentStates",
	component: LibraryDocumentStart,
	parameters: {
		layout: "fullscreen",
		docs: {
			description: {
				component:
					"The four states a Library document page takes beyond reading: an empty document offering what to start with, files dragged over it, an image that failed to import in its gallery cell, and the read-only islands of a member offline. Each piece is drawn here on the page the app assembles from LibraryDocumentBar, floating over LibraryDocumentColumn.",
			},
		},
	},
	args: { onStart },
})

export const EmptyDocument = meta.story({
	render: (args) => (
		<DocumentPage
			heading={
				<input
					aria-label={i18n.t("common:library.editor.title")}
					className={cn(
						DOCUMENT_TITLE,
						"bg-transparent outline-none placeholder:text-title-placeholder-foreground",
					)}
					placeholder={i18n.t("common:library.editor.untitled")}
				/>
			}
			item={{ id: "new", name: "", detail: "Created just now", body: "" }}
		>
			<p
				className="text-reading leading-6 before:text-placeholder-foreground before:content-[attr(data-placeholder)]"
				data-placeholder={i18n.t("common:library.document.placeholder")}
			/>
			<LibraryDocumentStart {...args} />
		</DocumentPage>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A document just created, nothing written yet, as artboard 5a draws it. Check the Untitled placeholder title, the placeholder line, and that each of the four Start with buttons calls `onStart` with its own kind.",
			},
		},
	},
	play: async ({ args, canvas, userEvent }) => {
		const start = canvas.getByRole("group", { name: "Start with" })
		const kinds = [
			["Checklist", "checklist"],
			["Gallery", "gallery"],
			["Table", "table"],
			["From a template", "template"],
		] as const
		for (const [name, kind] of kinds) {
			await userEvent.click(within(start).getByRole("button", { name }))
			await expect(args.onStart).toHaveBeenLastCalledWith(kind)
		}
		await expect(args.onStart).toHaveBeenCalledTimes(kinds.length)
	},
})

export const FilesDroppedIn = meta.story({
	render: () => (
		<>
			<DocumentPage item={BRIEF}>
				<LibraryDocumentBody body={BRIEF.body} />
				<LibraryDocumentDropLine
					imageCount={DROPPED_NAMES.length}
					top={DROP_LINE_TOP}
				/>
			</DocumentPage>
			<LibraryDragGhost
				names={DROPPED_NAMES}
				position={GHOST_POSITION}
				previewSrc={LIBRARY_DRAG_PREVIEW}
			/>
		</>
	),
	parameters: {
		docs: {
			description: {
				story:
					"Three images dragged over a document, between two blocks, as artboard 5b draws it. Check the insertion line across the column with its hollow dot at the start, the count pill on the line and the drag preview under the cursor, all three in the Space accent.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const pill = canvas.getByRole("status")
		await expect(pill).toHaveTextContent("Drop to add 3 images here")

		const line = canvasElement.querySelector<HTMLElement>(
			'[data-slot="library-document-drop-line"] > span',
		)
		if (!line) throw new Error("No insertion line drawn")
		await expect(getComputedStyle(pill).backgroundColor).toBe(
			getComputedStyle(line).backgroundColor,
		)
	},
})

export const FailedImport = meta.story({
	render: () => (
		<DocumentPage item={BRIEF}>
			<LibraryDocumentBody body={BRIEF.body.split("\n\n")[0]} />
			<div className="grid h-60 grid-cols-3 gap-1">
				{LIBRARY_LIGHTBOX_IMAGES.slice(0, 2).map((image, index) => (
					<img
						alt={image.name}
						className={cn(
							"size-full object-cover",
							index === 0 && "rounded-s-control",
						)}
						key={image.id}
						src={image.src}
					/>
				))}
				<div className="min-w-0 overflow-hidden rounded-e-control">
					<LibraryFailedImage
						name={FAILED_NAME}
						onChooseAnother={onChooseAnother}
						onRemove={onRemove}
					/>
				</div>
			</div>
		</DocumentPage>
	),
	parameters: {
		docs: {
			description: {
				story:
					"An image that failed to import, in its gallery cell, as artboard 5c draws it. Check the dashed tile keeps the radii of its cell, that the line names the file, and that Choose another file and Remove call their callbacks. The failure notice itself is NoticeSurface's.",
			},
		},
	},
	play: async ({ canvas, userEvent }) => {
		const tile = canvas.getByRole("group", {
			name: `Couldn’t import ${FAILED_NAME}`,
		})
		await userEvent.click(
			within(tile).getByRole("button", { name: "Choose another file" }),
		)
		await expect(onChooseAnother).toHaveBeenCalledOnce()
		await userEvent.click(within(tile).getByRole("button", { name: "Remove" }))
		await expect(onRemove).toHaveBeenCalledOnce()
	},
})

export const ReadOnly = meta.story({
	render: () => (
		<DocumentPage isReadOnly item={BRIEF}>
			<LibraryDocumentBody body={BRIEF.body} />
		</DocumentPage>
	),
	parameters: {
		docs: {
			description: {
				story:
					"A document while the member is offline, as artboard 5d draws it. Check the Read-only chip sits in the actions island before More, and that no offline banner shows above the document.",
			},
		},
	},
	play: async ({ canvas, canvasElement }) => {
		const chip = canvas.getByText("Read-only")
		const more = canvas.getByRole("button", { name: "More" })
		await expect(
			chip.compareDocumentPosition(more) & Node.DOCUMENT_POSITION_FOLLOWING,
		).toBeTruthy()
		await expect(canvas.queryByRole("alert")).toBeNull()
		await expect(canvasElement.querySelector('[data-slot="notice"]')).toBeNull()
	},
})
