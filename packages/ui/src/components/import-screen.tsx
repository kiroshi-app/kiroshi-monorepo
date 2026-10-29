"use client"

import { useCallback, useState } from "react"

import {
	FullWindowContent,
	FullWindowLayout,
} from "@workspace/ui/components/full-window-layout"
import { Icons } from "@workspace/ui/components/icons"
import {
	ImportRow,
	type ImportRowKind,
	type ImportRowStatus,
} from "@workspace/ui/components/import-row"
import { Button } from "@workspace/ui/components/ui/button"
import { cn } from "@workspace/ui/lib/utils"

type ImportScreenStep = "select" | "importing" | "done" | "unreadable"

type ImportItem = {
	id: string
	kind: ImportRowKind
	title: string
	detail: string
	hue?: number | null
	checked?: boolean
	isInKiroshi?: boolean
	status?: ImportRowStatus
}

type ImportSection = {
	id: string
	label: string
	items: ImportItem[]
}

type ImportAction = {
	label: string
	onPress: () => void
}

type ImportScreenProps = {
	step: ImportScreenStep
	title: string
	subtitle: string
	sections?: ImportSection[]
	primary: ImportAction
	secondary?: ImportAction
	onToggle?: (id: string, checked: boolean) => void
}

const LINK_CLASS =
	"relative rounded-xs font-medium text-compact text-foreground leading-4.5 underline decoration-1 underline-offset-2 outline-offset-2 after:absolute after:-inset-1"

const hasCheckedItem = (sections: ImportSection[]) =>
	sections.some((section) =>
		section.items.some((item) => item.checked && !item.isInKiroshi),
	)

const useOverflow = () => {
	const [isOverflowing, setIsOverflowing] = useState(false)

	const watch = useCallback((scroller: HTMLDivElement | null) => {
		const content = scroller?.firstElementChild
		if (!scroller || !content) return

		const measure = () =>
			setIsOverflowing(content.scrollHeight > scroller.clientHeight)
		measure()
		const observer = new ResizeObserver(measure)
		observer.observe(scroller)
		observer.observe(content)
		return () => observer.disconnect()
	}, [])

	return { isOverflowing, watch }
}

type ImportListProps = {
	step: ImportScreenStep
	sections: ImportSection[]
	onToggle?: (id: string, checked: boolean) => void
}

const ImportList = ({ step, sections, onToggle }: ImportListProps) => {
	const { isOverflowing, watch } = useOverflow()

	return (
		<div
			className="min-h-0 w-140 max-w-full overflow-y-auto pr-3 outline-offset-2"
			data-slot="import-list"
			ref={watch}
			tabIndex={isOverflowing ? 0 : undefined}
		>
			<div className="flex flex-col gap-5">
				{sections.map((section) => (
					<section className="flex flex-col gap-2" key={section.id}>
						<h2 className="font-medium text-muted-foreground text-xs">
							{section.label}
						</h2>
						<div className="flex flex-col overflow-hidden rounded-xl border border-border bg-muted/40 [&>*+*]:border-border [&>*+*]:border-t">
							{section.items.map(({ id, ...item }) => (
								<ImportRow
									{...item}
									key={id}
									onCheckedChange={(checked) => onToggle?.(id, checked)}
									status={
										step === "select" ? undefined : (item.status ?? "pending")
									}
								/>
							))}
						</div>
					</section>
				))}
			</div>
			{isOverflowing ? (
				<div
					aria-hidden="true"
					className="pointer-events-none sticky bottom-0 h-10 bg-linear-to-b from-transparent to-background"
					data-slot="import-list-fade"
				/>
			) : null}
		</div>
	)
}

const ImportScreen = ({
	step,
	title,
	subtitle,
	sections = [],
	primary,
	secondary,
	onToggle,
}: ImportScreenProps) => {
	const isUnreadable = step === "unreadable"
	const isPrimaryDisabled =
		step === "importing" || (step === "select" && !hasCheckedItem(sections))
	const Mark = isUnreadable ? Icons.AlertCircle : Icons.FolderOpen

	return (
		<FullWindowLayout data-slot="import-screen" data-step={step}>
			<FullWindowContent className="min-h-0 gap-5 px-6 pt-10 pb-6">
				<span
					className={cn(
						"grid size-14 shrink-0 place-items-center rounded-[1rem]",
						isUnreadable ? "bg-destructive-tint" : "bg-muted/40",
					)}
				>
					<Mark
						aria-hidden="true"
						className={cn(
							"size-6",
							isUnreadable ? "text-destructive" : "text-foreground",
						)}
					/>
				</span>
				<div className="flex w-105 max-w-full shrink-0 flex-col gap-2 text-center">
					<h1 className="text-balance font-semibold text-[22px] text-foreground leading-7 tracking-[-0.01em]">
						{title}
					</h1>
					<p className="text-pretty text-muted-foreground text-sm">
						{subtitle}
					</p>
				</div>
				{sections.length > 0 ? (
					<ImportList onToggle={onToggle} sections={sections} step={step} />
				) : null}
				<div
					className={cn(
						"flex shrink-0 flex-col items-center",
						isUnreadable ? "gap-4" : "gap-5",
					)}
				>
					<Button
						className="rounded-full px-5 leading-4.5 transition-none data-disabled:pointer-events-none data-disabled:opacity-50"
						disabled={isPrimaryDisabled}
						focusableWhenDisabled
						onClick={primary.onPress}
						size="lg"
					>
						{primary.label}
					</Button>
					{secondary && step !== "importing" ? (
						<button
							className={LINK_CLASS}
							onClick={secondary.onPress}
							type="button"
						>
							{secondary.label}
						</button>
					) : null}
				</div>
			</FullWindowContent>
		</FullWindowLayout>
	)
}

export {
	type ImportAction,
	type ImportItem,
	ImportScreen,
	type ImportScreenProps,
	type ImportScreenStep,
	type ImportSection,
}
