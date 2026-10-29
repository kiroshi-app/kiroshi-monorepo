import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"

import { DragGhost } from "@/components/drag-ghost"
import { createDragGhostView } from "@/lib/tabs/drag-ghost-view"
import { applyLanguage, readMirror } from "@/lib/user/preferences-mirror"

const reportWatchFailure = (reason: unknown) => {
	console.error("the drag ghost does not hear its tab", reason)
}

applyLanguage(readMirror().language)

const view = createDragGhostView()
view.watch().catch(reportWatchFailure)

const root = document.getElementById("root")

if (root) {
	createRoot(root).render(
		<StrictMode>
			<I18nProvider>
				<DragGhost view={view} />
			</I18nProvider>
		</StrictMode>,
	)
} else {
	console.error("the drag ghost page has no root")
}
