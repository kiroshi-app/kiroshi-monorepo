import { getProjectAnnotations } from "virtual:/@storybook/builder-vite/project-annotations.js"

import { setProjectAnnotations } from "storybook/preview-api"
import { commands } from "vitest/browser"

import {
	type MotionPreference,
	provideMotionEmulation,
} from "./motion-preference"

declare module "vitest/browser" {
	interface BrowserCommands {
		emulateMotionPreference: (preference: MotionPreference) => Promise<void>
	}
}

setProjectAnnotations(getProjectAnnotations())
provideMotionEmulation(commands.emulateMotionPreference)

const RESIZE_OBSERVER_LOOP = "ResizeObserver loop"

const swallowResizeObserverLoop = (event: ErrorEvent) => {
	if (!event.message.includes(RESIZE_OBSERVER_LOOP)) return
	event.stopImmediatePropagation()
	event.preventDefault()
}

window.addEventListener("error", swallowResizeObserverLoop, true)
