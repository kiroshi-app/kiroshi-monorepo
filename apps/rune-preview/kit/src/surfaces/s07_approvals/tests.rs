use rune::{Key, KeyEvent, Mods, PhysicalKeyCode, TextEdit};

use super::{
	Draft, Question, QuestionEntry, QuestionEvent, QuestionOption, QuestionPanel, digit_of,
};

const OPTIONS: &[QuestionOption] = &[
	QuestionOption::new("Starter", "One seat."),
	QuestionOption::new("Team", "Ten seats."),
	QuestionOption::new("Enterprise", "Every seat."),
];
const PLAN: Question = Question::ask("Which plan?", "Plan", OPTIONS);
const CHANNELS: Question =
	Question { is_multi_select: true, ..Question::ask("Where?", "Channels", OPTIONS) };
const KEY_STEP: Question = Question {
	entry: Some(QuestionEntry { label: "Key", placeholder: "", is_secret: true }),
	..Question::ask("Paste your key", "API key", &[])
};

fn typed(key: &str, mods: Mods) -> KeyEvent {
	KeyEvent { key: Key::Text(key.to_owned()), mods }
}

fn panel<'a>(questions: &'a [Question<'a>], drafts: &'a [Draft<'a>]) -> QuestionPanel<'a> {
	QuestionPanel {
		questions,
		drafts,
		shown: 0,
		companion: None,
		can_skip: true,
		can_minimise: false,
		has_digit_keys: true,
		is_refused: false,
		is_pending: false,
		has_copied: false,
	}
}

#[test]
fn a_digit_reads_the_physical_key_whatever_the_layout_types() {
	let azerty_one = typed("&", Mods::default());
	assert_eq!(digit_of(&azerty_one, Some(PhysicalKeyCode::Digit1)), Some(1));
	assert_eq!(digit_of(&typed("7", Mods::default()), None), Some(7));
	assert_eq!(digit_of(&typed("0", Mods::default()), None), None);
	assert_eq!(digit_of(&typed("a", Mods::default()), None), None);
}

#[test]
fn a_digit_held_with_a_command_modifier_picks_nothing() {
	let command = Mods { cmd: true, ..Mods::default() };
	assert_eq!(digit_of(&typed("1", command), Some(PhysicalKeyCode::Digit1)), None);
}

#[test]
fn a_digit_chooses_on_a_single_select_question_and_toggles_on_a_multi_select_one() {
	let blank = TextEdit::new("");
	let drafts = [Draft { chosen: &[1], edit: &blank }];
	let single = [PLAN];
	let asked = panel(&single, &drafts);
	assert_eq!(asked.digit_gesture(1), Some(QuestionEvent::Choose(0)));
	assert_eq!(asked.digit_gesture(2), None);
	assert_eq!(asked.digit_gesture(4), None);
	let multi = [CHANNELS];
	let asked = panel(&multi, &drafts);
	assert_eq!(asked.digit_gesture(2), Some(QuestionEvent::Toggle(1)));
}

#[test]
fn no_digit_picks_on_an_entry_question_or_without_digit_keys() {
	let blank = TextEdit::new("");
	let drafts = [Draft { chosen: &[], edit: &blank }];
	let entry = [KEY_STEP];
	assert_eq!(panel(&entry, &drafts).digit_gesture(1), None);
	let plan = [PLAN];
	let unbound = QuestionPanel { has_digit_keys: false, ..panel(&plan, &drafts) };
	assert_eq!(unbound.digit_gesture(1), None);
}

#[test]
fn the_question_still_waiting_is_the_first_other_one_left_unanswered() {
	let blank = TextEdit::new("");
	let written = TextEdit::new("Wait for the audit");
	let questions = [PLAN, CHANNELS, KEY_STEP];
	let drafts = [
		Draft { chosen: &[], edit: &blank },
		Draft { chosen: &[], edit: &written },
		Draft { chosen: &[], edit: &blank },
	];
	assert_eq!(panel(&questions, &drafts).waiting_after_shown(), Some(2));
	let notice = [PLAN, Question::notice("Sentry")];
	assert_eq!(panel(&notice, &drafts[..2]).waiting_after_shown(), None);
}
