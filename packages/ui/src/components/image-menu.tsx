"use client"

import {
	type ComponentProps,
	type MouseEvent,
	type ReactElement,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import {
	CONTEXT_MENU_PARTS,
	hasImageActions,
	hasLibraryItemActions,
	type ImageHandlers,
	ImageMenuItems,
	LibraryItemDeleteDialog,
	type LibraryItemHandlers,
	LibraryItemMenuItems,
} from "@workspace/ui/components/library-item-menu"
import {
	ContextMenu,
	ContextMenuContent,
	ContextMenuSeparator,
	ContextMenuTrigger,
} from "@workspace/ui/components/ui/context-menu"
import { STILL_UNDER_REDUCED_MOTION } from "@workspace/ui/lib/reduced-motion"
import { cn } from "@workspace/ui/lib/utils"

type ImageMenuActions<Item> = LibraryItemHandlers<Item> & ImageHandlers<Item>

type ImageMenuSurface = "thread" | "viewer"

type ImageMenuProps<Item> = ImageMenuActions<Item> & {
	item: Item
	name: string
	trigger: ReactElement
	surface?: ImageMenuSurface
	isSavingToLibrary?: boolean
	onOpenChange?: ComponentProps<typeof ContextMenu>["onOpenChange"]
	onConfirmingDeleteChange?: (isConfirming: boolean) => void
}

type PressableImageMenuProps<Item> = Omit<ImageMenuProps<Item>, "trigger"> & {
	picture: ReactElement
	className?: string
}

const imageHandlersOf = <Item,>(
	{ onSaveToLibrary, onCopyImage, onOpenInViewer }: ImageHandlers<Item>,
	surface: ImageMenuSurface,
): ImageHandlers<Item> => ({
	onSaveToLibrary,
	onCopyImage,
	onOpenInViewer: surface === "viewer" ? undefined : onOpenInViewer,
})

const hasAnyImageMenuAction = <Item,>({
	surface = "thread",
	...actions
}: ImageMenuActions<Item> & Pick<ImageMenuProps<Item>, "surface">) =>
	hasImageActions(imageHandlersOf(actions, surface)) ||
	hasLibraryItemActions(actions)

const openMenuAtPress = (event: MouseEvent<HTMLElement>) => {
	const { left, bottom } = event.currentTarget.getBoundingClientRect()
	event.currentTarget.dispatchEvent(
		new globalThis.MouseEvent("contextmenu", {
			bubbles: true,
			cancelable: true,
			clientX: left,
			clientY: bottom,
		}),
	)
}

const imageMenuActionsFor = <From, To>(
	actions: ImageMenuActions<To>,
	itemOf: (from: From) => To,
): ImageMenuActions<From> =>
	Object.fromEntries(
		Object.entries(actions).map(([handler, action]) => [
			handler,
			action && ((from: From) => action(itemOf(from))),
		]),
	)

const ImageMenu = <Item,>({
	item,
	name,
	trigger,
	surface = "thread",
	isSavingToLibrary,
	onOpenChange,
	onConfirmingDeleteChange,
	onSaveToLibrary,
	onCopyImage,
	onOpenInViewer,
	...viewerActions
}: ImageMenuProps<Item>) => {
	const { t } = useTranslation("common")
	const [isConfirmingDelete, setConfirmingDelete] = useState(false)
	const imageHandlers = imageHandlersOf(
		{ onSaveToLibrary, onCopyImage, onOpenInViewer },
		surface,
	)
	const hasImageMenuActions = hasImageActions(imageHandlers)
	const hasViewerActions = hasLibraryItemActions(viewerActions)

	if (!hasViewerActions && !hasImageMenuActions) return trigger

	const confirmDelete = (isConfirming: boolean) => {
		setConfirmingDelete(isConfirming)
		onConfirmingDeleteChange?.(isConfirming)
	}

	return (
		<>
			<ContextMenu onOpenChange={onOpenChange}>
				<ContextMenuTrigger render={trigger} />
				<ContextMenuContent
					aria-label={t("library.itemMenu.label", { name })}
					className={cn(
						surface === "viewer" && "dark",
						STILL_UNDER_REDUCED_MOTION,
					)}
				>
					<LibraryItemMenuItems
						actions={viewerActions}
						item={item}
						onPickDelete={() => confirmDelete(true)}
						order="bar"
						parts={CONTEXT_MENU_PARTS}
					/>
					{hasViewerActions && hasImageMenuActions ? (
						<ContextMenuSeparator />
					) : null}
					<ImageMenuItems
						actions={imageHandlers}
						isSavingToLibrary={isSavingToLibrary}
						item={item}
					/>
				</ContextMenuContent>
			</ContextMenu>
			<LibraryItemDeleteDialog
				name={name}
				onConfirm={() => viewerActions.onDelete?.(item)}
				onOpenChange={confirmDelete}
				open={isConfirmingDelete}
			/>
		</>
	)
}

const PressableImageMenu = <Item,>({
	picture,
	className,
	...menu
}: PressableImageMenuProps<Item>) => {
	if (!hasAnyImageMenuAction(menu)) return picture

	return (
		<ImageMenu
			{...menu}
			trigger={
				<button
					type="button"
					aria-label={menu.name}
					aria-haspopup="menu"
					className={className}
					onClick={openMenuAtPress}
				>
					{picture}
				</button>
			}
		/>
	)
}

export {
	ImageMenu,
	type ImageMenuActions,
	type ImageMenuProps,
	imageMenuActionsFor,
	PressableImageMenu,
}
