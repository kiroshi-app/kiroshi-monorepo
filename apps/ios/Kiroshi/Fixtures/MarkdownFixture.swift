#if DEBUG
    import Foundation

    enum MarkdownFixture {
        static let headings = """
            # Release notes, 4.2
            Thirty-one changes since 4.1.

            ## What’s new
            Missions open from the iPhone.

            ### Conversations
            Pinned rows keep their order.

            #### Settings
            Secrets sort by name.

            ##### Known issues
            ###### Thanks to everyone who reported one
            """
        static let paragraph = """
            The build is **green on every platform**, and the iPhone app picked up the *new sign-in sheet* without a restart.\\
            The ~~Tuesday~~ Thursday release still holds.

            Run `bun run ci` before you tag, and read the [release checklist](https://kiroshi.app/support) once more.
            """
        static let bullets = """
            What changed in the thread:
            - Replies stream word by word
            - Attachments open in a sheet
              - Images preview inline
              - Other files show a row
                - name and size
            - Times show on a swipe
            """
        static let numbers = """
            To ship it:
            1. Merge the open pull request
            2. Tag the release from main, once the queue is green
               1. desktop builds first
            3. Post the notes
            """
        static let tasks = """
            - [x] Changelog drafted
            - [x] Screenshots updated
            - [ ] App Store text reviewed
            """
        static let quote = """
            The review left one comment worth keeping:

            > Keep the sheet short. People read it on the train, one hand on the phone.

            ---

            Everything else is resolved.
            """
        static let inlineCode = """
            The flag is `--force-with-lease`, set in `push.default`. Your `.gitconfig` already has it.
            """
        static let swiftCode = """
            ```swift
            struct Release {
                let version = "4.2"
                // Ship once the queue is green, never on a Friday afternoon
                func notes() -> String { "Thirty-one changes since 4.1" }
            }
            ```
            """
        static let codeBlock = "Here’s the model with the new field:\n\n" + swiftCode
        static let narrowTable = """
            | Platform | Size | Status |
            |---|--:|---|
            | macOS | 48 MB | Signed |
            | Windows | 52 MB | Signed |
            | Linux | 61 MB | Building |
            """
        static let wideTable = """
            | Change | Owner | Platform | Merged | Lines |
            |---|---|---|--:|--:|
            | Sign-in sheet | Juniper | iPhone | Oct 18 | +412 |
            | Pinned order | Basil | Desktop | Oct 20 | +88 |
            | Secrets sorting | Basil | Desktop | Oct 21 | +36 |
            """
        static let builds = "Builds for 4.2:\n\n" + narrowTable
        static let changes = "And the changes behind them:\n\n" + wideTable
        static let mention =
            "<@atlas-3> can you take the desktop half? I’ve also asked <@basil> too."
        static let mermaid = """
            ```mermaid
            flowchart LR
              pr[Pull request] --> queue[Merge queue]
              queue --> main[main]
              main --> tag[Tag v4.2]
            ```
            """
        static let diagrams = """
            The release path:

            \(mermaid)

            Release size grows as:

            ```math
            S = \\sum_{i=1}^{n} \\frac{a_i}{1 + r}
            ```
            """
        static let ask = "Where does 4.2 stand?"
        static let mixedReply = """
            ### Ready to tag
            Two builds are signed, Linux is still building.

            \(narrowTable)

            Tag it with:

            ```sh
            git tag v4.2.0 && git push origin v4.2.0
            ```
            """
        static let everyFamily = """
            ## Release 4.2
            The build is **green**, read the [release checklist](https://kiroshi.app/support) once more.

            \(bullets)

            \(tasks)

            > Keep the sheet short. People read it on the train.

            ---

            The flag is `--force-with-lease`. <@atlas-3> takes the desktop half, <@basil> the rest.

            \(swiftCode)

            \(narrowTable)

            \(wideTable)

            \(mermaid)
            """

        static let artboards: [String: (isGroup: Bool, replies: [String])] = [
            "1": (true, [headings]),
            "2": (false, [paragraph]),
            "3": (false, [bullets, numbers, tasks]),
            "4": (false, [quote]),
            "5": (false, [inlineCode]),
            "6": (false, [codeBlock]),
            "7": (false, [builds, changes]),
            "8": (true, [mention]),
            "9": (false, [diagrams]),
            "10": (false, [mixedReply]),
            "all": (true, [everyFamily]),
        ]

        static var artboard: (isGroup: Bool, replies: [String]) {
            artboards[UserDefaults.standard.string(forKey: "artboard") ?? ""] ?? artboards["10"]!
        }
    }
#endif
