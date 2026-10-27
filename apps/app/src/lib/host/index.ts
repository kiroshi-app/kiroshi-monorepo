import { getCurrentWindow } from "@tauri-apps/api/window"
import { platform } from "@tauri-apps/plugin-os"

import { createHostedSpaces } from "./hosted-spaces"
import { raiseRefusalNotice } from "./http"
import { createJoinedHosts } from "./joined-hosts"
import type { Invoke } from "./joined-hosts-invoke"
import {
	convertFileSrc,
	invoke as tauriInvoke,
	listen as tauriListen,
} from "./tauri"
import { hasTauriInternals } from "./tauri-internals"
import { listenOnThisWindow } from "./window-listen"

import {
	commands,
	MAXIMIZE_BUTTON_EVENT,
	type MaximizeButtonPointer,
	type MaximizeButtonState,
} from "../bindings"
import { reportLocalWhen } from "../failure-report"

const localFileSrc = (path: string): string =>
	isDesktopHost() ? convertFileSrc(path) : path

export const joinedHosts = createJoinedHosts({
	local: {
		invoke: tauriInvoke as Invoke,
		listen: tauriListen,
		fileSrc: localFileSrc,
	},
	join: (id) => commands.joinedSpaceConnect(id),
	fetch: (input, init) => fetch(input, init),
	openSocket: (url) => new WebSocket(url),
	reportFailure: raiseRefusalNotice,
})

export const invoke = joinedHosts.invoke

export const listen = joinedHosts.listen

export const invokeOnThisComputer = joinedHosts.invokeOnThisComputer

export const invokeOn = joinedHosts.invokeOn

export const listenOnThisComputer = tauriListen

export { listenOnThisWindow } from "./window-listen"

export const activeJoinedSpaceId = joinedHosts.activeSpaceId

const hostedSpaces = isDesktopHost() ? createHostedSpaces() : undefined

reportLocalWhen(
	() =>
		activeJoinedSpaceId() === null && (hostedSpaces?.isNoneHosted() ?? false),
)

export const onJoinedSpaceChange = joinedHosts.subscribe

export const listenToActiveHost = joinedHosts.listenToActiveHost

export const onHostReconnected = joinedHosts.onReconnected

export function isDesktopHost(): boolean {
	return hasTauriInternals()
}

export function drivesRealHost(): boolean {
	return isDesktopHost()
}

export function hasOverlayWindowControls(): boolean {
	return isDesktopHost() && platform() === "macos"
}

export const isSidebarResizable = (): boolean =>
	!isDesktopHost() || platform() === "macos"

export const usesCommandKey = (): boolean =>
	!isDesktopHost() || platform() === "macos"

export const hasCaptionWindowControls = (): boolean =>
	isDesktopHost() && platform() === "windows"

export const minimizeWindow = (): Promise<void> => getCurrentWindow().minimize()

export const toggleMaximizeWindow = (): Promise<void> =>
	getCurrentWindow().toggleMaximize()

export const closeWindow = (): Promise<void> => getCurrentWindow().close()

export type MaximizedWatch = {
	report: (isMaximized: boolean) => void
	onError: (reason: unknown) => void
}

export const watchWindowMaximized = ({
	report,
	onError,
}: MaximizedWatch): Promise<() => void> => {
	const current = getCurrentWindow()
	const readMaximized = () => current.isMaximized().then(report, onError)
	readMaximized()
	return current.onResized(readMaximized)
}

export const watchMaximizeButton = (
	report: (state: MaximizeButtonState) => void,
): Promise<() => void> =>
	listenOnThisWindow<MaximizeButtonPointer>(
		MAXIMIZE_BUTTON_EVENT,
		({ payload }) => report(payload.state),
	)

export type MaximizeButtonBounds = NonNullable<
	Parameters<typeof commands.windowDeclareMaximizeButton>[0]
>

export const declareMaximizeButton = async (
	bounds: MaximizeButtonBounds | null,
): Promise<void> => {
	const result = await commands.windowDeclareMaximizeButton(bounds)
	if (result.status === "error") {
		throw new Error(result.error.kind)
	}
}

export function assetSrc(path: string): string {
	return joinedHosts.fileSrc(path)
}

export function avatarSrc(path: string | null): string | undefined {
	return path ? assetSrc(path) : undefined
}

export type WindowReveal = {
	withFocus?: boolean
}

export function revealWindow({ withFocus }: WindowReveal = {}): Promise<void> {
	if (!isDesktopHost()) {
		return Promise.resolve()
	}
	const current = getCurrentWindow()
	const shown = current.show()
	return withFocus ? shown.then(() => current.setFocus()) : shown
}

export function watchWindowFocus(
	report: (isFocused: boolean) => void,
): Promise<() => void> {
	if (!isDesktopHost()) {
		return Promise.resolve(() => undefined)
	}
	const current = getCurrentWindow()
	current.isFocused().then(report, () => report(true))
	return current.onFocusChanged(({ payload }) => report(payload))
}
