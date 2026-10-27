import {
	type NavigateOptions,
	useNavigate,
	useRouter,
} from "@tanstack/react-router"
import { useMemo } from "react"

import type { CompanionSettingsSearch, SettingsSearch } from "./settings-search"
import type { ThreadSearch } from "./thread-search"

import { isNewTabClickInFlight } from "../tabs/new-tab-clicks"
import { heldThreadOf, type ThreadHolder } from "../tabs/use-tab-thread-sync"

export const useSettingsNavigation = (holder: ThreadHolder) => {
	const navigate = useNavigate()
	const router = useRouter()

	return useMemo(() => {
		const backOr = (fallback: () => void) => {
			if (router.history.canGoBack()) {
				router.history.back()
				return
			}
			fallback()
		}

		const openInBackgroundTab = (options: NavigateOptions, spaceId?: string) =>
			router.options.context.tabs.openInBackgroundTab(
				router.buildLocation(options).href,
				spaceId,
			)

		const go = (options: NavigateOptions) => {
			if (isNewTabClickInFlight()) {
				openInBackgroundTab(options)
				return
			}
			void navigate(options)
		}

		return {
			back: () =>
				backOr(
					() =>
						void navigate({
							to: "/",
							search: heldThreadOf(holder),
							replace: true,
						}),
				),
			backToUserSettings: () =>
				backOr(() => void navigate({ to: "/settings/user", replace: true })),
			openConversations: () => {
				void navigate({ to: "/", search: heldThreadOf(holder) })
			},
			openThreadInNewTab: (thread: ThreadSearch, spaceId?: string) =>
				openInBackgroundTab({ to: "/", search: thread }, spaceId),
			openSpaceSettings: (spaceId: string, search: SettingsSearch = {}) => {
				void navigate({
					to: "/settings/space/$spaceId",
					params: { spaceId },
					search,
				})
			},
			openUserSettings: (search: SettingsSearch = {}) =>
				go({ to: "/settings/user", search }),
			openCompanionSettings: (
				companionId: string,
				search: CompanionSettingsSearch = {},
			) =>
				go({
					to: "/settings/companion/$companionId",
					params: { companionId },
					search,
				}),
			showEntry: (entry: string) =>
				go({
					to: ".",
					search: (previous: CompanionSettingsSearch) => ({
						...previous,
						entry,
					}),
					replace: true,
				}),
		}
	}, [navigate, router, holder])
}

export type SettingsNavigation = ReturnType<typeof useSettingsNavigation>
