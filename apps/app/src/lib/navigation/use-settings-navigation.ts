import { useNavigate, useRouter } from "@tanstack/react-router"
import { useMemo } from "react"

import type { CompanionSettingsSearch, SettingsSearch } from "./settings-search"

export const useSettingsNavigation = () => {
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

		return {
			back: () => backOr(() => void navigate({ to: "/", replace: true })),
			backToUserSettings: () =>
				backOr(() => void navigate({ to: "/settings/user", replace: true })),
			openConversations: () => {
				void navigate({ to: "/" })
			},
			openSpaceSettings: (spaceId: string, search: SettingsSearch = {}) => {
				void navigate({
					to: "/settings/space/$spaceId",
					params: { spaceId },
					search,
				})
			},
			openUserSettings: (search: SettingsSearch = {}) => {
				void navigate({ to: "/settings/user", search })
			},
			openCompanionSettings: (
				companionId: string,
				search: CompanionSettingsSearch = {},
			) => {
				void navigate({
					to: "/settings/companion/$companionId",
					params: { companionId },
					search,
				})
			},
			showEntry: (entry: string) => {
				void navigate({
					to: ".",
					search: (previous: CompanionSettingsSearch) => ({
						...previous,
						entry,
					}),
					replace: true,
				})
			},
		}
	}, [navigate, router])
}

export type SettingsNavigation = ReturnType<typeof useSettingsNavigation>
