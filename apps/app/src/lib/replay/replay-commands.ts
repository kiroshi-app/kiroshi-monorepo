import type { AnyRouter } from "@tanstack/react-router"

import {
	MEASURED_MATCH_LIMIT,
	type ReplayCommand,
	type ReplayOutcome,
} from "./replay-protocol"

type CommandNamed<Name extends ReplayCommand["name"]> = Extract<
	ReplayCommand,
	{ name: Name }
>

type FindRenderedRouter = () => AnyRouter | undefined

const FUZZY_REMAINDER_PARAM = "**"

const succeeded = (result: unknown): ReplayOutcome => ({ ok: true, result })

const failed = (reason: string): ReplayOutcome => ({ ok: false, reason })

const nextAnimationFrame = () =>
	new Promise<void>((resolve) => {
		requestAnimationFrame(() => resolve())
	})

const navigate = async (
	{ path, search }: CommandNamed<"navigate">,
	findRenderedRouter: FindRenderedRouter,
) => {
	const router = findRenderedRouter()
	if (!router) {
		return failed("the workspace router is not ready")
	}
	const [, rawParams, route] = router.getMatchedRoutes(path)
	if (!route || rawParams[FUZZY_REMAINDER_PARAM] !== undefined) {
		return failed(`unknown route ${path}`)
	}
	await router.navigate({ to: path, search })
	const { href, pathname, search: resolvedSearch } = router.state.location
	return succeeded({ href, pathname, search: resolvedSearch })
}

const applyTheme = ({ scheme }: CommandNamed<"theme">) => {
	const root = document.documentElement
	root.classList.remove("light", "dark")
	root.classList.add(scheme)
	return succeeded({ scheme, rootClass: root.className })
}

const scroll = async ({ selector, top }: CommandNamed<"scroll">) => {
	const target = document.querySelector(selector)
	if (!target) {
		return failed(`selector matches nothing: ${selector}`)
	}
	target.scrollTop = top
	await nextAnimationFrame()
	return succeeded({ scrollTop: target.scrollTop })
}

const measuresOf = (element: Element, properties: string[]) => {
	const { x, y, width, height, top, right, bottom, left } =
		element.getBoundingClientRect()
	const style = getComputedStyle(element)
	return {
		rect: { x, y, width, height, top, right, bottom, left },
		scrollTop: element.scrollTop,
		scrollHeight: element.scrollHeight,
		clientHeight: element.clientHeight,
		computed: Object.fromEntries(
			properties.map((property) => [
				property,
				style.getPropertyValue(property),
			]),
		),
	}
}

const measure = ({ selector, properties }: CommandNamed<"measure">) => {
	const matches = [...document.querySelectorAll(selector)]
	if (matches.length === 0) {
		return failed(`selector matches nothing: ${selector}`)
	}
	return succeeded({
		matchCount: matches.length,
		elements: matches
			.slice(0, MEASURED_MATCH_LIMIT)
			.map((element) => measuresOf(element, properties)),
	})
}

const execute = async (
	command: ReplayCommand,
	findRenderedRouter: FindRenderedRouter,
): Promise<ReplayOutcome> => {
	switch (command.name) {
		case "navigate":
			return navigate(command, findRenderedRouter)
		case "theme":
			return applyTheme(command)
		case "scroll":
			return scroll(command)
		case "measure":
			return measure(command)
		default:
			return failed("unknown command")
	}
}

export const runReplayCommand = (
	command: ReplayCommand,
	findRenderedRouter: FindRenderedRouter,
): Promise<ReplayOutcome> =>
	execute(command, findRenderedRouter).catch((error: unknown) =>
		failed(error instanceof Error ? error.message : String(error)),
	)
