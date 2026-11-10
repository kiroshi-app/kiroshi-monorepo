import { RouterProvider } from "@tanstack/react-router"
import { useState } from "react"

import type { WindowIdentity } from "@/lib/bindings"
import { launchPageOf } from "@/lib/tabs/tab-pages"
import { createWorkspaceTabs } from "@/lib/tabs/workspace-tabs"
import { readMirror } from "@/lib/user/preferences-mirror"
import { createWorkspaceRouter } from "@/workspace-router"

type AppProps = {
	windowIdentity?: WindowIdentity
}

export function App({ windowIdentity }: AppProps) {
	const [router] = useState(() =>
		createWorkspaceRouter(
			createWorkspaceTabs(
				windowIdentity?.initialHref ?? undefined,
				windowIdentity?.label,
				launchPageOf(readMirror()),
			),
		),
	)
	return <RouterProvider router={router} />
}
