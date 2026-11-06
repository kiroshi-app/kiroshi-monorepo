import { QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"

import { ScreenshotTarget } from "@/components/screenshot-target"
import {
	commands,
	LIBRARY_SCREENSHOT_WINDOW_PREFIX,
	type ScreenshotJob,
} from "@/lib/bindings"
import { currentWindowLabel } from "@/lib/host"
import { forwardConsoleToLogFile } from "@/lib/host/console-log-forwarding"
import { captured, settled } from "@/lib/library/screenshot-capture"
import { answerScreenshot } from "@/lib/library/screenshot-page"
import { createQueryClient } from "@/lib/query/query-client"
import { applyLanguage, readMirror } from "@/lib/user/preferences-mirror"

forwardConsoleToLogFile()
applyLanguage(readMirror().language)

const queryClient = createQueryClient()

const shownOf = (container: HTMLElement) => {
	const shown = container.firstElementChild
	if (!shown) {
		throw new Error("the screenshot target rendered nothing")
	}
	return shown
}

const rendered = (job: ScreenshotJob) =>
	new Promise<Element>((resolve, reject) => {
		const container = document.getElementById("root")
		if (!container) {
			reject(new Error("the screenshot page has no root"))
			return
		}
		createRoot(container, { onUncaughtError: (error) => reject(error) }).render(
			<StrictMode>
				<QueryClientProvider client={queryClient}>
					<I18nProvider>
						<ScreenshotTarget job={job} />
					</I18nProvider>
				</QueryClientProvider>
			</StrictMode>,
		)
		settled(queryClient, container)
			.then(() => resolve(shownOf(container)))
			.catch(reject)
	})

answerScreenshot({
	requestId: currentWindowLabel().slice(
		LIBRARY_SCREENSHOT_WINDOW_PREFIX.length,
	),
	readJob: commands.libraryScreenshotJob,
	render: rendered,
	capture: captured,
	answer: commands.libraryScreenshotAnswer,
}).catch((reason: unknown) => {
	console.error("the screenshot was not answered", reason)
})
