import SwiftUI

// Couleurs reprises telles quelles de public/app.css (thème sombre du site) : même identité visuelle.
extension Color {
    init(hex: UInt32, opacity: Double = 1) {
        self.init(.sRGB,
                  red: Double((hex >> 16) & 0xFF) / 255,
                  green: Double((hex >> 8) & 0xFF) / 255,
                  blue: Double(hex & 0xFF) / 255,
                  opacity: opacity)
    }
}

enum Theme {
    static let bg = Color(hex: 0x0E0F12)
    static let surface = Color(hex: 0x17191E)
    static let sunk = Color(hex: 0x121418)
    static let raise = Color(hex: 0x20232A)
    static let fill = Color.white.opacity(0.07)
    static let fg = Color(hex: 0xF4F5F7)
    static let fg2 = Color(hex: 0xC9CED6)
    static let muted = Color(hex: 0x9AA1AD)
    static let line = Color(hex: 0x2A2E36)
    static let accent = Color(hex: 0xD4FF3A)
    static let ink = Color(hex: 0x0E0F12)

    static let easy = Color(hex: 0x8DB8FF)
    static let long = Color(hex: 0xFFB27A)
    static let renfo = Color(hex: 0xC9A7FF)
    static let race = Color(hex: 0x7FE3C4)
    static let coral = Color(hex: 0xFF8A7A)

    static let radius: CGFloat = 20

    /// Couleur d'une séance selon son type (q = intensité, easy, long, race), comme les pastilles du site.
    static func color(forType type: String?) -> Color {
        switch type {
        case "q": accent
        case "easy": easy
        case "long": long
        case "race": race
        case "renfo": renfo
        default: muted
        }
    }

    static func zoneColor(_ z: String?) -> Color {
        switch z {
        case "z1": easy
        case "z2": long
        case "z3": coral
        case "rf": renfo
        default: muted
        }
    }

    static func zoneLabel(_ z: String?) -> String? {
        switch z {
        case "z1": "Facile · Z1"
        case "z2": "Seuil · Z2"
        case "z3": "Intense · Z3"
        case "rf": "Force"
        default: nil
        }
    }
}

// Titres : équivalent natif de Barlow Condensed (police du site), en SF condensée.
extension Font {
    static func display(_ size: CGFloat, weight: Font.Weight = .heavy) -> Font {
        .system(size: size, weight: weight).width(.condensed)
    }
}

struct Card<Content: View>: View {
    var padding: CGFloat = 18
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(padding)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Theme.surface)
            .clipShape(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: Theme.radius, style: .continuous).stroke(Theme.line, lineWidth: 1))
    }
}

struct Chip: View {
    let text: String
    var color: Color = Theme.accent

    var body: some View {
        Text(text)
            .font(.caption.weight(.semibold))
            .padding(.horizontal, 10)
            .padding(.vertical, 4)
            .foregroundStyle(color)
            .background(color.opacity(0.14), in: Capsule())
    }
}

struct SectionTitle: View {
    let text: String
    var body: some View {
        Text(text.uppercased())
            .font(.display(15, weight: .bold))
            .tracking(1.2)
            .foregroundStyle(Theme.muted)
            .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct PrimaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.headline)
            .foregroundStyle(Theme.ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(Theme.accent, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
            .opacity(configuration.isPressed ? 0.8 : 1)
            .scaleEffect(configuration.isPressed ? 0.98 : 1)
    }
}

struct GhostButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(.subheadline.weight(.semibold))
            .foregroundStyle(Theme.fg)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 13)
            .background(Theme.fill, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}
