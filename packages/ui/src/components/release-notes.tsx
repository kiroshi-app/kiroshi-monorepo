import { Markdown } from "@workspace/ui/components/markdown"
import { cn } from "@workspace/ui/lib/utils"

type ReleaseNotesSize = "xs" | "sm"

type ReleaseNotesProps = {
	body: string
	size: ReleaseNotesSize
}

const SIZE_CLASS = {
	xs: "text-muted-foreground text-xs leading-(--text-xs--line-height) [&_li]:mt-1",
	sm: "text-foreground text-sm leading-(--text-sm--line-height) [&_li]:mt-1.5",
} as const satisfies Record<ReleaseNotesSize, string>

const RELEASE_NOTES_CLASS =
	"[&>:first-child]:mt-0 [&_h3+*]:mt-1 [&_h3]:mt-4 [&_h3]:font-medium [&_h3]:text-xs"

const ReleaseNotes = ({ body, size }: ReleaseNotesProps) => (
	<Markdown className={cn(RELEASE_NOTES_CLASS, SIZE_CLASS[size])}>
		{body}
	</Markdown>
)

export { ReleaseNotes, type ReleaseNotesProps, type ReleaseNotesSize }
