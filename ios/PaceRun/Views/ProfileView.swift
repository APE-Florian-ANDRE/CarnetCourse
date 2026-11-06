import SwiftUI

extension AppStore {
    func binding(_ key: String) -> Binding<String> {
        Binding(get: { self.value(key) }, set: { self.set(key, $0) })
    }
}

/// Champs physiques et de volume, partagés entre l'onboarding et le profil.
struct ProfileFields: View {
    @Environment(AppStore.self) private var store
    let running: Bool

    var body: some View {
        VStack(spacing: 0) {
            Picker("Sexe", selection: store.binding("sexe")) { Text("Homme").tag("H"); Text("Femme").tag("F") }
                .pickerStyle(.segmented).padding(.bottom, 12)
            numberRow("Âge", "ans", "age", "32", decimal: false)
            numberRow("Taille", "cm", "taille", "175", decimal: false)
            numberRow("Poids", "kg", "poids", "72")
            if running {
                numberRow("Volume actuel", "km / sem.", "volume", "15")
                numberRow("Plus longue sortie récente", "km", "longest", "8")
            }
        }
        .padding(16)
        .background(Theme.surface, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }

    private func numberRow(_ label: String, _ unit: String, _ key: String, _ ph: String, decimal: Bool = true) -> some View {
        HStack {
            Text(label).foregroundStyle(Theme.fg)
            Spacer()
            TextField(ph, text: store.binding(key))
                .keyboardType(decimal ? .decimalPad : .numberPad)
                .multilineTextAlignment(.trailing)
                .frame(width: 80)
                .foregroundStyle(Theme.accent)
            Text(unit).font(.caption).foregroundStyle(Theme.muted).frame(width: 64, alignment: .leading)
        }
        .padding(.vertical, 10)
        .overlay(alignment: .bottom) { Rectangle().fill(Theme.line).frame(height: 1) }
    }
}

struct ProfileView: View {
    @Environment(AppStore.self) private var store
    @Binding var showTuto: Bool
    @State private var confirmReset = false

    private var isRun: Bool { ["course", "trail"].contains(store.value("sport")) }

    var body: some View {
        NavigationStack {
            Form {
                Section("Entraînement") {
                    Picker("Sport", selection: store.binding("sport")) {
                        Text("Course à pied").tag("course"); Text("Trail").tag("trail"); Text("VTT").tag("vtt")
                        Text("Force").tag("force"); Text("Remise en forme").tag("forme")
                    }
                    if isRun {
                        Picker("Objectif", selection: store.binding("objectif")) {
                            Text("5 km").tag("5"); Text("10 km").tag("10"); Text("Semi-marathon").tag("21")
                            Text("Marathon").tag("42"); Text("Forme").tag("forme")
                        }
                    }
                    Picker("Niveau", selection: store.binding("niveau")) {
                        Text("Débutant").tag("deb"); Text("Intermédiaire").tag("int"); Text("Confirmé").tag("conf")
                    }
                    Picker("Séances / semaine", selection: store.binding("seances")) {
                        ForEach(store.value("niveau") == "deb" ? ["3", "4"] : ["3", "4", "5", "6"], id: \.self) { Text($0).tag($0) }
                    }
                    Picker("Sortie longue le", selection: store.binding("longDay")) { Text("Samedi").tag("5"); Text("Dimanche").tag("6") }
                    DatePicker("Début du plan", selection: Binding(
                        get: { Day.date(store.value("start")) ?? Date() },
                        set: { store.set("start", Day.iso($0)) }), displayedComponents: .date)
                }
                .listRowBackground(Theme.surface)

                Section { RaceDateField().listRowInsets(EdgeInsets()) }
                    .listRowBackground(Theme.surface)

                Section("Toi") { ProfileFields(running: isRun).listRowInsets(EdgeInsets()) }
                    .listRowBackground(Theme.surface)

                if let plan = store.plan {
                    Section("Ton plan") {
                        LabeledContent("Semaines", value: "\(plan.weeks.count)")
                        if plan.sport == "course" || plan.sport == "trail" {
                            LabeledContent("VMA utilisée", value: "\(fmt(plan.vma)) km/h")
                        }
                        if let u = plan.unreal {
                            Text("Objectif trop proche pour être préparé sans risque : le plan prépare \(u.used == "forme" ? "la forme" : u.used + " km").")
                                .font(.caption).foregroundStyle(Theme.long)
                        }
                    }
                    .listRowBackground(Theme.surface)
                }

                Section {
                    Button("Revoir le tuto") { showTuto = true }
                    Button("Tout effacer", role: .destructive) { confirmReset = true }
                } footer: {
                    Text("Tes données restent sur cet iPhone. Pace'Run ne remplace pas un avis médical.")
                }
                .listRowBackground(Theme.surface)
            }
            .scrollContentBackground(.hidden)
            .background(Theme.bg)
            .scrollDismissesKeyboard(.interactively)
            .navigationTitle("Profil")
            .onChange(of: store.doc.profile) { store.save() }
            .confirmationDialog("Effacer le profil, le plan et le suivi ?", isPresented: $confirmReset, titleVisibility: .visible) {
                Button("Tout effacer", role: .destructive) { store.resetAll() }
            }
        }
    }
}
