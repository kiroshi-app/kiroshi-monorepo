import { createContext, useMemo, useState } from "react"

import { DocumentPanel } from "@workspace/ui/components/document-panel"
import { LibraryDocumentBlockEditor } from "@workspace/ui/components/library-document-block-editor"

import { useLibraryOnScreen } from "@/components/answer-image-viewer"
import { titleOf } from "@/lib/library/library-items"
import { useLibraryDocumentSession } from "@/lib/library/use-library-document-session"
import { useLibraryImageResolver } from "@/lib/library/use-library-image-sources"
import { useSaveMessageAsDocument } from "@/lib/library/use-save-message-as-document"
import { useOpenLibraryDocument } from "@/lib/navigation/use-open-library-document"

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

type ThreadDocumentProps = {
	spaceId: string
	isJoined: boolean
	name: string
}

type ThreadDocumentPanelProps = ThreadDocumentProps & {
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

	return (
		<DocumentPanel
			onClose={onClose}
			onOpenInLibrary={() => openInLibrary(name)}
			title={documentTitleOf(name)}
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
