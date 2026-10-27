import {
	type NavigateOptions,
	useNavigate,
	useRouter,
} from "@tanstack/react-router"
import { useMemo } from "react"

import { APPLICATIONS_ENTRY } from "@workspace/ui/components/space-settings-dialog/use-space-settings"
import type { ClickModifiers } from "@workspace/ui/lib/click-modifiers"

import type { CompanionSettingsSearch, SettingsSearch } from "./settings-search"
import type { ThreadSearch } from "./thread-search"

import { isNewTabClickInFlight, opensInNewTab } from "../tabs/new-tab-clicks"
import { heldThreadOf, type ThreadHolder } from "../tabs/use-tab-thread-sync"

const entrySearchOf = (entry: string): SettingsSearch =>
	entry === APPLICATIONS_ENTRY ? { entry } : { entry, application: undefined }

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
			router.options.context.tabs.openInNewTab(
				router.buildLocation(options).href,
				spaceId,
			)

		const replacingSearch = (
			patch: CompanionSettingsSearch,
		): NavigateOptions => ({
			to: ".",
			search: (previous: CompanionSettingsSearch) => ({
				...previous,
				...patch,
			}),
			replace: true,
		})

		const go = (options: NavigateOptions) => {
			if (isNewTabClickInFlight()) {
				openInBackgroundTab(options)
				return
			}
			void navigate(options)
		}

		const goFromClick = (
			options: NavigateOptions,
			modifiers: ClickModifiers | undefined,
		) => {
			if (opensInNewTab(modifiers)) {
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
			openSpaceSettings: (
				spaceId: string,
				search: SettingsSearch = {},
				modifiers?: ClickModifiers,
			) =>
				goFromClick(
					{ to: "/settings/space/$spaceId", params: { spaceId }, search },
					modifiers,
				),
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
			showEntry: (entry: string, modifiers?: ClickModifiers) =>
				goFromClick(replacingSearch(entrySearchOf(entry)), modifiers),
			openApplication: (application: string, modifiers?: ClickModifiers) =>
				goFromClick(
					replacingSearch({ entry: APPLICATIONS_ENTRY, application }),
					modifiers,
				),
			showApplication: (application: string | null) =>
				void navigate(
					replacingSearch({ application: application ?? undefined }),
				),
		}
	}, [navigate, router, holder])
}

export type SettingsNavigation = ReturnType<typeof useSettingsNavigation>
