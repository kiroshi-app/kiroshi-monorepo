import { BOOT_MARK_SIZE } from "@workspace/ui/components/app-boot-screen"
import { BrandMark } from "@workspace/ui/components/app-icon-mark"
import {
	FullWindowContent,
	FullWindowLayout,
} from "@workspace/ui/components/full-window-layout"
import { Notice } from "@workspace/ui/components/notice"

type AppBootNoticeProps = {
	title: string
	description: string
	onRetry: () => void
}

const AppBootNotice = ({ title, description, onRetry }: AppBootNoticeProps) => (
	<FullWindowLayout data-slot="app-boot-notice" data-tauri-drag-region="deep">
		<FullWindowContent className="gap-6 p-6">
			<BrandMark size={BOOT_MARK_SIZE} />
			<div className="w-full max-w-sm" data-tauri-drag-region="false">
				<Notice description={description} retry={{ onRetry }} title={title} />
			</div>
		</FullWindowContent>
	</FullWindowLayout>
)

export { AppBootNotice }
