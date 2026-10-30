"use client"

import type { TFunction } from "i18next"
import { useCallback, useState } from "react"
import { useTranslation } from "react-i18next"

import {
	FullWindowContent,
	FullWindowLayout,
} from "@workspace/ui/components/full-window-layout"
import {
	ImportRow,
	type ImportRowKind,
	type ImportRowStatus,
} from "@workspace/ui/components/import-row"
import { OnboardingDragStrip } from "@workspace/ui/components/onboarding-shell"
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

type ImportAction = {
	label: string
	onPress: () => void
}

type ImportScreenProps = {
	title: string
	primary: ImportAction
	secondary?: ImportAction
} & (
	| {
			step: "select"
			subtitle: string
			items: ImportItem[]
			onToggle: (id: string, checked: boolean) => void
	  }
	| { step: "importing" | "done"; items: ImportItem[] }
	| { step: "unreadable"; subtitle: string }
)

const LINK_CLASS =
	"relative rounded-xs font-medium text-compact text-foreground leading-4.5 underline decoration-1 underline-offset-2 outline-offset-2 after:absolute after:-inset-1"

const isPicked = (item: ImportItem) => item.checked && !item.isInKiroshi

const itemsOf = (props: ImportScreenProps) => {
	if (props.step === "unreadable") return []
	if (props.step === "select") return props.items
	return props.items.filter(isPicked)
}

type ImportListRow = Omit<ImportItem, "id"> & { ids: string[] }

const rowOf = ({ id, ...item }: ImportItem): ImportListRow => ({
	...item,
	ids: [id],
})

const skillsRowOf = (skills: ImportItem[], title: string): ImportListRow => ({
	ids: skills.map((skill) => skill.id),
	kind: "skill",
	title,
	detail: skills.map((skill) => skill.title).join(", "),
	checked: skills.every((skill) => skill.checked),
	isInKiroshi: skills.every((skill) => skill.isInKiroshi),
	status: skills.every((skill) => skill.status === "done") ? "done" : "pending",
})

const rowsOf = (items: ImportItem[], t: TFunction<"common">) => {
	const skills = items.filter((item) => item.kind === "skill")
	const failedSkills = skills.filter((skill) => skill.status === "failed")
	const comingIn = skills.filter((skill) => skill.status !== "failed")
	const newSkills = comingIn.filter((skill) => !skill.isInKiroshi)
	const hasNewSkill = newSkills.length > 0
	const grouped = hasNewSkill ? newSkills : comingIn
	const hasSkillInKiroshi = newSkills.length < comingIn.length
	const groupedTitle = t(
		hasNewSkill && hasSkillInKiroshi
			? "claudeImport.row.newSkills"
			: "claudeImport.row.skills",
		{ count: grouped.length },
	)

	return [
		...items.filter((item) => item.kind !== "skill").map(rowOf),
		...(grouped.length > 0 ? [skillsRowOf(grouped, groupedTitle)] : []),
		...failedSkills.map(rowOf),
	]
}

const doneSummaryOf = (
	items: ImportItem[],
	t: TFunction<"common">,
	language: string,
) => {
	const listOf = (parts: string[]) =>
		new Intl.ListFormat(language, { type: "conjunction" }).format(parts)
	const companions = items
		.filter((item) => item.kind === "companion")
		.map((item) => item.title)
	const hasInstructions = items.some((item) => item.kind === "instructions")
	const skillCount = items.filter((item) => item.kind === "skill").length

	if (companions.length === 0) {
		if (!hasInstructions) {
			return t("claudeImport.done.onlySkills", { count: skillCount })
		}
		if (skillCount === 0) return t("claudeImport.done.onlyInstructions")
		return t("claudeImport.done.instructionsAndSkills", { count: skillCount })
	}

	const extras = [
		...(hasInstructions ? [t("claudeImport.done.instructions")] : []),
		...(skillCount > 0
			? [t("claudeImport.row.skills", { count: skillCount })]
			: []),
	]
	const names = listOf(companions)
	if (extras.length === 0) {
		return t("claudeImport.done.companions", {
			companions: names,
			count: companions.length,
		})
	}
	return t("claudeImport.done.companionsWith", {
		companions: names,
		count: companions.length,
		extras: listOf(extras),
	})
}

const useSubtitle = (props: ImportScreenProps, items: ImportItem[]) => {
	const { t, i18n } = useTranslation("common")
	if (props.step === "select" || props.step === "unreadable") {
		return props.subtitle
	}

	if (props.step === "importing") {
		return t("claudeImport.importing.body", {
			done: items.filter((item) => item.status === "done").length,
			count: items.length,
		})
	}

	const failed = items.find((item) => item.status === "failed")
	if (failed) {
		return t(
			failed.kind === "skill"
				? "claudeImport.partlyFailed.body"
				: "claudeImport.partlyFailed.bodyNamed",
			{ name: failed.title },
		)
	}

	return doneSummaryOf(items, t, i18n.language)
}

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
	items: ImportItem[]
	onToggle?: (id: string, checked: boolean) => void
}

const ImportList = ({ step, items, onToggle }: ImportListProps) => {
	const { t } = useTranslation("common")
	const { isOverflowing, watch } = useOverflow()

	return (
		<div
			className="min-h-0 w-146 max-w-full overflow-y-auto px-3 outline-offset-2"
			data-slot="import-list"
			ref={watch}
			{...(isOverflowing && {
				"aria-label": t("claudeImport.listLabel"),
				role: "region",
				tabIndex: 0,
			})}
		>
			<div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card [&>*+*]:border-border [&>*+*]:border-t">
				{rowsOf(items, t).map(({ ids, ...row }) => (
					<ImportRow
						{...row}
						key={ids.join()}
						onCheckedChange={(checked) => {
							for (const id of ids) onToggle?.(id, checked)
						}}
						status={step === "select" ? undefined : (row.status ?? "pending")}
					/>
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

const ImportScreen = (props: ImportScreenProps) => {
	const { step, title, primary, secondary } = props
	const items = itemsOf(props)
	const subtitle = useSubtitle(props, items)
	const isUnreadable = step === "unreadable"
	const isPrimaryDisabled =
		step === "importing" || (step === "select" && !items.some(isPicked))

	return (
		<FullWindowLayout data-slot="import-screen">
			<OnboardingDragStrip />
			<FullWindowContent className="min-h-0 gap-5 px-6 pt-10 pb-6">
				<div className="flex w-120 max-w-full shrink-0 flex-col gap-2.5 text-center">
					<h1 className="text-balance font-semibold text-[22px] text-foreground leading-7 tracking-[-0.01em]">
						{title}
					</h1>
					<p className="text-pretty text-muted-foreground text-sm">
						{subtitle}
					</p>
				</div>
				{items.length > 0 ? (
					<ImportList
						items={items}
						onToggle={props.step === "select" ? props.onToggle : undefined}
						step={step}
					/>
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
}
