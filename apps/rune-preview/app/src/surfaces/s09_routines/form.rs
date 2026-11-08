use kiroshi_core::routines::contract::{
	FieldType, Filter, FilterMatchMode, FilterOperator, FilterRow, PayloadField, Routine,
	RoutineError, RoutineKey, TriggerSource,
};
use rune::TextEdit;
use serde_json::{Map, Number, Value, json};

use kiroshi_rune_kit::surfaces::s09_routines::form::{FormField, FormRefusal, Picker};

use crate::host::HostError;

const PRESENCE: [FilterOperator; 2] = [FilterOperator::Exists, FilterOperator::NotExists];

const TRUE: &str = "true";

const FALSE: &str = "false";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TriggerKind {
	Plain,
	Schedule,
	FileWatch,
	LocalWebhook,
}

pub fn trigger_kind_of(source_id: &str) -> TriggerKind {
	match source_id {
		"schedule" => TriggerKind::Schedule,
		"file-watch" => TriggerKind::FileWatch,
		"local-webhook" => TriggerKind::LocalWebhook,
		_ => TriggerKind::Plain,
	}
}

pub fn type_of(fields: &[PayloadField], name: &str) -> Option<FieldType> {
	fields.iter().find(|field| field.name == name).map(|field| field.field_type)
}

pub fn takes_value(operator: FilterOperator) -> bool {
	!PRESENCE.contains(&operator)
}

fn operators_of(field_type: Option<FieldType>) -> &'static [FilterOperator] {
	field_type.map_or(&PRESENCE, FieldType::operators)
}

fn blank_value(field_type: Option<FieldType>) -> &'static str {
	if field_type == Some(FieldType::Boolean) { TRUE } else { "" }
}

fn next_of<T: PartialEq + Clone>(options: &[T], current: Option<&T>) -> Option<T> {
	let at = current.and_then(|held| options.iter().position(|option| option == held));
	let next = at.map_or(0, |at| (at + 1) % options.len());
	options.get(next).cloned()
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct ReadAs {
	pub operator: FilterOperator,
	pub field_type: Option<FieldType>,
}

pub struct Row {
	pub field: TextEdit,
	pub is_free_path: bool,
	pub operator: FilterOperator,
	pub value: TextEdit,
	pub read_as: Option<ReadAs>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct RowValues {
	pub field: String,
	pub operator: FilterOperator,
	pub value: String,
}

fn text_of(value: &Value) -> String {
	match value {
		Value::String(text) => text.clone(),
		other => other.to_string(),
	}
}

fn read_type_of(value: Option<&Value>) -> Option<FieldType> {
	match value? {
		Value::Number(_) => Some(FieldType::Number),
		Value::Bool(_) => Some(FieldType::Boolean),
		Value::String(_) => Some(FieldType::String),
		_ => None,
	}
}

fn written_value(text: &str, field_type: Option<FieldType>) -> Value {
	match field_type {
		Some(FieldType::Number) => text
			.trim()
			.parse::<f64>()
			.ok()
			.and_then(Number::from_f64)
			.map_or_else(|| Value::String(text.to_owned()), Value::Number),
		Some(FieldType::Boolean) => Value::Bool(text == TRUE),
		_ => Value::String(text.to_owned()),
	}
}

impl Row {
	fn new(field: &str, operator: FilterOperator, value: &str, is_free_path: bool) -> Row {
		Row {
			field: TextEdit::new(field),
			is_free_path,
			operator,
			value: TextEdit::new(value),
			read_as: None,
		}
	}

	fn appended(fields: &[PayloadField]) -> Row {
		let field = fields.first().map_or("", |field| field.name.as_str());
		let field_type = type_of(fields, field);
		Row::new(field, operators_of(field_type)[0], blank_value(field_type), fields.is_empty())
	}

	fn of_read(read: &FilterRow, fields: &[PayloadField]) -> Row {
		let value = read.value.as_ref().map(text_of).unwrap_or_default();
		let is_free_path = type_of(fields, &read.field).is_none();
		let mut row = Row::new(&read.field, read.operator, &value, is_free_path);
		row.read_as =
			Some(ReadAs { operator: read.operator, field_type: read_type_of(read.value.as_ref()) });
		row
	}

	fn values(&self) -> RowValues {
		RowValues {
			field: self.field.text.clone(),
			operator: self.operator,
			value: self.value.text.clone(),
		}
	}

	fn carried(&mut self, field: &str, held: Option<FieldType>, now: Option<FieldType>) {
		let accepted = operators_of(now);
		if !accepted.contains(&self.operator) {
			self.operator = accepted[0];
		}
		if held != now {
			self.value = TextEdit::new(blank_value(now));
		}
		self.field = TextEdit::new(field);
		self.read_as = None;
	}

	fn named(&mut self, fields: &[PayloadField], field: &str) {
		let held = type_of(fields, &self.field.text);
		self.carried(field, held, type_of(fields, field));
	}

	pub fn declared_type(&self, fields: &[PayloadField]) -> Option<FieldType> {
		type_of(fields, &self.field.text)
	}

	pub fn value_type(&self, fields: &[PayloadField]) -> Option<FieldType> {
		self.declared_type(fields).or(self.read_as.and_then(|read| read.field_type))
	}

	pub fn is_free(&self, fields: &[PayloadField]) -> bool {
		self.is_free_path || self.declared_type(fields).is_none()
	}

	pub fn offered_operators(&self, fields: &[PayloadField]) -> Vec<FilterOperator> {
		let field_type = self.declared_type(fields);
		let accepted = operators_of(field_type);
		let read = match field_type {
			Some(_) => self.operator,
			None => self.read_as.map_or(self.operator, |read| read.operator),
		};
		let mut offered: Vec<FilterOperator> =
			[self.operator, read].into_iter().filter(|kept| !accepted.contains(kept)).collect();
		offered.dedup();
		let fresh: Vec<FilterOperator> =
			accepted.iter().copied().filter(|operator| !offered.contains(operator)).collect();
		offered.extend(fresh);
		offered
	}

	pub fn is_untyped_comparison(&self, fields: &[PayloadField]) -> bool {
		takes_value(self.operator)
			&& self.declared_type(fields).is_none()
			&& self.read_as.and_then(|read| read.field_type).is_none()
	}

	pub fn is_missing_value(&self) -> bool {
		takes_value(self.operator) && self.value.text.trim().is_empty()
	}

	fn written(&self, fields: &[PayloadField]) -> FilterRow {
		let value = takes_value(self.operator)
			.then(|| written_value(&self.value.text, self.value_type(fields)));
		FilterRow { field: self.field.text.clone(), operator: self.operator, value }
	}

	fn is_read_as(&self, read: &FilterRow) -> bool {
		let read_value = read.value.as_ref().map(text_of).unwrap_or_default();
		self.field.text == read.field
			&& self.operator == read.operator
			&& self.value.text == read_value
	}
}

#[derive(Clone, Debug, PartialEq)]
pub struct Values {
	title: String,
	instruction: String,
	trigger_source_id: String,
	expression: String,
	path: String,
	match_mode: FilterMatchMode,
	rows: Vec<RowValues>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Refused {
	Field(FormRefusal),
	Operator { row: usize, operator: FilterOperator, field_type: FieldType },
}

pub fn refusal_of(failure: &HostError) -> Option<Refused> {
	let HostError::CommandFailed { body, .. } = failure else { return None };
	match serde_json::from_str::<RoutineError>(body).ok()? {
		RoutineError::BlankField { field } if field == "title" => {
			Some(Refused::Field(FormRefusal::BlankTitle))
		}
		RoutineError::BlankField { field } if field == "instruction" => {
			Some(Refused::Field(FormRefusal::BlankInstruction))
		}
		RoutineError::UnreadableExpression { .. } => {
			Some(Refused::Field(FormRefusal::UnreadableExpression))
		}
		RoutineError::UnsupportedOperator { row, operator, field_type, .. } => {
			Some(Refused::Operator { row, operator, field_type })
		}
		_ => None,
	}
}

#[derive(Clone, Debug, PartialEq)]
pub enum KeyRead {
	Unread,
	Read(RoutineKey),
	Failed,
}

pub struct Form {
	pub routine_id: Option<String>,
	pub placement: u64,
	pub title: TextEdit,
	pub instruction: TextEdit,
	pub trigger_source_id: String,
	pub expression: TextEdit,
	pub path: TextEdit,
	pub match_mode: FilterMatchMode,
	pub rows: Vec<Row>,
	pub marks_refused_rows: bool,
	pub key: KeyRead,
	pub is_saving: bool,
	refused: Option<(Refused, Values)>,
	saved: Values,
}

fn text_in(trigger_config: &Value, field: &str) -> String {
	trigger_config.get(field).and_then(Value::as_str).unwrap_or_default().to_owned()
}

pub fn fields_of<'a>(sources: &'a [TriggerSource], source_id: &str) -> &'a [PayloadField] {
	sources.iter().find(|source| source.id == source_id).map_or(&[], |source| &source.payload)
}

impl Form {
	pub fn new_routine(placement: u64) -> Form {
		let blank = Values {
			title: String::new(),
			instruction: String::new(),
			trigger_source_id: String::new(),
			expression: String::new(),
			path: String::new(),
			match_mode: FilterMatchMode::All,
			rows: Vec::new(),
		};
		Form {
			routine_id: None,
			placement,
			title: TextEdit::new(""),
			instruction: TextEdit::new(""),
			trigger_source_id: String::new(),
			expression: TextEdit::new(""),
			path: TextEdit::new(""),
			match_mode: FilterMatchMode::All,
			rows: Vec::new(),
			marks_refused_rows: false,
			key: KeyRead::Unread,
			is_saving: false,
			refused: None,
			saved: blank,
		}
	}

	pub fn of_routine(routine: &Routine, placement: u64, fields: &[PayloadField]) -> Form {
		let mut form = Form::new_routine(placement);
		form.routine_id = Some(routine.id.clone());
		form.rows = routine.filter.rows.iter().map(|read| Row::of_read(read, fields)).collect();
		form.title = TextEdit::new(&routine.title);
		form.instruction = TextEdit::new(&routine.instruction);
		form.trigger_source_id = routine.trigger_source_id.clone();
		form.expression = TextEdit::new(text_in(&routine.trigger_config, "expression"));
		form.path = TextEdit::new(text_in(&routine.trigger_config, "path"));
		form.match_mode = routine.filter.match_mode;
		form.saved = form.values();
		form
	}

	pub fn is_written(&self) -> bool {
		self.routine_id.is_some()
	}

	pub fn kind(&self) -> TriggerKind {
		trigger_kind_of(&self.trigger_source_id)
	}

	fn values(&self) -> Values {
		Values {
			title: self.title.text.clone(),
			instruction: self.instruction.text.clone(),
			trigger_source_id: self.trigger_source_id.clone(),
			expression: self.expression.text.clone(),
			path: self.path.text.clone(),
			match_mode: self.match_mode,
			rows: self.rows.iter().map(Row::values).collect(),
		}
	}

	pub fn is_unsaved(&self) -> bool {
		self.values() != self.saved
	}

	pub fn field_refusal(&self) -> Option<FormRefusal> {
		match self.refused {
			Some((Refused::Field(refusal), _)) => Some(refusal),
			_ => None,
		}
	}

	pub fn row_refusal(&self) -> Option<(usize, FilterOperator, FieldType)> {
		let Some((Refused::Operator { row, operator, field_type }, entered)) = &self.refused else {
			return None;
		};
		let current = self.values();
		let is_same_filter = current.trigger_source_id == entered.trigger_source_id
			&& current.match_mode == entered.match_mode
			&& current.rows == entered.rows;
		is_same_filter.then_some((*row, *operator, *field_type))
	}

	pub fn edit(&mut self, field: FormField) -> Option<&mut TextEdit> {
		match field {
			FormField::Title => Some(&mut self.title),
			FormField::Instruction => Some(&mut self.instruction),
			FormField::Expression => Some(&mut self.expression),
			FormField::Path => Some(&mut self.path),
			FormField::FilterPath(rank) => self.rows.get_mut(rank).map(|row| &mut row.field),
			FormField::FilterValue(rank) => self.rows.get_mut(rank).map(|row| &mut row.value),
		}
	}

	pub fn pick(&mut self, picker: Picker, sources: &[TriggerSource]) {
		let fields = fields_of(sources, &self.trigger_source_id).to_vec();
		match picker {
			Picker::Trigger => self.pick_source(sources),
			Picker::MatchMode => {
				self.match_mode = match self.match_mode {
					FilterMatchMode::All => FilterMatchMode::Any,
					FilterMatchMode::Any => FilterMatchMode::All,
				}
			}
			Picker::Field(rank) => self.pick_field(rank, &fields),
			Picker::Operator(rank) => {
				if let Some(row) = self.rows.get_mut(rank) {
					let offered = row.offered_operators(&fields);
					if let Some(operator) = next_of(&offered, Some(&row.operator)) {
						row.operator = operator;
					}
				}
			}
			Picker::Value(rank) => {
				if let Some(row) = self.rows.get_mut(rank) {
					let flipped = if row.value.text == TRUE { FALSE } else { TRUE };
					row.value = TextEdit::new(flipped);
				}
			}
		}
	}

	fn pick_source(&mut self, sources: &[TriggerSource]) {
		if self.is_written() {
			return;
		}
		let ids: Vec<&str> = sources.iter().map(|source| source.id.as_str()).collect();
		let Some(next) = next_of(&ids, Some(&self.trigger_source_id.as_str())) else { return };
		if next == self.trigger_source_id {
			return;
		}
		let was = fields_of(sources, &self.trigger_source_id);
		let now = fields_of(sources, next);
		for row in &mut self.rows {
			let field = row.field.text.clone();
			row.carried(&field, type_of(was, &field), type_of(now, &field));
		}
		self.trigger_source_id = next.to_owned();
	}

	fn pick_field(&mut self, rank: usize, fields: &[PayloadField]) {
		let Some(row) = self.rows.get_mut(rank) else { return };
		let mut names: Vec<Option<String>> =
			fields.iter().map(|field| Some(field.name.clone())).collect();
		names.push(None);
		let current = (!row.is_free(fields)).then(|| row.field.text.clone());
		let Some(next) = next_of(&names, Some(&current)) else { return };
		row.is_free_path = next.is_none();
		row.named(fields, &next.unwrap_or_default());
	}

	pub fn add_row(&mut self, fields: &[PayloadField]) {
		self.rows.push(Row::appended(fields));
	}

	pub fn remove_row(&mut self, rank: usize) {
		if rank < self.rows.len() {
			self.rows.remove(rank);
		}
	}

	pub fn refuses_rows(&mut self, fields: &[PayloadField]) -> bool {
		self.marks_refused_rows =
			self.rows.iter().any(|row| row.is_missing_value() || row.is_untyped_comparison(fields));
		self.marks_refused_rows
	}

	pub fn filter(&self, fields: &[PayloadField], read: Option<&Filter>) -> Filter {
		let read_rows = read.map_or(&[][..], |filter| filter.rows.as_slice());
		let rows = self
			.rows
			.iter()
			.map(|row| {
				read_rows
					.iter()
					.find(|held| row.is_read_as(held))
					.cloned()
					.unwrap_or_else(|| row.written(fields))
			})
			.collect();
		Filter { match_mode: self.match_mode, rows }
	}

	pub fn trigger_config(&self) -> Value {
		match self.kind() {
			TriggerKind::Schedule => json!({ "expression": self.expression.text }),
			TriggerKind::FileWatch => json!({ "path": self.path.text }),
			TriggerKind::Plain | TriggerKind::LocalWebhook => Value::Object(Map::new()),
		}
	}

	pub fn keep_entered(&mut self, refused: Option<Refused>) {
		let entered = self.values();
		self.refused = refused.map(|refused| (refused, entered.clone()));
		self.saved = entered;
	}
}
