import type {
	EventCallback,
	EventName,
	UnlistenFn,
} from "@tauri-apps/api/event"
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow"

export const listenOnThisWindow = async <T>(
	event: EventName,
	handler: EventCallback<T>,
): Promise<UnlistenFn> => getCurrentWebviewWindow().listen<T>(event, handler)
