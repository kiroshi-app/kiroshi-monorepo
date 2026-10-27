import { QueryClientProvider } from "@tanstack/react-query"
import { ReactQueryDevtools } from "@tanstack/react-query-devtools"
import { lazy, StrictMode, Suspense } from "react"
import { createRoot } from "react-dom/client"

import { I18nProvider } from "@workspace/ui/components/i18n-provider"

import { App } from "./App"

import { forgetOwnAccountIds } from "@/lib/account/forget-own-account-ids"
import { exposeLiveSessions } from "@/lib/agent/live-sessions-devtools"
import { commands, type WindowIdentity } from "@/lib/bindings"
import { isDesktopHost, revealWindow } from "@/lib/host"
import { forwardConsoleToLogFile } from "@/lib/host/console-log-forwarding"
import { installInvokeTally } from "@/lib/perf/invoke-tally-devtools"
import { exposeScrollTrace } from "@/lib/perf/scroll-trace-devtools"
import { invalidateOnHostReconnect } from "@/lib/query/host-invalidations"
import { createQueryClient } from "@/lib/query/query-client"
import { MAIN_WINDOW_LABEL } from "@/lib/tabs/tabs-mirror"
import {
	forgetWindowWhenClosed,
	reopenSecondaryWindows,
} from "@/lib/tabs/workspace-tabs"
import { applyLanguage, readMirror } from "@/lib/user/preferences-mirror"
import { warmCodeHighlighter } from "@/lib/warm-highlighter"

const reportRevealFailure = (reason: unknown) => {
	console.error("reveal at start failed", reason)
}

forwardConsoleToLogFile()
installInvokeTally()

try {
	revealWindow().catch(reportRevealFailure)
} catch (reason) {
	reportRevealFailure(reason)
}

exposeLiveSessions()
exposeScrollTrace()

forgetOwnAccountIds()
applyLanguage(readMirror().language)

const AnnotationToolbar = import.meta.env.DEV
	? lazy(() =>
			import("@/components/annotation-toolbar").then((module) => ({
				default: module.AnnotationToolbar,
			})),
		)
	: undefined

const queryClient = createQueryClient()
invalidateOnHostReconnect(queryClient)

const renderApp = (windowIdentity?: WindowIdentity) => {
	createRoot(document.getElementById("root")!).render(
		<StrictMode>
			<QueryClientProvider client={queryClient}>
				<I18nProvider>
					<App windowIdentity={windowIdentity} />
				</I18nProvider>
				{import.meta.env.DEV && <ReactQueryDevtools />}
				{AnnotationToolbar && (
					<Suspense>
						<AnnotationToolbar />
					</Suspense>
				)}
			</QueryClientProvider>
		</StrictMode>,
	)
}

const reportWindowStartFailure = (reason: unknown) => {
	console.error("window start failed", reason)
}

const startWindow = (windowIdentity: WindowIdentity) => {
	renderApp(windowIdentity)
	const starting =
		windowIdentity.label === MAIN_WINDOW_LABEL
			? reopenSecondaryWindows()
			: forgetWindowWhenClosed(windowIdentity.label)
	starting.catch(reportWindowStartFailure)
}

const renderAsMainWindow = (reason: unknown) => {
	console.error("window identity at start failed", reason)
	renderApp()
}

if (isDesktopHost()) {
	commands.windowIdentity().then(startWindow, renderAsMainWindow)
} else {
	renderApp()
}

warmCodeHighlighter()
