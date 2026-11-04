"use client"

import { Menu as MenuPrimitive } from "@base-ui/react/menu"
import {
	type ButtonHTMLAttributes,
	type ComponentType,
	type SVGProps,
	useRef,
	useState,
} from "react"
import { useTranslation } from "react-i18next"

import { Icons } from "@workspace/ui/components/icons"
import type { LibraryBlockType } from "@workspace/ui/components/library-document-blocks"
import { POPUP_CLASS } from "@workspace/ui/components/settings-styles"
import {
	DropdownMenu,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuSub,
	DropdownMenuSubContent,
	DropdownMenuSubTrigger,
} from "@workspace/ui/components/ui/dropdown-menu"
import { isMacPlatform } from "@workspace/ui/lib/platform"
import { cn } from "@workspace/ui/lib/utils"

type BlockIcon = ComponentType<SVGProps<SVGSVGElement>>

const BLOCK_ICONS: Record<LibraryBlockType, BlockIcon> = {
	paragraph: Icons.Text,
	heading: Icons.Heading,
	list: Icons.List,
	checklist: Icons.Checklist,
	quote: Icons.Quote,
	gallery: Icons.Gallery,
	callout: Icons.Info,
	table: Icons.Table,
	code: Icons.Code,
	"web-page": Icons.Web,
	collapsible: Icons.Collapsible,
	other: Icons.File,
}

const HANDLE_BUTTON =
	"flex h-6 items-center justify-center rounded-sm text-muted-foreground outline-offset-1 transition-none hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-solid [&_svg]:size-4"

const MENU_ROW =
	"h-8 min-h-8 gap-2.5 rounded-md px-2.5 py-0 text-compact leading-4 transition-none [&_svg:not([class*='size-'])]:size-4"

const MENU_SHORTCUT =
	"text-muted-foreground text-xs leading-4 tracking-normal group-focus/dropdown-menu-item:text-muted-foreground"

type LibraryBlockActions = {
	onInsertBelow: () => void
	onTurnInto: (type: LibraryBlockType) => void
	onDuplicate: () => void
	onMoveUp: () => void
	onMoveDown: () => void
	onDelete: () => void
}

type DragProps = Pick<
	ButtonHTMLAttributes<HTMLButtonElement>,
	"onPointerDown" | "onClickCapture"
>

type LibraryBlockHandleProps = LibraryBlockActions & {
	type: LibraryBlockType
	conversions: LibraryBlockType[]
	canMoveUp: boolean
	canMoveDown: boolean
	dragProps?: DragProps
}

const LibraryBlockHandle = ({
	type,
	conversions,
	canMoveUp,
	canMoveDown,
	dragProps,
	onInsertBelow,
	onTurnInto,
	onDuplicate,
	onMoveUp,
	onMoveDown,
	onDelete,
}: LibraryBlockHandleProps) => {
	const { t } = useTranslation("common")
	const dragHandle = useRef<HTMLButtonElement>(null)
	const [isOpen, setOpen] = useState(false)
	const typeName = t(`library.editor.blocks.types.${type}`)
	const platform = isMacPlatform() ? "mac" : "other"

	return (
		<div
			className={cn(
				"flex items-center gap-0.5 opacity-0 group-focus-within/block:opacity-100 group-hover/block:opacity-100",
				isOpen && "opacity-100",
			)}
			data-slot="library-block-handle"
		>
			<button
				aria-label={t("library.editor.blocks.handle.insert")}
				className={cn(HANDLE_BUTTON, "w-6")}
				data-slot="library-block-insert"
				onClick={onInsertBelow}
				type="button"
			>
				<Icons.Add aria-hidden="true" />
			</button>
			<button
				aria-expanded={isOpen}
				aria-haspopup="menu"
				aria-label={t("library.editor.blocks.handle.menu")}
				className={cn(
					HANDLE_BUTTON,
					"w-5 cursor-grab touch-none active:cursor-grabbing active:bg-accent",
					isOpen && "bg-accent text-foreground",
				)}
				data-slot="library-block-drag"
				onClick={() => setOpen(true)}
				ref={dragHandle}
				type="button"
				{...dragProps}
			>
				<Icons.Drag aria-hidden="true" />
			</button>
			<DropdownMenu onOpenChange={setOpen} open={isOpen}>
				<MenuPrimitive.Portal>
					<MenuPrimitive.Positioner
						align="start"
						anchor={dragHandle}
						className="isolate z-50 outline-none"
						side="bottom"
						sideOffset={4}
					>
						<MenuPrimitive.Popup
							className={cn(
								POPUP_CLASS,
								"w-55 rounded-control p-1 text-popover-foreground",
							)}
							data-slot="library-block-menu"
							finalFocus={dragHandle}
						>
							<DropdownMenuGroup>
								<DropdownMenuLabel className="px-2.5 pt-1.5 pb-1 font-medium text-xs leading-4">
									{typeName}
								</DropdownMenuLabel>
								<DropdownMenuSub>
									<DropdownMenuSubTrigger className={MENU_ROW}>
										<Icons.TurnInto aria-hidden="true" />
										{t("library.editor.blocks.menu.turnInto")}
									</DropdownMenuSubTrigger>
									<DropdownMenuSubContent
										className="w-50 min-w-50 rounded-control bg-popover p-1 shadow-popover ring-0"
										data-slot="library-block-turn-into"
									>
										<DropdownMenuRadioGroup
											onValueChange={(next: LibraryBlockType) =>
												onTurnInto(next)
											}
											value={type}
										>
											{conversions.map((each) => {
												const Icon = BLOCK_ICONS[each]
												return (
													<DropdownMenuRadioItem
														className={cn(MENU_ROW, "pe-8")}
														closeOnClick
														key={each}
														value={each}
													>
														<Icon aria-hidden="true" />
														{t(`library.editor.blocks.types.${each}`)}
													</DropdownMenuRadioItem>
												)
											})}
										</DropdownMenuRadioGroup>
									</DropdownMenuSubContent>
								</DropdownMenuSub>
								<DropdownMenuItem className={MENU_ROW} onClick={onDuplicate}>
									<Icons.Copy aria-hidden="true" />
									{t("library.editor.blocks.menu.duplicate")}
									<DropdownMenuShortcut className={MENU_SHORTCUT}>
										{t(
											`library.editor.blocks.menu.shortcuts.${platform}.duplicate`,
										)}
									</DropdownMenuShortcut>
								</DropdownMenuItem>
								<DropdownMenuItem
									className={MENU_ROW}
									disabled={!canMoveUp}
									onClick={onMoveUp}
								>
									<Icons.ArrowUp aria-hidden="true" />
									{t("library.editor.blocks.menu.moveUp")}
									<DropdownMenuShortcut className={MENU_SHORTCUT}>
										{t(
											`library.editor.blocks.menu.shortcuts.${platform}.moveUp`,
										)}
									</DropdownMenuShortcut>
								</DropdownMenuItem>
								<DropdownMenuItem
									className={MENU_ROW}
									disabled={!canMoveDown}
									onClick={onMoveDown}
								>
									<Icons.ArrowDown aria-hidden="true" />
									{t("library.editor.blocks.menu.moveDown")}
									<DropdownMenuShortcut className={MENU_SHORTCUT}>
										{t(
											`library.editor.blocks.menu.shortcuts.${platform}.moveDown`,
										)}
									</DropdownMenuShortcut>
								</DropdownMenuItem>
								<DropdownMenuSeparator className="bg-border" />
								<DropdownMenuItem
									className={MENU_ROW}
									onClick={onDelete}
									variant="destructive"
								>
									<Icons.Delete aria-hidden="true" />
									{t("library.editor.blocks.menu.delete")}
									<DropdownMenuShortcut className={MENU_SHORTCUT}>
										{t(
											`library.editor.blocks.menu.shortcuts.${platform}.delete`,
										)}
									</DropdownMenuShortcut>
								</DropdownMenuItem>
							</DropdownMenuGroup>
						</MenuPrimitive.Popup>
					</MenuPrimitive.Positioner>
				</MenuPrimitive.Portal>
			</DropdownMenu>
		</div>
	)
}

export { type DragProps, LibraryBlockHandle }
