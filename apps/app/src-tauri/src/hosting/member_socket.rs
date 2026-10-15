use std::collections::{BTreeMap, BTreeSet};
use std::io;
use std::path::{Path, PathBuf};

use serde_json::{json, Map, Value};
use specta::datatype::{
	DataType, Enum, Fields, Function, NamedDataType, NamedReferenceType, Primitive, Reference,
	Tuple,
};
use specta::{Format, Type, Types};
use specta_serde::{select_phase_datatype, Phase, PhasesFormat};
use tauri_specta::{BuilderConfiguration, LanguageExt};

use super::reach::{Audience, Reach, AUDIENCES, REACHES};
use crate::events::{self, Event};

type Definition = fn(&mut Types) -> DataType;

const fn payload_of<P: Type>(event: Event<P>) -> (&'static str, Definition) {
	(event.name(), P::definition)
}

const PAYLOADS: &[(&str, Definition)] = &[
	payload_of(events::AGENT_EVENT),
	payload_of(events::APPLICATION_INSTALLED),
	payload_of(events::COMPANION_CREATED),
	payload_of(events::COMPANION_DELETED),
	payload_of(events::COMPANION_UPDATED),
	payload_of(events::COMPANION_ARRIVED),
	payload_of(events::COMPANION_SPOKE),
	payload_of(events::CONVERSATION_CREATED),
	payload_of(events::CONVERSATION_DELETED),
	payload_of(events::MESSAGE_STORED),
	payload_of(events::CONVERSATION_UPDATED),
	payload_of(events::HOSTING_CHANGED),
	payload_of(events::MEMBERS_CHANGED),
	payload_of(events::MISSION_CHANGED),
	payload_of(events::ROUTINE_CHANGED),
];

const FRAME_NAMES: [&str; 3] = ["CallFrame", "AnswerFrame", "EventFrame"];

fn guest_commands() -> BTreeSet<&'static str> {
	REACHES
		.iter()
		.filter(|(_, reach)| matches!(reach, Reach::Free | Reach::Scoped(_)))
		.map(|(command, _)| *command)
		.collect()
}

fn guest_events() -> BTreeSet<&'static str> {
	AUDIENCES
		.iter()
		.filter(|(_, audience)| {
			matches!(audience, Audience::Scoped(_) | Audience::ScopedOrHostWide(_))
		})
		.map(|(event, _)| *event)
		.collect()
}

struct MemberSocketSchema;

impl LanguageExt for MemberSocketSchema {
	type Error = io::Error;

	fn export(self, cfg: &BuilderConfiguration, path: &Path) -> io::Result<()> {
		let schema = member_socket_schema(cfg).map_err(io::Error::other)?;
		let rendered = serde_json::to_string_pretty(&schema).map_err(io::Error::other)?;
		std::fs::write(path, format!("{rendered}\n"))
	}
}

fn member_socket_schema(cfg: &BuilderConfiguration) -> Result<Value, String> {
	let mut types = cfg.types.clone();
	let payloads = payload_definitions(&mut types)?;
	let mapped = PhasesFormat.map_types(&types).map_err(|error| error.to_string())?;
	let mut walker = Walker { types: &mapped, defs: frames(), origins: BTreeMap::new() };

	let mut commands = Map::new();
	for command in guest_commands() {
		let function =
			cfg.commands.iter().find(|function| function.name() == command).ok_or_else(|| {
				format!("the guest command {command} is not registered with specta")
			})?;
		commands.insert(command.to_owned(), walker.command(function));
	}
	let mut events = Map::new();
	for (event, payload) in payloads {
		let schema = walker.schema(&payload, Phase::Serialize, &Generics::new());
		events.insert(event.to_owned(), json!({ "payload": schema }));
	}

	Ok(json!({
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"title": "Kiroshi relay member socket",
		"description": "One text frame of the member socket. member-socket.md tells how they are exchanged.",
		"oneOf": FRAME_NAMES.map(|frame| json!({ "$ref": format!("#/$defs/{frame}") })),
		"commands": commands,
		"events": events,
		"$defs": walker.defs,
	}))
}

fn payload_definitions(types: &mut Types) -> Result<Vec<(&'static str, DataType)>, String> {
	let guest_events = guest_events();
	let tabled: BTreeSet<&str> = PAYLOADS.iter().map(|(event, _)| *event).collect();
	let untabled: Vec<&&str> = guest_events.difference(&tabled).collect();
	if !untabled.is_empty() {
		return Err(format!("the guest events {untabled:?} have no payload type in PAYLOADS"));
	}
	let unreached: Vec<&&str> = tabled.difference(&guest_events).collect();
	if !unreached.is_empty() {
		return Err(format!("PAYLOADS still lists {unreached:?}, which no guest hears"));
	}
	Ok(PAYLOADS.iter().map(|(event, definition)| (*event, definition(types))).collect())
}

fn frames() -> BTreeMap<String, Value> {
	let id = json!({ "type": ["string", "number"] });
	BTreeMap::from([
		(
			"CallFrame".to_owned(),
			json!({
				"description": "A member calls one command of the host. args defaults to {} when absent.",
				"type": "object",
				"properties": {
					"id": id,
					"command": { "type": "string" },
					"args": { "type": "object" },
				},
				"required": ["id", "command"],
			}),
		),
		(
			"AnswerFrame".to_owned(),
			json!({
				"description": "The host answers one call. id is null when the call carried no usable id.",
				"type": "object",
				"properties": {
					"id": { "anyOf": [id, { "type": "null" }] },
					"status": { "type": "integer" },
					"body": true,
				},
				"required": ["id", "status", "body"],
			}),
		),
		(
			"EventFrame".to_owned(),
			json!({
				"description": "An event the host published, forwarded inside one more event key.",
				"type": "object",
				"properties": {
					"event": {
						"type": "object",
						"properties": {
							"event": { "type": "string" },
							"payload": true,
						},
						"required": ["event", "payload"],
					},
				},
				"required": ["event"],
			}),
		),
	])
}

type Generics = BTreeMap<String, Value>;

struct Walker<'a> {
	types: &'a Types,
	defs: BTreeMap<String, Value>,
	origins: BTreeMap<String, String>,
}

impl Walker<'_> {
	fn command(&mut self, function: &Function) -> Value {
		let mut properties = Map::new();
		let mut required = Vec::new();
		for (name, argument) in function.args() {
			let name = camel_cased(name);
			if !matches!(argument, DataType::Nullable(_)) {
				required.push(name.clone());
			}
			properties.insert(name, self.schema(argument, Phase::Deserialize, &Generics::new()));
		}
		let mut entry = Map::new();
		entry.insert(
			"args".to_owned(),
			json!({ "type": "object", "properties": properties, "required": required }),
		);
		let (ok, error) = self.answer_halves(function.result());
		entry.insert("ok".to_owned(), self.schema(&ok, Phase::Serialize, &Generics::new()));
		if let Some(error) = error {
			entry.insert(
				"error".to_owned(),
				self.schema(&error, Phase::Serialize, &Generics::new()),
			);
		}
		Value::Object(entry)
	}

	fn answer_halves(&self, result: Option<&DataType>) -> (DataType, Option<DataType>) {
		let Some(result) = result else {
			return (DataType::Tuple(Tuple::new(Vec::new())), None);
		};
		if let DataType::Reference(Reference::Named(named)) = result {
			let is_result = self.types.get(named).is_some_and(|ndt| {
				ndt.name == "Result" && matches!(&*ndt.module_path, "std::result" | "core::result")
			});
			if let NamedReferenceType::Reference { generics, .. } = &named.inner {
				if let ([(_, ok), (_, error), ..], true) = (generics.as_slice(), is_result) {
					return (ok.clone(), Some(error.clone()));
				}
			}
		}
		(result.clone(), None)
	}

	fn schema(&mut self, dt: &DataType, phase: Phase, generics: &Generics) -> Value {
		match dt {
			DataType::Primitive(primitive) => primitive_schema(primitive),
			DataType::List(list) => {
				let mut schema =
					json!({ "type": "array", "items": self.schema(&list.ty, phase, generics) });
				if let Some(length) = list.length {
					schema["minItems"] = json!(length);
					schema["maxItems"] = json!(length);
				}
				if list.unique {
					schema["uniqueItems"] = json!(true);
				}
				schema
			}
			DataType::Map(map) => {
				let mut schema = json!({
					"type": "object",
					"additionalProperties": self.schema(map.value_ty(), phase, generics),
				});
				let keys = self.schema(map.key_ty(), phase, generics);
				if keys.get("enum").is_some() || keys.get("const").is_some() {
					schema["propertyNames"] = keys;
				}
				schema
			}
			DataType::Struct(structure) => self.fields(&structure.fields, phase, generics),
			DataType::Enum(enumeration) => self.enumeration(enumeration, phase, generics),
			DataType::Tuple(tuple) if tuple.elements.is_empty() => json!({ "type": "null" }),
			DataType::Tuple(tuple) => {
				let elements: Vec<&DataType> = tuple.elements.iter().collect();
				self.tuple(&elements, phase, generics)
			}
			DataType::Nullable(inner) => {
				json!({ "anyOf": [self.schema(inner, phase, generics), { "type": "null" }] })
			}
			DataType::Intersection(parts) => {
				let parts: Vec<Value> =
					parts.iter().map(|part| self.schema(part, phase, generics)).collect();
				json!({ "allOf": parts })
			}
			DataType::Generic(generic) => {
				generics.get(generic.name().as_ref()).cloned().unwrap_or_else(|| {
					panic!("the generic {} is bound by no reference", generic.name())
				})
			}
			DataType::Reference(_) => self.reference(dt, phase, generics),
		}
	}

	fn reference(&mut self, dt: &DataType, phase: Phase, generics: &Generics) -> Value {
		let selected = select_phase_datatype(dt, self.types, phase);
		let reference = match &selected {
			DataType::Reference(reference) => reference,
			other => return self.schema(other, phase, generics),
		};
		let named = match reference {
			Reference::Named(named) => named,
			Reference::Opaque(_) if is_unknown(reference) => return json!(true),
			Reference::Opaque(opaque) => {
				panic!("the opaque type {} has no json schema", opaque.type_name())
			}
		};
		let ndt = self.types.get(named).unwrap_or_else(|| panic!("{named:?} is not registered"));
		match &named.inner {
			NamedReferenceType::Inline { dt, .. } => self.schema(dt, phase, generics),
			NamedReferenceType::Reference { generics: bound, .. } if !bound.is_empty() => {
				let bound: Generics = bound
					.iter()
					.map(|(generic, dt)| {
						(generic.name().to_string(), self.schema(dt, phase, generics))
					})
					.collect();
				match &ndt.ty {
					Some(ty) => self.schema(ty, phase, &bound),
					None => json!(true),
				}
			}
			NamedReferenceType::Reference { .. } | NamedReferenceType::Recursive(_) => {
				self.defined(ndt, phase)
			}
		}
	}

	fn defined(&mut self, ndt: &NamedDataType, phase: Phase) -> Value {
		let name = ndt.name.to_string();
		let origin = format!("{}::{name}", ndt.module_path);
		match self.origins.get(&name) {
			Some(known) if *known != origin => {
				panic!("two types share the schema name {name}: {known} and {origin}")
			}
			Some(_) => {}
			None => {
				assert!(!self.defs.contains_key(&name), "the type {origin} shadows a frame");
				self.origins.insert(name.clone(), origin);
				let body = match &ndt.ty {
					Some(ty) => self.schema(ty, phase, &Generics::new()),
					None => json!(true),
				};
				self.defs.insert(name.clone(), body);
			}
		}
		json!({ "$ref": format!("#/$defs/{name}") })
	}

	fn enumeration(&mut self, enumeration: &Enum, phase: Phase, generics: &Generics) -> Value {
		let mut schemas: Vec<Value> = enumeration
			.variants
			.iter()
			.filter(|(_, variant)| !variant.skip)
			.map(|(name, variant)| match &variant.fields {
				Fields::Unit => json!({ "const": name }),
				fields => self.fields(fields, phase, generics),
			})
			.collect();
		let constants: Option<Vec<Value>> = schemas
			.iter()
			.map(|schema| schema.as_object().filter(|keys| keys.len() == 1)?.get("const").cloned())
			.collect();
		match (schemas.len(), constants) {
			(0, _) => json!(false),
			(1, _) => schemas.remove(0),
			(_, Some(constants)) => json!({ "enum": constants }),
			(_, None) => json!({ "anyOf": schemas }),
		}
	}

	fn fields(&mut self, fields: &Fields, phase: Phase, generics: &Generics) -> Value {
		match fields {
			Fields::Unit => json!({ "type": "null" }),
			Fields::Unnamed(unnamed) => {
				let live: Vec<&DataType> =
					unnamed.fields.iter().filter_map(|field| field.ty.as_ref()).collect();
				match live.as_slice() {
					[only] if unnamed.fields.len() == 1 => self.schema(only, phase, generics),
					_ => self.tuple(&live, phase, generics),
				}
			}
			Fields::Named(named) => {
				let mut properties = Map::new();
				let mut required = Vec::new();
				for (name, field) in &named.fields {
					let Some(ty) = &field.ty else {
						continue;
					};
					if !field.optional {
						required.push(name.to_string());
					}
					properties.insert(name.to_string(), self.schema(ty, phase, generics));
				}
				json!({ "type": "object", "properties": properties, "required": required })
			}
		}
	}

	fn tuple(&mut self, elements: &[&DataType], phase: Phase, generics: &Generics) -> Value {
		let items: Vec<Value> =
			elements.iter().map(|element| self.schema(element, phase, generics)).collect();
		json!({
			"type": "array",
			"prefixItems": items,
			"items": false,
			"minItems": elements.len(),
		})
	}
}

fn is_unknown(reference: &Reference) -> bool {
	match specta_typescript::Unknown::<()>::definition(&mut Types::default()) {
		DataType::Reference(unknown) => reference.ty_eq(&unknown),
		_ => false,
	}
}

fn primitive_schema(primitive: &Primitive) -> Value {
	match primitive {
		Primitive::i8
		| Primitive::i16
		| Primitive::i32
		| Primitive::i64
		| Primitive::i128
		| Primitive::isize => json!({ "type": "integer" }),
		Primitive::u8
		| Primitive::u16
		| Primitive::u32
		| Primitive::u64
		| Primitive::u128
		| Primitive::usize => json!({ "type": "integer", "minimum": 0 }),
		Primitive::f16 | Primitive::f32 | Primitive::f64 | Primitive::f128 => {
			json!({ "type": "number" })
		}
		Primitive::bool => json!({ "type": "boolean" }),
		Primitive::char => json!({ "type": "string", "minLength": 1, "maxLength": 1 }),
		Primitive::str => json!({ "type": "string" }),
	}
}

fn camel_cased(snake: &str) -> String {
	let mut words = snake.split('_');
	let first = words.next().unwrap_or_default().to_owned();
	words.fold(first, |mut camel, word| {
		let mut letters = word.chars();
		if let Some(initial) = letters.next() {
			camel.extend(initial.to_uppercase());
			camel.push_str(letters.as_str());
		}
		camel
	})
}

fn committed_path() -> PathBuf {
	PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../../../docs/relay/member-socket.schema.json")
}

#[cfg(test)]
mod tests {
	use super::*;
	use crate::removed_on_drop::RemovedOnDrop;

	const REGENERATE: &str = "bun run snapshots";

	fn committed() -> Value {
		let committed = std::fs::read_to_string(committed_path()).expect("the schema reads");
		serde_json::from_str(&committed).expect("the schema is json")
	}

	fn generated() -> String {
		let path = RemovedOnDrop(
			std::env::temp_dir()
				.join(format!("kiroshi-member-socket-{}.schema.json", uuid::Uuid::new_v4())),
		);
		crate::commands::builder()
			.export(MemberSocketSchema, &path)
			.unwrap_or_else(|error| panic!("the member socket schema is not generated: {error}"));
		let generated = std::fs::read_to_string(&path).expect("the generated schema reads back");
		std::fs::remove_file(&path).expect("the generated schema is cleaned up");
		generated
	}

	fn entries(schema: &Value, section: &str) -> BTreeSet<String> {
		schema[section]
			.as_object()
			.unwrap_or_else(|| panic!("the schema holds no {section} object"))
			.keys()
			.cloned()
			.collect()
	}

	fn first_difference(held: &Value, live: &Value, path: String) -> Option<String> {
		match (held, live) {
			(Value::Object(held), Value::Object(live)) => {
				let keys: BTreeSet<&String> = held.keys().chain(live.keys()).collect();
				keys.into_iter().find_map(|key| match (held.get(key), live.get(key)) {
					(Some(held), Some(live)) => {
						first_difference(held, live, format!("{path}.{key}"))
					}
					_ => Some(format!("{path}.{key}")),
				})
			}
			(Value::Array(held), Value::Array(live)) => {
				let longest = held.len().max(live.len());
				(0..longest).find_map(|index| match (held.get(index), live.get(index)) {
					(Some(held), Some(live)) => {
						first_difference(held, live, format!("{path}[{index}]"))
					}
					_ => Some(format!("{path}[{index}]")),
				})
			}
			_ => (held != live).then_some(path),
		}
	}

	fn differing_path(held: &str, live: &str) -> String {
		let held: Value = serde_json::from_str(held).expect("the committed schema is json");
		let live: Value = serde_json::from_str(live).expect("the generated schema is json");
		first_difference(&held, &live, "$".to_owned())
			.unwrap_or_else(|| "no json path, only its layout".to_owned())
	}

	fn assert_holds_exactly(section: &str, held: &BTreeSet<String>, reached: &BTreeSet<&str>) {
		let reached: BTreeSet<String> = reached.iter().map(|name| (*name).to_owned()).collect();
		let missing: Vec<&String> = reached.difference(held).collect();
		assert!(
			missing.is_empty(),
			"the committed schema has no {section} entry for {missing:?}, regenerate it with `{REGENERATE}`"
		);
		let unreached: Vec<&String> = held.difference(&reached).collect();
		assert!(
			unreached.is_empty(),
			"the committed schema still holds {section} {unreached:?}, out of the guest reach, regenerate it with `{REGENERATE}`"
		);
	}

	#[test]
	fn the_committed_schema_holds_every_guest_command_and_event_and_nothing_else() {
		let schema = committed();

		assert_holds_exactly("commands", &entries(&schema, "commands"), &guest_commands());
		assert_holds_exactly("events", &entries(&schema, "events"), &guest_events());
	}

	#[test]
	fn the_committed_schema_is_the_one_the_specta_types_produce() {
		let live = generated();
		if std::env::var_os("UPDATE_SNAPSHOTS").is_some() {
			std::fs::write(committed_path(), &live).expect("the schema is written");
			return;
		}
		let held = std::fs::read_to_string(committed_path()).expect("the schema reads");

		assert!(
			held == live,
			"docs/relay/member-socket.schema.json differs from the specta types at {}, regenerate it with `{REGENERATE}`",
			differing_path(&held, &live)
		);
	}

	#[test]
	fn a_differing_schema_names_its_first_differing_json_path() {
		let held = r#"{ "commands": { "a": { "args": [1, 2] }, "b": 1 } }"#;
		let live = r#"{ "commands": { "a": { "args": [1, 3] }, "b": 2 } }"#;
		let grown = r#"{ "commands": { "a": { "args": [1, 2, 3] }, "b": 1 } }"#;

		assert_eq!(differing_path(held, live), "$.commands.a.args[1]");
		assert_eq!(differing_path(held, grown), "$.commands.a.args[2]");
		assert_eq!(differing_path(held, &held.replace(' ', "")), "no json path, only its layout");
	}

	#[test]
	fn the_send_turn_command_crosses_with_its_args_and_its_answer() {
		let send_turn = &committed()["commands"]["conversation_send_turn"];

		assert_eq!(send_turn["args"]["required"], json!(["message", "summoned"]));
		assert_eq!(send_turn["ok"], json!({ "type": "integer" }));
		assert_eq!(send_turn["error"], json!({ "$ref": "#/$defs/TranscriptStoreError" }));
	}

	#[test]
	fn a_snake_cased_argument_crosses_camel_cased() {
		assert_eq!(camel_cased("settled_text"), "settledText");
		assert_eq!(camel_cased("summoned"), "summoned");
		assert_eq!(camel_cased("a_b_c"), "aBC");
	}
}
