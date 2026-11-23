// MedicinePro - therapy.js
// Terapia: frequenza, date di inizio/fine, calendario mensile, eccezioni per giorno

Object.assign(app, {
    // --- GESTIONE MODALE FREQUENZA ---
    openFrequencyModal() {
        const currentVal = document.getElementById('med-frequency').value || 'daily';

        // Aggiorna UI nel modale
        document.querySelectorAll('.freq-option').forEach(btn => {
            if (btn.dataset.val === currentVal) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });

        this.showModal('modal-frequency');
    },
    selectFrequency(val) {
        document.getElementById('med-frequency').value = val;

        // Aggiorna Display nel form
        const displayTxt = document.getElementById('freq-text-display');
        const displayIcon = document.getElementById('freq-icon-display');

        if (val === 'daily') {
            displayTxt.textContent = "Ogni Giorno";
            displayIcon.className = "fa-solid fa-calendar-day text-blue-500";
        } else {
            displayTxt.textContent = "Giorni Alterni";
            displayIcon.className = "fa-solid fa-calendar-days text-orange-500";
        }

        // Aggiorna anteprime se necessario usando la nuova funzione dinamica
        const startDate = document.getElementById('med-start-date')?.value || null;
        if (startDate) {
            this.refreshTherapyUI();
        }

        this.closeModal('modal-frequency');
    },
    initTherapyMonthSwipe() {
        if (this.therapyMonthSwipeInitialized) return;

        const el = document.getElementById('therapy-month-wrapper');
        if (!el) return;

        let startX = 0;

        el.addEventListener('touchstart', e => {
            startX = e.touches[0].clientX;
        }, { passive: true });

        el.addEventListener('touchend', e => {
            const endX = e.changedTouches[0].clientX;
            const diff = endX - startX;

            if (Math.abs(diff) < 40) return;

            if (diff > 0) {
                this.goToPrevTherapyMonth();
            } else {
                this.goToNextTherapyMonth();
            }
        });

        this.therapyMonthSwipeInitialized = true;
    },
    // --- GESTIONE DETTAGLIO GIORNO (OVERRIDE) ---

    openDayDetail(dateIso) {
        this.editingDayDate = dateIso;
        this.editingDayTimes = []; // Reset

        if (!this.currentEditingMed) return;

        // Formatta data per titolo
        const dateObj = this.parseLocalDate(dateIso);
        const options = { weekday: 'long', day: 'numeric', month: 'long' };
        document.getElementById('day-detail-date').textContent = dateObj.toLocaleDateString('it-IT', options);

        // --- CARICAMENTO ORARIO GIORNALIERO (NUOVO) ---
        const dayTimeInput = document.getElementById('day-detail-time');
        // Se esiste la struttura dati e c'è un valore per questa data, impostalo
        if (this.currentEditingMed.daySpecificTimes && this.currentEditingMed.daySpecificTimes[dateIso]) {
            dayTimeInput.value = this.currentEditingMed.daySpecificTimes[dateIso];
        } else {
            dayTimeInput.value = ''; // Altrimenti pulisci
        }
        // ----------------------------------------------

        // --- DOSE DEL GIORNO ---
        // Vuoto = dose standard (quella scritta nel modulo, anche se non ancora salvata)
        const standardDose = this.getStandardDoseForDayDetail();
        const doseInput = document.getElementById('day-detail-dose');
        const dayDoses = this.currentEditingMed.daySpecificDoses || {};
        doseInput.value = dayDoses[dateIso] || '';
        doseInput.placeholder = standardDose || 'Es. 2 compresse';
        document.getElementById('day-detail-dose-hint').textContent = standardDose
            ? `Lascia vuoto per la dose standard (${standardDose}). Vale per tutte le fasce di questo giorno.`
            : 'Se inserita, vale solo per questo giorno e per tutte le sue fasce.';

        // Logica esistente per i momenti (Mattina, Sera...)
        const specificDays = this.currentEditingMed.specificDays || {};

        if (specificDays[dateIso]) {
            this.editingDayTimes = [...specificDays[dateIso]];
        } else {
            // Fallback standard
            const isStandardActive = this.isMedicationDay(this.currentEditingMed, dateIso, true);
            if (isStandardActive) {
                const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
                if (profile) {
                    const siblings = profile.meds.filter(m => m.sharedId === this.currentEditingMed.sharedId);
                    this.editingDayTimes = siblings.map(m => m.time);
                } else {
                    this.editingDayTimes = [...this.selectedTimes];
                }
            } else {
                this.editingDayTimes = [];
            }
        }

        this.updateDayDetailUI();
        this.showModal('modal-day-detail');
    },
    toggleDayDetailTime(time) {
        const idx = this.editingDayTimes.indexOf(time);
        if (idx > -1) {
            this.editingDayTimes.splice(idx, 1);
        } else {
            this.editingDayTimes.push(time);
        }
        this.updateDayDetailUI();
    },
    updateDayDetailUI() {
        document.querySelectorAll('.detail-time-btn').forEach(btn => {
            const val = btn.dataset.val;
            if (this.editingDayTimes.includes(val)) {
                btn.classList.add('selected');
            } else {
                btn.classList.remove('selected');
            }
        });
    },
    saveDayDetail() {
        if (!this.currentEditingMed || !this.editingDayDate) return;

        // Assicuriamoci che gli oggetti contenitore esistano
        if (!this.currentEditingMed.specificDays) this.currentEditingMed.specificDays = {};
        if (!this.currentEditingMed.daySpecificTimes) this.currentEditingMed.daySpecificTimes = {}; // NUOVO

        // 1. Salva i momenti (Mattina/Sera)
        this.currentEditingMed.specificDays[this.editingDayDate] = [...this.editingDayTimes];

        // 2. Salva l'Orario Specifico (NUOVO)
        const timeVal = document.getElementById('day-detail-time').value;
        if (timeVal) {
            this.currentEditingMed.daySpecificTimes[this.editingDayDate] = timeVal;
        } else {
            // Se l'utente ha cancellato l'orario, rimuoviamo la chiave per liberare memoria
            delete this.currentEditingMed.daySpecificTimes[this.editingDayDate];
        }

        // 3. Dose del giorno: si salva solo se diversa da quella standard
        if (!this.currentEditingMed.daySpecificDoses) this.currentEditingMed.daySpecificDoses = {};
        const doseVal = document.getElementById('day-detail-dose').value.trim();
        if (doseVal && doseVal !== this.getStandardDoseForDayDetail()) {
            this.currentEditingMed.daySpecificDoses[this.editingDayDate] = doseVal;
        } else {
            delete this.currentEditingMed.daySpecificDoses[this.editingDayDate];
        }

        // Aggiorna vista calendario
        this.renderTherapyMonth(this.currentEditingMed);
        this.closeModal('modal-day-detail');
    },

    // Dose standard mostrata nel modale del giorno: quella del modulo aperto, altrimenti quella salvata
    getStandardDoseForDayDetail() {
        const formDose = (document.getElementById('input-med-dose')?.value || '').trim();
        return formDose || (this.currentEditingMed && this.currentEditingMed.dose) || '';
    },

    // Dose da prendere in una data: quella cambiata dal calendario o quella standard
    getDoseOn(med, dateISO) {
        return (med.daySpecificDoses && dateISO && med.daySpecificDoses[dateISO]) || med.dose;
    },
    updateTherapyStatusUI(med) {
        const box = document.getElementById('therapy-status-box');
        const badge = document.getElementById('therapy-badge');
        const countdown = document.getElementById('therapy-countdown');

        if (!med || !med.endDate || !med.startDate) {
            box.classList.add('hidden');
            return;
        }

        // Usa la logica centralizzata per la coerenza
        const countdownData = this.calculateTherapyCountdown(med);

        box.classList.remove('hidden');
        box.className = "p-3 rounded-xl border mt-3 text-sm flex items-center gap-3";

        if (countdownData.phase === 'not-started') {
            badge.textContent = "⏳ Non iniziata";
            badge.className = "bg-blue-100 text-blue-700 px-3 py-1 rounded-full text-xs font-bold";
            countdown.textContent = `Inizia tra ${countdownData.days}g`;
            box.classList.add("bg-blue-50", "border-blue-200");
        }
        else if (countdownData.phase === 'ended') {
            badge.textContent = "✅ Terminata";
            badge.className = "bg-slate-100 text-slate-700 px-3 py-1 rounded-full text-xs font-bold";
            countdown.textContent = `Terminata`;
            box.classList.add("bg-slate-50", "border-slate-200");
        }
        else {
            // Fase Attiva
            const diff = countdownData.days;
            if (diff <= 3) {
                badge.textContent = "▶️ In scadenza";
                badge.className = "bg-orange-100 text-orange-700 px-3 py-1 rounded-full text-xs font-bold";
                countdown.textContent = `Scade tra ${diff} giorni`;
                box.classList.add("bg-orange-50", "border-orange-200");
            } else {
                badge.textContent = "▶️ In corso";
                badge.className = "bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full text-xs font-bold";
                countdown.textContent = `Restano ${diff} giorni`;
                box.classList.add("bg-emerald-50", "border-emerald-200");
            }
        }
    },
    calculateEndDate(startDate, durationDays, frequency) {
        if (!startDate || !durationDays) return null;

        const start = this.parseLocalDate(startDate);

        // Caso giornaliero
        if (frequency !== "alternate") {
            const end = new Date(start);
            end.setDate(start.getDate() + durationDays - 1);
            return app.getLocalDateString(end);
        }

        // Caso giorni alterni → durata = numero di dosi
        let doses = 0;
        let offset = 0;

        while (doses < durationDays) {
            const d = new Date(start);
            d.setDate(start.getDate() + offset);

            if (offset % 2 === 0) {
                doses++;
            }

            offset++;
        }

        const end = new Date(start);
        end.setDate(start.getDate() + offset - 1);
        return app.getLocalDateString(end);
    },
    calculateTherapyCountdown(med) {
        if (!med.startDate || !med.endDate) return null;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const start = this.parseLocalDate(med.startDate);
        start.setHours(0, 0, 0, 0);

        const end = this.parseLocalDate(med.endDate);
        end.setHours(0, 0, 0, 0);

        // Se non è ancora iniziata
        if (today < start) {
            const daysToStart = Math.ceil((start - today) / 86400000);
            return {
                phase: 'not-started',
                days: daysToStart
            };
        }

        // Se è terminata
        if (today > end) {
            return {
                phase: 'ended',
                days: 0
            };
        }

        // In corso
        const daysLeft = Math.ceil((end - today) / 86400000);
        return {
            phase: 'active',
            days: daysLeft
        };
    },
    isMedicationDay(med, dateISO, ignoreOverride = false) {
        // 1. Controllo Override specifico per la data
        if (!ignoreOverride && med.specificDays && med.specificDays[dateISO] !== undefined) {
            // Se esiste un override, controlla se l'orario del farmaco è incluso nell'array
            return med.specificDays[dateISO].includes(med.time);
        }

        // 2. Logica Standard
        if (!med.startDate) return true;

        // Se è fuori dal range temporale standard, è falso (a meno che non ci fosse un override positivo sopra)
        if (med.endDate && dateISO > med.endDate) return false;
        if (dateISO < med.startDate) return false;

        if (med.frequency !== "alternate") return true;

        const start = this.parseLocalDate(med.startDate);
        const today = this.parseLocalDate(dateISO);

        const diffDays = Math.round(
            (today - start) / (1000 * 60 * 60 * 24)
        );

        return diffDays % 2 === 0;
    },
    // --- SOSPENSIONE ---
    // med.suspensions = [{ from: 'AAAA-MM-GG', to: 'AAAA-MM-GG' | null }], uguale su tutte le
    // fasce dello stesso farmaco. "to" è il giorno della ripresa (da quel giorno torna previsto);
    // null = sospensione ancora in corso.

    // Il farmaco è sospeso adesso? Restituisce la sospensione in corso (o null)
    getActiveSuspension(med) {
        return (med.suspensions || []).find(s => !s.to) || null;
    },

    isSuspended(med) {
        return !!this.getActiveSuspension(med);
    },

    // Il farmaco era sospeso in quella data?
    isSuspendedOn(med, dateISO) {
        return (med.suspensions || []).some(s => s.from <= dateISO && (!s.to || dateISO < s.to));
    },

    // Il farmaco era DA PRENDERE in quella data? Usata da statistiche e report.
    // Stessa logica della lista del giorno (renderMedications): override del
    // giorno, poi frequenza/date + giorni della settimana. "Al Bisogno" non è
    // mai previsto, quindi non conta come dose saltata; nemmeno i giorni di sospensione.
    isScheduledOn(med, dateISO) {
        if (med.time === 'Al Bisogno') return false;
        // Prima che il farmaco fosse inserito non poteva essere preso
        if (med.createdAt && dateISO < med.createdAt) return false;
        if (this.isSuspendedOn(med, dateISO)) return false;
        if (med.specificDays && med.specificDays[dateISO] !== undefined) {
            return med.specificDays[dateISO].includes(med.time);
        }
        if (!this.isMedicationDay(med, dateISO)) return false;
        if (!Array.isArray(med.days) || med.days.length === 0) return true;
        const dayMap = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
        return med.days.includes(dayMap[this.parseLocalDate(dateISO).getDay()]);
    },
    getTherapyDayInfo(med, dateISO) {
        if (!med.startDate || !med.durationDays) {
            return { active: false, activeTimes: [] };
        }

        // PRENDI LE TIMES STANDARD DAL MODALE CORRENTE (ANTEPRIMA)
        // Usiamo this.selectedTimes che è live nel modale di editing
        const standardTimes = this.selectedTimes || [];

        const start = this.parseLocalDate(med.startDate);
        const target = this.parseLocalDate(dateISO);

        // se prima dell'inizio terapia → fuori
        if (target < start) {
            return { active: false, activeTimes: [] };
        }

        // Verifica override
        let hasOverride = false;
        let isOverrideActive = false;
        let overrideTimes = [];

        if (med.specificDays && med.specificDays[dateISO] !== undefined) {
            hasOverride = true;
            overrideTimes = med.specificDays[dateISO];
            // Se l'array non è vuoto, consideriamo il giorno attivo visivamente nel calendario
            isOverrideActive = overrideTimes.length > 0;
        }

        let dosesCount = 0;
        let current = new Date(start);

        // Per il conteggio dosi, usiamo la logica standard
        // Ma per dire se è "active" nel calendario usiamo anche l'override

        while (dosesCount < med.durationDays) {
            const iso = app.getLocalDateString(current);
            // Qui usiamo true per ignorare l'override nel calcolo della sequenza teorica
            const isActiveStandard = this.isMedicationDay(med, iso, true);

            if (isActiveStandard) {
                dosesCount++;

                if (iso === dateISO) {
                    // SE GIORNO STANDARD ATTIVO
                    if (hasOverride) {
                        return {
                            active: isOverrideActive,
                            activeTimes: overrideTimes,
                            index: dosesCount,
                            isFirst: dosesCount === 1,
                            isLast: dosesCount === med.durationDays,
                            hasOverride: hasOverride
                        };
                    } else {
                        return {
                            active: true,
                            activeTimes: standardTimes, // Usa le times standard
                            index: dosesCount,
                            isFirst: dosesCount === 1,
                            isLast: dosesCount === med.durationDays,
                            hasOverride: false
                        };
                    }
                }
            }

            current.setDate(current.getDate() + 1);
        }

        // Se siamo qui, non è un giorno standard della terapia.
        // Ma potrebbe avere un override positivo (aggiunto extra)
        if (hasOverride && isOverrideActive) {
            return {
                active: true,
                activeTimes: overrideTimes,
                index: -1, // Extra
                isFirst: false,
                isLast: false,
                hasOverride: true
            };
        }

        return { active: false, activeTimes: [] };
    },
    getTherapyStatus(med) {
        if (!med.endDate) return null;
        const countdown = this.calculateTherapyCountdown(med);

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const end = this.parseLocalDate(med.endDate);
        end.setHours(0, 0, 0, 0);

        // ➕ +1 per includere il giorno finale
        const diffDays = Math.ceil((end - today) / 86400000);

        if (countdown.phase === 'not-started') {
            return {
                cls: 'blue',
                label: '⏳ Non iniziata',
                sub: `Inizia tra ${countdown.days}g`
            };
        }

        if (countdown.phase === 'active') {
            if (countdown.days <= 2) {
                return {
                    cls: 'orange',
                    label: '▶️ In scadenza',
                    sub: `Scade tra ${countdown.days}g`
                };
            }
            return {
                cls: 'green',
                label: '▶️ In corso',
                sub: `Restano ${countdown.days}g`
            };
        }

        if (countdown.phase === 'ended') {
            return {
                cls: 'gray',
                label: '✅ Terminata',
                sub: 'Completata'
            };
        }

        return {
            label: "In corso",
            sub: `Restano ${diffDays} giorni`,
            cls: "green"
        };
    },
    renderTherapyPreview(med) {
        const container = document.getElementById('therapy-calendar');
        const wrapper = document.getElementById('therapy-preview');
        const legend = document.getElementById('therapy-legend');
        const monthWrapper = document.getElementById('therapy-month-wrapper');

        if (container) container.innerHTML = '';
        if (wrapper) wrapper.classList.add('hidden');
        if (legend) legend.classList.add('hidden');
        if (monthWrapper) monthWrapper.classList.add('hidden');

        if (
            !med ||
            !med.startDate ||
            !med.durationDays ||
            med.durationDays <= 0
        ) {
            this.currentTherapyMonth = null;
            return;
        }

        wrapper.classList.remove('hidden');

        const start = this.parseLocalDate(med.startDate);
        const totalDoses = med.durationDays;

        if (med.frequency === "alternate") {
            legend.classList.remove('hidden');
        }

        let dosesCount = 0;
        let dayOffset = 0;

        while (dosesCount < totalDoses) {
            const d = new Date(start);
            d.setDate(start.getDate() + dayOffset);
            const iso = app.getLocalDateString(d);

            // Qui usiamo standard logic per la preview orizzontale
            const isActiveDay = this.isMedicationDay(med, iso, true);

            if (isActiveDay) {
                dosesCount++;

                let cls = 'bg-yellow-400 text-slate-900';

                if (dosesCount === 1) {
                    cls = 'bg-green-600 text-white';
                } else if (dosesCount === totalDoses) {
                    cls = 'bg-red-600 text-white';
                }

                const el = document.createElement('div');
                el.className = `w-9 h-9 flex-shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${cls}`;
                el.textContent = d.getDate();
                container.appendChild(el);
            }

            dayOffset++;
        }

        if (med.startDate && med.durationDays && med.endDate) {
            this.renderTherapyMonth(med);
        }
    },
    // Calendario mensile della terapia nel modulo del farmaco
    renderTherapyMonth(med) {
        if (!med || !med.startDate || !med.endDate) {
            return;
        }
        const wrapper = document.getElementById('therapy-month-wrapper');
        const container = document.getElementById('therapy-month');

        if (!wrapper || !container) return;

        container.innerHTML = '';

        wrapper.classList.remove('hidden');

        if (!this.currentTherapyMonth) {
            this.currentTherapyMonth = this.parseLocalDate(med.startDate);
        }

        const start = new Date(this.currentTherapyMonth);

        const header = document.getElementById('therapy-month-header');

        const monthNames = [
            'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
            'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'
        ];

        if (header) {
            header.textContent = `${monthNames[start.getMonth()]} ${start.getFullYear()}`;
        }
        const base = new Date(start);
        base.setDate(1);

        const month = base.getMonth();
        const year = base.getFullYear();

        const firstDay = new Date(year, month, 1).getDay();
        // Fix per far iniziare la settimana da Lunedì (0=Lun in array visuale, ma getDay() 0=Dom)
        const firstDayAdjusted = firstDay === 0 ? 6 : firstDay - 1;

        const daysInMonth = new Date(year, month + 1, 0).getDate();

        // Spazi vuoti prima
        for (let i = 0; i < firstDayAdjusted; i++) {
            container.appendChild(document.createElement('div'));
        }

        for (let d = 1; d <= daysInMonth; d++) {
            const date = new Date(year, month, d);

            const iso = [
                date.getFullYear(),
                String(date.getMonth() + 1).padStart(2, '0'),
                String(date.getDate()).padStart(2, '0')
            ].join('-');

            container.appendChild(this.buildTherapyDayCell(med, d, iso));
        }
    },

    // Cella di un giorno: numero, icone delle fasce (sole/luna), orologio se c'è un orario del giorno
    buildTherapyDayCell(med, d, iso) {
        const info = this.getTherapyDayInfo(med, iso);
        const { cls, isInteractable } = this.getTherapyDayClass(med, iso, info);

        const el = document.createElement('div');
        el.className = cls;

        // --- NUOVA POSIZIONE: ALTO A SINISTRA ---
        // Se c'è un orario specifico, aggiungi l'icona nell'angolo
        if (med.daySpecificTimes && med.daySpecificTimes[iso]) {
            const tlIcon = document.createElement('div');
            // 'absolute' la sgancia dal flusso normale
            // 'top-0.5 left-1' la posiziona nell'angolo con un po' di margine
            tlIcon.className = 'absolute top-0.5 left-1.5';

            // Icona piccola color fucsia
            tlIcon.innerHTML = `<i class="fa-solid fa-clock text-[10px] text-blue-600"></i>`;

            el.appendChild(tlIcon);
        }
        // ----------------------------------------

        // Dose cambiata per questo giorno: pastiglia in alto a destra
        if (med.daySpecificDoses && med.daySpecificDoses[iso]) {
            const trIcon = document.createElement('div');
            trIcon.className = 'absolute top-0 right-0.5 leading-none';
            trIcon.title = `Dose: ${med.daySpecificDoses[iso]}`;
            trIcon.innerHTML = `<i class="fa-solid fa-pills text-[8px] text-amber-600"></i>`;
            el.appendChild(trIcon);
        }

        // Giorno di sospensione: pausa al posto delle icone delle fasce
        if (this.isSuspendedOn(med, iso)) {
            const spanNumS = document.createElement('span');
            spanNumS.textContent = d;
            el.appendChild(spanNumS);
            const pause = document.createElement('div');
            pause.className = 'cal-icon-wrapper';
            pause.innerHTML = `<i class="fa-solid fa-pause text-[10px] text-amber-700"></i>`;
            el.appendChild(pause);
            el.classList.add('therapy-suspended');
            el.title = 'Farmaco sospeso';
            el.onclick = () => this.openDayDetail(iso);
            return el;
        }

        // Numero Giorno (Viene aggiunto dopo, così sta sopra/accanto senza problemi)
        const spanNum = document.createElement('span');
        spanNum.textContent = d;
        el.appendChild(spanNum);

        // ICONE ORARI (Solo se attivo) - Questo gestisce SOLO le icone in basso (Sole/Luna)
        if (info.active && info.activeTimes && info.activeTimes.length > 0) {
            const iconContainer = document.createElement('div');
            iconContainer.className = 'cal-icon-wrapper';

            // --- RIMOSSO IL BLOCCO CHE AGGIUNGEVA L'OROLOGIO QUI ---

            // Ordine fisso: Mattina, Pomeriggio, Sera
            const order = ['Mattina', 'Pomeriggio', 'Sera'];
            const sortedTimes = info.activeTimes.sort((a, b) => order.indexOf(a) - order.indexOf(b));

            sortedTimes.forEach(t => {
                const i = document.createElement('i');
                if (t === 'Mattina') i.className = 'fa-solid fa-sun text-[10px] text-orange-600';
                if (t === 'Pomeriggio') i.className = 'fa-solid fa-cloud-sun text-[10px] text-blue-500';
                if (t === 'Sera') i.className = 'fa-solid fa-moon text-[10px] text-indigo-800';

                if (info.hasOverride) {
                    i.classList.add('text-[11px]');
                }

                iconContainer.appendChild(i);
            });
            el.appendChild(iconContainer);
        }

        // MODIFICA: Aggiungi click handler se è interagibile
        if (isInteractable) {
            el.onclick = () => this.openDayDetail(iso);
        }

        return el;
    },

    // Stile della cella: inizio/metà/fine terapia, fuori terapia, eccezione del giorno, cliccabile
    getTherapyDayClass(med, iso, info) {
        // MODIFICA: Calcolo se il giorno è nel range della terapia
        let isWithinRange = false;
        if (med.startDate && med.endDate) {
            isWithinRange = (iso >= med.startDate && iso <= med.endDate);
        }

        // Il giorno è cliccabile se è attivo (ha farmaci) O se è nel periodo della terapia (anche se spento/grigio)
        const isInteractable = info.active || isWithinRange;

        let cls = 'therapy-day ';

        if (info.active) {
            cls += 'clickable-day '; // Questo ha l'hover effect
            if (info.isFirst) {
                cls += 'therapy-start';
            } else if (info.isLast) {
                cls += 'therapy-end';
            } else {
                cls += 'therapy-mid';
            }

            if (info.hasOverride) {
                cls += ' border-2 border-blue-500';
            }
        } else {
            cls += 'therapy-out';
        }

        // Se è interagibile ma spento (grigio), forziamo il cursore pointer
        if (isInteractable && !info.active) {
            cls += ' cursor-pointer hover:brightness-95';
        }

        return { cls, isInteractable };
    },
    goToPrevTherapyMonth() {
        this.currentTherapyMonth = new Date(
            this.currentTherapyMonth.getFullYear(),
            this.currentTherapyMonth.getMonth() - 1,
            1
        );
        this.renderTherapyMonth(this.currentEditingMed);
    },
    goToNextTherapyMonth() {
        this.currentTherapyMonth = new Date(
            this.currentTherapyMonth.getFullYear(),
            this.currentTherapyMonth.getMonth() + 1,
            1
        );
        this.renderTherapyMonth(this.currentEditingMed);
    },
    checkTherapyEnd(profile) {
        if (!profile) return;

        const today = app.getLocalDateString(new Date());
        const alertedSharedIds = new Set();
        let endedMeds = [];

        profile.meds.forEach(med => {

            if (!med.endDate) return;
            if (med.therapyEndedAlertShown) return;
            if (alertedSharedIds.has(med.sharedId)) return;

            if (today >= med.endDate) {
                endedMeds.push(med.name);
                alertedSharedIds.add(med.sharedId);

                profile.meds.forEach(m => {
                    if (m.sharedId === med.sharedId) {
                        m.therapyEndedAlertShown = true;
                    }
                });
            }
        });

        if (endedMeds.length > 0) {
            this.showAlert(
                "Terapie Terminate",
                `I seguenti farmaci hanno terminato il periodo di terapia:\n${endedMeds.join(', ')}`
            );
        }

        this.saveData();
    },
    // --- FUNZIONE SMEMORATO ---
    askShiftTherapy(sharedId) {
        this.showConfirm(
            "Funzione Smemorato",
            "Hai dimenticato di prendere il farmaco? <br><br>Spostando in avanti di <b>1 giorno</b> l'inizio della terapia, ricalcoleremo automaticamente tutti i prossimi turni a giorni alterni.",
            () => {
                this.confirmShiftTherapy(sharedId);
            }
        );
    },
    confirmShiftTherapy(sharedId) {
        const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
        if (!profile) return;

        let medName = "";
        let shifted = false;

        profile.meds.forEach(m => {
            if (m.sharedId === sharedId && m.startDate && m.frequency === 'alternate') {
                // 1. Parse sicuro della data per evitare problemi di fuso orario
                const parts = m.startDate.split('-');
                const startObj = new Date(parts[0], parts[1] - 1, parts[2]);

                // 2. Sposta in avanti di 1 giorno
                startObj.setDate(startObj.getDate() + 1);
                m.startDate = startObj.getFullYear() + '-' + String(startObj.getMonth() + 1).padStart(2, '0') + '-' + String(startObj.getDate()).padStart(2, '0');

                // 3. Ricalcola automaticamente la Data di Fine in base alla durata
                m.endDate = this.calculateEndDate(m.startDate, m.durationDays, m.frequency);

                // 4. Se per caso lo avevi segnato come preso per errore, resettalo
                if (m.taken) {
                    m.taken = false;
                    const todayISO = app.getLocalDateString(new Date());
                    if (m.history && m.history[todayISO]) {
                        delete m.history[todayISO];
                    }
                }

                medName = m.name;
                shifted = true;
            }
        });

        if (shifted) {
            this.saveData();
            this.renderMedications(); // Ricarica la grafica in tempo reale

            // 1. Inseriamo il nome del farmaco nel modale
            document.getElementById('reminder-med-name').textContent = medName;

            // 2. Apriamo il nuovo modale specifico INVECE del generico showAlert
            this.showModal('modal-reminder-update');
        }
    }
});
