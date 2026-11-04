import { createContext, useContext, useMemo, useState } from "react"

import { DocumentCard } from "@workspace/ui/components/document-card"
import { DocumentPanel } from "@workspace/ui/components/document-panel"
import { LibraryDocumentBlockEditor } from "@workspace/ui/components/library-document-block-editor"
import { LibraryDocumentBody } from "@workspace/ui/components/library-document-view"

import { useLibraryOnScreen } from "@/components/answer-image-viewer"
import { titleOf } from "@/lib/library/library-items"
import { useLibraryDocumentCard } from "@/lib/library/use-library-document-card"
import { useLibraryDocumentSession } from "@/lib/library/use-library-document-session"
import { useOpenLibraryDocument } from "@/lib/navigation/use-open-library-document"

type ThreadDocuments = {
	spaceId: string
	openedName: string | null
	open: (name: string) => void
	close: () => void
}

export const ThreadDocumentsContext = createContext<ThreadDocuments | null>(
	null,
)

export const useThreadDocuments = (): ThreadDocuments | null => {
	const spaceId = useLibraryOnScreen()?.spaceId
	const [openedName, setOpenedName] = useState<string | null>(null)

	return useMemo(
		() =>
			spaceId
				? {
						spaceId,
						openedName,
						open: setOpenedName,
						close: () => setOpenedName(null),
					}
				: null,
		[spaceId, openedName],
	)
}

const documentTitleOf = (name: string) => titleOf({ kind: "document", name })

type ThreadDocumentProps = {
	spaceId: string
	name: string
}

const UnfoldedDocument = ({ spaceId, name }: ThreadDocumentProps) => {
	const { document } = useLibraryDocumentSession(spaceId, name)
	return <LibraryDocumentBody body={document?.markdown ?? ""} />
}

type ThreadDocumentCardProps = ThreadDocumentProps & {
	isSelected: boolean
	onOpen: () => void
}

const ThreadDocumentCard = ({
	spaceId,
	name,
	isSelected,
	onOpen,
}: ThreadDocumentCardProps) => {
	const { detail, excerpt } = useLibraryDocumentCard(spaceId, name)

	return (
		<DocumentCard
			detail={detail}
			excerpt={excerpt}
			isSelected={isSelected}
			onOpen={onOpen}
			title={documentTitleOf(name)}
		>
			<UnfoldedDocument name={name} spaceId={spaceId} />
		</DocumentCard>
	)
}

type ThreadDocumentCardsProps = {
	names: string[]
}

export const ThreadDocumentCards = ({ names }: ThreadDocumentCardsProps) => {
	const documents = useContext(ThreadDocumentsContext)
	if (!documents) {
		return null
	}

	return names.map((name) => (
		<ThreadDocumentCard
			isSelected={documents.openedName === name}
			key={name}
			name={name}
			onOpen={() => documents.open(name)}
			spaceId={documents.spaceId}
		/>
	))
}

type ThreadDocumentPanelProps = ThreadDocumentProps & {
	onClose: () => void
}

export const ThreadDocumentPanel = ({
	spaceId,
	name,
	onClose,
}: ThreadDocumentPanelProps) => {
	const { document, edit } = useLibraryDocumentSession(spaceId, name)
	const openInLibrary = useOpenLibraryDocument()

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
				/>
			) : null}
		</DocumentPanel>
	)
}
