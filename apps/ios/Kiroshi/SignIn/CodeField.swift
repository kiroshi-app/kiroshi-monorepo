import SwiftUI

struct CodeField: View {
    @Binding var code: String
    var focus: FocusState<Bool>.Binding
    let isWrong: Bool

    var body: some View {
        HStack(spacing: 8) {
            ForEach(0..<SignInModel.codeLength, id: \.self) { slot in
                CodeBox(
                    digit: digit(in: slot),
                    isCurrent: focus.wrappedValue && !isWrong && slot == code.count,
                    isWrong: isWrong)
            }
        }
        .accessibilityHidden(true)
        .contentShape(.rect)
        .onTapGesture { focus.wrappedValue = true }
        .overlay {
            TextField("", text: $code)
                .textContentType(.oneTimeCode)
                .keyboardType(.numberPad)
                .focused(focus)
                .foregroundStyle(.clear)
                .tint(.clear)
                .accessibilityLabel("Six-digit code")
        }
    }

    private func digit(in slot: Int) -> String {
        guard slot < code.count else { return "" }
        return String(code[code.index(code.startIndex, offsetBy: slot)])
    }
}

private struct CodeBox: View {
    let digit: String
    let isCurrent: Bool
    let isWrong: Bool

    private var isOutlined: Bool {
        isCurrent || isWrong
    }

    var body: some View {
        RoundedRectangle(cornerRadius: 16)
            .fill(
                Color(isOutlined ? .secondarySystemGroupedBackground : .secondarySystemBackground)
            )
            .strokeBorder(isWrong ? Color(.systemRed) : .primary, lineWidth: isOutlined ? 2 : 0)
            .frame(minHeight: 60)
            .overlay {
                if isCurrent {
                    RoundedRectangle(cornerRadius: 1)
                        .fill(.blue)
                        .frame(width: 2, height: 28)
                } else {
                    Text(digit)
                        .font(.title.weight(.semibold))
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                }
            }
    }
}
