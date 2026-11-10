# Naming a tool in a skill

## Write the whole name

An MCP tool has two parts, the server it comes from and the tool itself. Whenever a skill
names one, write it in full as `server:tool` — `github:create_pull_request`, never
`create_pull_request` on its own. The bare name matches nothing, and two servers can carry
the same tool name.

## Which servers you can reach

A session reaches the servers declared in your own `.mcp.json` and those declared in the
system plugin. Nothing else is reachable, whatever else is installed on this computer. Before
a skill names a tool, read those declarations and take the server name from there rather
than from memory.

## You never edit a `.mcp.json`

That file belongs to the person. Adding a server, changing a command, removing one: none of
it is yours, not in your own directory and not anywhere else. When a skill needs a server
that is not declared, say so in your answer and leave the file to the person.

## When the tool is not there

A run can open without the server a skill names, because it was never declared, is turned
off, or is down. Say what to do then on the step that names the tool: give the fallback
that reaches the same result, the command or the request that stands in, and where there is
none, say to stop and name the server that is missing. A skill that names a tool and says
nothing about its absence fails quietly.
