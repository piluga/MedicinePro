// MedicinePro - doctor.js
// Medico di famiglia e "Dottore AI" (suggerimenti sui sintomi)

Object.assign(app, {
    // --- GESTIONE MEDICO DI FAMIGLIA (Aggiornato con Giorni Mattina/Pom) ---

    openDoctorModal(profileId) {
        this.currentProfileId = profileId;
        const profile = this.data.profiles.find(p => p.id === profileId);
        if (!profile) return;

        // Resetta campi
        document.getElementById('doc-profile-name').textContent = `PROFILO: ${profile.name}`;
        document.getElementById('doc-name').value = '';
        document.getElementById('doc-phone-studio').value = '';
        document.getElementById('doc-phone-mobile').value = '';
        document.getElementById('doc-phone-wa').value = '';
        document.getElementById('doc-phone-emergency').value = '';

        // Reset Orari (4 campi)
        document.getElementById('doc-days-am').value = '';
        document.getElementById('doc-hours-am').value = '';
        document.getElementById('doc-days-pm').value = '';
        document.getElementById('doc-hours-pm').value = '';

        document.getElementById('doc-address').value = '';

        // Nascondi pulsanti azioni
        document.getElementById('doc-actions').classList.add('hidden');
        document.getElementById('btn-map-doc').classList.add('hidden');

        if (profile.doctor) {
            document.getElementById('doc-name').value = profile.doctor.name || '';
            document.getElementById('doc-phone-studio').value = profile.doctor.phoneStudio || '';
            document.getElementById('doc-phone-mobile').value = profile.doctor.phoneMobile || '';
            document.getElementById('doc-phone-wa').value = profile.doctor.phoneWa || '';
            document.getElementById('doc-phone-wa').value = profile.doctor.phoneWa || '';

            // Load Orari
            document.getElementById('doc-days-am').value = profile.doctor.daysAm || ''; // NUOVO
            document.getElementById('doc-hours-am').value = profile.doctor.hoursAm || '';
            document.getElementById('doc-days-pm').value = profile.doctor.daysPm || ''; // NUOVO
            document.getElementById('doc-hours-pm').value = profile.doctor.hoursPm || '';
            document.getElementById('doc-address').value = profile.doctor.address || '';
            document.getElementById('doc-phone-emergency').value = profile.doctor.phoneEmergency || '';

            // --- Logica Pulsanti Azione ---
            let hasMainActions = false;

            const btnCall = document.getElementById('btn-call-doc');
            if (profile.doctor.phoneStudio) {
                btnCall.classList.remove('opacity-40', 'pointer-events-none');
                btnCall.href = `tel:${profile.doctor.phoneStudio}`;
                hasMainActions = true;
            } else {
                btnCall.classList.add('opacity-40', 'pointer-events-none');
            }

            const btnMobile = document.getElementById('btn-call-mobile');
            if (profile.doctor.phoneMobile) {
                btnMobile.classList.remove('opacity-40', 'pointer-events-none');
                btnMobile.href = `tel:${profile.doctor.phoneMobile}`;
                hasMainActions = true;
            } else {
                btnMobile.classList.add('opacity-40', 'pointer-events-none');
            }

            const btnWa = document.getElementById('btn-wa-doc');
            if (profile.doctor.phoneWa) {
                btnWa.classList.remove('opacity-40', 'pointer-events-none');
                btnWa.href = `https://wa.me/${this.toWhatsAppNumber(profile.doctor.phoneWa)}`;
                hasMainActions = true;
            } else {
                btnWa.classList.add('opacity-40', 'pointer-events-none');
            }

            if (hasMainActions) {
                document.getElementById('doc-actions').classList.remove('hidden');
            }

            const btnMap = document.getElementById('btn-map-doc');
            if (profile.doctor.address) {
                btnMap.classList.remove('hidden');
                const encodedAddr = encodeURIComponent(profile.doctor.address);
                btnMap.href = `https://www.google.com/maps/search/?api=1&query=${encodedAddr}`;
            }
        }

        this.showModal('modal-doctor');
    },
    saveDoctorInfo() {
        const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
        if (!profile) return;

        const name = document.getElementById('doc-name').value.trim();
        const phoneStudio = document.getElementById('doc-phone-studio').value.trim();
        const phoneMobile = document.getElementById('doc-phone-mobile').value.trim();
        const phoneWa = document.getElementById('doc-phone-wa').value.trim();
        const phoneEmergency = document.getElementById('doc-phone-emergency').value.trim();

        // Campi Orario
        const daysAm = document.getElementById('doc-days-am').value.trim();
        const hoursAm = document.getElementById('doc-hours-am').value.trim();
        const daysPm = document.getElementById('doc-days-pm').value.trim();
        const hoursPm = document.getElementById('doc-hours-pm').value.trim();

        const address = document.getElementById('doc-address').value.trim();

        profile.doctor = {
            name,
            phoneStudio,
            phoneMobile,
            phoneWa,
            daysAm,  // SALVA GIORNI MATTINA
            hoursAm,
            phoneEmergency,
            daysPm,  // SALVA GIORNI POMERIGGIO
            hoursPm,
            address
        };

        this.saveData();
        this.renderProfiles();
        this.closeModal('modal-doctor');

        if (name) {
            this.showAlert("Salvato", "Scheda medico aggiornata.");
        }
    },
    // --- NUOVE FUNZIONI DOTTORE AI ---

    openDoctorAI() {
        document.getElementById('symptom-input').value = '';
        document.getElementById('doctor-results').innerHTML = `

                                                            <div class="flex flex-col items-center justify-center h-full text-slate-400 opacity-60">

                                                                <i class="fa-solid fa-notes-medical text-3xl mb-2"></i>

                                                                <p class="text-xs">I risultati appariranno qui</p>

                                                            </div>`;
        this.showModal('modal-doctor-ai');
        setTimeout(() => document.getElementById('symptom-input').focus(), 100);
    },
    analyzeSymptoms() {
        const input = document.getElementById('symptom-input').value.toLowerCase().trim();
        const container = document.getElementById('doctor-results');

        if (input.length < 3) {
            container.innerHTML = `<p class="text-center text-red-400 text-xs py-4 font-bold">Descrivi meglio il sintomo.</p>`;
            return;
        }

        // Dividiamo l'input in parole chiave (es. "mal di testa" -> "mal", "testa")
        // Rimuoviamo parole comuni inutili
        const ignoreWords = ['di', 'il', 'la', 'lo', 'un', 'una', 'ho', 'mi', 'fa', 'male', 'per', 'con'];
        const keywords = input.split(' ').filter(w => w.length > 2 && !ignoreWords.includes(w));

        let foundMeds = [];

        // Cerca in tutti i profili
        this.data.profiles.forEach(profile => {
            profile.meds.forEach(med => {
                // Campi dove cercare: Nome, Categoria (Type), Forma (Category), Note (Usage)
                const textToSearch = `${med.name} ${med.type || ''} ${med.category || ''} ${med.usage || ''}`.toLowerCase();

                // Verifica se almeno una parola chiave è presente
                // Oppure se l'intera frase è contenuta (per match esatti come "mal di testa")
                const exactMatch = textToSearch.includes(input);
                const keywordMatch = keywords.some(k => textToSearch.includes(k));

                if (exactMatch || keywordMatch) {
                    // Calcola un punteggio di rilevanza (opzionale, qui semplice)
                    foundMeds.push({
                        med: med,
                        profileName: profile.name,
                        relevance: exactMatch ? 2 : 1
                    });
                }
            });
        });

        // Ordina per rilevanza
        foundMeds.sort((a, b) => b.relevance - a.relevance);

        // Renderizza risultati
        container.innerHTML = '';
        if (foundMeds.length === 0) {
            container.innerHTML = `

                                                                <div class="text-center py-6">

                                                                    <div class="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-2 text-slate-400">

                                                                        <i class="fa-solid fa-face-frown-open"></i>

                                                                    </div>

                                                                    <p class="text-sm font-bold text-slate-600">Nessun farmaco trovato</p>

                                                                    <p class="text-xs text-slate-400 mt-1">Prova a cercare una parola diversa (es. "dolore", "febbre") o controlla le note dei farmaci.</p>

                                                                </div>

                                                            `;
            return;
        }

        foundMeds.forEach(item => {
            const m = item.med;
            const div = document.createElement('div');
            div.className = "bg-white border border-slate-200 p-3 rounded-xl shadow-sm hover:border-teal-300 transition-colors cursor-pointer group";
            // Cliccando apre il dettaglio del farmaco per assumerlo
            div.onclick = () => {
                this.closeModal('modal-doctor-ai');
                this.currentProfileId = this.data.profiles.find(p => p.name === item.profileName).id;
                this.openProfile(this.currentProfileId);
                // Opzionale: scrollare al farmaco specifico
                setTimeout(() => this.openEditMedModal(m.id), 300);
            };

            div.innerHTML = `

                                                                <div class="flex justify-between items-start">

                                                                    <div>

                                                                        <span class="text-[10px] font-bold text-teal-600 uppercase tracking-wide flex items-center gap-1 mb-0.5">

                                                                            <i class="fa-solid fa-user"></i> ${app.escapeHTML(item.profileName)}

                                                                        </span>

                                                                        <h4 class="font-bold text-slate-800 text-sm">${app.escapeHTML(m.name)}</h4>

                                                                        <p class="text-xs text-slate-500 mt-1 line-clamp-2 italic">

                                                                            "${app.escapeHTML(m.usage || m.type || 'Nessuna descrizione')}"

                                                                        </p>

                                                                    </div>

                                                                    <i class="fa-solid fa-chevron-right text-slate-300 group-hover:text-teal-500 text-xs mt-4"></i>

                                                                </div>

                                                            `;
            container.appendChild(div);
        });
    }
});
