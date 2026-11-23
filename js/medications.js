// MedicinePro - medications.js
// Farmaci: modulo di inserimento/modifica, lista del giorno, assunzioni, reset giornaliero

Object.assign(app, {
    parseDose(dose) {
        if (!dose) return 1;

        if (typeof dose === "string") {
            const frac = dose.match(/(\d+)\s*\/\s*(\d+)/);
            if (frac) {
                return parseInt(frac[1]) / parseInt(frac[2]);
            }

            const num = parseFloat(dose.replace(",", "."));
            if (!isNaN(num)) return num;
        }

        return 1;
    },
    // Refactor: Collect all low stock alerts
    checkDailyReset() {
        const today = this.getLocalDateString();

        if (this.data.lastOpened === today) return;

        let lowStockMeds = [];

        this.data.profiles.forEach(profile => {
            // Le fasce orarie dello stesso farmaco (stesso sharedId) condividono UNA scorta:
            // si sommano le dosi prese in tutte le fasce e si scalano una volta sola
            const groups = {};
            profile.meds.forEach(med => {
                const key = med.sharedId || med.id;
                (groups[key] = groups[key] || []).push(med);
            });

            Object.values(groups).forEach(copies => {
                // Dose del giorno appena chiuso (può essere stata cambiata dal calendario)
                const consumed = copies.reduce((sum, m) => sum + (m.taken ? this.parseDose(this.getDoseOn(m, this.data.lastOpened)) : 0), 0);
                // Se le copie si erano disallineate (versioni precedenti), vale la più bassa
                const current = Math.min(...copies.map(m => parseFloat(m.boxQty) || 0));
                const newQty = Math.max(0, Math.round((current - consumed) * 100) / 100);
                const ref = copies[0];
                const minQty = parseFloat(ref.minQty) || 0;
                const wasAlerted = copies.some(m => m.alertShown);
                let alertShown = wasAlerted;

                if (newQty > minQty) alertShown = false;
                if (minQty > 0 && newQty <= minQty && !wasAlerted) {
                    lowStockMeds.push(`${ref.name} (${newQty} rimasti)`);
                    alertShown = true;
                }

                copies.forEach(m => {
                    m.boxQty = newQty;
                    m.alertShown = alertShown;
                    m.taken = false;
                });
            });
        });

        if (lowStockMeds.length > 0) {
            this.showAlert(
                "Scorte in esaurimento",
                `I seguenti farmaci sono sotto la soglia minima:\n\n${lowStockMeds.join('\n')}`
            );
        }

        this.data.lastOpened = today;
        this.saveData();
    },
    toggleDaySelection(day, btn) {
        const idx = this.selectedDays.indexOf(day);
        idx > -1 ? this.selectedDays.splice(idx, 1) : this.selectedDays.push(day);
        this.updateDayUI();
    },
    updateDayUI() {
        if (!this.selectedDays) this.selectedDays = [];
        document.querySelectorAll('.day-btn').forEach(b => {
            const day = b.dataset.day;
            this.selectedDays.includes(day)
                ? b.classList.add('selected')
                : b.classList.remove('selected');
        });
    },
    // MODIFICA: app.prepareNewMed()
    prepareNewMed() {
        document.getElementById('input-med-edit-id').value = '';
        this.currentEditingMed = null;
        this.resetMedModal();

        // --- NUOVO: Mostra/Nascondi bottone archivio in base al contenuto del DB
        const btnArchive = document.getElementById('btn-open-archive');
        if (this.data.drugDb && this.data.drugDb.length > 0) {
            btnArchive.classList.remove('hidden');
        } else {
            btnArchive.classList.add('hidden');
        }
        // -------------------------------------------------------------

        // Scroll to top
        const content = document.querySelector('#med-modal-content');
        if (content) content.scrollTop = 0;

        this.tempMedImage = null; // Reset immagine
        this.updateImagePreview();
        this.showModal('modal-med');
    },
    resetMedModal() {
        document.getElementById('med-modal-title').textContent = "Nuovo Farmaco";
        document.getElementById('input-med-name').value = '';
        document.getElementById('input-med-category').value = ''; // Forma
        document.getElementById('input-med-type').value = '';     // Categoria (NUOVO)
        document.getElementById('input-med-dose').value = '';
        document.getElementById('input-med-usage').value = '';
        document.getElementById('input-med-specific-time').value = '';

        // Reset campi blister
        document.getElementById('med-blister-count').value = '';
        document.getElementById('med-pills-per-blister').value = '';
        document.getElementById('calc-preview').textContent = '0'; // Reset Preview

        document.getElementById('med-box-qty').value = '';
        document.getElementById('med-min-qty').value = '';

        //
        document.getElementById('med-start-date').value = '';
        document.getElementById('med-duration').value = '';
        this.selectFrequency('daily');
        document.getElementById('btn-scan').classList.remove('hidden');
        document.getElementById('therapy-status-box').classList.add('hidden');
        document.getElementById('therapy-preview').classList.add('hidden');
        document.getElementById('therapy-month-wrapper').classList.add('hidden');

        this.selectedTimes = [];
        this.updateTimeUI();
        this.selectedDays = [];
        this.updateDayUI();
    },
    resetTherapyDates() {
        // 1. Svuota i campi input standard
        document.getElementById('med-start-date').value = '';
        document.getElementById('med-duration').value = '';
        document.getElementById('input-med-specific-time').value = '';

        // 2. Resetta il valore della Frequenza (Database)
        document.getElementById('med-frequency').value = 'daily';

        // 3. --- AGGIUNTA FONDAMENTALE: Resetta la grafica della Frequenza ---
        // Devi dire all'interfaccia di scrivere "Ogni giorno" e rimettere l'icona base
        const freqText = document.getElementById('freq-text-display');
        const freqIcon = document.getElementById('freq-icon-display');

        if (freqText) freqText.textContent = 'Ogni giorno';
        if (freqIcon) freqIcon.className = 'fa-solid fa-calendar-day text-slate-400 text-xs';
        // -------------------------------------------------------------------

        // 4. Nascondi tutte le sezioni di anteprima calendario e stato
        document.getElementById('therapy-preview').classList.add('hidden');
        document.getElementById('therapy-month-wrapper').classList.add('hidden');
        document.getElementById('therapy-status-box').classList.add('hidden');
        document.getElementById('therapy-legend').classList.add('hidden');

        // 5. Resetta la variabile interna del mese visualizzato
        this.currentTherapyMonth = null;

        this.showAlert("Reset", "Date, orari e frequenza reimpostati.");
    },
    resetStocks() {
        document.getElementById('med-box-qty').value = '';
        document.getElementById('med-min-qty').value = '';
    },
    // Aggiungi questa funzione:
    resetPackageConfig() {
        document.getElementById('med-blister-count').value = '';
        document.getElementById('med-pills-per-blister').value = '';
        document.getElementById('calc-preview').textContent = '0';
    },
    refreshTherapyUI() {
        const startDate = document.getElementById('med-start-date').value;
        const durationInput = document.getElementById('med-duration').value;

        // MODIFICA: Blocca solo se manca la data.
        // Se la durata manca, procediamo comunque per mostrare l'inizio.
        if (!startDate) return;

        // MODIFICA: Se la durata è vuota o zero, usa 1 come default per l'anteprima
        let durationDays = parseInt(durationInput);
        if (isNaN(durationDays) || durationDays < 1) {
            durationDays = 1;
        }

        const frequency = document.getElementById('med-frequency').value;

        // Calcola data fine al volo
        const endDate = this.calculateEndDate(startDate, durationDays, frequency);

        // Oggetto temporaneo simulato
        const tempMed = {
            startDate,
            durationDays,
            endDate,
            frequency,
            specificDays: this.currentEditingMed ? this.currentEditingMed.specificDays : {},
            daySpecificTimes: this.currentEditingMed ? this.currentEditingMed.daySpecificTimes : {},
            daySpecificDoses: this.currentEditingMed ? this.currentEditingMed.daySpecificDoses : {},
            suspensions: this.currentEditingMed ? this.currentEditingMed.suspensions : []
        };

        // Imposta il mese di visualizzazione se non c'è
        // oppure se la data selezionata è in un mese diverso da quello visualizzato
        const startObj = this.parseLocalDate(startDate);
        if (!this.currentTherapyMonth ||
            startObj.getMonth() !== this.currentTherapyMonth.getMonth() ||
            startObj.getFullYear() !== this.currentTherapyMonth.getFullYear()) {

            this.currentTherapyMonth = new Date(startObj.getFullYear(), startObj.getMonth(), 1);
        }

        // Ridisegna tutto
        this.renderTherapyPreview(tempMed);
        this.updateTherapyStatusUI(tempMed);
    },
    openEditMedModal(medId) {
        const profile = this.data.profiles.find(x => x.id === this.currentProfileId);
        const med = profile.meds.find(m => m.id === medId);
        if (med) {
            document.getElementById('input-med-edit-id').value = med.id;
            document.getElementById('input-med-name').value = med.name;
            document.getElementById('input-med-category').value = med.category || ""; // Forma
            document.getElementById('input-med-type').value = med.type || "";         // Categoria (NUOVO)
            document.getElementById('input-med-dose').value = med.dose || "";
            document.getElementById('input-med-usage').value = med.usage || "";

            document.getElementById('med-blister-count').value = med.blisterCount || '';
            document.getElementById('med-pills-per-blister').value = med.pillsPerBlister || '';
            // Aggiorna preview calcolo all'apertura
            if (med.blisterCount && med.pillsPerBlister) {
                document.getElementById('calc-preview').textContent = med.blisterCount * med.pillsPerBlister;
            } else {
                document.getElementById('calc-preview').textContent = '0';
            }

            // ... (resto della funzione invariato)
            document.getElementById('input-med-specific-time').value = med.specificTime || "";
            document.getElementById('med-box-qty').value = med.boxQty ?? 0;
            document.getElementById('med-min-qty').value = med.minQty ?? 0;
            this.selectFrequency(med.frequency || "daily");
            document.getElementById('med-start-date').value = med.startDate || "";
            document.getElementById('med-duration').value = med.durationDays ?? "";
            document.getElementById('med-modal-title').textContent = "Modifica Farmaco";
            document.getElementById('btn-scan').classList.add('hidden');
            const relatedMeds = profile.meds.filter(m => m.sharedId === med.sharedId);
            this.selectedTimes = relatedMeds.map(m => m.time);
            this.selectedDays = Array.isArray(med.days) ? [...med.days] : [];
            this.updateTherapyStatusUI(med);
            this.renderTherapyPreview(med);
            this.initTherapyMonthSwipe();
            this.tempMedImage = med.image || null;
            this.updateImagePreview();
            document.getElementById('modal-med').classList.remove('hidden');
            this.updateTimeUI();
            this.updateDayUI();
            // Usa la data salvata, altrimenti usa la data di oggi come fallback
            const dateString = med.startDate || this.getLocalDateString();
            const start = this.parseLocalDate(dateString);

            this.currentTherapyMonth = new Date(start.getFullYear(), start.getMonth(), 1);
            this.currentEditingMed = med;
            this.renderTherapyMonth(med);
        }
    },
    // Salvataggio del modulo farmaco: crea un farmaco nuovo o aggiorna quello in modifica
    handleMedicationSubmit() {
        const form = this.readMedForm();
        const editId = document.getElementById('input-med-edit-id').value;
        if (!this.validateMedForm(form)) return;

        const profile = this.data.profiles.find(x => x.id === this.currentProfileId);

        if (editId) {
            // ✏️ MODIFICA FARMACO
            if (this.updateExistingMed(profile, editId, form)) {
                this.showAlert("Modificato", `Il farmaco ${form.name} è stato aggiornato correttamente.`);
            }
        } else {
            // ➕ NUOVO FARMACO: una copia per ogni fascia oraria, tutte con lo stesso sharedId
            const sharedId = this.generateId();
            this.selectedTimes.forEach(t => profile.meds.push(this.createMedInstance(form, sharedId, t, {})));
            this.showAlert("Creato", `Il farmaco ${form.name} è stato creato correttamente.`);
        }

        // --- LOGICA DATABASE PERMANENTE ---
        this.updateDrugDatabase({
            name: form.name,
            category: form.category, // Forma
            type: form.type,         // Categoria Terapeutica
            dose: form.dose,
            usage: form.usage,
            blisterCount: form.blisterCount,
            pillsPerBlister: form.pillsPerBlister,
            image: form.imageToSave,
            minQty: form.minQty // Salviamo anche la soglia di avviso preferita
        });

        this.saveData();
        this.closeModal('modal-med');
        this.renderMedications();
        this.renderTherapyPreview({ startDate: form.startDate, frequency: form.frequency });
    },

    // Legge tutti i campi del modulo farmaco
    readMedForm() {
        const name = document.getElementById('input-med-name').value.trim();
        const category = document.getElementById('input-med-category').value.trim(); // Questo è la FORMA
        const type = document.getElementById('input-med-type').value.trim(); // NUOVO: Categoria
        const dose = document.getElementById('input-med-dose').value.trim();
        const usage = document.getElementById('input-med-usage').value.trim();
        const specificTime = document.getElementById('input-med-specific-time').value;
        const frequency = document.getElementById('med-frequency').value;
        const startDate = document.getElementById('med-start-date')?.value || null;
        const durationDays = parseInt(document.getElementById('med-duration')?.value) || null;
        const endDate = this.calculateEndDate(startDate, durationDays, frequency);

        const boxQty = parseFloat(document.getElementById('med-box-qty').value) || 0;
        const minQty = parseFloat(document.getElementById('med-min-qty').value) || 0;
        const imageToSave = this.tempMedImage;

        // NUOVO: Leggi i valori dei blister
        const blisterCount = parseFloat(document.getElementById('med-blister-count').value) || 0;
        const pillsPerBlister = parseFloat(document.getElementById('med-pills-per-blister').value) || 0;

        return { name, category, type, dose, usage, specificTime, frequency, startDate, durationDays, endDate,
            boxQty, minQty, imageToSave, blisterCount, pillsPerBlister };
    },

    // Controlli prima del salvataggio (mostra il messaggio e restituisce false se manca qualcosa)
    validateMedForm(form) {
        const { name, startDate, durationDays } = form;
        if (!name || this.selectedTimes.length === 0) {
            this.showAlert("Dati mancanti", "Inserisci almeno il Nome e l'Orario.");
            return false;
        }

        // NUOVO CONTROLLO VALIDAZIONE PERIODO TERAPIA
        if (startDate && durationDays <= 0) {
            this.showAlert(
                "Periodo Terapia Incompleto",
                "Hai selezionato una data di inizio ma non la durata.\n\nInserisci il numero di giorni di terapia oppure clicca su 'Resetta date' se è una cura continuativa senza scadenza."
            );
            return false; // Blocca il salvataggio
        }
        return true;
    },

    // UNICO punto in cui si costruisce un farmaco: usato sia per un farmaco nuovo sia per una
    // fascia oraria aggiunta in modifica, così le copie hanno sempre tutti gli stessi campi
    createMedInstance(form, sharedId, time, specificDays) {
        return {
            id: this.generateId(),
            sharedId,
            // Giorno in cui il farmaco entra in terapia: le statistiche non contano i giorni prima
            createdAt: this.getLocalDateString(),
            name: form.name,
            category: form.category,
            type: form.type,
            dose: form.dose,
            usage: form.usage,
            specificTime: form.specificTime,
            startDate: form.startDate,
            durationDays: form.durationDays,
            endDate: form.endDate,
            time,
            days: Array.isArray(this.selectedDays) ? [...this.selectedDays] : [],
            frequency: form.frequency,
            taken: false,
            boxQty: form.boxQty,
            minQty: form.minQty,
            blisterCount: form.blisterCount,
            pillsPerBlister: form.pillsPerBlister,
            therapyEndedAlertShown: false,
            alertShown: false,
            image: form.imageToSave,
            specificDays
        };
    },

    // Modifica: aggiorna tutte le copie del farmaco e aggiunge/toglie le fasce orarie
    updateExistingMed(profile, editId, form) {
        const med = profile.meds.find(m => m.id === editId);
        if (!med) return false;

        const sharedId = med.sharedId;
        // PRESERVA LE ECCEZIONI: se stiamo modificando, manteniamo il calendario specifico
        // Assumiamo che tutte le istanze abbiano le stesse eccezioni
        const preservedSpecificDays = med.specificDays || {};
        // Dosi cambiate dal calendario: valgono per il giorno intero, quindi per tutte le fasce
        const preservedDayDoses = med.daySpecificDoses || {};

        // 1. Aggiorna le proprietà comuni
        profile.meds.forEach(m => {
            if (m.sharedId !== sharedId) return;
            const oldQty = m.boxQty;
            m.name = form.name;
            m.category = form.category;
            m.type = form.type;
            m.dose = form.dose;
            m.usage = form.usage;
            m.specificTime = form.specificTime;
            m.startDate = form.startDate;
            m.durationDays = form.durationDays;
            m.endDate = form.endDate;
            m.days = Array.isArray(this.selectedDays) ? [...this.selectedDays] : [];
            m.frequency = form.frequency;
            m.blisterCount = form.blisterCount;
            m.pillsPerBlister = form.pillsPerBlister;
            m.boxQty = form.boxQty;
            m.minQty = form.minQty;
            m.image = form.imageToSave;
            // Assicurati che l'oggetto abbia la proprietà
            m.specificDays = preservedSpecificDays;
            m.daySpecificDoses = { ...preservedDayDoses };
            if (form.boxQty > form.minQty && form.boxQty > oldQty) m.alertShown = false;
        });

        // 2. Gestione degli orari (Aggiunta/Rimozione istanze)
        const existingInstances = profile.meds.filter(m => m.sharedId === sharedId);
        const existingTimes = existingInstances.map(m => m.time);

        const timesToAdd = this.selectedTimes.filter(t => !existingTimes.includes(t));
        const timesToRemove = existingTimes.filter(t => !this.selectedTimes.includes(t));

        if (timesToRemove.length > 0) {
            profile.meds = profile.meds.filter(m => !(m.sharedId === sharedId && timesToRemove.includes(m.time)));
        }

        timesToAdd.forEach(t => {
            const instance = this.createMedInstance(form, sharedId, t, preservedSpecificDays);
            // La nuova fascia eredita le sospensioni del farmaco (passate e in corso)
            if (med.suspensions) instance.suspensions = med.suspensions.map(s => ({ ...s }));
            instance.daySpecificDoses = { ...preservedDayDoses };
            profile.meds.push(instance);
        });
        return true;
    },
    normalizeMedications(profile) {
        profile.meds.forEach(m => {
            if (!m.sharedId) {
                m.sharedId = m.id;
            }
        });
    },
    // SOSTITUISCI la vecchia toggleMedication con questa:
    toggleMedication(id) {
        const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
        if (!profile) return;

        const med = profile.meds.find(m => m.id === id);
        if (!med) return;
        // Farmaco sospeso: non si può segnare (ridisegna per annullare la spunta)
        if (this.isSuspended(med)) { this.renderMedications(); return; }

        // 1. Inverti stato
        med.taken = !med.taken;

        // 2. GESTIONE STORICO (Nuovo)
        // Se non esiste l'oggetto history, crealo
        if (!med.history) med.history = {};

        const todayISO = app.getLocalDateString(new Date());

        if (med.taken) {
            // Se preso, salva true nella data di oggi
            med.history[todayISO] = true;
        } else {
            // Se deselezionato, rimuovi la voce dallo storico
            delete med.history[todayISO];
        }

        this.saveData();
        this.renderMedications();
    },
    takePrnMed(id) {
        const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
        const med = profile.meds.find(m => m.id === id);
        if (!med) return;
        if (this.isSuspended(med)) {
            this.showAlert("Farmaco sospeso", `${med.name} è sospeso.\nRiprendi l'assunzione per poterlo registrare.`);
            return;
        }

        // Inizializza l'array dello storico se non esiste
        if (!med.prnHistory) med.prnHistory = [];

        // Aggiungi il timestamp di adesso
        med.prnHistory.push(new Date().toISOString());

        // Scala la scorta se gestita
        // (su tutte le copie dello stesso farmaco, che condividono la scorta)
        if (med.boxQty > 0) {
            const newQty = Math.max(0, Math.round((med.boxQty - this.parseDose(med.dose)) * 100) / 100);
            profile.meds.forEach(m => {
                if (m === med || (med.sharedId && m.sharedId === med.sharedId)) m.boxQty = newQty;
            });
        }

        this.saveData();
        this.renderMedications();

        // Feedback visivo rapido
        this.showAlert("Registrato", `${med.name}: assunzione registrata.`);
    },
    uncheckAllMeds() {
        const profile = this.data.profiles.find(x => x.id === this.currentProfileId);
        if (profile) {
            this.showConfirm("Conferma", "Deselezionare tutto?", () => {
                profile.meds.forEach(m => m.taken = false);
                this.saveData(); this.renderMedications();
            });
        }
    },
    deleteMedication(id) {
        // Invece di showConfirm, apriamo il modale di scelta specifico
        this.medToDeleteId = id; // Salviamo l'ID temporaneamente
        this.showModal('modal-delete-choice');
    },
    // NUOVE FUNZIONI PER GESTIRE LA SCELTA ELIMINAZIONE
    confirmDeleteMed(mode) {
        const profile = this.data.profiles.find(x => x.id === this.currentProfileId);
        if (!profile || !this.medToDeleteId) return;

        const med = profile.meds.find(m => m.id === this.medToDeleteId);
        if (!med) return;

        // 1. Rimuovi dalla terapia attiva TUTTE le fasce orarie del farmaco (stesso sharedId):
        //    prima restavano le altre fasce, anche con "elimina definitivamente".
        //    Per togliere una sola fascia si usa il modulo di modifica.
        profile.meds = profile.meds.filter(m => m.id !== med.id && !(med.sharedId && m.sharedId === med.sharedId));

        // 2. Se scelto "Definitivo", rimuovi anche dal DB Permanente
        if (mode === 'permanent') {
            if (this.data.drugDb) {
                this.data.drugDb = this.data.drugDb.filter(d => d.name.toLowerCase() !== med.name.toLowerCase());
            }
            this.showAlert("Eliminato", "Farmaco rimosso definitivamente dal database.");
        } else {
            this.showAlert("Archiviato", "Farmaco rimosso dalla terapia ma mantenuto in archivio.");
        }

        this.saveData();
        this.renderMedications();
        this.closeModal('modal-delete-choice');
        this.medToDeleteId = null;
    },
    showMedNote(medId) {
        const profile = this.data.profiles.find(x => x.id === this.currentProfileId);
        const med = profile.meds.find(m => m.id === medId);

        if (med && med.usage) {
            document.getElementById('note-modal-title').textContent = med.name;
            document.getElementById('note-modal-content').textContent = med.usage;
            this.showModal('modal-show-note');
        }
    },
    // Lista dei farmaci del profilo aperto, divisa per fascia oraria
    renderMedications() {
        const profile = this.data.profiles.find(x => x.id === this.currentProfileId);
        if (!profile) return;

        const prefs = this.data.preferences || { showCart: true, showNotes: true, showEdit: true, showDelete: true };

        const rawName = (profile.nickname && profile.nickname.trim() !== '') ? profile.nickname : profile.name;
        // textContent è già sicuro: escapeHTML qui mostrerebbe "&lt;" e "&amp;" a schermo
        document.getElementById('current-profile-name').textContent = rawName;

        this.renderMedToolbar(profile);

        // Dati di "oggi" condivisi da tutte le schede
        const dayMap = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
        const now = new Date();
        const ctx = {
            prefs,
            now,
            todayShort: dayMap[now.getDay()],
            todayISO: now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0')
        };

        let hasMeds = false;
        ['Mattina', 'Pomeriggio', 'Sera', 'Al Bisogno'].forEach(time => {
            const container = document.getElementById(`med-list-${time.toLowerCase()}`);
            if (!container) return;

            container.innerHTML = '';
            const meds = profile.meds.filter(m => m.time === time);
            if (meds.length === 0) return;
            hasMeds = true;

            container.appendChild(this.buildTimeSectionHeader(time, meds));

            const listContainer = document.createElement('div');
            listContainer.id = `list-${time}`;
            listContainer.className = `space-y-3 ${this.expandedSections.includes(time) ? '' : 'hidden'}`;
            meds.forEach(med => listContainer.appendChild(this.buildMedCard(med, time, ctx)));
            container.appendChild(listContainer);
        });

        document.getElementById('med-empty-state').classList.toggle('hidden', hasMeds);
    },

    // Pulsanti "Deseleziona" / "Tutto Preso" sopra la lista
    renderMedToolbar(profile) {
        const toolbarContainer = document.getElementById('med-toolbar');
        if (!toolbarContainer) return;
        const anyTakenGlobal = profile.meds.some(m => m.taken);
        toolbarContainer.innerHTML = `

                                <div class="flex items-center justify-end gap-2"> ${anyTakenGlobal ? `

                                    <button onclick="app.resetDailyIntake()" class="px-3 py-1.5 bg-rose-50 text-rose-600 border border-rose-100 rounded-lg text-xs font-bold shadow-sm hover:bg-rose-100 active:scale-95 transition-all flex items-center gap-1.5">

                                        <i class="fa-regular fa-square-minus"></i> Deseleziona

                                    </button>` : ''}

                                    <button onclick="app.askMarkAllTaken()" class="px-3 py-1.5 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-lg text-xs font-bold shadow-sm hover:bg-emerald-100 active:scale-95 transition-all flex items-center gap-1.5">

                                        <i class="fa-solid fa-check-double"></i> Tutto Preso

                                    </button>

                                </div>

                            `;
    },

    // Intestazione cliccabile di una fascia oraria (icona, nome, "2 / 3 assunti")
    buildTimeSectionHeader(time, meds) {
        // I farmaci sospesi non contano nel "presi / totale"
        const activeMeds = meds.filter(m => !this.isSuspended(m));
        const totalCount = activeMeds.length;
        const takenCount = activeMeds.filter(m => m.taken).length;
        const isOpen = this.expandedSections.includes(time);
        const rotateClass = isOpen ? 'rotate-180' : '';

        const header = document.createElement('div');
        header.className = "cursor-pointer bg-white p-3 rounded-xl card-shadow border border-slate-100 mb-2 flex items-center justify-between transition-all hover:bg-slate-50";
        header.onclick = () => this.toggleSection(time);

        let icon = '';
        if (time === 'Mattina') icon = 'fa-sun text-orange-400';
        else if (time === 'Pomeriggio') icon = 'fa-cloud-sun text-yellow-500';
        else if (time === 'Sera') icon = 'fa-moon text-indigo-400';
        else if (time === 'Al Bisogno') icon = 'fa-kit-medical text-red-500';

        header.innerHTML = `

                                    <div class="flex items-center gap-3">

                                        <div class="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center">

                                            <i class="fa-solid ${icon} text-lg"></i>

                                        </div>

                                        <div>

                                            <h4 class="font-bold text-slate-700 text-sm">${time}</h4>

                                            <p class="text-[10px] text-slate-400 font-semibold">${takenCount} / ${totalCount} assunti</p>

                                        </div>

                                    </div>

                                    <i id="chevron-${time}" class="fa-solid fa-chevron-down text-slate-300 transition-transform duration-300 ${rotateClass}"></i>

                                `;
        return header;
    },

    // Il farmaco è previsto oggi? A che ora? È ancora "bloccato" perché l'orario non è arrivato?
    getMedDayState(med, ctx) {
        const { now, todayISO, todayShort } = ctx;
        let isToday = false;

        if (med.specificDays && med.specificDays[todayISO] !== undefined) {
            isToday = med.specificDays[todayISO].includes(med.time);
        } else {
            const isFreqMatch = this.isMedicationDay(med, todayISO);
            const isDayMatch = !Array.isArray(med.days) || med.days.length === 0 || med.days.includes(todayShort);
            isToday = isFreqMatch && isDayMatch;
        }

        let effectiveTime = med.specificTime;
        if (med.daySpecificTimes && med.daySpecificTimes[todayISO]) effectiveTime = med.daySpecificTimes[todayISO];

        let isLocked = false;
        if (effectiveTime && !med.taken && isToday) {
            const currentTime = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
            if (currentTime < effectiveTime) isLocked = true;
        }

        // Sospensione in corso (o null): la scheda resta visibile ma non si può segnare
        const suspension = this.getActiveSuspension(med);

        // Dose di oggi: quella standard o quella cambiata dal calendario per questa data
        const effectiveDose = this.getDoseOn(med, todayISO);

        return { isToday, effectiveTime, isLocked, suspension, effectiveDose };
    },

    // Pulsanti azione della scheda (foto, nota, carrello, modifica, elimina, smemorato)
    buildMedActionButtons(med, prefs) {
        const photoBtn = (prefs.showImage !== false && med.image) ?
            `<button onclick="event.stopPropagation(); app.showMedImageFromList('${med.id}')" class="text-slate-400 hover:text-slate-600 p-2"><i class="fa-solid fa-image"></i></button>` : '';
        const noteBtn = (prefs.showNotes && med.usage) ?
            `<button onclick="app.showMedNote('${med.id}')" class="text-amber-400 hover:text-amber-500 p-2"><i class="fa-solid fa-note-sticky"></i></button>` : '';
        const cartBtn = prefs.showCart ?
            `<button onclick="app.quickAddToShoppingList('${med.id}')" class="text-emerald-400 hover:text-emerald-600 p-2 transition-colors"><i class="fa-solid fa-cart-plus"></i></button>` : '';
        const editBtn = prefs.showEdit ?
            `<button onclick="app.openEditMedModal('${med.id}')" class="text-blue-400 hover:text-blue-600 p-2"><i class="fa-solid fa-pen"></i></button>` : '';
        const deleteBtn = prefs.showDelete ?
            `<button onclick="app.deleteMedication('${med.id}')" class="text-red-400 hover:text-red-600 p-2"><i class="fa-solid fa-trash-can"></i></button>` : '';

        const smemoratoBtn = (med.frequency === 'alternate' && med.startDate) ?
            `<button onclick="app.askShiftTherapy('${med.sharedId}')" class="text-fuchsia-400 hover:text-fuchsia-600 p-2 transition-colors" title="Sposta avanti di 1 giorno"><i class="fa-solid fa-forward-step"></i></button>` : '';

        // Sospendi / Riprendi: sempre visibile (non dipende dalle preferenze)
        const suspendBtn = this.isSuspended(med)
            ? `<button onclick="app.resumeMed('${med.id}')" class="text-emerald-500 hover:text-emerald-700 p-2" title="Riprendi l'assunzione"><i class="fa-solid fa-play"></i></button>`
            : `<button onclick="app.askSuspendMed('${med.id}')" class="text-slate-400 hover:text-amber-600 p-2" title="Sospendi il farmaco"><i class="fa-solid fa-pause"></i></button>`;

        return { photoBtn, noteBtn, cartBtn, editBtn, deleteBtn, smemoratoBtn, suspendBtn };
    },

    // Etichette di stato terapia ("Sospeso", "In corso", "Restano 5g", "Oggi non previsto")
    buildTherapyBadge(med, isToday, suspension) {
        const therapy = this.getTherapyStatus(med);
        let therapyBadge = '';
        if (suspension) {
            const [, m, d] = suspension.from.split('-');
            therapyBadge += `<div class="therapy-badge paused"><span class="label">⏸ Sospeso</span><span class="dot">•</span><span class="sub">dal ${d}/${m}</span></div>`;
        }
        if (therapy) {
            therapyBadge += `<div class="therapy-badge ${therapy.cls}"><span class="label">${therapy.label}</span><span class="dot">•</span><span class="sub">${therapy.sub}</span></div>`;
        }
        if (!isToday && !suspension) {
            therapyBadge += `<div class="therapy-badge gray"><span class="label">Oggi non previsto</span></div>`;
        }
        return therapyBadge;
    },

    // Scheda di un farmaco: "al bisogno" (contatore + Prendi) o programmata (checkbox)
    buildMedCard(med, time, ctx) {
        const state = this.getMedDayState(med, ctx);
        const buttons = this.buildMedActionButtons(med, ctx.prefs);
        // Sulla scheda "al bisogno" la sospensione è già indicata dal pulsante "Sospeso"
        const therapyBadge = this.buildTherapyBadge(med, state.isToday, time === 'Al Bisogno' ? null : state.suspension);

        const card = document.createElement('div');
        if (time === 'Al Bisogno') {
            this.fillPrnMedCard(card, med, ctx, buttons, therapyBadge, state);
        } else {
            this.fillScheduledMedCard(card, med, time, state, buttons, therapyBadge);
        }
        return card;
    },

    // Scheda "al bisogno": quante volte preso oggi, totale assunto, pulsante Prendi
    fillPrnMedCard(card, med, ctx, buttons, therapyBadge, state) {
        const { prefs, todayISO } = ctx;
        const { noteBtn, suspendBtn } = buttons;
        const suspended = !!state.suspension;
        // SICUREZZA: Sanitizziamo le variabili immesse dall'utente
        const safeMedName = this.escapeHTML(med.name);
        const safeCategory = this.escapeHTML(med.category);
        const safeDose = this.escapeHTML(med.dose);

        // I timestamp sono in UTC: si confronta la data LOCALE (dopo mezzanotte l'UTC è ancora "ieri")
        const countToday = (med.prnHistory || []).filter(ts => this.getLocalDateString(new Date(ts)) === todayISO).length;

        let totalDisplay = `Oggi: ${countToday} ${countToday === 1 ? 'volta' : 'volte'}`;
        if (countToday > 0 && med.dose) {
            const match = med.dose.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/);
            if (match) {
                const val = parseFloat(match[1].replace(',', '.'));
                const unit = match[2];
                const total = parseFloat((val * countToday).toFixed(2));
                totalDisplay = `Totale: ${total} ${unit} <span class="text-slate-400 font-normal">(${countToday} ass.)</span>`;
            }
        }

        const activeBorder = countToday > 0 ? 'border-red-200 bg-red-50/30' : 'border-slate-200 bg-white';
        card.className = `p-4 rounded-xl card-shadow border ${activeBorder} mb-3 flex items-center justify-between transition-all ${suspended ? 'med-card-suspended' : ''}`;

        // Sospeso: al posto di "Prendi" un pulsante disattivato
        const takeBtn = suspended
            ? `<button disabled class="bg-slate-200 text-slate-400 px-3 py-1.5 rounded-lg font-bold text-xs flex items-center gap-1 ml-1 mr-1 cursor-not-allowed"><i class="fa-solid fa-pause"></i> Sospeso</button>`
            : `<button onclick="app.takePrnMed('${med.id}')" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold text-xs shadow-md active:scale-95 transition-all flex items-center gap-1 ml-1 mr-1"><i class="fa-solid fa-plus"></i> Prendi</button>`;

        const editBtnSmall = prefs.showEdit ? `<button onclick="app.openEditMedModal('${med.id}')" class="text-slate-300 hover:text-blue-500 text-xs p-1"><i class="fa-solid fa-pen"></i></button>` : '';
        const deleteBtnSmall = prefs.showDelete ? `<button onclick="app.deleteMedication('${med.id}')" class="text-slate-300 hover:text-red-500 text-xs p-1"><i class="fa-solid fa-trash"></i></button>` : '';

        card.innerHTML = `

                                            <div class="flex items-center gap-4 flex-1 overflow-hidden">

                                                <div class="w-10 h-10 rounded-full ${countToday > 0 ? 'bg-red-500 text-white shadow-md border-red-600' : 'bg-slate-50 text-slate-300 border-slate-200'} flex items-center justify-center font-bold text-lg border shrink-0 transition-colors">

                                                    ${countToday}

                                                </div>

                                                <div class="overflow-hidden">

                                                    <h4 class="font-bold text-slate-800 leading-tight truncate">${safeMedName}</h4>

                                                    <div class="flex flex-col">

                                                        ${safeCategory ? `<p class="text-[10px] font-semibold text-slate-500 uppercase tracking-tighter">${safeCategory}</p>` : ''}

                                                        <p class="text-xs font-bold ${countToday > 0 ? 'text-red-600' : 'text-slate-400'} mt-0.5 mb-0.5 truncate">${totalDisplay}</p>

                                                        <div class="flex flex-col">

                                                            ${safeDose ? `<p class="text-[10px] text-slate-400 opacity-80">Dose singola: ${safeDose}</p>` : ''}

                                                            ${therapyBadge || ''}

                                                        </div>

                                                    </div>

                                                </div>

                                            </div>

                                            <div class="flex items-center gap-1 pl-2">

                                                ${noteBtn}

                                                ${takeBtn}

                                                <div class="flex flex-col gap-1 ml-1 border-l pl-2 border-slate-100">

                                                    ${suspendBtn.replace('p-2', 'text-xs p-1')}

                                                    ${editBtnSmall}

                                                    ${deleteBtnSmall}

                                                </div>

                                            </div>`;
    },

    // Scheda di un farmaco programmato: checkbox, orario, dose, note, pulsanti
    fillScheduledMedCard(card, med, time, state, buttons, therapyBadge) {
        const { isToday, isLocked, effectiveTime, suspension, effectiveDose } = state;
        const { smemoratoBtn, photoBtn, cartBtn, noteBtn, editBtn, deleteBtn, suspendBtn } = buttons;
        // Spunta non utilizzabile: orario non ancora arrivato, oggi non previsto o farmaco sospeso
        const checkDisabled = isLocked || !isToday || !!suspension;
        // SICUREZZA: Sanitizziamo le variabili immesse dall'utente
        const safeMedName = this.escapeHTML(med.name);
        const safeCategory = this.escapeHTML(med.category);
        const safeDose = this.escapeHTML(effectiveDose);
        const doseChanged = !!effectiveDose && effectiveDose !== med.dose;
        const safeUsage = this.escapeHTML(med.usage);

        const categoryClass = `med-card-${time.toLowerCase()}`;

        let visualClass = '';
        if (suspension) visualClass = 'med-card-suspended';
        else if (!isToday) visualClass = 'med-card-inactive';
        else if (isLocked) visualClass = 'opacity-60 bg-slate-100 border-slate-200';

        const takenClass = med.taken ? 'med-card-taken' : '';

        const timeDisplay = effectiveTime
            ? `<span class="text-xs font-bold ${isLocked ? 'text-orange-500' : 'text-slate-600'} bg-white px-1.5 py-0.5 rounded border mr-2 flex-shrink-0">${isLocked ? '<i class="fa-solid fa-lock mr-1"></i>' : ''}${effectiveTime}</span>`
            : '';

        card.className = `p-4 rounded-xl card-shadow border mb-3 flex items-center justify-between transition-all ${categoryClass} ${takenClass} ${visualClass}`;

        card.innerHTML = `

                                            <div class="flex items-center gap-4 flex-1 overflow-hidden card-main-content">

                                                <input type="checkbox" class="med-checkbox" ${med.taken ? 'checked' : ''} ${checkDisabled ? 'disabled' : ''} onchange="app.toggleMedication('${med.id}')">

                                                <div class="overflow-hidden ${med.taken ? 'opacity-40' : ''} ${!checkDisabled ? 'cursor-pointer' : ''}">

                                                    <div class="flex items-center">

                                                        ${timeDisplay}

                                                        <h4 class="font-bold text-slate-800 leading-tight truncate">${safeMedName}</h4>

                                                    </div>

                                                    <div class="flex flex-col">

                                                        ${safeCategory ? `<p class="text-[10px] font-semibold text-slate-500 uppercase tracking-tighter">${safeCategory}</p>` : ''}

                                                        <div class="flex flex-col mt-0.5">

                                                            ${safeDose ? `<p class="text-xs text-blue-700 font-bold mb-0.5">${safeDose}${doseChanged ? ' <span class="text-[9px] font-bold text-amber-700 bg-amber-50 border border-amber-200 rounded px-1 align-middle" title="Dose cambiata per oggi dal calendario">solo oggi</span>' : ''}</p>` : ''}

                                                            ${safeUsage ? `<p class="text-[10px] text-slate-400 italic truncate">${safeUsage}</p>` : ''}

                                                            ${therapyBadge}

                                                        </div>

                                                    </div>

                                                </div>

                                            </div>

                                            <div class="flex items-center card-actions">

                                                ${suspendBtn}

                                                ${smemoratoBtn}

                                                ${photoBtn}

                                                ${cartBtn}

                                                ${noteBtn}

                                                ${editBtn}

                                                ${deleteBtn}

                                            </div>`;
    },
    showMedImageFromList(medId) {
        const profile = this.data.profiles.find(x => x.id === this.currentProfileId);
        const med = profile.meds.find(m => m.id === medId);
        if (med && med.image) {
            document.getElementById('full-image-display').src = med.image;
            document.getElementById('modal-image-view').classList.remove('hidden');
        }
    },
    toggleSection(time) {
        if (this.expandedSections.includes(time)) {
            this.expandedSections = this.expandedSections.filter(t => t !== time);
        } else {
            this.expandedSections.push(time);
        }

        const list = document.getElementById(`list-${time}`);
        const chevron = document.getElementById(`chevron-${time}`);
        if (list) list.classList.toggle('hidden');
        if (chevron) chevron.classList.toggle('rotate-180');
    },
    toggleTimeSelection(time, btn) {
        const idx = this.selectedTimes.indexOf(time);
        idx > -1 ? this.selectedTimes.splice(idx, 1) : this.selectedTimes.push(time);

        this.updateTimeUI();
    },
    updateTimeUI() {
        document.querySelectorAll('.time-btn').forEach(b => {
            const val = b.dataset.val;
            if (val) {
                this.selectedTimes.includes(val) ? b.classList.add('selected') : b.classList.remove('selected');
            }
        });
    },
    // --- CONTROLLO GIORNALIERO AUTOMATICO ---
    checkNewDay() {
        // 1. Ottieni la data di OGGI in formato stringa locale (YYYY-MM-DD)
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        // 2. Se è la prima volta che apri l'app in assoluto, salva oggi e esci
        if (!this.data.lastOpenDate) {
            this.data.lastOpenDate = today;
            this.saveData();
            return;
        }

        // 3. CONFRONTO: Se la data salvata è diversa da oggi -> RESET
        if (this.data.lastOpenDate !== today) {

            // Reset di tutti i farmaci di tutti i profili
            this.data.profiles.forEach(profile => {
                profile.meds.forEach(med => {
                    med.taken = false; // Resetta lo stato "preso"

                    // Se in futuro userai orari specifici con checkbox multiple, resettale qui
                    // es: med.takenTimes = [];
                });
            });

            // Aggiorna la data di ultimo accesso a OGGI
            this.data.lastOpenDate = today;

            // Salva e Aggiorna UI
            this.saveData();
            this.renderProfiles(); // O updateUI() a seconda della tua versione

            // Mostra il modale di benvenuto
            this.showModal('modal-new-day');
        }
    },
    // --- FUNZIONI PER "SEGNA TUTTO PRESO" ---

    askMarkAllTaken() {
        // Usa showConfirm: sostituire il pulsante "Sì" (come faceva prima) rompeva tutte
        // le conferme successive, che eseguivano di nuovo "Tutto Preso"
        this.showConfirm(
            "Tutto preso oggi?",
            "Vuoi segnare come <b>presi</b> tutti i farmaci previsti per oggi?<br>L'operazione vale solo per la giornata odierna.",
            () => this.confirmMarkAllTaken()
        );
    },

    // Segna come presi i farmaci previsti oggi: stessa logica delle statistiche (isScheduledOn),
    // quindi esclude "Al Bisogno", sospesi, giorni non previsti (frequenza, giorni fissi,
    // eccezioni, fine terapia). Registra anche lo storico, come la spunta singola.
    confirmMarkAllTaken() {
        const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
        if (!profile) return;

        const todayISO = this.getLocalDateString();
        let count = 0;

        profile.meds.forEach(med => {
            if (med.taken || !this.isScheduledOn(med, todayISO)) return;
            med.taken = true;
            if (!med.history) med.history = {};
            med.history[todayISO] = true;
            count++;
        });

        this.saveData();
        this.renderMedications(); // Ricarica la lista per vedere le spunte verdi

        if (count > 0) {
            this.showAlert("Fatto", `Segnati ${count} farmaci come presi!`);
        } else {
            this.showAlert("Info", "Tutti i farmaci di oggi erano già segnati.");
        }
    },

    // --- SOSPENSIONE DI UN FARMACO ---
    // Il farmaco resta visibile ma non si può segnare finché non viene ripreso.
    // Vale per tutte le fasce orarie dello stesso farmaco.
    askSuspendMed(id) {
        const med = this.findCurrentMed(id);
        if (!med) return;
        this.showConfirm(
            "Sospendi farmaco",
            `Vuoi sospendere <b>${this.escapeHTML(med.name)}</b>?<br><br>` +
            "Resterà visibile nella terapia ma non potrai segnarlo come preso finché non riprendi l'assunzione. " +
            "I giorni di sospensione non contano come dosi saltate.<br><br>" +
            "<span class=\"text-xs\">I promemoria già aggiunti al calendario del telefono non vengono rimossi.</span>",
            () => this.setMedSuspended(id, true)
        );
    },

    // Ripresa: se la terapia ha una durata e durante la sospensione sono saltati giorni
    // di assunzione, chiede se recuperarli spostando in avanti la fine della terapia
    resumeMed(id) {
        const med = this.findCurrentMed(id);
        if (!med) return;
        const open = this.getActiveSuspension(med);
        const today = this.getLocalDateString();
        const missed = (open && med.endDate && med.durationDays)
            ? this.countSuspendedDoseDays(med, open.from, today) : 0;

        if (missed === 0) {
            this.setMedSuspended(id, false);
            this.showAlert("Assunzione ripresa", `${med.name} è di nuovo attivo da oggi.`);
            return;
        }

        const newEnd = this.extendEndDate(med, missed);
        const fmt = iso => this.parseLocalDate(iso).toLocaleDateString('it-IT');
        const word = missed === 1 ? 'giorno' : 'giorni';
        this.pendingResume = { id, missed, newEnd };
        document.getElementById('resume-med-message').innerHTML =
            `Durante la sospensione di <b>${this.escapeHTML(med.name)}</b> (dal ${fmt(open.from)}) ` +
            `sono saltati <b>${missed} ${word}</b> di terapia.<br><br>` +
            `Vuoi recuperarli? La fine della terapia passerebbe dal <b>${fmt(med.endDate)}</b> al <b>${fmt(newEnd)}</b>.`;
        document.getElementById('resume-med-recover').textContent = `Recupera ${missed} ${word}`;
        this.showModal('modal-resume-med');
    },

    confirmResumeMed(recover) {
        const pending = this.pendingResume;
        this.pendingResume = null;
        this.closeModal('modal-resume-med');
        if (!pending) return;
        const med = this.findCurrentMed(pending.id);
        if (!med) return;

        if (recover) {
            const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
            const durationDays = this.durationForEndDate(med, pending.newEnd);
            const today = this.getLocalDateString();
            profile.meds.forEach(m => {
                if (m === med || (med.sharedId && m.sharedId === med.sharedId)) {
                    m.endDate = pending.newEnd;
                    m.durationDays = durationDays;
                    // Era già terminata durante la sospensione: l'avviso di fine dovrà ricomparire
                    if (pending.newEnd >= today) m.therapyEndedAlertShown = false;
                }
            });
        }
        this.setMedSuspended(pending.id, false, recover ? pending.missed : 0);

        const msg = recover
            ? `${med.name} è di nuovo attivo da oggi.\nLa terapia ora termina il ${this.parseLocalDate(pending.newEnd).toLocaleDateString('it-IT')}.`
            : `${med.name} è di nuovo attivo da oggi.\nLa data di fine terapia non è cambiata.`;
        this.showAlert("Assunzione ripresa", msg);
    },

    // Le fasce di un farmaco (stesso sharedId), esclusi gli "Al Bisogno"
    getScheduledCopies(med) {
        const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
        const copies = profile ? profile.meds.filter(m => m === med || (med.sharedId && m.sharedId === med.sharedId)) : [med];
        return copies.filter(m => m.time !== 'Al Bisogno');
    },

    // Giorni (da "from" incluso a "to" escluso) in cui il farmaco andava preso ma era sospeso
    countSuspendedDoseDays(med, from, to) {
        const copies = this.getScheduledCopies(med).map(c => ({ ...c, suspensions: [] }));
        if (copies.length === 0) return 0;
        let count = 0;
        const d = this.parseLocalDate(from);
        for (let i = 0; i < 3660; i++) {
            const iso = this.getLocalDateString(d);
            if (iso >= to) break;
            if (copies.some(c => this.isScheduledOn(c, iso))) count++;
            d.setDate(d.getDate() + 1);
        }
        return count;
    },

    // Nuova fine terapia: dopo quella attuale aggiunge "extra" giorni di assunzione
    // (rispettando frequenza e giorni della settimana)
    extendEndDate(med, extra) {
        const copies = this.getScheduledCopies(med).map(c => ({ ...c, endDate: null, suspensions: [], specificDays: {} }));
        const d = this.parseLocalDate(med.endDate);
        let added = 0;
        for (let i = 0; i < 3660 && added < extra; i++) {
            d.setDate(d.getDate() + 1);
            if (copies.some(c => this.isScheduledOn(c, this.getLocalDateString(d)))) added++;
        }
        return this.getLocalDateString(d);
    },

    // Durata (giorni o, a giorni alterni, numero di dosi) che porta la fine a "endISO",
    // così il modulo di modifica ricalcola la stessa data
    durationForEndDate(med, endISO) {
        const diff = Math.round((this.parseLocalDate(endISO) - this.parseLocalDate(med.startDate)) / 86400000);
        return med.frequency === 'alternate' ? Math.floor(diff / 2) + 1 : diff + 1;
    },

    findCurrentMed(id) {
        const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
        return profile ? profile.meds.find(m => m.id === id) : null;
    },

    // Apre (suspend=true) o chiude la sospensione da oggi, su tutte le copie del farmaco
    setMedSuspended(id, suspend, recoveredDays = 0) {
        const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
        const med = profile && profile.meds.find(m => m.id === id);
        if (!med) return;

        const today = this.getLocalDateString();
        let list = (med.suspensions || []).map(s => ({ ...s }));
        const open = list.find(s => !s.to);

        if (suspend && !open) {
            list.push({ from: today, to: null });
        } else if (!suspend && open) {
            // Sospeso e ripreso nello stesso giorno: come se non fosse mai stato sospeso
            if (open.from === today) list = list.filter(s => s !== open);
            else {
                open.to = today;
                if (recoveredDays > 0) open.recoveredDays = recoveredDays;
            }
        }

        profile.meds.forEach(m => {
            if (m === med || (med.sharedId && m.sharedId === med.sharedId)) {
                m.suspensions = list.map(s => ({ ...s }));
            }
        });

        this.saveData();
        this.renderMedications();
    },
    // --- FUNZIONE DESELEZIONA TUTTO ---
    resetDailyIntake() {
        const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
        if (!profile) return;

        let count = 0;

        // Resetta lo stato 'taken' di tutti i farmaci
        profile.meds.forEach(med => {
            if (med.taken) {
                med.taken = false;
                count++;
            }
        });

        if (count > 0) {
            this.saveData();
            this.renderMedications(); // Ricarica la lista per aggiornare le icone

            // Feedback visivo
            this.showAlert("Reset effettuato", `Deselezionati ${count} farmaci.`);
        } else {
            // Questo caso è raro perché il pulsante viene nascosto se non c'è nulla di preso,
            // ma è utile per sicurezza.
            this.showAlert("Info", "Nessun farmaco da deselezionare.");
        }
    }
});
