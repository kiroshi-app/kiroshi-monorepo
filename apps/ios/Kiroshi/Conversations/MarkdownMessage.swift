import Foundation

struct MarkdownMessage: Equatable {
    let blocks: [MarkdownBlock]
    let shownText: String

    init(_ text: String, among authors: [Companion] = []) {
        shownText = Mentions.shown(in: text, among: authors)
        let marked = authors.isEmpty ? text : MentionMarks.marking(text)
        let options = AttributedString.MarkdownParsingOptions(interpretedSyntax: .full)
        guard let parsed = try? AttributedString(markdown: marked, options: options) else {
            blocks = [.paragraph(MarkdownInline(plain: shownText))]
            return
        }
        let pieces = parsed.runs.map { run in
            MarkdownPiece(
                path: (run.presentationIntent?.components ?? []).reversed(),
                text: AttributedString(parsed[run.range]))
        }
        let names = MentionMarks.Names(authors)
        let blocks = MarkdownPiece.blocks(of: pieces[...], depth: 0, names: names)
        self.blocks =
            blocks.filter { !$0.isFootnoteDefinition } + blocks.filter(\.isFootnoteDefinition)
    }

    private init(blocks: [MarkdownBlock], shownText: String) {
        self.blocks = blocks
        self.shownText = shownText
    }

    var bubbles: [MarkdownMessage] {
        BubbleSplit.groups(blocks).map { MarkdownMessage(blocks: $0, shownText: shownText) }
    }

    var hasCard: Bool {
        blocks.contains(where: \.isCard)
    }
}

indirect enum MarkdownBlock: Equatable {
    case heading(level: Int, MarkdownInline)
    case paragraph(MarkdownInline)
    case list(MarkdownList)
    case quote([MarkdownBlock])
    case code(MarkdownCode)
    case table(MarkdownTable)
    case rule

    var isCard: Bool {
        switch self {
        case .code, .table: true
        default: false
        }
    }

    static func openingIndex(of blocks: [MarkdownBlock]) -> Int {
        blocks.firstIndex { $0 != .rule } ?? 0
    }

    var isFootnoteDefinition: Bool {
        guard case .paragraph(let inline) = self else { return false }
        return inline.plain.wholeMatch(of: #/\[\^[^\]\s]+\]:[\s\S]*/#) != nil
    }

    static func spacing(between previous: MarkdownBlock, and next: MarkdownBlock) -> Double {
        switch (previous, next) {
        case (.heading, .heading): 4
        case (_, .heading(let level, _)): level <= 2 ? 16 : level == 3 ? 14 : 12
        case (.heading(let level, _), _): level <= 2 ? 4 : 2
        case (.paragraph, .list): 6
        default: 10
        }
    }
}

struct MarkdownInline: Equatable {
    struct Run: Equatable {
        enum Kind: Equatable {
            case text
            case code
            case mention(isKnown: Bool)
        }

        var text: String
        var kind = Kind.text
        var isStrong = false
        var isEmphasized = false
        var isStruck = false
        var link: URL?

        func isMarked(like other: Run) -> Bool {
            kind == .text && other.kind == .text && isStrong == other.isStrong
                && isEmphasized == other.isEmphasized && isStruck == other.isStruck
                && link == other.link
        }
    }

    var runs: [Run]

    init(runs: [Run]) {
        self.runs = runs
    }

    init(plain: String) {
        runs = plain.isEmpty ? [] : [Run(text: plain)]
    }

    var plain: String {
        runs.map(\.text).joined()
    }

    func droppingPrefix(_ count: Int) -> MarkdownInline {
        var rest = count
        var runs = runs
        while rest > 0, let first = runs.first {
            if first.text.count <= rest {
                rest -= first.text.count
                runs.removeFirst()
            } else {
                runs[0].text.removeFirst(rest)
                rest = 0
            }
        }
        return MarkdownInline(runs: runs)
    }
}

struct MarkdownList: Equatable {
    enum Marker: Equatable {
        case bullet(depth: Int)
        case number(String)
        case task(isDone: Bool)

        var spoken: String {
            switch self {
            case .bullet: "•"
            case .number(let label): label
            case .task(let isDone): isDone ? String(localized: "Done") : String(localized: "To do")
            }
        }
    }

    struct Item: Equatable {
        let marker: Marker
        let lead: MarkdownInline?
        let rest: [MarkdownBlock]
    }

    let items: [Item]

    var isTaskList: Bool {
        items.allSatisfy {
            if case .task = $0.marker { true } else { false }
        }
    }

    static func numberLabel(_ ordinal: Int, depth: Int) -> String {
        switch depth % 3 {
        case 1: "\(letters(ordinal))."
        case 2: "\(roman(ordinal))."
        default: "\(ordinal)."
        }
    }

    private static func letters(_ ordinal: Int) -> String {
        var value = max(ordinal, 1)
        var label = ""
        while value > 0 {
            value -= 1
            label = String(UnicodeScalar(UInt8(97 + value % 26))) + label
            value /= 26
        }
        return label
    }

    private static func roman(_ ordinal: Int) -> String {
        let numerals = [
            (1000, "m"), (900, "cm"), (500, "d"), (400, "cd"), (100, "c"), (90, "xc"), (50, "l"),
            (40, "xl"), (10, "x"), (9, "ix"), (5, "v"), (4, "iv"), (1, "i"),
        ]
        var value = max(ordinal, 1)
        var label = ""
        for (amount, numeral) in numerals {
            while value >= amount {
                label += numeral
                value -= amount
            }
        }
        return label
    }
}

struct MarkdownCode: Hashable {
    let language: String?
    let text: String
}

struct MarkdownTable: Equatable {
    enum Alignment: Equatable {
        case leading
        case center
        case trailing
    }

    let alignments: [Alignment]
    let header: [MarkdownInline]
    let rows: [[MarkdownInline]]

    var columnCount: Int {
        max(alignments.count, header.count, rows.map(\.count).max() ?? 0)
    }

    var tabSeparated: String {
        ([header] + rows).map { row in
            row.map { $0.plain.replacing(#/[\t\n]/#, with: " ") }.joined(separator: "\t")
        }
        .joined(separator: "\n")
    }
}

private struct MarkdownPiece {
    let path: [PresentationIntent.IntentType]
    let text: AttributedString

    static func blocks(of pieces: ArraySlice<MarkdownPiece>, depth: Int, names: MentionMarks.Names)
        -> [MarkdownBlock]
    {
        groups(of: pieces, at: depth).compactMap { group in
            block(of: group, depth: depth, names: names)
        }
    }

    private static func groups(of pieces: ArraySlice<MarkdownPiece>, at depth: Int)
        -> [ArraySlice<MarkdownPiece>]
    {
        var groups: [ArraySlice<MarkdownPiece>] = []
        var start = pieces.startIndex
        for index in pieces.indices.dropFirst()
        where pieces[index].identity(at: depth) != pieces[start].identity(at: depth) {
            groups.append(pieces[start..<index])
            start = index
        }
        if start < pieces.endIndex {
            groups.append(pieces[start...])
        }
        return groups
    }

    private func identity(at depth: Int) -> Int? {
        depth < path.count ? path[depth].identity : nil
    }

    private static func block(
        of group: ArraySlice<MarkdownPiece>, depth: Int, names: MentionMarks.Names
    ) -> MarkdownBlock? {
        guard let first = group.first, depth < first.path.count else {
            let inline = inline(of: group, names: names, trimming: true)
            return inline.runs.isEmpty ? nil : .paragraph(inline)
        }
        switch first.path[depth].kind {
        case .header(let level):
            return .heading(level: level, inline(of: group, names: names))
        case .codeBlock(let languageHint):
            let text = group.map { String($0.text.characters) }.joined()
            return .code(
                MarkdownCode(
                    language: languageHint.flatMap { $0.isEmpty ? nil : $0 },
                    text: names.naming(String(text.trimmingSuffix(while: \.isNewline)))))
        case .thematicBreak:
            return .rule
        case .blockQuote:
            return .quote(blocks(of: group, depth: depth + 1, names: names))
        case .orderedList, .unorderedList:
            return .list(list(of: group, depth: depth, names: names))
        case .table(let columns):
            return .table(table(of: group, columns: columns, depth: depth, names: names))
        default:
            let inline = inline(of: group, names: names)
            return inline.runs.isEmpty ? nil : .paragraph(inline)
        }
    }

    private static func list(
        of group: ArraySlice<MarkdownPiece>, depth: Int, names: MentionMarks.Names
    ) -> MarkdownList {
        let listDepth = group.first.map { $0.listDepth(before: depth) } ?? 0
        let isOrdered = group.first.map { $0.path[depth].kind == .orderedList } ?? false
        let items = groups(of: group, at: depth + 1).map { itemGroup in
            let ordinal: Int =
                if case .listItem(let ordinal) = itemGroup.first?.path[safe: depth + 1]?.kind {
                    ordinal
                } else { 1 }
            var blocks = blocks(of: itemGroup, depth: depth + 2, names: names)
            var lead: MarkdownInline?
            if case .paragraph(let inline) = blocks.first {
                lead = inline
                blocks.removeFirst()
            }
            var marker: MarkdownList.Marker =
                isOrdered
                ? .number(MarkdownList.numberLabel(ordinal, depth: listDepth))
                : .bullet(depth: listDepth)
            if !isOrdered, let task = lead.flatMap(Self.task) {
                marker = .task(isDone: task.isDone)
                lead = task.rest
            }
            return MarkdownList.Item(marker: marker, lead: lead, rest: blocks)
        }
        return MarkdownList(items: items)
    }

    private static func task(in lead: MarkdownInline) -> (isDone: Bool, rest: MarkdownInline)? {
        guard let first = lead.runs.first, first.kind == .text,
            let box = first.text.prefixMatch(of: #/\[([ xX])\](?:\s|$)/#)
        else { return nil }
        return (box.1 != " ", lead.droppingPrefix(box.0.count))
    }

    private func listDepth(before depth: Int) -> Int {
        path.prefix(depth).filter { $0.kind == .orderedList || $0.kind == .unorderedList }.count
    }

    private static func table(
        of group: ArraySlice<MarkdownPiece>, columns: [PresentationIntent.TableColumn], depth: Int,
        names: MentionMarks.Names
    ) -> MarkdownTable {
        var header: [MarkdownInline] = []
        var rows: [[MarkdownInline]] = []
        for rowGroup in groups(of: group, at: depth + 1) {
            let cells = groups(of: rowGroup, at: depth + 2).map {
                inline(of: $0, names: names)
            }
            if rowGroup.first?.path[safe: depth + 1]?.kind == .tableHeaderRow {
                header = cells
            } else {
                rows.append(cells)
            }
        }
        let alignments = columns.map { column -> MarkdownTable.Alignment in
            switch column.alignment {
            case .center: .center
            case .right: .trailing
            default: .leading
            }
        }
        return MarkdownTable(alignments: alignments, header: header, rows: rows)
    }

    private static func inline(
        of group: ArraySlice<MarkdownPiece>, names: MentionMarks.Names, trimming: Bool = false
    ) -> MarkdownInline {
        var runs: [MarkdownInline.Run] = []
        for piece in group {
            for run in piece.text.runs {
                let text = String(piece.text[run.range].characters)
                let intent = run.inlinePresentationIntent ?? []
                var base = MarkdownInline.Run(
                    text: text, isStrong: intent.contains(.stronglyEmphasized),
                    isEmphasized: intent.contains(.emphasized),
                    isStruck: intent.contains(.strikethrough), link: run.link)
                if intent.contains(.code) {
                    base.text = names.naming(text)
                    base.kind = .code
                    runs.append(base)
                } else {
                    runs += names.runs(splitting: base).flatMap(MathSpans.runs)
                }
            }
        }
        if trimming, !runs.isEmpty {
            runs[runs.count - 1].text = String(
                runs[runs.count - 1].text.trimmingSuffix(while: \.isNewline))
        }
        return MarkdownInline(
            runs: runs.filter { !$0.text.isEmpty }.reduce(into: []) { merged, run in
                if let last = merged.last, last.isMarked(like: run) {
                    merged[merged.count - 1].text += run.text
                } else {
                    merged.append(run)
                }
            })
    }
}

enum MentionMarks {
    static let open: Character = "\u{E000}"
    static let close: Character = "\u{E001}"

    struct Names {
        private let authors: [Companion]

        init(_ authors: [Companion]) {
            self.authors = authors
        }

        func naming(_ text: String) -> String {
            text.replacing(MentionMarks.mark) { "@\(name(of: String($0.1)) ?? unknown)" }
        }

        func runs(splitting run: MarkdownInline.Run) -> [MarkdownInline.Run] {
            var runs: [MarkdownInline.Run] = []
            var rest = run.text[...]
            while let match = rest.firstMatch(of: MentionMarks.mark) {
                var before = run
                before.text = String(rest[..<match.range.lowerBound])
                runs.append(before)
                let name = name(of: String(match.1))
                var mention = run
                mention.text = "@\(name ?? unknown)".replacing(" ", with: "\u{00A0}")
                mention.kind = .mention(isKnown: name != nil)
                runs.append(mention)
                rest = rest[match.range.upperBound...]
            }
            var after = run
            after.text = String(rest)
            return runs + [after]
        }

        private var unknown: String {
            String(localized: "Unknown agent")
        }

        private func name(of id: String) -> String? {
            authors.first { $0.id == id }?.name
        }
    }

    static func marking(_ text: String) -> String {
        text.replacing(#/<@([\w-]+)>/#) { "\(open)\($0.1)\(close)" }
    }

    fileprivate static var mark: Regex<(Substring, Substring)> {
        #/\x{E000}([\w-]+)\x{E001}/#
    }
}

private enum MathSpans {
    static func runs(_ run: MarkdownInline.Run) -> [MarkdownInline.Run] {
        guard run.kind == .text, run.link == nil else { return [run] }
        var runs: [MarkdownInline.Run] = []
        var rest = run.text[...]
        while let match = rest.firstMatch(of: span) {
            var before = run
            before.text = String(rest[..<match.range.lowerBound])
            var math = run
            math.text = String(match.0)
            math.kind = .code
            runs += [before, math]
            rest = rest[match.range.upperBound...]
        }
        var after = run
        after.text = String(rest)
        return runs + [after]
    }

    private static var span: Regex<Substring> {
        #/\$\$[^$\n]+\$\$|\$(?=\S)[^$\n]*?\S\$(?!\d)|\$\S\$(?!\d)/#
    }
}

extension StringProtocol {
    fileprivate func trimmingSuffix(while isTrimmed: (Character) -> Bool) -> SubSequence {
        var end = endIndex
        while end > startIndex, isTrimmed(self[index(before: end)]) {
            end = index(before: end)
        }
        return self[startIndex..<end]
    }
}

extension Array {
    fileprivate subscript(safe index: Int) -> Element? {
        indices.contains(index) ? self[index] : nil
    }
}
