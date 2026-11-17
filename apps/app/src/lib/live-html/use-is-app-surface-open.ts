import { useSyncExternalStore } from "react"

import { subscribeToOpenPopups } from "@/lib/annotation/use-topmost-open-popup"

const OPEN_APP_SURFACE =
	'[data-open]:is([role="dialog"], [role="alertdialog"], [role="menu"], [role="listbox"], [role="presentation"])'

const hasOpenAppSurface = () =>
	document.querySelector(OPEN_APP_SURFACE) !== null

export const useIsAppSurfaceOpen = () =>
	useSyncExternalStore(subscribeToOpenPopups, hasOpenAppSurface)
