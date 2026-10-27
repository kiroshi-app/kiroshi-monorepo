import { RouterProvider } from "@tanstack/react-router"
import { useState } from "react"

import type { WindowIdentity } from "@/lib/bindings"
import { createWorkspaceTabs } from "@/lib/tabs/workspace-tabs"
import { createWorkspaceRouter } from "@/workspace-router"

type AppProps = {
	windowIdentity?: WindowIdentity
}

const tabsOfWindow = (windowIdentity?: WindowIdentity) =>
	windowIdentity
		? createWorkspaceTabs(
				windowIdentity.initialHref ?? undefined,
				windowIdentity.label,
			)
		: createWorkspaceTabs()

export function App({ windowIdentity }: AppProps) {
	const [router] = useState(() =>
		createWorkspaceRouter(tabsOfWindow(windowIdentity)),
	)
	return <RouterProvider router={router} />
}
