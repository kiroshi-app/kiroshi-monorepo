import { useEffect } from "react"

import { showLaunchedWindowOnce } from "./launch-reveal"

export const useWindowRevealOnMount = () => {
	useEffect(showLaunchedWindowOnce, [])
}
