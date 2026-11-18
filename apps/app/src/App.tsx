import { RouterProvider } from "@tanstack/react-router"
import { useState } from "react"

import { RecoveredWindowScreen } from "@/components/recovered-window-screen"
import type { WindowIdentity, WindowRecovery } from "@/lib/bindings"
import { recoveryScreenReasonOf } from "@/lib/host/window-recovery"
import { launchPageOf } from "@/lib/tabs/tab-pages"
import { createWorkspaceTabs } from "@/lib/tabs/workspace-tabs"
import { readMirror } from "@/lib/user/preferences-mirror"
import { createWorkspaceRouter } from "@/workspace-router"

type AppProps = {
	windowIdentity?: WindowIdentity
	windowRecovery?: WindowRecovery | null
}

export function App({ windowIdentity, windowRecovery = null }: AppProps) {
	const [router] = useState(() =>
		createWorkspaceRouter(
			createWorkspaceTabs(
				windowIdentity?.initialHref ?? undefined,
				windowIdentity?.label,
				launchPageOf(readMirror()),
			),
		),
	)
	const [isRecoveryDismissed, setIsRecoveryDismissed] = useState(false)
	const recoveryReason = recoveryScreenReasonOf(windowRecovery)
	const continueToApp = () => setIsRecoveryDismissed(true)

	if (recoveryReason && !isRecoveryDismissed) {
		return (
			<RecoveredWindowScreen
				onContinue={continueToApp}
				reason={recoveryReason}
			/>
		)
	}
	return <RouterProvider router={router} />
}
