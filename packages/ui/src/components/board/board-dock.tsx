"use client"

import { Popover } from "@base-ui/react/popover"
import { Toolbar } from "@base-ui/react/toolbar"
import {
	Fragment,
	type KeyboardEvent,
	type PointerEvent,
	type ReactElement,
	type Ref,
	useRef,
	useState,
} from "react"
import { createPortal } from "react-dom"
import { useTranslation } from "react-i18next"

import { BoardLibraryCard } from "@workspace/ui/components/board/board-library-card"
import { Icons } from "@workspace/ui/components/icons"
import { TooltipHint } from "@workspace/ui/components/tooltip-hint"
import { cn } from "@workspace/ui/lib/utils"

const BOARD_TOOLS = [
	"select",
	"hand",
	"sticky",
	"shape",
	"text",
	"connector",
	"section",
	"image",
	"library",
] as const

type BoardTool = (typeof BOARD_TOOLS)[number]

type BoardLibraryItem =
	| { id: string; kind: "image"; title: string; src: string }
	| { id: string; kind: "document"; title: string; excerpt: string }

type BoardClientPoint = {
	clientX: number
	clientY: number
}

type BoardDockProps = {
	tool: BoardTool
	onToolChange: (tool: BoardTool) => void
	libraryItems: readonly BoardLibraryItem[]
	onLibraryItemPick: (id: string) => void
	onLibraryItemDrop: (id: string, pointer: BoardClientPoint) => void
}

const TOOL_GLYPH: Record<Exclude<BoardTool, "sticky">, typeof Icons.Library> = {
	select: Icons.Select,
	hand: Icons.Hand,
	shape: Icons.Shapes,
	text: Icons.Type,
	connector: Icons.Connector,
	section: Icons.Section,
	image: Icons.Image,
	library: Icons.Library,
}

const TOOL =
	"inline-flex size-10 shrink-0 items-center justify-center rounded-[10px] text-board-control-foreground outline-none transition-none hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/30 active:bg-input aria-pressed:bg-user-bubble aria-pressed:text-user-bubble-foreground aria-pressed:hover:bg-user-bubble-hover aria-pressed:active:bg-user-bubble-hover"

const TILE =
	"relative h-17.5 w-23.5 shrink-0 overflow-hidden rounded-[8px] outline-none transition-none hover:ring-2 hover:ring-input focus-visible:ring-3 focus-visible:ring-ring/30 active:ring-2 active:ring-user-bubble"

const DRAG_THRESHOLD = 3
const DOCK_PADDING = 6
const PICKER_GAP = 12
const TILES_PER_ROW = 3
const TILE_STEP: Partial<Record<string, number>> = {
	ArrowLeft: -1,
	ArrowRight: 1,
	ArrowUp: -TILES_PER_ROW,
	ArrowDown: TILES_PER_ROW,
}

type ToolGlyphProps = {
	tool: BoardTool
}

const ToolGlyph = ({ tool }: ToolGlyphProps) => {
	if (tool === "sticky")
		return (
			<span
				aria-hidden="true"
				className="size-5.5 rounded-[3px] bg-board-sticky-yellow"
				data-slot="board-dock-sticky-swatch"
			/>
		)
	const Glyph = TOOL_GLYPH[tool]
	return <Glyph aria-hidden="true" className="size-5" />
}

type TileFaceProps = {
	item: BoardLibraryItem
}

const TileFace = ({ item }: TileFaceProps) =>
	item.kind === "image" ? (
		<img
			alt=""
			className="size-full object-cover"
			draggable={false}
			src={item.src}
		/>
	) : (
		<span className="absolute inset-0 bg-board-card-inset">
			<span className="absolute inset-x-3.5 top-2.5 bottom-0 rounded-t-[3px] bg-board-card-surface px-1.5 pt-1.5 text-start">
				<span className="line-clamp-3 font-semibold text-[7px] text-board-card-foreground leading-[9px]">
					{item.title}
				</span>
			</span>
		</span>
	)

type DragGhostProps = {
	item: BoardLibraryItem
	pointer: BoardClientPoint
}

const DragGhost = ({ item, pointer }: DragGhostProps) =>
	createPortal(
		<div
			aria-hidden="true"
			className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-1/2"
			data-slot="board-library-ghost"
			style={{ left: pointer.clientX, top: pointer.clientY }}
		>
			{item.kind === "document" ? (
				<BoardLibraryCard
					excerpt={item.excerpt}
					isDragging
					title={item.title}
				/>
			) : (
				<img
					alt=""
					className="w-59 -rotate-2 rounded-lg border border-board-card-border opacity-94 shadow-board-card-dragging"
					src={item.src}
				/>
			)}
		</div>,
		document.body,
	)

type LibraryDrag = {
	item: BoardLibraryItem
	pointer: BoardClientPoint
}

type LibraryPickerProps = Pick<
	BoardDockProps,
	"libraryItems" | "onLibraryItemPick" | "onLibraryItemDrop"
>

const LibraryPicker = ({
	libraryItems,
	onLibraryItemPick,
	onLibraryItemDrop,
}: LibraryPickerProps) => {
	const { t } = useTranslation("common")
	const [focusedAt, setFocusedAt] = useState(0)
	const [drag, setDrag] = useState<LibraryDrag | null>(null)
	const hasJustDragged = useRef(false)

	const pressTile =
		(item: BoardLibraryItem) => (event: PointerEvent<HTMLButtonElement>) => {
			if (event.button !== 0) return
			hasJustDragged.current = false
			const start = { x: event.clientX, y: event.clientY }
			const track = (moved: globalThis.PointerEvent) => {
				const travel = Math.hypot(
					moved.clientX - start.x,
					moved.clientY - start.y,
				)
				if (!hasJustDragged.current && travel < DRAG_THRESHOLD) return
				hasJustDragged.current = true
				setDrag({
					item,
					pointer: { clientX: moved.clientX, clientY: moved.clientY },
				})
			}
			const finish = (end: globalThis.PointerEvent) => {
				window.removeEventListener("pointermove", track)
				window.removeEventListener("pointerup", finish)
				window.removeEventListener("pointercancel", finish)
				setDrag(null)
				if (hasJustDragged.current && end.type === "pointerup")
					onLibraryItemDrop(item.id, {
						clientX: end.clientX,
						clientY: end.clientY,
					})
			}
			window.addEventListener("pointermove", track)
			window.addEventListener("pointerup", finish)
			window.addEventListener("pointercancel", finish)
		}

	const pick = (id: string) => {
		if (hasJustDragged.current) return
		onLibraryItemPick(id)
	}

	const moveFocus = (event: KeyboardEvent<HTMLDivElement>) => {
		const step = TILE_STEP[event.key]
		if (step === undefined) return
		event.preventDefault()
		const next = focusedAt + step
		const tiles = event.currentTarget.querySelectorAll<HTMLElement>(
			'[data-slot="board-library-tile"]',
		)
		tiles[next]?.focus()
	}

	return (
		<>
			<div className="flex items-center justify-between gap-3">
				<Popover.Title className="font-semibold text-compact text-foreground leading-4">
					{t("board.picker.title")}
				</Popover.Title>
				<Popover.Description className="text-muted-foreground text-xs leading-4">
					{t("board.picker.hint")}
				</Popover.Description>
			</div>
			{libraryItems.length > 0 ? (
				<div
					className="flex flex-wrap gap-2"
					data-slot="board-library-tiles"
					onKeyDown={moveFocus}
					role="group"
				>
					{libraryItems.map((item, index) => {
						const isDragged = drag?.item.id === item.id
						return (
							<button
								aria-label={item.title}
								className={cn(
									TILE,
									isDragged &&
										"border-[1.5px] border-user-bubble border-dashed bg-user-bubble/6",
								)}
								data-dragging={isDragged || undefined}
								data-slot="board-library-tile"
								key={item.id}
								onClick={() => pick(item.id)}
								onFocus={() => setFocusedAt(index)}
								onPointerDown={pressTile(item)}
								tabIndex={index === focusedAt ? 0 : -1}
								type="button"
							>
								{isDragged ? null : <TileFace item={item} />}
							</button>
						)
					})}
				</div>
			) : (
				<p
					className="text-muted-foreground text-xs leading-4"
					data-slot="board-library-empty"
				>
					{t("board.picker.empty")}
				</p>
			)}
			{drag ? <DragGhost item={drag.item} pointer={drag.pointer} /> : null}
		</>
	)
}

type DockToolProps = {
	tool: BoardTool
	isActive: boolean
	onPress: () => void
	buttonRef?: Ref<HTMLButtonElement>
}

const DockTool = ({ tool, isActive, onPress, buttonRef }: DockToolProps) => {
	const { t } = useTranslation("common")
	const label = t(`board.dock.tool.${tool}`)
	const button: ReactElement = (
		<Toolbar.Button
			aria-label={label}
			aria-pressed={isActive}
			className={TOOL}
			data-slot="board-dock-tool"
			data-tool={tool}
			onClick={onPress}
			ref={buttonRef}
		>
			<ToolGlyph tool={tool} />
		</Toolbar.Button>
	)

	return (
		<TooltipHint content={label}>
			{tool === "library" ? <Popover.Trigger render={button} /> : button}
		</TooltipHint>
	)
}

const BoardDock = ({
	tool,
	onToolChange,
	libraryItems,
	onLibraryItemPick,
	onLibraryItemDrop,
}: BoardDockProps) => {
	const { t } = useTranslation("common")
	const [shownTool, setShownTool] = useState(tool)
	const [isPickerOpen, setIsPickerOpen] = useState(tool === "library")
	const libraryTool = useRef<HTMLButtonElement | null>(null)

	if (tool !== shownTool) {
		setShownTool(tool)
		setIsPickerOpen(tool === "library")
	}

	return (
		<Popover.Root onOpenChange={setIsPickerOpen} open={isPickerOpen}>
			<Toolbar.Root
				aria-label={t("board.dock.label")}
				className="absolute inset-x-0 bottom-5 mx-auto flex w-fit items-center gap-1 rounded-[14px] bg-board-control p-1.5 text-board-control-foreground shadow-board-dock"
				data-slot="board-dock"
			>
				{BOARD_TOOLS.map((id) => (
					<Fragment key={id}>
						<DockTool
							buttonRef={id === "library" ? libraryTool : undefined}
							isActive={id === tool}
							onPress={() => onToolChange(id)}
							tool={id}
						/>
						{id === "hand" ? (
							<Toolbar.Separator
								className="h-6 w-px shrink-0 bg-board-card-border"
								data-slot="board-dock-divider"
							/>
						) : null}
					</Fragment>
				))}
			</Toolbar.Root>
			<Popover.Portal>
				<Popover.Positioner
					className="isolate z-50"
					side="top"
					sideOffset={DOCK_PADDING + PICKER_GAP}
				>
					<Popover.Popup
						className="flex w-82 flex-col gap-3 rounded-[14px] bg-board-control p-3 text-board-control-foreground shadow-board-picker outline-none select-none"
						data-slot="board-library-picker"
						finalFocus={libraryTool}
					>
						<LibraryPicker
							libraryItems={libraryItems}
							onLibraryItemDrop={onLibraryItemDrop}
							onLibraryItemPick={onLibraryItemPick}
						/>
					</Popover.Popup>
				</Popover.Positioner>
			</Popover.Portal>
		</Popover.Root>
	)
}

export {
	BOARD_TOOLS,
	type BoardClientPoint,
	BoardDock,
	type BoardDockProps,
	type BoardLibraryItem,
	type BoardTool,
}
