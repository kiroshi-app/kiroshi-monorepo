mod calls;
mod detail;
mod form;
mod listing;
#[cfg(test)]
mod tests;
mod view;

use std::time::{SystemTime, UNIX_EPOCH};

use kiroshi_core::routines::contract::{
	Routine, RoutineDraft, RoutineEdit, RoutineKey, TriggerDecision, TriggerSource,
};
use rune::{TextEdit, Tx, Waker};

use kiroshi_rune_kit::strings::Language;
use kiroshi_rune_kit::surfaces::s09_routines::RoutinesEvent;
use kiroshi_rune_kit::surfaces::s09_routines::form::{FormField, Picker, WebhookPart};
use kiroshi_rune_kit::surfaces::s09_routines::panel::{Failure, Page};

use crate::app::App;
use crate::host::HostError;
use crate::source::Source;

use calls::{Answer, Call, Calls, Listed};
use detail::Detail;
use form::{Form, KeyRead, TriggerKind, fields_of, refusal_of};
use listing::{Held, landed};

pub use view::{layers, view};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Scope {
	pub conversation_id: String,
	pub lead_bot_id: Option<String>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Leaving {
	Back,
	Close,
}

#[derive(Clone, Debug, PartialEq, Eq)]
struct Deleting {
	routine_id: String,
	is_busy: bool,
	has_failed: bool,
}

#[derive(Default)]
pub struct State {
	scope: Option<Scope>,
	held: Option<Held>,
	list_generation: u64,
	counter: u64,
	is_showing_routines: bool,
	has_write_failed: bool,
	detail: Option<Detail>,
	form: Option<Form>,
	deleting: Option<Deleting>,
	leaving: Option<Leaving>,
	copies: Vec<String>,
	scratch: TextEdit,
	queued: Vec<Call>,
	source: Option<Source>,
	waker: Option<Waker>,
	calls: Option<Calls>,
}

fn now_ms() -> i64 {
	SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.map_or(0, |elapsed| i64::try_from(elapsed.as_millis()).unwrap_or(i64::MAX))
}

fn failure_text(failure: &HostError) -> String {
	format!("{}: {}", failure.title(), failure.detail())
}

fn unknown_source(source_id: &str) -> TriggerSource {
	TriggerSource {
		id: source_id.to_owned(),
		title: source_id.to_owned(),
		payload: Vec::new(),
		dedupe_key: String::new(),
		header: None,
	}
}

fn edit_of_routine(routine: &Routine, is_enabled: bool) -> RoutineEdit {
	RoutineEdit {
		title: routine.title.clone(),
		instruction: routine.instruction.clone(),
		filter: routine.filter.clone(),
		trigger_config: routine.trigger_config.clone(),
		is_enabled,
	}
}

impl State {
	pub fn attach(&mut self, waker: Waker) {
		self.waker = Some(waker);
		self.flush();
	}

	fn use_source(&mut self, source: Source) {
		self.source.get_or_insert(source);
		self.flush();
	}

	pub fn is_open(&self) -> bool {
		self.scope.is_some()
	}

	fn next_count(&mut self) -> u64 {
		self.counter += 1;
		self.counter
	}

	fn wake(&self) {
		if let Some(waker) = self.waker.as_ref() {
			waker();
		}
	}

	fn open(&mut self, scope: Scope) {
		if self.scope.as_ref() != Some(&scope) {
			self.held = None;
		}
		self.reset_pages();
		self.has_write_failed = false;
		self.scope = Some(scope);
		self.reload();
	}

	fn close(&mut self) {
		self.reset_pages();
		self.scope = None;
	}

	fn reset_pages(&mut self) {
		self.is_showing_routines = false;
		self.detail = None;
		self.form = None;
		self.deleting = None;
		self.leaving = None;
	}

	fn reload(&mut self) {
		let Some(scope) = self.scope.clone() else { return };
		let generation = self.next_count();
		self.list_generation = generation;
		self.queued.push(Call::ReadList {
			generation,
			conversation_id: scope.conversation_id,
			lead_bot_id: scope.lead_bot_id,
		});
	}

	fn listed(&mut self, generation: u64, listed: Listed) {
		let Some(scope) = self.scope.as_ref() else { return };
		if generation != self.list_generation {
			return;
		}
		self.held = Some(landed(self.held.take(), listed, scope.lead_bot_id.as_deref()));
		self.has_write_failed = false;
	}

	fn routine(&self, id: &str) -> Option<&Routine> {
		self.held.as_ref()?.routine(id)
	}

	fn shown_detail(&self) -> Option<(&Detail, &Routine)> {
		let detail = self.detail.as_ref()?;
		Some((detail, self.routine(&detail.routine_id)?))
	}

	fn can_create(&self) -> bool {
		self.held.as_ref().is_some_and(|held| !held.offered.is_empty())
	}

	fn page(&self) -> Page {
		if let Some(form) = self.form.as_ref() {
			return Page::Form {
				written: form.is_written(),
				from_detail: self.shown_detail().is_some(),
			};
		}
		if self.shown_detail().is_some() {
			return Page::Detail;
		}
		if self.is_showing_routines {
			return Page::Routines { can_create: self.can_create() };
		}
		Page::Activity
	}

	fn failure(&self) -> Option<Failure> {
		if self.has_write_failed {
			return Some(Failure::Write);
		}
		self.held.as_ref().filter(|held| held.has_failed).map(|_| Failure::Routines)
	}

	fn write_failed(&mut self, what: &str, failure: &HostError) {
		eprintln!("{what}: {}", failure_text(failure));
		self.has_write_failed = true;
	}

	fn set_enabled(&mut self, id: &str, is_enabled: bool) {
		let Some(routine) = self.routine(id) else { return };
		let edit = edit_of_routine(routine, is_enabled);
		self.queued.push(Call::Toggle { id: id.to_owned(), edit });
	}

	fn toggled(&mut self, toggled: Result<Routine, HostError>) {
		match toggled {
			Ok(written) => {
				if let Some(held) = self.held.as_mut() {
					held.replace(written);
				}
				self.has_write_failed = false;
			}
			Err(failure) => self.write_failed("a routine was not turned on or off", &failure),
		}
	}

	fn open_detail(&mut self, routine_id: String) {
		let mut detail = Detail::opened(routine_id, self.next_count());
		let generation = self.next_count();
		self.queued.push(detail.read_runs(generation));
		self.detail = Some(detail);
	}

	fn reread_runs(&mut self) {
		let generation = self.next_count();
		if let Some(detail) = self.detail.as_mut() {
			self.queued.push(detail.read_runs(generation));
		}
	}

	fn retry_runs(&mut self) {
		if self.detail.as_ref().is_some_and(|detail| !detail.is_reading) {
			self.reread_runs();
		}
	}

	fn run_now(&mut self) {
		let call = self.detail.as_mut().and_then(Detail::run_now);
		self.queued.extend(call);
	}

	fn ran_now(&mut self, opened: u64, decision: Result<TriggerDecision, HostError>) {
		if let Err(failure) = &decision {
			self.write_failed("a routine did not run now", failure);
		}
		if let Some(detail) = self.detail.as_mut().filter(|detail| detail.opened == opened) {
			detail.decided(decision.as_ref().ok());
		}
	}

	fn sources_for(&self, routine: Option<&Routine>) -> Vec<TriggerSource> {
		let Some(held) = self.held.as_ref() else { return Vec::new() };
		let mut sources = held.offered.clone();
		let Some(routine) = routine else { return sources };
		if sources.iter().any(|source| source.id == routine.trigger_source_id) {
			return sources;
		}
		let carried = held
			.known_source(&routine.bot_id, &routine.trigger_source_id)
			.cloned()
			.unwrap_or_else(|| unknown_source(&routine.trigger_source_id));
		sources.push(carried);
		sources
	}

	fn form_routine(&self) -> Option<&Routine> {
		let routine_id = self.form.as_ref()?.routine_id.as_deref()?;
		self.routine(routine_id)
	}

	fn form_sources(&self) -> Vec<TriggerSource> {
		self.sources_for(self.form_routine())
	}

	fn open_new_form(&mut self) {
		if self.can_create() {
			self.form = Some(Form::new_routine(self.next_count()));
		}
	}

	fn show_form(&mut self, routine: &Routine) {
		let placement = self.next_count();
		let sources = self.sources_for(Some(routine));
		let fields = fields_of(&sources, &routine.trigger_source_id);
		let form = Form::of_routine(routine, placement, fields);
		if form.kind() == TriggerKind::LocalWebhook {
			self.queued.push(Call::ReadKey { placement, routine_id: routine.id.clone() });
		}
		self.form = Some(form);
	}

	fn edit_detail(&mut self) {
		let routine = self.shown_detail().map(|(_, routine)| routine.clone());
		if let Some(routine) = routine {
			self.show_form(&routine);
		}
	}

	fn write_of(&self, form: &Form, sources: &[TriggerSource]) -> Option<Call> {
		let fields = fields_of(sources, &form.trigger_source_id);
		let placement = form.placement;
		let Some(routine_id) = form.routine_id.as_ref() else {
			let scope = self.scope.as_ref()?;
			let draft = RoutineDraft {
				conversation_id: scope.conversation_id.clone(),
				bot_id: scope.lead_bot_id.clone()?,
				title: form.title.text.clone(),
				instruction: form.instruction.text.clone(),
				trigger_source_id: form.trigger_source_id.clone(),
				filter: form.filter(fields, None),
				trigger_config: form.trigger_config(),
			};
			return Some(Call::Create { placement, draft });
		};
		let routine = self.routine(routine_id)?;
		let edit = RoutineEdit {
			title: form.title.text.clone(),
			instruction: form.instruction.text.clone(),
			filter: form.filter(fields, Some(&routine.filter)),
			trigger_config: form.trigger_config(),
			is_enabled: routine.is_enabled,
		};
		Some(Call::Edit { placement, id: routine_id.clone(), edit })
	}

	fn save(&mut self) {
		let sources = self.form_sources();
		let Some(mut form) = self.form.take() else { return };
		let fields = fields_of(&sources, &form.trigger_source_id);
		if !form.is_saving && !form.refuses_rows(fields) {
			match self.write_of(&form, &sources) {
				Some(call) => {
					form.is_saving = true;
					self.queued.push(call);
				}
				None => {
					form.keep_entered(None);
					eprintln!("a routine was not saved: its conversation, lead or routine is gone");
					self.has_write_failed = true;
				}
			}
		}
		self.form = Some(form);
	}

	fn open_form_placement(&self) -> Option<u64> {
		self.form.as_ref().map(|form| form.placement)
	}

	fn saved(&mut self, placement: u64, saved: Result<Routine, HostError>) {
		let is_still_open = self.open_form_placement() == Some(placement);
		match saved {
			Ok(routine) => {
				if let Some(held) = self.held.as_mut() {
					held.hold(routine.clone());
				}
				self.has_write_failed = false;
				if !is_still_open {
					return;
				}
				if self.shown_detail().is_some() {
					self.form = None;
					return;
				}
				self.show_form(&routine);
			}
			Err(failure) => {
				let refused = if is_still_open { refusal_of(&failure) } else { None };
				if let Some(form) = self.form.as_mut().filter(|_| is_still_open) {
					form.is_saving = false;
					form.keep_entered(refused);
				}
				if refused.is_none() {
					self.write_failed("a routine was not saved", &failure);
				}
			}
		}
	}

	fn key_read(&mut self, placement: u64, key: Result<RoutineKey, HostError>) {
		let Some(form) = self.form.as_mut().filter(|form| form.placement == placement) else {
			return;
		};
		form.key = match key {
			Ok(key) => KeyRead::Read(key),
			Err(failure) => {
				eprintln!("the webhook key was not read: {}", failure_text(&failure));
				KeyRead::Failed
			}
		};
	}

	fn copy(&mut self, part: WebhookPart) {
		let Some(KeyRead::Read(key)) = self.form.as_ref().map(|form| &form.key) else { return };
		let text = match part {
			WebhookPart::Address => key.url.clone().unwrap_or_default(),
			WebhookPart::Key => key.key.clone(),
			WebhookPart::Header => key.header.clone().unwrap_or_default(),
		};
		if !text.is_empty() {
			self.copies.push(text);
		}
	}

	fn ask_delete(&mut self, routine_id: String) {
		if self.routine(&routine_id).is_some() {
			self.deleting = Some(Deleting { routine_id, is_busy: false, has_failed: false });
		}
	}

	fn confirm_delete(&mut self) {
		let Some(deleting) = self.deleting.as_mut().filter(|deleting| !deleting.is_busy) else {
			return;
		};
		deleting.is_busy = true;
		deleting.has_failed = false;
		self.queued.push(Call::Delete(deleting.routine_id.clone()));
	}

	fn deleted(&mut self, id: &str, outcome: Result<(), HostError>) {
		let is_asked = self.deleting.as_ref().is_some_and(|deleting| deleting.routine_id == id);
		match outcome {
			Ok(()) => {
				if let Some(held) = self.held.as_mut() {
					held.remove(id);
				}
				self.has_write_failed = false;
				if is_asked {
					self.deleting = None;
				}
			}
			Err(failure) => {
				eprintln!("the routine {id} was not deleted: {}", failure_text(&failure));
				if let Some(deleting) = self.deleting.as_mut().filter(|_| is_asked) {
					deleting.is_busy = false;
					deleting.has_failed = true;
				}
			}
		}
	}

	fn ask_leaving(&mut self, way: Leaving) {
		if self.form.as_ref().is_some_and(Form::is_unsaved) {
			self.leaving = Some(way);
			return;
		}
		self.leave(way);
	}

	fn leave(&mut self, way: Leaving) {
		self.leaving = None;
		match way {
			Leaving::Close => self.close(),
			Leaving::Back => self.back(),
		}
	}

	fn back(&mut self) {
		if self.form.is_some() {
			self.form = None;
		} else if self.shown_detail().is_some() {
			self.detail = None;
		} else {
			self.is_showing_routines = false;
		}
	}

	fn confirm(&mut self) {
		match self.leaving {
			Some(way) => self.leave(way),
			None => self.confirm_delete(),
		}
	}

	fn cancel(&mut self) {
		if self.leaving.take().is_some() {
			return;
		}
		if self.deleting.as_ref().is_some_and(|deleting| !deleting.is_busy) {
			self.deleting = None;
		}
	}

	fn pick(&mut self, picker: Picker) {
		let sources = self.form_sources();
		if let Some(form) = self.form.as_mut() {
			form.pick(picker, &sources);
		}
	}

	fn add_filter_row(&mut self) {
		let sources = self.form_sources();
		if let Some(form) = self.form.as_mut() {
			let fields = fields_of(&sources, &form.trigger_source_id).to_vec();
			form.add_row(&fields);
		}
	}

	fn routine_changed(&mut self, conversation_id: &str) {
		let is_shown =
			self.scope.as_ref().is_some_and(|scope| scope.conversation_id == conversation_id);
		if !is_shown {
			return;
		}
		self.reload();
		self.reread_runs();
	}

	fn routines_event(&mut self, event: RoutinesEvent) {
		match event {
			RoutinesEvent::ClosePanel => self.ask_leaving(Leaving::Close),
			RoutinesEvent::Back => self.ask_leaving(Leaving::Back),
			RoutinesEvent::OpenRoutines => self.is_showing_routines = true,
			RoutinesEvent::NewRoutine => self.open_new_form(),
			RoutinesEvent::Retry => self.reload(),
			RoutinesEvent::ToggleEarlierToday => {}
			RoutinesEvent::Open(routine_id) => self.open_detail(routine_id),
			RoutinesEvent::SetEnabled(routine_id, is_enabled) => {
				self.set_enabled(&routine_id, is_enabled)
			}
			RoutinesEvent::AskDelete(routine_id) => self.ask_delete(routine_id),
			RoutinesEvent::Edit => self.edit_detail(),
			RoutinesEvent::RunNow => self.run_now(),
			RoutinesEvent::RetryRuns => self.retry_runs(),
			RoutinesEvent::Pick(picker) => self.pick(picker),
			RoutinesEvent::AddFilterRow => self.add_filter_row(),
			RoutinesEvent::RemoveFilterRow(rank) => {
				if let Some(form) = self.form.as_mut() {
					form.remove_row(rank);
				}
			}
			RoutinesEvent::Copy(part) => self.copy(part),
			RoutinesEvent::Save => self.save(),
			RoutinesEvent::Confirm => self.confirm(),
			RoutinesEvent::Cancel => self.cancel(),
		}
	}

	fn answered(&mut self, answer: Answer) {
		match answer {
			Answer::Listed { generation, listed } => self.listed(generation, listed),
			Answer::Runs { generation, runs } => {
				if let Some(detail) = self.detail.as_mut() {
					detail.runs_read(generation, runs, now_ms());
				}
			}
			Answer::Toggled(toggled) => self.toggled(toggled),
			Answer::Saved { placement, saved } => self.saved(placement, saved),
			Answer::Deleted { id, outcome } => self.deleted(&id, outcome),
			Answer::RanNow { opened, decision } => self.ran_now(opened, decision),
			Answer::Key { placement, key } => self.key_read(placement, key),
		}
	}

	fn take_answers(&mut self) -> Vec<Answer> {
		self.calls.as_ref().map(Calls::answers).unwrap_or_default()
	}

	fn flush(&mut self) {
		if self.calls.is_none()
			&& let (Some(source), Some(waker)) = (self.source.as_ref(), self.waker.as_ref())
		{
			self.calls = Some(Calls::new(source.clone(), waker.clone()));
		}
		let Some(calls) = self.calls.as_ref() else { return };
		for call in self.queued.drain(..) {
			calls.send(call);
		}
	}
}

fn state(app: &mut App) -> &mut State {
	&mut app.surfaces.s09_routines
}

fn language(app: &App) -> Language {
	app.surfaces.s12_person_settings.language()
}

pub fn open_panel(app: &mut App, scope: Scope) {
	let Some(source) = app.ready().map(|ready| ready.source.clone()) else { return };
	let routines = state(app);
	routines.use_source(source);
	routines.open(scope);
	routines.flush();
}

pub fn routine_changed(app: &mut App, conversation_id: &str) {
	let routines = state(app);
	routines.routine_changed(conversation_id);
	routines.flush();
}

pub fn routines_event(app: &mut App, event: RoutinesEvent) {
	let routines = state(app);
	routines.routines_event(event);
	routines.flush();
	if !routines.copies.is_empty() {
		routines.wake();
	}
}

pub fn edit_of(app: &mut App, field: FormField) -> &mut TextEdit {
	let routines = state(app);
	routines.form.as_mut().and_then(|form| form.edit(field)).unwrap_or(&mut routines.scratch)
}

pub fn poll(app: &mut App, tx: &mut Tx) -> bool {
	let routines = state(app);
	let answers = routines.take_answers();
	let copies = std::mem::take(&mut routines.copies);
	let is_changed = !answers.is_empty() || !copies.is_empty();
	for answer in answers {
		routines.answered(answer);
	}
	for text in copies {
		tx.copy(text);
	}
	routines.flush();
	is_changed
}
