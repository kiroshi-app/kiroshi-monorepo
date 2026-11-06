use std::process::Command;

const DEV_EXECUTABLE: &str = "Kiroshi";

const BUNDLED: &str = ".app/Contents/";

pub fn dev_host_ports() -> Result<Vec<u16>, String> {
	let listening = run("lsof", &["-nP", "-iTCP@127.0.0.1", "-sTCP:LISTEN", "-Fpn"])?;
	let mut ports = Vec::new();
	for (pid, port) in listeners(&listening) {
		if is_dev_host(pid)? && !ports.contains(&port) {
			ports.push(port);
		}
	}
	Ok(ports)
}

fn listeners(lsof: &str) -> Vec<(u32, u16)> {
	let mut pid = None;
	let mut found = Vec::new();
	for line in lsof.lines() {
		if let Some(held) = line.strip_prefix('p') {
			pid = held.parse().ok();
		} else if let (Some(name), Some(pid)) = (line.strip_prefix('n'), pid)
			&& let Some(port) = name.rsplit_once(':').and_then(|(_, port)| port.parse().ok())
		{
			found.push((pid, port));
		}
	}
	found
}

fn is_dev_host(pid: u32) -> Result<bool, String> {
	let args = run("ps", &["-o", "args=", "-p", &pid.to_string()])?;
	let executable = args.split_whitespace().next().unwrap_or("");
	let name = executable.rsplit('/').next().unwrap_or("");
	Ok(name == DEV_EXECUTABLE && !executable.contains(BUNDLED))
}

// lsof and ps exit 1 when nothing matches, an empty answer rather than a failure.
fn run(program: &str, args: &[&str]) -> Result<String, String> {
	let output = Command::new(program)
		.args(args)
		.output()
		.map_err(|failure| format!("{program} did not run: {failure}"))?;
	Ok(String::from_utf8_lossy(&output.stdout).into_owned())
}

#[cfg(test)]
mod tests {
	use super::*;

	#[test]
	fn listeners_pair_each_port_with_its_process() {
		let lsof =
			"p947\nf57\nn127.0.0.1:29979\nf71\nn127.0.0.1:50162\np950\nf40\nn127.0.0.1:9277\n";
		assert_eq!(listeners(lsof), vec![(947, 29979), (947, 50162), (950, 9277)]);
	}
}
