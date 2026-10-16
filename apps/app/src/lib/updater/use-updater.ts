import { useEffect } from "react"

import { createUpdater } from "./create-updater"
import {
	createUpdaterController,
	type UpdaterController,
	type UpdaterState,
} from "./updater-controller"
import { raiseUpdaterFailure } from "./updater-failure"

import { useController } from "../use-controller"

export type Updater = {
	state: UpdaterState
	controller: UpdaterController
}

export const useUpdater = (): Updater => {
	const { state, controller } = useController(() =>
		createUpdaterController(
			createUpdater(),
			raiseUpdaterFailure("use-updater"),
		),
	)

	useEffect(() => controller.start(), [controller])

	return { state, controller }
}
