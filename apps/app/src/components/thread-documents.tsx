import { createContext, useMemo, useState } from "react"

import {
	DOCUMENT_PANEL_MAX_WIDTH,
	DocumentPanel,
} from "@workspace/ui/components/document-panel"
import {
	FileReferenceChip,
	type FileReferenceChipProps,
} from "@workspace/ui/components/file-reference-chip"
import { LibraryDocumentBlockEditor } from "@workspace/ui/components/library-document-block-editor"
import type { MarkdownProps } from "@workspace/ui/components/markdown"
import type { MarkdownRunRenderProps } from "@workspace/ui/components/markdown/run"

import { useLibraryOnScreen } from "@/components/answer-image-viewer"
import { documentRunsOf, isTrailingRun } from "@/lib/chat/document-mentions"
import { titleOf } from "@/lib/library/library-items"
import { useLibraryDocumentSession } from "@/lib/library/use-library-document-session"
import { useLibraryImageResolver } from "@/lib/library/use-library-image-sources"
import { useSaveMessageAsDocument } from "@/lib/library/use-save-message-as-document"
import {
	useOpenLibraryDocument,
	useOpenLibraryItemInNewTab,
} from "@/lib/navigation/use-open-library-document"
import {
	keepDocumentPanelWidth,
	readDocumentPanelWidth,
} from "@/lib/user/preferences-mirror"

type ThreadDocuments = {
	spaceId: string
	isJoined: boolean
	openedName: string | null
	open: (name: string) => void
	close: () => void
	saveAsDocument?: (messageId: string) => void
}

export const ThreadDocumentsContext = createContext<ThreadDocuments | null>(
	null,
)

export const useThreadDocuments = (
	conversationId: string | null,
): ThreadDocuments | null => {
	const library = useLibraryOnScreen()
	const spaceId = library?.spaceId
	const isJoined = library?.isJoined ?? false
	const [openedName, setOpenedName] = useState<string | null>(null)
	const save = useSaveMessageAsDocument(spaceId, ({ name }) =>
		setOpenedName(name),
	)

	return useMemo(
		() =>
			spaceId
				? {
						spaceId,
						isJoined,
						openedName,
						open: setOpenedName,
						close: () => setOpenedName(null),
						saveAsDocument: conversationId
							? (messageId: string) => save({ conversationId, messageId })
							: undefined,
					}
				: null,
		[spaceId, isJoined, openedName, conversationId, save],
	)
}

const documentTitleOf = (name: string) => titleOf({ kind: "document", name })

const chipStateOf = (
	isWriting: boolean,
	isOpen: boolean,
): FileReferenceChipProps["state"] => {
	if (isWriting) {
		return "writing"
	}
	return isOpen ? "open" : "rest"
}

type ThreadDocumentChipProps = {
	documents: ThreadDocuments
	name: string
	isWriting: boolean
}

const ThreadDocumentChip = ({
	documents,
	name,
	isWriting,
}: ThreadDocumentChipProps) => {
	const openInNewTab = useOpenLibraryItemInNewTab()

	return (
		<FileReferenceChip
			onOpen={() => documents.open(name)}
			onOpenInNewTab={() => openInNewTab({ kind: "document", name })}
			state={chipStateOf(isWriting, documents.openedName === name)}
			title={documentTitleOf(name)}
		/>
	)
}

type DocumentReferencesSource = {
	documents: ThreadDocuments
	text: string
	names: string[]
	isWriting: boolean
}

type DocumentReferences = Pick<MarkdownProps, "runs" | "renderRun"> & {
	text: string
}

export const documentReferencesOf = ({
	documents,
	text,
	names,
	isWriting,
}: DocumentReferencesSource): DocumentReferences => {
	const shownText = text.trim() === "" ? names.join(" ") : text
	const runs = documentRunsOf(shownText, names)
	const trailingNames = new Set(runs.filter(isTrailingRun).map(({ id }) => id))
	const renderRun = ({ id, isEnd }: MarkdownRunRenderProps) => {
		if (!isEnd) {
			return null
		}
		const chip = (
			<ThreadDocumentChip
				documents={documents}
				isWriting={isWriting}
				name={id}
			/>
		)
		return trailingNames.has(id) ? <> {chip}</> : chip
	}

	return { text: shownText, runs, renderRun }
}

type ThreadDocumentPanelProps = {
	spaceId: string
	isJoined: boolean
	name: string
	onClose: () => void
}

export const ThreadDocumentPanel = ({
	spaceId,
	isJoined,
	name,
	onClose,
}: ThreadDocumentPanelProps) => {
	const { document, edit } = useLibraryDocumentSession(spaceId, name)
	const openInLibrary = useOpenLibraryDocument()
	const resolveImage = useLibraryImageResolver(spaceId, isJoined)
	const [keptWidth, setKeptWidth] = useState(readDocumentPanelWidth)

	const keepWidth = (width: number) => {
		keepDocumentPanelWidth(width)
		setKeptWidth(width)
	}

	return (
		<DocumentPanel
			defaultWidth={DOCUMENT_PANEL_MAX_WIDTH}
			onClose={onClose}
			onOpenInLibrary={() => openInLibrary(name)}
			onWidthChange={keepWidth}
			title={documentTitleOf(name)}
			width={keptWidth ?? DOCUMENT_PANEL_MAX_WIDTH}
		>
			{document ? (
				<LibraryDocumentBlockEditor
					body={document.markdown}
					onBodyChange={edit}
					resolveImage={resolveImage}
				/>
			) : null}
		</DocumentPanel>
	)
}
