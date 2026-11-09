import { useSyncExternalStore } from "react"

import { pageOf, type TabPage } from "./tab-pages"
import type { WorkspaceTabs } from "./workspace-tabs"

export const usePageShown = (
	tabs: WorkspaceTabs,
	isPage: (page: TabPage) => boolean,
) =>
	useSyncExternalStore(tabs.history.subscribe, () =>
		isPage(pageOf(tabs.history.location.href)),
	)
