import SwiftUI

struct QuestionRow: View {
    let state: QuestionCardState
    let send: (QuestionDraft) -> Void

    var body: some View {
        Group {
            switch state {
            case .asking(let asking):
                QuestionCard(asking: asking, send: send)
                    .id(asking.question.request.id)
            case .answered(let answered):
                AnsweredQuestionCard(answered: answered)
            }
        }
        .padding(.top, 14)
    }
}

struct QuestionCard: View {
    let asking: QuestionAsking
    let send: (QuestionDraft) -> Void
    @State private var draft: QuestionDraft
    @FocusState private var isWritingOther: Bool

    init(
        asking: QuestionAsking, draft: QuestionDraft? = nil,
        send: @escaping (QuestionDraft) -> Void
    ) {
        self.asking = asking
        self.send = send
        _draft = State(initialValue: draft ?? QuestionDraft(request: asking.question.request))
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            if draft.isOneOfSeveral {
                Picker("Question", selection: shown) {
                    ForEach(draft.request.questions.indices, id: \.self) { index in
                        Text(draft.request.questions[index].header)
                            .tag(index)
                    }
                }
                .pickerStyle(.segmented)
            }
            heading
                .padding(.horizontal, 6)
            VStack(spacing: 8) {
                ForEach(draft.asked.options, id: \.label) { option in
                    QuestionOptionButton(
                        option: option, isPicked: draft.isPicked(option),
                        isMultiSelect: draft.asked.multiSelect
                    ) {
                        isWritingOther = false
                        draft.pick(option)
                    }
                }
            }
            otherField
            if asking.hasFailed {
                ProblemLabel(message: "Couldn’t send your answer. Tap Send to try again.")
            }
            actions
                .padding(.leading, 6)
                .padding(.top, 2)
        }
        .padding(.top, 14)
        .padding(.bottom, 12)
        .padding(.horizontal, 12)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 26))
        .tint(Color(.systemBlue))
        .disabled(asking.isSending)
        .accessibilityElement(children: .contain)
    }

    private var shown: Binding<Int> {
        Binding {
            draft.shown
        } set: { index in
            draft.show(index)
        }
    }

    private var heading: some View {
        VStack(alignment: .leading, spacing: 2) {
            if !draft.isOneOfSeveral {
                Text(draft.asked.header)
                    .font(.footnote.weight(.semibold))
                    .foregroundStyle(.secondary)
            }
            Text(draft.asked.question)
                .font(.headline)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
                .accessibilityAddTraits(.isHeader)
            if draft.asked.multiSelect {
                Text("Choose any that apply.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private var otherField: some View {
        HStack(spacing: 8) {
            TextField("Write your own answer…", text: $draft.other, axis: .vertical)
                .lineLimit(1...5)
                .font(.body)
                .focused($isWritingOther)
                .accessibilityLabel("Other answer")
            if draft.hasOther {
                QuestionMark(isMultiSelect: false, isPicked: true)
            }
        }
        .padding(.vertical, 11)
        .padding(.leading, 16)
        .padding(.trailing, 14)
        .frame(minHeight: 44)
        .background(Color(.tertiarySystemBackground), in: .rect(cornerRadius: 14))
        .overlay {
            RoundedRectangle(cornerRadius: 14)
                .strokeBorder(
                    draft.hasOther ? Color(.systemBlue) : Color(.separator),
                    lineWidth: draft.hasOther ? 2 : 0.5)
        }
    }

    private var actions: some View {
        HStack {
            Button("Skip") {
                isWritingOther = false
                if draft.skip() {
                    send(draft)
                }
            }
            .buttonStyle(.borderless)
            .padding(.horizontal, 10)
            .frame(minHeight: 44)
            Spacer(minLength: 8)
            Button {
                isWritingOther = false
                if draft.goOn() {
                    send(draft)
                }
            } label: {
                if asking.isSending {
                    ProgressView()
                        .accessibilityLabel("Sending your answer")
                } else {
                    Text(draft.isLast ? "Send" : "Next")
                        .fontWeight(.semibold)
                        .padding(.horizontal, 8)
                }
            }
            .buttonStyle(.borderedProminent)
            .buttonBorderShape(.capsule)
            .controlSize(.large)
            .disabled(!draft.canGoOn)
        }
    }
}

struct QuestionOptionButton: View {
    let option: QuestionRequest.Option
    let isPicked: Bool
    let isMultiSelect: Bool
    let pick: () -> Void

    var body: some View {
        Button(action: pick) {
            HStack(spacing: 12) {
                VStack(alignment: .leading, spacing: 1) {
                    Text(option.label)
                        .font(.body)
                        .foregroundStyle(.primary)
                    if let description = option.description, !description.isEmpty {
                        Text(description)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                .fixedSize(horizontal: false, vertical: true)
                QuestionMark(isMultiSelect: isMultiSelect, isPicked: isPicked)
            }
            .padding(.vertical, 11)
            .padding(.leading, 16)
            .padding(.trailing, 14)
            .frame(minHeight: 44)
            .background(Color(.tertiarySystemBackground), in: .rect(cornerRadius: 14))
            .overlay {
                if isPicked {
                    RoundedRectangle(cornerRadius: 14)
                        .strokeBorder(Color(.systemBlue), lineWidth: 2)
                }
            }
            .contentShape(.rect(cornerRadius: 14))
        }
        .buttonStyle(.plain)
        .accessibilityAddTraits(isPicked ? .isSelected : [])
    }
}

struct QuestionMark: View {
    let isMultiSelect: Bool
    let isPicked: Bool
    @ScaledMetric(relativeTo: .body) private var side: CGFloat = 22

    var body: some View {
        Group {
            if isMultiSelect {
                Image(systemName: isPicked ? "checkmark.circle.fill" : "circle")
                    .font(.title3)
                    .foregroundStyle(isPicked ? Color(.systemBlue) : Color(.tertiaryLabel))
            } else if isPicked {
                Image(systemName: "checkmark")
                    .font(.body.weight(.semibold))
                    .foregroundStyle(Color(.systemBlue))
            }
        }
        .frame(width: side, height: side)
        .accessibilityHidden(true)
    }
}

struct AnsweredQuestionCard: View {
    let answered: QuestionAnswered
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Label {
                Text(title)
            } icon: {
                icon
            }
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.secondary)
            if !answered.lines.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    ForEach(Array(answered.lines.enumerated()), id: \.offset) { _, line in
                        lineLayout {
                            if let header = line.header {
                                Text("\(header):")
                                    .foregroundStyle(.secondary)
                            }
                            Text(line.answer)
                                .foregroundStyle(.primary)
                                .fixedSize(horizontal: false, vertical: true)
                        }
                        .font(.subheadline)
                    }
                }
            }
        }
        .padding(.top, 12)
        .padding(.bottom, 14)
        .padding(.horizontal, 16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 22))
        .accessibilityElement(children: .combine)
    }

    private var title: LocalizedStringKey {
        switch answered.by {
        case .you where answered.isSkipped: "You skipped"
        case .you: "You answered"
        case .elsewhere: "Answered on another device"
        }
    }

    @ViewBuilder private var icon: some View {
        switch answered.by {
        case .you where answered.isSkipped:
            Image(systemName: "forward.circle.fill")
        case .you:
            Image(systemName: "checkmark.circle.fill")
                .symbolRenderingMode(.multicolor)
        case .elsewhere:
            Image(systemName: "laptopcomputer")
        }
    }

    private var lineLayout: AnyLayout {
        dynamicTypeSize.isAccessibilitySize
            ? AnyLayout(VStackLayout(alignment: .leading, spacing: 2))
            : AnyLayout(HStackLayout(alignment: .firstTextBaseline, spacing: 6))
    }
}

#if DEBUG
    #Preview("3.1 Card · single select, empty") {
        QuestionCardPreview(asking: QuestionsFixture.asking(QuestionsFixture.format))
    }

    #Preview("3.2 Card · option chosen") {
        let asking = QuestionsFixture.asking(QuestionsFixture.format)
        var draft = QuestionDraft(request: asking.question.request)
        draft.pick(draft.asked.options[0])
        return QuestionCardPreview(asking: asking, draft: draft)
    }

    #Preview("3.3 Card · multi-select") {
        let asking = QuestionsFixture.asking(QuestionsFixture.sections)
        var draft = QuestionDraft(request: asking.question.request)
        draft.pick(draft.asked.options[0])
        draft.pick(draft.asked.options[1])
        return QuestionCardPreview(asking: asking, draft: draft)
    }

    #Preview("3.4 Card · Other typed") {
        let asking = QuestionsFixture.asking(QuestionsFixture.format)
        var draft = QuestionDraft(request: asking.question.request)
        draft.other = "Changelog, user-facing only"
        return QuestionCardPreview(asking: asking, draft: draft)
    }

    #Preview("3.5 Card · 3 questions, 1 answered") {
        let asking = QuestionsFixture.asking(
            QuestionsFixture.format, QuestionsFixture.audience, QuestionsFixture.length)
        var draft = QuestionDraft(request: asking.question.request)
        draft.pick(draft.asked.options[0])
        _ = draft.goOn()
        draft.pick(draft.asked.options[0])
        return QuestionCardPreview(asking: asking, draft: draft)
            .preferredColorScheme(.dark)
    }

    #Preview("Card · answer refused") {
        var asking = QuestionsFixture.asking(QuestionsFixture.format)
        asking.hasFailed = true
        return QuestionCardPreview(asking: asking)
    }

    #Preview("3.6 Card · collapsed after Send") {
        QuestionCardPreview(
            answered: QuestionAnswered(
                by: .you,
                lines: [
                    QuestionAnswerLine(header: "Format", answer: "Summary"),
                    QuestionAnswerLine(header: "Audience", answer: "People using the app"),
                    QuestionAnswerLine(header: "Length", answer: "Under a page"),
                ]))
    }

    #Preview("3.7 Card · answered on another device") {
        QuestionCardPreview(
            answered: QuestionAnswered(
                by: .elsewhere,
                lines: [QuestionAnswerLine(header: "Format", answer: "Full changelog")]))
    }

    #Preview("3.8 Card · answered from the composer · dark") {
        QuestionCardPreview(
            answered: QuestionAnswered(
                by: .you,
                lines: [
                    QuestionAnswerLine(
                        header: "Format",
                        answer: "A summary for users, with breaking changes at the top.")
                ])
        )
        .preferredColorScheme(.dark)
    }

    #Preview("Card · skipped") {
        QuestionCardPreview(answered: QuestionAnswered(by: .you, lines: []))
    }

    #Preview("Thread · 3.1 question waiting") {
        SignInRootView(model: .fixture(.questionSingle))
    }

    #Preview("Thread · 3.5 three questions · dark") {
        SignInRootView(model: .fixture(.questionSeveral))
            .preferredColorScheme(.dark)
    }

    #Preview("Thread · 3.7 answered on another device") {
        SignInRootView(model: .fixture(.questionElsewhere))
    }

    #Preview("2.1 Conversations · needs you") {
        SignInRootView(model: .fixture(.questionsList))
    }

    private struct QuestionCardPreview: View {
        var asking: QuestionAsking?
        var draft: QuestionDraft?
        var answered: QuestionAnswered?

        var body: some View {
            ScrollView {
                Group {
                    if let answered {
                        AnsweredQuestionCard(answered: answered)
                    } else if let asking {
                        QuestionCard(asking: asking, draft: draft) { _ in }
                    }
                }
                .padding()
            }
        }
    }
#endif
