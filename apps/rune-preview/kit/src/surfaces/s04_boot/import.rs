use rune::{Cursor, El, Icon, LoopSpec, ScrollSpec, col, el, icon, row, text};

use super::{Emit, Frame, centred, counted, onboarding_shell, ringed, say, secondary};
use crate::avatar::Face;
use crate::icons;
use crate::primitives::DISABLED_OPACITY;
use crate::primitives::button::{Button, ButtonSize};
use crate::primitives::separator::{Orientation, separator};
use crate::strings::common::claude_import;
use crate::strings::{Key, Language};
use crate::tokens::{
	RADIUS_XL, SPACING, TEXT_COMPACT_MEDIUM, TEXT_COMPACT_MONO_MEDIUM, TEXT_SM, TEXT_TITLE,
	TEXT_XS, Tokens,
};
use crate::widgets::checkbox;

const HEADING_WIDTH: f32 = SPACING * 120.0;
const LIST_WIDTH: f32 = SPACING * 146.0;
const ROW_INSET: f32 = SPACING * 2.75;
const SLOT: f32 = SPACING * 4.5;
const MEDIA: f32 = SPACING * 7.0;
const GLYPH: f32 = SPACING * 4.0;
const FADE: f32 = SPACING * 10.0;
const SPIN_PERIOD: f64 = 1.0;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImportKind {
	Agent,
	Instructions,
	Skill,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImportStatus {
	Done,
	Pending,
	Failed,
}

#[derive(Clone)]
pub struct ImportItem<'a> {
	pub kind: ImportKind,
	pub title: &'a str,
	pub detail: &'a str,
	pub hue: Option<f32>,
	pub checked: bool,
	pub in_kiroshi: bool,
	pub status: Option<ImportStatus>,
}

impl ImportItem<'_> {
	fn is_picked(&self) -> bool {
		self.checked && !self.in_kiroshi
	}
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImportStep {
	Select,
	Importing,
	Done,
	Unreadable,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ImportEvent {
	Primary,
	Secondary,
	Toggle { item: usize, checked: bool },
	ToggleSkills { checked: bool },
}

pub struct Import<'a> {
	pub step: ImportStep,
	pub language: Language,
	pub hue: Option<f32>,
	pub title: &'a str,
	pub subtitle: Option<&'a str>,
	pub items: &'a [ImportItem<'a>],
	pub primary: &'a str,
	pub secondary: Option<&'a str>,
}

pub fn import_screen<S: 'static>(t: &Tokens, import: &Import, emit: Emit<S, ImportEvent>) -> El {
	let t = &t.in_space(import.hue);
	let language = import.language;
	let items: Vec<(usize, &ImportItem)> = match import.step {
		ImportStep::Unreadable => Vec::new(),
		ImportStep::Select => import.items.iter().enumerate().collect(),
		ImportStep::Importing | ImportStep::Done => {
			import.items.iter().enumerate().filter(|(_, item)| item.is_picked()).collect()
		}
	};
	let subtitle = match (import.step, import.subtitle) {
		(ImportStep::Select | ImportStep::Unreadable, Some(subtitle)) => subtitle.to_owned(),
		(ImportStep::Importing, _) => {
			let done =
				items.iter().filter(|(_, item)| item.status == Some(ImportStatus::Done)).count();
			say(
				claude_import::importing::BODY,
				language,
				&[("done", &done.to_string()), ("count", &items.len().to_string())],
			)
		}
		(ImportStep::Done, _) => done_summary(&items, language),
		(ImportStep::Select | ImportStep::Unreadable, None) => String::new(),
	};
	let heading = col()
		.w(HEADING_WIDTH)
		.shrink()
		.gap(SPACING * 2.5)
		.items_center()
		.child(
			centred(text(import.title.to_owned()).font(TEXT_TITLE).color(t.foreground))
				.role("heading"),
		)
		.child(centred(text(subtitle).font(TEXT_SM).color(t.muted_foreground)));
	let mut content = vec![heading];
	if !items.is_empty() {
		content.push(list(t, language, import.step, &items, emit));
	}
	let is_primary_disabled = import.step == ImportStep::Importing
		|| (import.step == ImportStep::Select && !items.iter().any(|(_, item)| item.is_picked()));
	let primary = Button::new(import.primary).size(ButtonSize::Lg);
	let mut controls = vec![if is_primary_disabled {
		primary.disabled(true).view(t)
	} else {
		primary.view(t).on_press(move |s: &mut S| emit(s, ImportEvent::Primary))
	}];
	if let Some(label) = import.secondary.filter(|_| import.step != ImportStep::Importing) {
		controls.push(secondary(t, label, emit, ImportEvent::Secondary));
	}
	onboarding_shell(
		t,
		Frame { content_gap: SPACING * 5.0, content_bottom: 0.0 },
		content,
		controls,
	)
}

pub fn import_row<S: 'static>(
	t: &Tokens,
	language: Language,
	r: &ImportItem,
	toggle: impl Fn(&mut S) + 'static,
) -> El {
	let slot = match r.status {
		Some(status) => status_mark(t, status),
		None => tick(t, r, toggle),
	};
	let media = match r.kind {
		ImportKind::Agent => Face::still(r.title, r.hue).draw(MEDIA, t),
		ImportKind::Instructions => icon(&icons::FILE, GLYPH).color(t.muted_foreground),
		ImportKind::Skill => icon(&icons::SKILL, GLYPH).color(t.muted_foreground),
	};
	let detail =
		if r.in_kiroshi { claude_import::row::IN_KIROSHI.text(language) } else { r.detail };
	let kind = match r.kind {
		ImportKind::Agent => claude_import::row::r#type::COMPANION,
		ImportKind::Instructions => claude_import::row::r#type::INSTRUCTIONS,
		ImportKind::Skill => claude_import::row::r#type::SKILL,
	};
	row()
		.key(format!("import-row-{}", r.title))
		.w_full()
		.padding(ROW_INSET)
		.gap(SPACING * 3.5)
		.center_y()
		.child(el().size(SLOT, SLOT).center().child(slot))
		.child(el().size(MEDIA, MEDIA).center().a11y_hidden().child(media))
		.child(
			col()
				.grow(1.0)
				.shrink()
				.gap(SPACING * 0.5)
				.child(
					text(r.title.to_owned())
						.font(if r.kind == ImportKind::Instructions {
							TEXT_COMPACT_MONO_MEDIUM
						} else {
							TEXT_COMPACT_MEDIUM
						})
						.color(t.foreground)
						.wrap_anywhere(),
				)
				.child(
					text(detail.to_owned())
						.font(TEXT_XS)
						.color(if r.status == Some(ImportStatus::Failed) {
							t.destructive
						} else {
							t.muted_foreground
						})
						.wrap_anywhere(),
				),
		)
		.child(text(kind.text(language).to_owned()).font(TEXT_XS).color(t.muted_foreground))
}

fn tick<S: 'static>(t: &Tokens, r: &ImportItem, toggle: impl Fn(&mut S) + 'static) -> El {
	let tick = checkbox(t, r.checked || r.in_kiroshi)
		.role("checkbox")
		.label(r.title)
		.checked(r.checked || r.in_kiroshi);
	if r.in_kiroshi {
		return tick.disabled(true).opacity(DISABLED_OPACITY);
	}
	ringed(t, tick.focusable(true).cursor(Cursor::Pointer).on_press(toggle))
}

fn status_mark(t: &Tokens, status: ImportStatus) -> El {
	let (glyph, ink): (&'static Icon, _) = match status {
		ImportStatus::Done => (&icons::SUCCESS, t.success),
		ImportStatus::Pending => (&icons::LOADER_CIRCLE, t.muted_foreground),
		ImportStatus::Failed => (&icons::CIRCLE_ALERT, t.destructive),
	};
	let mark = el().size(GLYPH, GLYPH).role("img").child(icon(glyph, GLYPH).color(ink));
	if status == ImportStatus::Pending && !t.reduced_motion {
		mark.looping(LoopSpec::rotation(SPIN_PERIOD))
	} else {
		mark
	}
}

struct ListRow<'a> {
	row: ImportItem<'a>,
	toggle: ImportEvent,
	title: Option<String>,
	detail: Option<String>,
}

fn rows_of<'a>(items: &[(usize, &ImportItem<'a>)], language: Language) -> Vec<ListRow<'a>> {
	let single = |&(index, item): &(usize, &ImportItem<'a>)| ListRow {
		row: item.clone(),
		toggle: ImportEvent::Toggle { item: index, checked: !item.checked },
		title: None,
		detail: None,
	};
	let skills: Vec<&ImportItem> =
		items.iter().map(|(_, item)| *item).filter(|item| item.kind == ImportKind::Skill).collect();
	let coming_in: Vec<&ImportItem> =
		skills.iter().copied().filter(|skill| skill.status != Some(ImportStatus::Failed)).collect();
	let new_skills: Vec<&ImportItem> =
		coming_in.iter().copied().filter(|skill| !skill.in_kiroshi).collect();
	let grouped = if new_skills.is_empty() { &coming_in } else { &new_skills };
	let mut rows: Vec<ListRow> =
		items.iter().filter(|(_, item)| item.kind != ImportKind::Skill).map(single).collect();
	if let Some(first) = grouped.first() {
		let (one, other) = if !new_skills.is_empty() && new_skills.len() < coming_in.len() {
			(claude_import::row::NEW_SKILLS_ONE, claude_import::row::NEW_SKILLS_OTHER)
		} else {
			(claude_import::row::SKILLS_ONE, claude_import::row::SKILLS_OTHER)
		};
		let checked = grouped.iter().all(|skill| skill.checked);
		let all_done = grouped.iter().all(|skill| skill.status == Some(ImportStatus::Done));
		rows.push(ListRow {
			row: ImportItem {
				kind: ImportKind::Skill,
				title: first.title,
				detail: first.detail,
				hue: None,
				checked,
				in_kiroshi: grouped.iter().all(|skill| skill.in_kiroshi),
				status: Some(if all_done { ImportStatus::Done } else { ImportStatus::Pending }),
			},
			toggle: ImportEvent::ToggleSkills { checked: !checked },
			title: Some(counted(one, other, grouped.len(), language)),
			detail: Some(grouped.iter().map(|skill| skill.title).collect::<Vec<_>>().join(", ")),
		});
	}
	rows.extend(
		items
			.iter()
			.filter(|(_, item)| {
				item.kind == ImportKind::Skill && item.status == Some(ImportStatus::Failed)
			})
			.map(single),
	);
	rows
}

fn list<S: 'static>(
	t: &Tokens,
	language: Language,
	step: ImportStep,
	items: &[(usize, &ImportItem)],
	emit: Emit<S, ImportEvent>,
) -> El {
	let mut rows = Vec::new();
	for (index, list_row) in rows_of(items, language).into_iter().enumerate() {
		let title = list_row.title.as_deref().unwrap_or(list_row.row.title);
		let detail = list_row.detail.as_deref().unwrap_or(list_row.row.detail);
		let status = match step {
			ImportStep::Select => None,
			_ => Some(list_row.row.status.unwrap_or(ImportStatus::Pending)),
		};
		let event = list_row.toggle;
		let drawn = import_row(
			t,
			language,
			&ImportItem { title, detail, status, ..list_row.row },
			move |s: &mut S| emit(s, event),
		);
		if index > 0 {
			rows.push(separator(t, Orientation::Horizontal));
		}
		rows.push(drawn);
	}
	col()
		.key("import-list")
		.w(LIST_WIDTH)
		.shrink()
		.px(SPACING * 3.0)
		.scroll(ScrollSpec { stick_bottom: false })
		.scroll_edge_fade(FADE)
		.child(
			col()
				.w_full()
				.radius(RADIUS_XL)
				.clip_rounded(RADIUS_XL)
				.border(1.0, t.border)
				.fill(t.card)
				.children(rows),
		)
}

fn list_of(parts: &[&str], language: Language) -> String {
	let (pair, last) = match language {
		Language::En => (" and ", ", and "),
		Language::Fr => (" et ", " et "),
	};
	match parts {
		[] => String::new(),
		[only] => (*only).to_owned(),
		[first, second] => format!("{first}{pair}{second}"),
		[head @ .., tail] => format!("{}{last}{tail}", head.join(", ")),
	}
}

fn done_summary(items: &[(usize, &ImportItem)], language: Language) -> String {
	let items: Vec<&ImportItem> = items.iter().map(|(_, item)| *item).collect();
	if let Some(failed) = items.iter().find(|item| item.status == Some(ImportStatus::Failed)) {
		let key = if failed.kind == ImportKind::Skill {
			claude_import::partly_failed::BODY
		} else {
			claude_import::partly_failed::BODY_NAMED
		};
		return say(key, language, &[("name", failed.title)]);
	}
	let agents: Vec<&str> =
		items.iter().filter(|item| item.kind == ImportKind::Agent).map(|item| item.title).collect();
	let has_instructions = items.iter().any(|item| item.kind == ImportKind::Instructions);
	let skill_count = items.iter().filter(|item| item.kind == ImportKind::Skill).count();
	let done = |one: Key, other: Key, count: usize| counted(one, other, count, language);
	if agents.is_empty() {
		use claude_import::done;
		return match (has_instructions, skill_count) {
			(false, _) => done(done::ONLY_SKILLS_ONE, done::ONLY_SKILLS_OTHER, skill_count),
			(true, 0) => done::ONLY_INSTRUCTIONS.text(language).to_owned(),
			(true, _) => done(
				done::INSTRUCTIONS_AND_SKILLS_ONE,
				done::INSTRUCTIONS_AND_SKILLS_OTHER,
				skill_count,
			),
		};
	}
	let mut extras: Vec<String> = Vec::new();
	if has_instructions {
		extras.push(claude_import::done::INSTRUCTIONS.text(language).to_owned());
	}
	if skill_count > 0 {
		extras.push(done(
			claude_import::row::SKILLS_ONE,
			claude_import::row::SKILLS_OTHER,
			skill_count,
		));
	}
	let names = list_of(&agents, language);
	let (one, other) = if extras.is_empty() {
		(claude_import::done::COMPANIONS_ONE, claude_import::done::COMPANIONS_OTHER)
	} else {
		(claude_import::done::COMPANIONS_WITH_ONE, claude_import::done::COMPANIONS_WITH_OTHER)
	};
	let key = if agents.len() == 1 { one } else { other };
	let extras: Vec<&str> = extras.iter().map(String::as_str).collect();
	say(key, language, &[("companions", &names), ("extras", &list_of(&extras, language))])
}

#[cfg(test)]
mod tests {
	use super::*;

	fn item(kind: ImportKind, title: &str) -> ImportItem<'_> {
		ImportItem {
			kind,
			title,
			detail: title,
			hue: None,
			checked: true,
			in_kiroshi: false,
			status: Some(ImportStatus::Done),
		}
	}

	#[test]
	fn the_done_summary_names_the_agents_and_what_came_with_them() {
		let items = [
			item(ImportKind::Agent, "Atlas"),
			item(ImportKind::Agent, "Wren"),
			item(ImportKind::Instructions, "CLAUDE.md"),
			item(ImportKind::Skill, "commit-style"),
			item(ImportKind::Skill, "changelog"),
		];
		let indexed: Vec<(usize, &ImportItem)> = items.iter().enumerate().collect();
		assert_eq!(
			done_summary(&indexed, Language::En),
			"Atlas and Wren are ready, with your CLAUDE.md and 2 skills."
		);
	}

	#[test]
	fn the_done_summary_turns_singular_and_leaves_out_what_did_not_come_in() {
		let skills = ["commit-style", "test-first", "review-checklist", "changelog"]
			.map(|title| item(ImportKind::Skill, title));
		let summary = |head: &[ImportItem]| {
			let items: Vec<ImportItem> = head.iter().cloned().chain(skills.clone()).collect();
			let indexed: Vec<(usize, &ImportItem)> = items.iter().enumerate().collect();
			done_summary(&indexed, Language::En)
		};
		assert_eq!(
			summary(&[
				item(ImportKind::Agent, "Atlas"),
				item(ImportKind::Instructions, "CLAUDE.md")
			]),
			"Atlas is ready, with your CLAUDE.md and 4 skills."
		);
		assert_eq!(
			summary(&[item(ImportKind::Agent, "Atlas"), item(ImportKind::Agent, "Wren")]),
			"Atlas and Wren are ready, with 4 skills."
		);
	}

	#[test]
	fn a_failed_agent_or_claude_md_names_itself_in_the_summary() {
		for (kind, title) in [(ImportKind::Agent, "Wren"), (ImportKind::Instructions, "CLAUDE.md")]
		{
			let mut failed = item(kind, title);
			failed.status = Some(ImportStatus::Failed);
			let items =
				[item(ImportKind::Agent, "Atlas"), failed, item(ImportKind::Skill, "changelog")];
			let indexed: Vec<(usize, &ImportItem)> = items.iter().enumerate().collect();
			assert_eq!(
				done_summary(&indexed, Language::En),
				format!("{title} didn’t come in. Try it again, or add it later from Settings.")
			);
		}
	}

	#[test]
	fn a_failed_skill_names_itself_in_the_summary_and_keeps_its_own_row() {
		let mut failed = item(ImportKind::Skill, "changelog");
		failed.status = Some(ImportStatus::Failed);
		let items = [item(ImportKind::Skill, "commit-style"), failed];
		let indexed: Vec<(usize, &ImportItem)> = items.iter().enumerate().collect();
		assert_eq!(
			done_summary(&indexed, Language::En),
			"The changelog skill didn’t come in. Try it again, or add it later from Settings."
		);
		let rows = rows_of(&indexed, Language::En);
		assert_eq!(rows.len(), 2);
		assert_eq!(rows[0].title.as_deref(), Some("1 skill"));
		assert_eq!(rows[1].row.title, "changelog");
	}
}
