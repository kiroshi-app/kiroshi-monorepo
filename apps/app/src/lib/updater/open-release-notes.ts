import { raiseUpdaterFailure } from "./updater-failure"

import { openInBrowser } from "../links/use-external-links"

export const openReleaseNotes = (url: string) => {
	openInBrowser(url).catch(raiseUpdaterFailure("open-release-notes"))
}
