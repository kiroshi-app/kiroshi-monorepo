#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum NoticeKind {
	Bot,
	Conversation,
	Mission,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NoticeTarget {
	pub kind: NoticeKind,
	pub id: String,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Notice {
	pub title: String,
	pub body: String,
	pub target: NoticeTarget,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Switches {
	pub on_question: bool,
	pub on_permission: bool,
	pub on_finished_turn: bool,
}

impl Switches {
	pub const ALL_ON: Switches =
		Switches { on_question: true, on_permission: true, on_finished_turn: true };
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Language {
	En,
	Fr,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Context {
	pub switches: Switches,
	pub has_focus: bool,
	pub language: Language,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Turn {
	Idle,
	Submitting,
	Running,
	Stopping,
	Failed,
}

impl Turn {
	fn is_busy(self) -> bool {
		matches!(self, Turn::Submitting | Turn::Running | Turn::Stopping)
	}
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct AgentState {
	pub turn: Turn,
	pub question_id: Option<String>,
	pub permission_id: Option<String>,
}

impl AgentState {
	pub const IDLE: AgentState =
		AgentState { turn: Turn::Idle, question_id: None, permission_id: None };
}

pub struct AgentChange<'a> {
	pub name: &'a str,
	pub target: NoticeTarget,
	pub before: &'a AgentState,
	pub after: &'a AgentState,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PromptKind {
	Question,
	Permission,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Prompt {
	pub kind: PromptKind,
	pub request_id: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Round {
	pub speaker_ids: Vec<String>,
	pub waiting_bot_ids: Vec<String>,
	pub prompt: Option<Prompt>,
}

impl Round {
	fn is_busy(&self) -> bool {
		!self.speaker_ids.is_empty() || !self.waiting_bot_ids.is_empty()
	}

	fn asked_question_id(&self) -> Option<&str> {
		self.prompt
			.as_ref()
			.filter(|prompt| prompt.kind == PromptKind::Question)
			.map(|prompt| prompt.request_id.as_str())
	}
}

pub struct RoundChange<'a> {
	pub name: &'a str,
	pub target: NoticeTarget,
	pub before: &'a Round,
	pub after: &'a Round,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MissionState {
	WaitingHuman,
	ReadyToMerge,
}

pub struct MissionChange<'a> {
	pub name: &'a str,
	pub ticket: &'a str,
	pub target: NoticeTarget,
	pub state: MissionState,
}

pub struct SpokenWord<'a> {
	pub title: &'a str,
	pub name: &'a str,
	pub target: NoticeTarget,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Event {
	Question,
	Permission,
	FinishedTurn,
}

impl Event {
	fn is_switched_on(self, switches: Switches) -> bool {
		match self {
			Event::Question => switches.on_question,
			Event::Permission => switches.on_permission,
			Event::FinishedTurn => switches.on_finished_turn,
		}
	}

	fn body(self, language: Language) -> &'static str {
		match (self, language) {
			(Event::Question, Language::En) => "Asked you a question",
			(Event::Permission, Language::En) => "Wants your approval",
			(Event::FinishedTurn, Language::En) => "Finished its turn",
			(Event::Question, Language::Fr) => "Vous a posé une question",
			(Event::Permission, Language::Fr) => "Demande votre autorisation",
			(Event::FinishedTurn, Language::Fr) => "A terminé son tour",
		}
	}
}

fn is_new_request(before: Option<&str>, after: Option<&str>) -> bool {
	after.is_some() && before != after
}

fn has_turn_finished(before: Turn, after: Turn) -> bool {
	before.is_busy() && before != Turn::Stopping && !after.is_busy() && after != Turn::Failed
}

fn events_in(before: &AgentState, after: &AgentState) -> Vec<Event> {
	let mut events = Vec::new();
	if is_new_request(before.question_id.as_deref(), after.question_id.as_deref()) {
		events.push(Event::Question);
	}
	if is_new_request(before.permission_id.as_deref(), after.permission_id.as_deref()) {
		events.push(Event::Permission);
	}
	if has_turn_finished(before.turn, after.turn) {
		events.push(Event::FinishedTurn);
	}
	events
}

fn notice_of(name: &str, target: NoticeTarget, body: String) -> Notice {
	Notice { title: name.to_owned(), body, target }
}

fn event_notice(name: &str, target: NoticeTarget, event: Event, language: Language) -> Notice {
	notice_of(name, target, event.body(language).to_owned())
}

pub fn agent_notices(change: AgentChange, context: Context) -> Vec<Notice> {
	if context.has_focus {
		return Vec::new();
	}
	events_in(change.before, change.after)
		.into_iter()
		.filter(|event| event.is_switched_on(context.switches))
		.map(|event| event_notice(change.name, change.target.clone(), event, context.language))
		.collect()
}

pub fn finished_round_notice(change: RoundChange, context: Context) -> Option<Notice> {
	let finished = !context.has_focus
		&& context.switches.on_finished_turn
		&& change.before.is_busy()
		&& !change.after.is_busy();
	finished
		.then(|| event_notice(change.name, change.target, Event::FinishedTurn, context.language))
}

pub fn asked_question_notice(change: RoundChange, context: Context) -> Option<Notice> {
	let asked = !context.has_focus
		&& context.switches.on_question
		&& is_new_request(change.before.asked_question_id(), change.after.asked_question_id());
	asked.then(|| event_notice(change.name, change.target, Event::Question, context.language))
}

pub fn spoken_notice(word: SpokenWord, context: Context) -> Option<Notice> {
	let speaks = !context.has_focus && context.switches.on_finished_turn;
	speaks.then(|| {
		let body = match context.language {
			Language::En => format!("{} said something", word.name),
			Language::Fr => format!("{} a dit quelque chose", word.name),
		};
		notice_of(word.title, word.target, body)
	})
}

pub fn mission_notice(change: MissionChange, context: Context) -> Option<Notice> {
	let switched_on = match change.state {
		MissionState::WaitingHuman => context.switches.on_question,
		MissionState::ReadyToMerge => context.switches.on_finished_turn,
	};
	(!context.has_focus && switched_on).then(|| {
		let ticket = change.ticket;
		let body = match (change.state, context.language) {
			(MissionState::WaitingHuman, Language::En) => format!("Needs you on {ticket}"),
			(MissionState::ReadyToMerge, Language::En) => format!("{ticket} is ready to merge"),
			(MissionState::WaitingHuman, Language::Fr) => format!("A besoin de vous sur {ticket}"),
			(MissionState::ReadyToMerge, Language::Fr) => format!("{ticket} est prête à fusionner"),
		};
		notice_of(change.name, change.target, body)
	})
}

#[cfg(test)]
mod tests {
	use super::*;

	const UNFOCUSED: Context =
		Context { switches: Switches::ALL_ON, has_focus: false, language: Language::En };

	fn bot(id: &str) -> NoticeTarget {
		NoticeTarget { kind: NoticeKind::Bot, id: id.to_owned() }
	}

	fn state(turn: Turn, question: Option<&str>, permission: Option<&str>) -> AgentState {
		AgentState {
			turn,
			question_id: question.map(str::to_owned),
			permission_id: permission.map(str::to_owned),
		}
	}

	fn idle() -> AgentState {
		AgentState::IDLE
	}

	fn turning(turn: Turn) -> AgentState {
		state(turn, None, None)
	}

	fn asking(id: &str) -> AgentState {
		state(Turn::Idle, Some(id), None)
	}

	fn approving(id: &str) -> AgentState {
		state(Turn::Idle, None, Some(id))
	}

	fn decide_with(before: AgentState, after: AgentState, context: Context) -> Vec<Notice> {
		agent_notices(
			AgentChange { name: "Nyx", target: bot("bot-1"), before: &before, after: &after },
			context,
		)
	}

	fn decide(before: AgentState, after: AgentState) -> Vec<Notice> {
		decide_with(before, after, UNFOCUSED)
	}

	fn bodies(notices: &[Notice]) -> Vec<&str> {
		notices.iter().map(|notice| notice.body.as_str()).collect()
	}

	#[test]
	fn reports_a_question_the_state_before_did_not_hold() {
		assert_eq!(bodies(&decide(idle(), asking("q-1"))), ["Asked you a question"]);
	}

	#[test]
	fn reports_a_permission_the_state_before_did_not_hold() {
		assert_eq!(bodies(&decide(idle(), approving("p-1"))), ["Wants your approval"]);
	}

	#[test]
	fn reports_a_turn_that_answered_on_its_own() {
		assert_eq!(bodies(&decide(turning(Turn::Running), idle())), ["Finished its turn"]);
	}

	#[test]
	fn reports_nothing_for_a_question_still_held_across_a_change() {
		assert_eq!(decide(asking("q-1"), asking("q-1")), []);
	}

	#[test]
	fn reports_nothing_for_a_permission_still_held_across_a_change() {
		assert_eq!(decide(approving("p-1"), approving("p-1")), []);
	}

	#[test]
	fn reports_the_next_question_once_the_one_before_it_was_answered() {
		assert_eq!(bodies(&decide(asking("q-1"), asking("q-2"))), ["Asked you a question"]);
	}

	#[test]
	fn reports_nothing_for_a_turn_that_failed() {
		assert_eq!(decide(turning(Turn::Running), turning(Turn::Failed)), []);
	}

	#[test]
	fn reports_nothing_for_a_turn_the_reader_stopped() {
		assert_eq!(decide(turning(Turn::Stopping), idle()), []);
	}

	#[test]
	fn reports_nothing_for_a_turn_that_starts() {
		assert_eq!(decide(idle(), turning(Turn::Running)), []);
	}

	#[test]
	fn reports_nothing_for_a_stop_the_turn_has_not_left_yet() {
		assert_eq!(decide(turning(Turn::Running), turning(Turn::Stopping)), []);
	}

	#[test]
	fn sends_nothing_while_the_window_holds_the_focus() {
		let focused = Context { has_focus: true, ..UNFOCUSED };

		assert_eq!(decide_with(idle(), asking("q-1"), focused), []);
	}

	#[test]
	fn sends_nothing_for_an_event_whose_switch_is_off() {
		let switches = Switches { on_question: false, ..Switches::ALL_ON };

		assert_eq!(decide_with(idle(), asking("q-1"), Context { switches, ..UNFOCUSED }), []);
	}

	#[test]
	fn keeps_the_events_whose_switches_are_on() {
		let switches = Switches { on_finished_turn: false, ..Switches::ALL_ON };

		let notices =
			decide_with(turning(Turn::Running), asking("q-1"), Context { switches, ..UNFOCUSED });

		assert_eq!(bodies(&notices), ["Asked you a question"]);
	}

	#[test]
	fn names_the_agent_the_change_is_about() {
		let before = idle();
		let after = approving("p-1");

		let notices = agent_notices(
			AgentChange { name: "Wren", target: bot("bot-7"), before: &before, after: &after },
			UNFOCUSED,
		);

		assert_eq!(
			notices,
			[Notice {
				title: "Wren".to_owned(),
				body: "Wants your approval".to_owned(),
				target: bot("bot-7"),
			}]
		);
	}

	#[test]
	fn reports_nothing_when_nothing_moved() {
		assert_eq!(decide(idle(), idle()), []);
	}

	fn room() -> NoticeTarget {
		NoticeTarget { kind: NoticeKind::Conversation, id: "c-1".to_owned() }
	}

	fn round(speakers: &[&str], waiting: &[&str]) -> Round {
		Round {
			speaker_ids: speakers.iter().map(|id| (*id).to_owned()).collect(),
			waiting_bot_ids: waiting.iter().map(|id| (*id).to_owned()).collect(),
			prompt: None,
		}
	}

	fn decide_round_with(before: Round, after: Round, context: Context) -> bool {
		finished_round_notice(
			RoundChange { name: "Room", target: room(), before: &before, after: &after },
			context,
		)
		.is_some()
	}

	fn decide_round(before: Round, after: Round) -> bool {
		decide_round_with(before, after, UNFOCUSED)
	}

	#[test]
	fn reports_the_last_agent_of_the_room_falling_silent() {
		assert!(decide_round(round(&["bot-1"], &[]), Round::default()));
	}

	#[test]
	fn a_finished_round_is_titled_with_the_room_and_opens_it() {
		let before = round(&["bot-1"], &[]);
		let after = Round::default();

		let notice = finished_round_notice(
			RoundChange { name: "Room", target: room(), before: &before, after: &after },
			UNFOCUSED,
		);

		assert_eq!(
			notice,
			Some(Notice {
				title: "Room".to_owned(),
				body: "Finished its turn".to_owned(),
				target: room(),
			})
		);
	}

	#[test]
	fn reports_nothing_while_an_agent_is_still_speaking() {
		assert!(!decide_round(round(&["bot-1"], &[]), round(&["bot-2"], &[])));
	}

	#[test]
	fn reports_nothing_while_an_agent_is_still_waiting_its_turn() {
		assert!(!decide_round(round(&["bot-1"], &["bot-2"]), round(&[], &["bot-2"])));
	}

	#[test]
	fn reports_the_room_falling_silent_once_the_last_waiting_agent_has_spoken() {
		assert!(decide_round(round(&["bot-2"], &[]), Round::default()));
	}

	#[test]
	fn reports_nothing_for_a_room_that_was_silent_already() {
		assert!(!decide_round(Round::default(), Round::default()));
	}

	#[test]
	fn reports_nothing_for_a_round_that_starts() {
		assert!(!decide_round(Round::default(), round(&["bot-1"], &[])));
	}

	#[test]
	fn reports_no_finished_round_while_the_window_holds_the_focus() {
		let focused = Context { has_focus: true, ..UNFOCUSED };

		assert!(!decide_round_with(round(&["bot-1"], &[]), Round::default(), focused));
	}

	#[test]
	fn reports_no_finished_round_while_the_finished_turn_switch_is_off() {
		let switches = Switches { on_finished_turn: false, ..Switches::ALL_ON };
		let context = Context { switches, ..UNFOCUSED };

		assert!(!decide_round_with(round(&["bot-1"], &[]), Round::default(), context));
	}

	fn prompting(kind: PromptKind, id: &str) -> Round {
		Round { prompt: Some(Prompt { kind, request_id: id.to_owned() }), ..Round::default() }
	}

	fn decide_asked_with(before: Round, after: Round, context: Context) -> bool {
		asked_question_notice(
			RoundChange { name: "Room", target: room(), before: &before, after: &after },
			context,
		)
		.is_some()
	}

	fn decide_asked(before: Round, after: Round) -> bool {
		decide_asked_with(before, after, UNFOCUSED)
	}

	#[test]
	fn reports_a_question_raised_in_the_round() {
		assert!(decide_asked(Round::default(), prompting(PromptKind::Question, "q-1")));
	}

	#[test]
	fn reports_nothing_while_the_same_question_stands() {
		assert!(!decide_asked(
			prompting(PromptKind::Question, "q-1"),
			prompting(PromptKind::Question, "q-1")
		));
	}

	#[test]
	fn reports_a_question_replacing_the_one_before_it() {
		assert!(decide_asked(
			prompting(PromptKind::Question, "q-1"),
			prompting(PromptKind::Question, "q-2")
		));
	}

	#[test]
	fn reports_no_asked_question_for_a_permission() {
		assert!(!decide_asked(Round::default(), prompting(PromptKind::Permission, "p-1")));
	}

	#[test]
	fn reports_no_asked_question_while_the_window_holds_the_focus() {
		let focused = Context { has_focus: true, ..UNFOCUSED };

		assert!(!decide_asked_with(
			Round::default(),
			prompting(PromptKind::Question, "q-1"),
			focused
		));
	}

	#[test]
	fn reports_no_asked_question_while_the_question_switch_is_off() {
		let switches = Switches { on_question: false, ..Switches::ALL_ON };
		let context = Context { switches, ..UNFOCUSED };

		assert!(!decide_asked_with(
			Round::default(),
			prompting(PromptKind::Question, "q-1"),
			context
		));
	}

	fn mission(state: MissionState, context: Context) -> Option<Notice> {
		mission_notice(
			MissionChange {
				name: "Nyx",
				ticket: "OPE-1",
				target: NoticeTarget { kind: NoticeKind::Mission, id: "m-1".to_owned() },
				state,
			},
			context,
		)
	}

	#[test]
	fn reports_an_escalation_to_the_human() {
		assert_eq!(
			mission(MissionState::WaitingHuman, UNFOCUSED).map(|notice| notice.body),
			Some("Needs you on OPE-1".to_owned())
		);
	}

	#[test]
	fn reports_work_that_is_ready_to_merge() {
		assert_eq!(
			mission(MissionState::ReadyToMerge, UNFOCUSED).map(|notice| notice.body),
			Some("OPE-1 is ready to merge".to_owned())
		);
	}

	#[test]
	fn reports_no_mission_while_the_window_holds_the_focus() {
		let focused = Context { has_focus: true, ..UNFOCUSED };

		assert_eq!(mission(MissionState::WaitingHuman, focused), None);
	}

	#[test]
	fn reports_nothing_on_an_escalation_while_the_question_switch_is_off() {
		let switches = Switches { on_question: false, ..Switches::ALL_ON };

		assert_eq!(mission(MissionState::WaitingHuman, Context { switches, ..UNFOCUSED }), None);
	}

	#[test]
	fn reports_nothing_on_finished_work_while_the_finished_turn_switch_is_off() {
		let switches = Switches { on_finished_turn: false, ..Switches::ALL_ON };

		assert_eq!(mission(MissionState::ReadyToMerge, Context { switches, ..UNFOCUSED }), None);
	}

	#[test]
	fn reports_an_escalation_while_the_finished_turn_switch_is_off() {
		let switches = Switches { on_finished_turn: false, ..Switches::ALL_ON };

		assert!(mission(MissionState::WaitingHuman, Context { switches, ..UNFOCUSED }).is_some());
	}

	#[test]
	fn titles_the_notification_with_the_name_it_was_given() {
		let notices = decide(idle(), asking("q-1"));

		assert_eq!(notices.iter().map(|notice| notice.title.as_str()).collect::<Vec<_>>(), ["Nyx"]);
	}

	fn every_body_in(language: Language) -> Vec<&'static str> {
		[Event::Question, Event::Permission, Event::FinishedTurn]
			.map(|event| event.body(language))
			.to_vec()
	}

	#[test]
	fn reads_each_event_from_the_en_catalogue() {
		assert_eq!(
			every_body_in(Language::En),
			["Asked you a question", "Wants your approval", "Finished its turn"]
		);
	}

	#[test]
	fn reads_each_event_from_the_fr_catalogue() {
		let context = Context { language: Language::Fr, ..UNFOCUSED };

		assert_eq!(
			bodies(&decide_with(idle(), asking("q-1"), context)),
			["Vous a posé une question"]
		);
		assert_eq!(
			every_body_in(Language::Fr),
			["Vous a posé une question", "Demande votre autorisation", "A terminé son tour"]
		);
	}

	#[test]
	fn a_spoken_word_names_who_spoke_under_the_title_it_was_given() {
		let notice =
			spoken_notice(SpokenWord { title: "Room", name: "Nyx", target: room() }, UNFOCUSED);

		assert_eq!(
			notice.map(|notice| (notice.title, notice.body)),
			Some(("Room".to_owned(), "Nyx said something".to_owned()))
		);
	}

	#[test]
	fn a_spoken_word_stays_silent_while_the_window_holds_the_focus() {
		let focused = Context { has_focus: true, ..UNFOCUSED };

		assert_eq!(
			spoken_notice(SpokenWord { title: "Room", name: "Nyx", target: room() }, focused),
			None
		);
	}
}
