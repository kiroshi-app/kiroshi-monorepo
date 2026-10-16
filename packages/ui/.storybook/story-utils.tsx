import { OverlayScrollbars } from "overlayscrollbars"
import type { ComponentType, ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import type { ExtraProps } from "react-markdown"
import { expect, waitFor } from "storybook/test"

import type { Icon } from "@workspace/ui/components/icons"
import {
	MARKDOWN_CODE_SURFACE_CLASS,
	MARKDOWN_TYPESET_CLASS,
	MARKDOWN_WHITESPACE_CLASS,
} from "@workspace/ui/components/markdown/prose"
import {
	Sidebar,
	SidebarContent,
	SidebarProvider,
} from "@workspace/ui/components/ui/sidebar"
import { cn } from "@workspace/ui/lib/utils"

export const withStoryProps = <Props,>(component: ComponentType<never>) =>
	component as ComponentType<Partial<Props>>

export const listExhaustively = <T extends string>(members: Record<T, true>) =>
	Object.keys(members) as T[]

export const A11Y_CONTRAST_AWAITING_DESIGN_DECISION = {
	config: {
		rules: [{ id: "color-contrast", reviewOnFail: true }],
	},
}

export const A11Y_FLOATING_FOCUS_GUARDS = {
	config: {
		rules: [{ id: "aria-hidden-focus", reviewOnFail: true }],
	},
}

export const A11Y_SUBMENU_PORTAL_GUARD = {
	config: {
		rules: [{ id: "aria-required-children", reviewOnFail: true }],
	},
}

export const A11Y_SIDE_BY_SIDE_TWIN_LANDMARKS = {
	config: {
		rules: [{ id: "landmark-unique", reviewOnFail: true }],
	},
}

type A11yRuleSet = {
	config: { rules: { id: string; reviewOnFail: boolean }[] }
}

export const mergeA11y = (...sets: A11yRuleSet[]) => ({
	config: { rules: sets.flatMap(({ config }) => config.rules) },
})

export const FRAME_POLL = { interval: 10 }

export const isInBrowserRunner = () => "__vitest_browser__" in globalThis

const runsToAnEnd = (animation: Animation) =>
	animation.effect?.getTiming().duration !== "auto"

export const shown = async (element: HTMLElement) => {
	await waitFor(() => expect(element).toBeVisible(), {
		...FRAME_POLL,
		timeout: 5000,
	})
	return element
}

export const settled = async (element: HTMLElement) => {
	await shown(element)
	await Promise.all(
		element
			.getAnimations({ subtree: true })
			.filter(runsToAnEnd)
			.map(({ finished }) => finished.catch(() => undefined)),
	)
	return element
}

export const Row = ({ children }: { children: React.ReactNode }) => (
	<div className="flex flex-wrap items-center gap-3">{children}</div>
)

export const SidebarFrame = ({ children }: { children: ReactNode }) => (
	<SidebarProvider>
		<Sidebar aria-label="Roster" collapsible="none" role="complementary">
			<SidebarContent>{children}</SidebarContent>
		</Sidebar>
	</SidebarProvider>
)

export const expectSkeletonFilledTo = (root: Element, edge: "top" | "bottom") =>
	waitFor(() => {
		const edgeY = slotIn(root, "list-skeleton").getBoundingClientRect()[edge]
		const lastRow = slotsIn(root, "list-skeleton-row")
			.at(-1)
			?.getBoundingClientRect()

		expect(
			lastRow !== undefined && lastRow.top <= edgeY && lastRow.bottom >= edgeY,
		).toBe(true)
	}, FRAME_POLL)

export const slotsIn = (root: Element, slot: string) =>
	Array.from(root.querySelectorAll<HTMLElement>(`[data-slot="${slot}"]`))

export const slotIn = (root: Element, slot: string) => {
	const node = root.querySelector<HTMLElement>(`[data-slot="${slot}"]`)
	if (!node) throw new Error(`Nothing here draws a ${slot}`)
	return node
}

const strokesOf = (Glyph: Icon) => {
	const host = document.createElement("div")
	host.innerHTML = renderToStaticMarkup(<Glyph />)
	return host.firstElementChild?.innerHTML
}

export const glyphIn = (root: Element, glyph: Icon) => {
	const strokes = strokesOf(glyph)
	return (
		Array.from(root.querySelectorAll<SVGSVGElement>("svg")).find(
			(svg) => svg.innerHTML === strokes,
		) ?? null
	)
}

export const holderOf = (root: Element, holds: string) => {
	const holder = root.querySelector<HTMLElement>(`[data-holds="${holds}"]`)
	if (!holder) throw new Error(`Nothing here holds ${holds}`)
	return holder
}

export const opaque = async (element: HTMLElement) => {
	await waitFor(
		() => expect(getComputedStyle(element).opacity).toBe("1"),
		FRAME_POLL,
	)
	return element
}

type FontUtility = "font-heading" | "font-sans"

const fontFamilyOf = (utility: FontUtility) => {
	const probe = document.createElement("span")
	probe.className = utility
	document.body.append(probe)
	const family = getComputedStyle(probe).fontFamily
	probe.remove()
	return family
}

export const expectFont = async (element: Element, utility: FontUtility) => {
	await expect(getComputedStyle(element).fontFamily).toBe(fontFamilyOf(utility))
}

export const expectHeadingFont = async (element: Element) => {
	await expect(fontFamilyOf("font-heading")).toBe(fontFamilyOf("font-sans"))
	await expect(getComputedStyle(element).fontFamily).toMatch(
		/^"Geist Variable"/,
	)
	await expect(getComputedStyle(element).fontWeight).toBe("600")
}

export const hasOverlayScrollbars = (element: HTMLElement) =>
	OverlayScrollbars.valid(OverlayScrollbars(element))

export const widthInRems = (element: HTMLElement) =>
	element.getBoundingClientRect().width /
	Number.parseFloat(getComputedStyle(document.documentElement).fontSize)

export const lineHeightOf = (element: Element) =>
	Number.parseFloat(getComputedStyle(element).lineHeight)

export const tokenLengthOf = (token: string) => {
	const probe = document.createElement("div")
	probe.style.width = `var(${token})`
	document.body.append(probe)
	const length = getComputedStyle(probe).width
	probe.remove()
	return length
}

type ProbedProperty =
	| "color"
	| "backgroundColor"
	| "borderTopColor"
	| "borderTopLeftRadius"
	| "fontFamily"
	| "lineHeight"
	| "rowGap"

export const probedStyleOf = (
	className: string,
	property: ProbedProperty,
	host: Element = document.body,
) => {
	const probe = document.createElement("span")
	probe.className = className
	host.append(probe)
	const value = getComputedStyle(probe)[property]
	probe.remove()
	return value
}

export const tokenStyleIn = (
	element: HTMLElement,
	className: string,
	property: ProbedProperty,
) => probedStyleOf(className, property, element)

export const contentBottomOf = (surface: HTMLElement) => {
	const style = getComputedStyle(surface)
	return (
		surface.getBoundingClientRect().bottom -
		Number.parseFloat(style.paddingBottom) -
		Number.parseFloat(style.borderBottomWidth)
	)
}

export const expectSkeletonClippedAtBottomOf = async (surface: HTMLElement) => {
	const list = await waitFor(() => slotIn(surface, "list-skeleton"))
	await waitFor(() => {
		const edge = list.getBoundingClientRect().bottom
		const lastRow = slotsIn(list, "list-skeleton-row")
			.at(-1)
			?.getBoundingClientRect()
		expect(Math.abs(edge - contentBottomOf(surface))).toBeLessThan(1)
		expect(
			lastRow !== undefined && lastRow.top < edge && lastRow.bottom >= edge,
		).toBe(true)
	}, FRAME_POLL)
	await expect(getComputedStyle(list).overflowY).toBe("hidden")
	await expect(list).toHaveAttribute("aria-hidden", "true")
	await expect(getComputedStyle(list).animationName).toBe("none")
	await expect(getComputedStyle(slotIn(list, "skeleton")).backgroundColor).toBe(
		probedStyleOf("bg-border", "backgroundColor", list),
	)
	return list
}

const surfaceOf = (frame: HTMLElement) => frame.parentElement ?? document.body

export const expectFieldFrame = async (
	frame: HTMLElement,
	outline: "border-input" | "border-border" = "border-input",
) => {
	const style = getComputedStyle(frame)
	const surface = surfaceOf(frame)
	await expect(style.backgroundColor).toBe(
		probedStyleOf("bg-muted", "backgroundColor", surface),
	)
	await expect(style.borderTopWidth).toBe("1px")
	await expect(style.borderTopColor).toBe(
		probedStyleOf(outline, "borderTopColor", surface),
	)
}

export const expectControlFrame = async (frame: HTMLElement) => {
	await expectFieldFrame(frame)
	await expect(getComputedStyle(frame).borderTopLeftRadius).toBe(
		probedStyleOf("rounded-control", "borderTopLeftRadius", surfaceOf(frame)),
	)
}

export const expectFocusRing = async (frame: HTMLElement) =>
	waitFor(() =>
		expect(getComputedStyle(frame).borderTopColor).toBe(
			probedStyleOf("border-ring", "borderTopColor", surfaceOf(frame)),
		),
	)

export const expectInvalidOutline = async (frame: HTMLElement) =>
	expect(getComputedStyle(frame).borderTopColor).toBe(
		probedStyleOf("border-destructive", "borderTopColor", surfaceOf(frame)),
	)

export const expectInverseAtRest = async (button: HTMLElement) => {
	const style = getComputedStyle(button)
	await expect(style.backgroundColor).toBe(
		tokenStyleIn(button, "bg-foreground", "backgroundColor"),
	)
	await expect(style.color).toBe(
		tokenStyleIn(button, "text-background", "color"),
	)
	await expect(style.backgroundColor).not.toBe(
		tokenStyleIn(button, "bg-primary", "backgroundColor"),
	)
}

export const realPointer = async () =>
	(await import("vitest/browser")).userEvent

export const botIdentityAvatars = (canvasElement: HTMLElement) =>
	slotsIn(canvasElement, "bot-identity-avatar")

export const companionGlyphOf = (avatar: Element) =>
	slotIn(avatar, "companion-field")

export const companionGlyphs = (root: Element) =>
	slotsIn(root, "companion-field")

export const companionTintOf = (glyph: HTMLElement) =>
	glyph.style.backgroundColor.match(/var\(--bot-blot-\w+\)/)?.[0] ?? ""

export const companionGlyphsIn = (root: Element, state: string) =>
	companionGlyphs(root).filter((glyph) => glyph.dataset.state === state)

export const pictureOf = async (avatar: HTMLElement) => {
	await waitFor(() => expect(avatar.querySelector("img")).not.toBeNull())
	return avatar.querySelector("img") as HTMLImageElement
}

export const expectCompanionSilhouette = (layer: Element) =>
	expect(getComputedStyle(layer).maskImage).toContain("data:image/svg+xml")

export const expectCompanionPictureShape = async (avatar: HTMLElement) => {
	const picture = await pictureOf(avatar)
	const { width } = avatar.getBoundingClientRect()

	for (const layer of [avatar, picture]) {
		const style = getComputedStyle(layer)
		await expect(style.borderRadius).toBe("0px")
		await expect(style.outlineStyle).toBe("none")
		await expect(style.borderTopWidth).toBe("0px")
		await expect(style.boxShadow).toBe("none")
	}
	await expect(getComputedStyle(avatar, "::after").display).toBe("none")
	await expect(getComputedStyle(picture).objectFit).toBe("cover")
	await expect(picture.getBoundingClientRect().width).toBe(width)
	await expect(picture).toHaveAttribute("alt", "")
	await expect(picture).toHaveAttribute("aria-hidden", "true")
	await expectCompanionSilhouette(picture)
}

export const UPLOADED_AVATAR_IMAGE =
	"data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHZpZXdCb3g9JzAgMCA5NiA5Nic+PHJlY3Qgd2lkdGg9Jzk2JyBoZWlnaHQ9Jzk2JyBmaWxsPScjZThhMzNkJy8+PGNpcmNsZSBjeD0nNDgnIGN5PSczOCcgcj0nMTYnIGZpbGw9JyNmZmY3ZTgnLz48cmVjdCB4PScyMCcgeT0nNjAnIHdpZHRoPSc1NicgaGVpZ2h0PSc0MCcgcng9JzIwJyBmaWxsPScjZmZmN2U4Jy8+PC9zdmc+"

export const PICKED_PICTURE_FILE = new File(["<svg />"], "portrait.svg", {
	type: "image/svg+xml",
})

interface MarkdownProseProps {
	children: ReactNode
}

export const MarkdownProse = ({ children }: MarkdownProseProps) => (
	<div
		className={cn(
			MARKDOWN_TYPESET_CLASS,
			MARKDOWN_CODE_SURFACE_CLASS,
			MARKDOWN_WHITESPACE_CLASS,
			"w-[44rem] max-w-full text-sm leading-6",
		)}
	>
		{children}
	</div>
)

type ParserNode = NonNullable<ExtraProps["node"]>
type ParserChild = ParserNode["children"][number]

export const textNode = (value: string): ParserChild => ({
	type: "text",
	value,
})

export const elementNode = (
	tagName: string,
	children: ParserChild[],
	properties: ParserNode["properties"] = {},
): ParserNode => ({ type: "element", tagName, properties, children })

type LitCell = { x: number; y: number; alpha: number }

const litCells = new WeakMap<HTMLCanvasElement, LitCell[]>()

const canvasOf = (context: CanvasRenderingContext2D) =>
	context.canvas as HTMLCanvasElement

export const recordLitCells = () => {
	const prototype = CanvasRenderingContext2D.prototype
	const { clearRect, fillRect, moveTo, fill } = prototype
	const traced = new WeakMap<HTMLCanvasElement, Omit<LitCell, "alpha">[]>()
	prototype.clearRect = new Proxy(clearRect, {
		apply: (target, context: CanvasRenderingContext2D, args) => {
			litCells.set(canvasOf(context), [])
			return Reflect.apply(target, context, args)
		},
	})
	prototype.moveTo = new Proxy(moveTo, {
		apply: (target, context: CanvasRenderingContext2D, args: number[]) => {
			const [x, y] = args.map((value) => value / context.canvas.width)
			traced.set(canvasOf(context), [
				...(traced.get(canvasOf(context)) ?? []),
				{ x, y },
			])
			return Reflect.apply(target, context, args)
		},
	})
	prototype.fill = new Proxy(fill, {
		apply: (target, context: CanvasRenderingContext2D, args) => {
			const canvas = canvasOf(context)
			litCells.get(canvas)?.push(
				...(traced.get(canvas) ?? []).map((corner) => ({
					...corner,
					alpha: context.globalAlpha,
				})),
			)
			traced.set(canvas, [])
			return Reflect.apply(target, context, args)
		},
	})
	prototype.fillRect = new Proxy(fillRect, {
		apply: (target, context: CanvasRenderingContext2D, args: number[]) => {
			const [x, y] = args.map((value) => value / context.canvas.width)
			litCells
				.get(canvasOf(context))
				?.push({ x, y, alpha: context.globalAlpha })
			return Reflect.apply(target, context, args)
		},
	})
	return () => {
		prototype.clearRect = clearRect
		prototype.fillRect = fillRect
		prototype.moveTo = moveTo
		prototype.fill = fill
	}
}

export const drawingOf = (canvas: HTMLCanvasElement) =>
	(litCells.get(canvas) ?? [])
		.map(({ x, y, alpha }) => `${x.toFixed(4)} ${y.toFixed(4)} ${alpha}`)
		.join("|")

export const litCellIndices = (canvas: HTMLCanvasElement) => {
	const cells = Number(canvas.dataset.cells)
	return (litCells.get(canvas) ?? []).map(
		({ x, y }) => Math.floor(y * cells) * cells + Math.floor(x * cells),
	)
}

const UNPREMULTIPLY_ROUNDING = 1

const channelsAt = (data: Uint8ClampedArray, offset: number) =>
	Array.from(data.subarray(offset, offset + 3))

export const resolvedChannelsOf = (token: string, scope: Element) => {
	const probe = document.createElement("span")
	probe.style.color = token
	scope.append(probe)
	const resolved = getComputedStyle(probe).color
	probe.remove()
	const context = document.createElement("canvas").getContext("2d")
	if (!context) throw new Error("Nothing here can resolve a colour")
	context.fillStyle = resolved
	context.fillRect(0, 0, 1, 1)
	return channelsAt(context.getImageData(0, 0, 1, 1).data, 0)
}

const solidestChannelsOf = (canvas: HTMLCanvasElement) => {
	const context = canvas.getContext("2d")
	if (!context) throw new Error("This canvas draws nothing")
	const { data } = context.getImageData(0, 0, canvas.width, canvas.height)
	let solidest = 0
	for (let offset = 0; offset < data.length; offset += 4)
		if (data[offset + 3] > data[solidest + 3]) solidest = offset
	return channelsAt(data, solidest)
}

export const expectCellsIn = async (
	canvas: HTMLCanvasElement,
	token: string,
) => {
	const expected = resolvedChannelsOf(token, canvas.parentElement ?? canvas)
	for (const [index, channel] of solidestChannelsOf(canvas).entries())
		await expect(Math.abs(channel - expected[index])).toBeLessThanOrEqual(
			UNPREMULTIPLY_ROUNDING,
		)
}

export const expectRoundAvatar = async (avatar: HTMLElement) => {
	const { width } = avatar.getBoundingClientRect()
	const layer = avatar.firstElementChild as Element

	await expect(
		Number.parseFloat(getComputedStyle(avatar).borderTopLeftRadius),
	).toBeGreaterThanOrEqual(width / 2)
	await expect(getComputedStyle(avatar).overflow).toBe("hidden")
	await expect(getComputedStyle(layer).maskImage).toBe("none")
}
