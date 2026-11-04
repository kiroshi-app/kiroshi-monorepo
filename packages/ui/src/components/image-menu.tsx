"use client"

import { type ComponentProps, type ReactElement, useState } from "react"
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
	onOpenChange?: ComponentProps<typeof ContextMenu>["onOpenChange"]
	onConfirmingDeleteChange?: (isConfirming: boolean) => void
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
	onOpenChange,
	onConfirmingDeleteChange,
	onSaveToLibrary,
	onCopyImage,
	onOpenInViewer,
	...viewerActions
}: ImageMenuProps<Item>) => {
	const { t } = useTranslation("common")
	const [isConfirmingDelete, setConfirmingDelete] = useState(false)
	const imageHandlers: ImageHandlers<Item> = {
		onSaveToLibrary,
		onCopyImage,
		onOpenInViewer: surface === "viewer" ? undefined : onOpenInViewer,
	}
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
					<ImageMenuItems actions={imageHandlers} item={item} />
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

export {
	ImageMenu,
	type ImageMenuActions,
	type ImageMenuProps,
	imageMenuActionsFor,
}
