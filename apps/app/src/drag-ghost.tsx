import { QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"

import { DragGhost } from "@/components/drag-ghost"
import { createTranscriptStore } from "@/lib/conversations/create-store"
import { createQueryClient } from "@/lib/query/query-client"
import { createDragGhostView } from "@/lib/tabs/drag-ghost-view"
import { applyLanguage, readMirror } from "@/lib/user/preferences-mirror"

const reportWatchFailure = (reason: unknown) => {
	console.error("the drag ghost does not hear its tab", reason)
}

applyLanguage(readMirror().language)

const view = createDragGhostView()
view.watch().catch(reportWatchFailure)

const queryClient = createQueryClient()

const reader = createTranscriptStore()

const root = document.getElementById("root")

if (root) {
	createRoot(root).render(
		<StrictMode>
			<QueryClientProvider client={queryClient}>
				<I18nProvider>
					<DragGhost reader={reader} view={view} />
				</I18nProvider>
			</QueryClientProvider>
		</StrictMode>,
	)
} else {
	console.error("the drag ghost page has no root")
}
