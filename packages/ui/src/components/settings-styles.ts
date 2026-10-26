const FIELD_LABEL_CLASS = "font-medium text-foreground text-xs"

const FIELD_CONTROL_CLASS =
	"w-full rounded-control border border-input bg-muted px-3 py-2 text-foreground text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/30"

const FIELD_CONTROL_INVALID_CLASS =
	"border-destructive focus-visible:border-destructive focus-visible:ring-destructive/30"

const FIELD_CONTROL_READONLY_CLASS = "cursor-default bg-transparent"

const FIELD_OPTION_MARKS_CLASS =
	"cursor-pointer rounded-xl text-muted-foreground hover:bg-muted has-[:checked]:bg-muted has-[:checked]:font-medium has-[:checked]:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"

const FIELD_OPTION_CLASS = `${FIELD_OPTION_MARKS_CLASS} flex flex-col items-center gap-1 p-1.5`

const PICTURE_FIELD_SIZE = 40

const PICTURE_BOX_CLASS =
	"flex items-center justify-between gap-3 rounded-xl border border-border bg-muted/40 px-4 py-3"

const SETTINGS_TAG_CLASS =
	"shrink-0 rounded-full bg-muted px-2 py-0.5 font-medium text-xs"

const SETTINGS_HEADER_CLASS =
	"flex shrink-0 items-center gap-2.5 border-border border-b py-4 pr-14 pl-4"

const BACKDROP_CLASS = "fixed inset-0 z-50 bg-black/50"

const DIALOG_BACKDROP_CLASS = `${BACKDROP_CLASS} transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none`

const POPUP_CLASS =
	"bg-popover text-popover-foreground shadow-popover outline-none"

const DIALOG_POPUP_CLASS = `${POPUP_CLASS} transition-[scale,opacity,filter] duration-150 ease-out data-ending-style:scale-[0.99] data-ending-style:opacity-0 data-ending-style:blur-[4px] data-starting-style:scale-[0.98] data-starting-style:opacity-0 motion-reduce:transition-none`

const DANGER_BLOCK_CLASS =
	"flex flex-col items-start gap-3 rounded-xl border border-destructive/30 p-4 in-data-companion-page:border-destructive/25 in-data-companion-page:bg-destructive/5"

const SETTINGS_EMPTY_CLASS =
	"flex flex-1 flex-col items-center justify-center gap-3 text-center"

export {
	BACKDROP_CLASS,
	DANGER_BLOCK_CLASS,
	DIALOG_BACKDROP_CLASS,
	DIALOG_POPUP_CLASS,
	FIELD_CONTROL_CLASS,
	FIELD_CONTROL_INVALID_CLASS,
	FIELD_CONTROL_READONLY_CLASS,
	FIELD_LABEL_CLASS,
	FIELD_OPTION_CLASS,
	FIELD_OPTION_MARKS_CLASS,
	PICTURE_BOX_CLASS,
	PICTURE_FIELD_SIZE,
	POPUP_CLASS,
	SETTINGS_EMPTY_CLASS,
	SETTINGS_HEADER_CLASS,
	SETTINGS_TAG_CLASS,
}
