"use client"

import { useCallback, useRef, useState } from "react"
import { useTranslation } from "react-i18next"

import { BotIdentityAvatar } from "@workspace/ui/components/bot-identity-avatar"
import type {
	BotCommitAuthor,
	BotIdentity,
} from "@workspace/ui/components/bot-settings"
import { ConfirmDialog } from "@workspace/ui/components/confirm-dialog"
import { Icons } from "@workspace/ui/components/icons"
import { InitialsAvatar } from "@workspace/ui/components/initials-avatar"
import { SETTINGS_EMPTY_CLASS } from "@workspace/ui/components/settings-styles"
import { Button } from "@workspace/ui/components/ui/button"
import { Input } from "@workspace/ui/components/ui/input"

type HistoryChange = {
	id: string
	author: BotCommitAuthor
	sentence: string
	detail?: string
	at: string
	time: string
	retouchCount?: number
	isUndone?: boolean
}

type HistoryDay = {
	id: string
	label: string
	changes: HistoryChange[]
}

type HistoryChangeFile = {
	path: string
	patch: string
}

type PluginHistory = {
	days: HistoryDay[]
	oldestDate: string
	haveFailedToLoad?: boolean
	onUndo: (change: HistoryChange) => void
	onSearchChange?: (text: string) => void
	onOpen?: (change: HistoryChange) => void
	files?: HistoryChangeFile[]
	areFilesReading?: boolean
	haveFilesFailedToRead?: boolean
}

type HistoryPanelProps = PluginHistory & {
	companionName: string
	companion?: BotIdentity
	readerImage?: string
}

const AUTHOR_MARK_SIZE = 20

const HEAD_CLASS =
	"flex shrink-0 items-center gap-3 px-5 pt-4 pb-3 in-data-companion-page:p-0"

const HEAD_SENTENCE_CLASS =
	"min-w-0 flex-1 text-muted-foreground text-xs/4 in-data-companion-page:text-compact/4.5"

const LIST_CLASS =
	"flex flex-col px-3 pb-5 in-data-companion-page:gap-4 in-data-companion-page:p-0"

const SEARCH_CONTROL_CLASS = "rounded-md text-muted-foreground"

const DAY_CLASS =
	"[&:not(:first-child)]:pt-2 in-data-companion-page:flex in-data-companion-page:flex-col in-data-companion-page:gap-1 in-data-companion-page:pt-0!"

const DAY_HEADING_ROW_CLASS =
	"flex items-center gap-2.5 px-2 pt-1.5 pb-2 in-data-companion-page:gap-2 in-data-companion-page:px-0 in-data-companion-page:py-1"

const DAY_HEADING_CLASS =
	"shrink-0 font-medium text-[11px]/[14px] text-muted-foreground uppercase tracking-[0.07em] in-data-companion-page:text-xs/4 in-data-companion-page:normal-case in-data-companion-page:tracking-normal"

const ROW_CLASS =
	"group/row relative flex list-none items-start gap-2.5 rounded-lg px-2 py-[7px] hover:bg-muted has-[:focus-visible]:bg-muted in-data-companion-page:py-2"

const ROW_CONTROL_CLASS =
	"absolute inset-0 cursor-pointer rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring"

const SENTENCE_CLASS =
	"min-w-0 flex-1 truncate text-foreground text-sm/5 in-data-companion-page:flex-initial in-data-companion-page:text-muted-foreground"

const SUFFIX_CLASS = "shrink-0 text-sm/5"

const UNDONE_CLASS = `${SUFFIX_CLASS} text-muted-foreground before:me-1 before:content-['·']`

const UNDO_SLOT_CLASS =
	"relative z-10 grid size-6 shrink-0 place-items-center in-data-companion-page:order-last in-data-companion-page:size-3.5"

const UNDO_CONTROL_CLASS =
	"rounded-md bg-card text-muted-foreground transition-opacity duration-150 [@media(hover:hover)]:opacity-0 group-hover/row:opacity-100 group-has-[:focus-visible]/row:opacity-100 motion-reduce:transition-none in-data-companion-page:-m-1.25 in-data-companion-page:bg-transparent in-data-companion-page:[@media(hover:hover)]:opacity-100"

const TIME_CLASS =
	"w-10 shrink-0 text-end text-muted-foreground text-xs/4 tabular-nums"

type AuthorMarkProps = {
	author: BotCommitAuthor
	companionName: string
	companion?: BotIdentity
	readerImage?: string
}

const AuthorMark = ({
	author,
	companionName,
	companion,
	readerImage,
}: AuthorMarkProps) =>
	author === "bot" ? (
		<BotIdentityAvatar
			hue={companion?.blot}
			className="shrink-0"
			image={companion?.image}
			name={companionName}
			size={AUTHOR_MARK_SIZE}
		/>
	) : (
		<InitialsAvatar
			className="shrink-0"
			image={readerImage}
			size={AUTHOR_MARK_SIZE}
		/>
	)

const HistoryPanel = ({
	days,
	oldestDate,
	haveFailedToLoad = false,
	onUndo,
	onSearchChange,
	onOpen,
	companionName,
	companion,
	readerImage,
}: HistoryPanelProps) => {
	const { t } = useTranslation("bots")
	const [searchText, setSearchText] = useState("")
	const [isSearching, setSearching] = useState(false)
	const [undoing, setUndoing] = useState<HistoryChange | null>(null)

	const isReturningFocus = useRef(false)

	const focusField = useCallback(
		(field: HTMLInputElement | null) => field?.focus(),
		[],
	)

	const focusTrigger = useCallback((trigger: HTMLButtonElement | null) => {
		if (!trigger || !isReturningFocus.current) return
		isReturningFocus.current = false
		trigger.focus()
	}, [])

	const search = (text: string) => {
		setSearchText(text)
		onSearchChange?.(text)
	}

	const closeSearch = () => {
		isReturningFocus.current = true
		setSearching(false)
		search("")
	}

	const changeCount = days.reduce((total, day) => total + day.changes.length, 0)

	if (haveFailedToLoad) {
		return (
			<div className={SETTINGS_EMPTY_CLASS}>
				<Icons.Alert aria-hidden="true" className="size-8 text-destructive" />
				<p className="max-w-xs text-muted-foreground text-sm">
					{t("history.unavailable")}
				</p>
			</div>
		)
	}

	if (changeCount === 0 && !isSearching) {
		return (
			<div className={SETTINGS_EMPTY_CLASS}>
				<Icons.History
					aria-hidden="true"
					className="size-8 text-muted-foreground"
				/>
				<p className="max-w-xs text-muted-foreground text-sm">
					{t("history.empty")}
				</p>
			</div>
		)
	}

	return (
		<>
			<div className={HEAD_CLASS}>
				{isSearching ? (
					<>
						<Input
							aria-label={t("history.search.label")}
							className="h-7 min-w-0 flex-1"
							onChange={(event) => search(event.target.value)}
							onKeyDown={(event) => {
								if (event.key === "Escape") closeSearch()
							}}
							placeholder={t("history.search.placeholder")}
							ref={focusField}
							value={searchText}
						/>
						<Button
							aria-label={t("history.search.clear")}
							className={SEARCH_CONTROL_CLASS}
							onClick={closeSearch}
							size="icon-sm"
							variant="ghost"
						>
							<Icons.Close aria-hidden="true" />
						</Button>
					</>
				) : (
					<>
						<p className={HEAD_SENTENCE_CLASS}>
							{t("history.summary", {
								count: changeCount,
								date: oldestDate,
							})}
						</p>
						<Button
							aria-label={t("history.search.label")}
							className={SEARCH_CONTROL_CLASS}
							onClick={() => setSearching(true)}
							ref={focusTrigger}
							size="icon-sm"
							variant="ghost"
						>
							<Icons.Search aria-hidden="true" />
						</Button>
					</>
				)}
			</div>

			<div className={LIST_CLASS}>
				{changeCount === 0 ? (
					<p className="px-2 py-1.5 text-muted-foreground text-sm">
						{t("history.noMatch", { text: searchText })}
					</p>
				) : null}

				{days.map((day) => (
					<section className={DAY_CLASS} data-slot="history-day" key={day.id}>
						<div className={DAY_HEADING_ROW_CLASS}>
							<h3 className={DAY_HEADING_CLASS}>{day.label}</h3>
							<span aria-hidden="true" className="h-px flex-1 bg-border" />
						</div>

						<ul className="flex flex-col p-0 in-data-companion-page:gap-1">
							{day.changes.map((change) => (
								<li
									className={ROW_CLASS}
									data-slot="history-change"
									key={change.id}
								>
									{onOpen ? (
										<button
											aria-label={change.sentence}
											className={ROW_CONTROL_CLASS}
											onClick={() => onOpen(change)}
											type="button"
										/>
									) : null}

									<AuthorMark
										author={change.author}
										companion={companion}
										companionName={companionName}
										readerImage={readerImage}
									/>

									<div className="flex min-w-0 flex-1 flex-col gap-0.5">
										<div className="flex min-w-0 items-baseline gap-[5px]">
											<span className="shrink-0 font-medium text-foreground text-sm/5">
												{change.author === "bot"
													? companionName
													: t("history.author.user")}
											</span>
											<span className={SENTENCE_CLASS}>{change.sentence}</span>
											{change.retouchCount ? (
												<span
													className={`${SUFFIX_CLASS} text-foreground`}
													data-slot="history-retouches"
												>
													{t("history.retouches", {
														count: change.retouchCount,
													})}
												</span>
											) : null}
											{change.isUndone ? (
												<span
													className={UNDONE_CLASS}
													data-slot="history-undone"
												>
													{t("history.undone")}
												</span>
											) : null}
										</div>
										{change.detail ? (
											<p className="truncate text-muted-foreground text-xs/4">
												{change.detail}
											</p>
										) : null}
									</div>

									<div className="flex h-5 shrink-0 items-center gap-2">
										<div className={UNDO_SLOT_CLASS}>
											{change.isUndone ? null : (
												<Button
													aria-label={t("history.undo.label", {
														title: change.sentence,
													})}
													className={UNDO_CONTROL_CLASS}
													onClick={() => setUndoing(change)}
													size="icon-xs"
													variant="ghost"
												>
													<Icons.Restart
														aria-hidden="true"
														className="size-3.5"
													/>
												</Button>
											)}
										</div>
										<time className={TIME_CLASS} dateTime={change.at}>
											{change.time}
										</time>
									</div>
								</li>
							))}
						</ul>
					</section>
				))}
			</div>

			<ConfirmDialog
				confirmLabel={t("history.undo.confirm")}
				description={t("history.undo.description")}
				onConfirm={() => {
					if (undoing) onUndo(undoing)
				}}
				onOpenChange={(open) => !open && setUndoing(null)}
				open={Boolean(undoing)}
				title={t("history.undo.title", { title: undoing?.sentence ?? "" })}
			/>
		</>
	)
}

export {
	type HistoryChange,
	type HistoryChangeFile,
	type HistoryDay,
	HistoryPanel,
	type HistoryPanelProps,
	type PluginHistory,
}
