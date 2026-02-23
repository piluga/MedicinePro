const app = {
            data: { lastOpened: null, profiles: [], apiKey: "" },
            tempMedImage: null, // Variabile per tenere la foto mentre si edita
            isPhotoOnlyMode: false, // Per distinguere se stiamo usando la camera solo per foto o per AI
            currentProfileId: null,
            selectedTimes: [],
            selectedDays: [],
            currentTherapyMonth: null,
            therapyMonthSwipeInitialized: false,
            currentEditingMed: null,
            touchStartX: 0,
            touchStartY: 0,
            isSwiping: false,
            stream: null,
            newProfileAvatar: null,
            expandedSections: [],
            confirmCallback: null,
            currentBackupContent: "",
            tempProfileImage: null,
            tempEditProfileImage: null,
            // Variabili per il modale dettagli giorno
            editingDayDate: null,
            editingDayTimes: [],

            // Variabili per export txt temporaneo
            tempExport: { content: null, filename: null },

            // --- 🛡️ FUNZIONE DI SICUREZZA ANTI-XSS ---
            escapeHTML(str) {
                if (!str) return '';
                return String(str)
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
            },

            // 🎨 TEMI DI COLORE
            profileThemes: [
                { bg: 'bg-blue-50', border: 'border-blue-200', iconBg: 'bg-blue-100', iconText: 'text-blue-600', progress: 'text-blue-500' },
                { bg: 'bg-emerald-50', border: 'border-emerald-200', iconBg: 'bg-emerald-100', iconText: 'text-emerald-600', progress: 'text-emerald-500' },
                { bg: 'bg-violet-50', border: 'border-violet-200', iconBg: 'bg-violet-100', iconText: 'text-violet-600', progress: 'text-violet-500' },
                { bg: 'bg-amber-50', border: 'border-amber-200', iconBg: 'bg-amber-100', iconText: 'text-amber-600', progress: 'text-amber-500' },
                { bg: 'bg-rose-50', border: 'border-rose-200', iconBg: 'bg-rose-100', iconText: 'text-rose-600', progress: 'text-rose-500' },
                { bg: 'bg-cyan-50', border: 'border-cyan-200', iconBg: 'bg-cyan-100', iconText: 'text-cyan-600', progress: 'text-cyan-500' },
                { bg: 'bg-fuchsia-50', border: 'border-fuchsia-200', iconBg: 'bg-fuchsia-100', iconText: 'text-fuchsia-600', progress: 'text-fuchsia-500' },
                { bg: 'bg-lime-50', border: 'border-lime-200', iconBg: 'bg-lime-100', iconText: 'text-lime-600', progress: 'text-lime-500' },
            ],

            // Modifica 1: Init diventa async
            async init() {
                await this.loadData();
                this.checkDailyReset();
                this.checkNewDay();
                this.renderProfiles();

                const usage = document.getElementById('input-med-usage');

                if (usage) {
                    usage.addEventListener('input', () => {
                        usage.style.height = 'auto';
                        usage.style.height = usage.scrollHeight + 'px';
                    });
                }

                const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };

                document.getElementById('current-date-display').textContent = new Date().toLocaleDateString('it-IT', options);
                document.getElementById('btn-back').addEventListener('click', () => this.goBack());

                document.addEventListener('touchstart', e => {
                    this.touchStartX = e.changedTouches[0].screenX;
                    this.touchStartY = e.changedTouches[0].screenY;
                    this.isSwiping = false;
                }, { passive: true });

                document.addEventListener('touchend', e => {
                    const touchEndX = e.changedTouches[0].screenX;
                    const touchEndY = e.changedTouches[0].screenY;
                    this.handleSwipe(touchEndX, touchEndY);
                }, { passive: true });

                // Bind confirm button only once
                document.getElementById('confirm-btn-yes').addEventListener('click', () => {
                    if (this.confirmCallback) {
                        this.confirmCallback();
                    }
                    this.closeModal('modal-confirm');
                });

                // --- 1. NUOVO: CONTROLLO QUANDO L'APP TORNA IN PRIMO PIANO ---
                document.addEventListener('visibilitychange', () => {
                    // Se l'utente ha appena riaperto l'app dal background
                    if (document.visibilityState === 'visible') {
                        this.checkDailyReset();
                        this.checkNewDay();
                    }
                });

                // --- 2. MODIFICA: AGGIORNA IL TIMER ESISTENTE ---
                // Fa scattare il controllo della mezzanotte in tempo reale anche 
                // se l'utente lascia l'app accesa con lo schermo acceso sul comodino.
                setInterval(() => {
                    this.checkDailyReset();
                    this.checkNewDay(); // Controlla se è passata la mezzanotte

                    if (this.currentProfileId) {
                        this.renderMedications(); // Ricarica la grafica se serve
                    }
                }, 60 * 1000);

                // ==========================================
                // SERVICE WORKER REGISTRATION CON CONTROLLO UPDATE
                // ==========================================
                if ('serviceWorker' in navigator) {
                    navigator.serviceWorker.register('sw.js')
                        .then(registration => {
                            console.log('✅ ServiceWorker registrato con successo! Scope:', registration.scope);
                        })
                        .catch(error => {
                            console.error('❌ Registrazione ServiceWorker fallita:', error);
                        });

                    // Ascolta l'evento in cui un NUOVO service worker prende il controllo
                    let refreshing = false;
                    navigator.serviceWorker.addEventListener('controllerchange', () => {
                    // Evita che il modale venga chiamato più volte di fila o ricarichi all'infinito
                    if (!refreshing) {
                        refreshing = true;
                        // Mostra il modale per avvisare l'utente
                        app.showModal('modal-app-updated');
                        }
                    });
                }
            },

            // --- GESTIONE MODALI DI SISTEMA ---
            showAlert(title, message) {
                document.getElementById('alert-title').textContent = title;
                document.getElementById('alert-message').textContent = message;
                this.showModal('modal-alert');
            },

            showConfirm(title, message, onConfirm) {
                document.getElementById('confirm-title').textContent = title;
                document.getElementById('confirm-message').innerHTML = message;
                this.confirmCallback = onConfirm;
                this.showModal('modal-confirm');
            },

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

            normalizeDate(date) {
                const d = new Date(date);
                d.setHours(0, 0, 0, 0);
                return d;
            },

            parseLocalDate(dateStr) {
                // PROTEZIONE: Se la data è vuota, nulla o indefinita, restituisci la data di oggi
                if (!dateStr) {
                    const today = new Date();
                    return new Date(today.getFullYear(), today.getMonth(), today.getDate());
                }

                // Codice originale
                const parts = dateStr.split('-');
                return new Date(parts[0], parts[1] - 1, parts[2]);
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

                // Aggiorna vista calendario
                this.renderTherapyMonth(this.currentEditingMed);
                this.closeModal('modal-day-detail');
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

                const start = new Date(startDate);

                // Caso giornaliero
                if (frequency !== "alternate") {
                    const end = new Date(start);
                    end.setDate(start.getDate() + durationDays - 1);
                    return end.toISOString().slice(0, 10);
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
                return end.toISOString().slice(0, 10);
            },

            calculateTherapyCountdown(med) {
                if (!med.startDate || !med.endDate) return null;

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                const start = new Date(med.startDate);
                start.setHours(0, 0, 0, 0);

                const end = new Date(med.endDate);
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

                const start = new Date(med.startDate);
                const today = new Date(dateISO);

                const diffDays = Math.floor(
                    (today - start) / (1000 * 60 * 60 * 24)
                );

                return diffDays % 2 === 0;
            },

            getTherapyDayInfo(med, dateISO) {
                if (!med.startDate || !med.durationDays) {
                    return { active: false, activeTimes: [] };
                }

                // PRENDI LE TIMES STANDARD DAL MODALE CORRENTE (ANTEPRIMA)
                // Usiamo this.selectedTimes che è live nel modale di editing
                const standardTimes = this.selectedTimes || [];

                const start = new Date(med.startDate);
                const target = new Date(dateISO);

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
                    const iso = current.toISOString().slice(0, 10);
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

                const end = new Date(med.endDate);
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

                const start = new Date(med.startDate);
                const totalDoses = med.durationDays;

                if (med.frequency === "alternate") {
                    legend.classList.remove('hidden');
                }

                let dosesCount = 0;
                let dayOffset = 0;

                while (dosesCount < totalDoses) {
                    const d = new Date(start);
                    d.setDate(start.getDate() + dayOffset);
                    const iso = d.toISOString().slice(0, 10);

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

            renderTherapyMonth(med) {
                if (!med || !med.startDate || !med.endDate) {
                    return;
                }
                const wrapper = document.getElementById('therapy-month-wrapper');
                const container = document.getElementById('therapy-month');

                if (!wrapper || !container) return;

                container.innerHTML = '';

                if (!med || !med.startDate || !med.endDate) {
                    wrapper.classList.add('hidden');
                    return;
                }

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

                    const info = this.getTherapyDayInfo(med, iso);

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

                    container.appendChild(el);
                }
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

                const today = new Date().toISOString().slice(0, 10);
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
                const today = new Date().toISOString().slice(0, 10);

                if (this.data.lastOpened === today) return;

                let lowStockMeds = [];

                this.data.profiles.forEach(profile => {
                    profile.meds.forEach(med => {
                        if (med.taken) {
                            const doseQty = this.parseDose(med.dose);
                            med.boxQty = Math.max(0, med.boxQty - doseQty);
                        }
                        if (med.boxQty > med.minQty) {
                            med.alertShown = false;
                        }
                        if (
                            med.minQty > 0 &&
                            med.boxQty <= med.minQty &&
                            med.alertShown === false
                        ) {
                            lowStockMeds.push(`${med.name} (${med.boxQty} rimasti)`);
                            med.alertShown = true;
                        }
                        med.taken = false;
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

            // --- CAMERA SCANNER LOGIC ---

            // MODIFICA: startScanner accetta un parametro opzionale
            startScanner(photoOnly = false) {
                if (!this.data.apiKey && !photoOnly) {
                    this.showModal('modal-no-api');
                    return;
                }

                this.isPhotoOnlyMode = photoOnly; // Salviamo la modalità

                const container = document.getElementById('camera-container');
                const video = document.getElementById('camera-feed');
                // ... resto del codice getUserMedia identico a prima ...
                try {
                    navigator.mediaDevices.getUserMedia({
                        video: { facingMode: { ideal: "environment" } }
                    }).then(stream => {
                        this.stream = stream;
                        video.srcObject = this.stream;
                        container.style.display = 'flex';
                    }).catch(err => {
                        this.showAlert("Errore Camera", "Impossibile accedere alla fotocamera.");
                    });
                } catch (e) { console.error(e); }
            },

            stopScanner() {
                const container = document.getElementById('camera-container');
                if (this.stream) {
                    this.stream.getTracks().forEach(track => track.stop());
                }
                container.style.display = 'none';
            },

            // MODIFICA: captureImage
            async captureImage() {
                const video = document.getElementById('camera-feed');
                const canvas = document.getElementById('camera-canvas');
                const ctx = canvas.getContext('2d');

                // 1. Cattura frame originale
                canvas.width = video.videoWidth;
                canvas.height = video.videoHeight;
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

                // Stop camera
                this.stopScanner();

                // 2. Ottieni Base64 grezzo
                const rawBase64 = canvas.toDataURL('image/jpeg', 0.9);

                // 3. COMPRIMI L'IMMAGINE (Importante per IndexedDB!)
                const compressedBase64 = await this.resizeImage(rawBase64, 800, 0.7);

                // 4. Salva nella variabile temporanea
                this.tempMedImage = compressedBase64;
                this.updateImagePreview(); // Mostra anteprima nel modale

                // 5. Se NON è solo modalità foto, procedi con l'analisi AI
                if (!this.isPhotoOnlyMode) {
                    // Passiamo l'immagine compressa all'AI (più veloce da caricare)
                    const base64Data = compressedBase64.split(',')[1];
                    await this.analyzeImage(base64Data);
                }
            },

            // NUOVA FUNZIONE: Ridimensiona immagini (Helper)
            resizeImage(base64Str, maxWidth = 800, quality = 0.7) {
                return new Promise((resolve) => {
                    const img = new Image();
                    img.src = base64Str;
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        let width = img.width;
                        let height = img.height;

                        if (width > height) {
                            if (width > maxWidth) {
                                height *= maxWidth / width;
                                width = maxWidth;
                            }
                        } else {
                            if (height > maxWidth) {
                                width *= maxWidth / height;
                                height = maxWidth;
                            }
                        }
                        canvas.width = width;
                        canvas.height = height;
                        const ctx = canvas.getContext('2d');
                        ctx.drawImage(img, 0, 0, width, height);
                        resolve(canvas.toDataURL('image/jpeg', quality));
                    };
                });
            },

            // NUOVE FUNZIONI UI IMMAGINI
            updateImagePreview() {
                const previewContainer = document.getElementById('med-img-preview-container');
                const placeholder = document.getElementById('med-img-placeholder');
                const img = document.getElementById('med-img-preview');

                if (this.tempMedImage) {
                    img.src = this.tempMedImage;
                    previewContainer.classList.remove('hidden');
                    placeholder.classList.add('hidden');
                } else {
                    img.src = '';
                    previewContainer.classList.add('hidden');
                    placeholder.classList.remove('hidden');
                }
            },

            removeMedImage() {
                this.tempMedImage = null;
                this.updateImagePreview();
            },

            viewFullImage() {
                if (this.tempMedImage) {
                    document.getElementById('full-image-display').src = this.tempMedImage;
                    document.getElementById('modal-image-view').classList.remove('hidden');
                }
            },

            async analyzeImage(base64Image) {
                // 1. Verifica API Key
                if (!this.data.apiKey) {
                    this.showModal('modal-no-api');
                    return;
                }

                this.toggleLoading(true, "Analisi farmaco in corso...");

                // 2. Prompt per Gemini
                const prompt = `Analizza questa immagine di un farmaco.
                                                                                Estrai i dati e rispondi ESCLUSIVAMENTE con un oggetto JSON valido (senza markdown o testo extra) con questi campi:
                                                                                - "name": nome commerciale e dosaggio (es. 'Oki 80mg').
                                                                                - "form": forma farmaceutica (es. 'Bustine', 'Pillole', 'Capsule', 'Compresse Effervescenti', 'Sciroppo', 'Gocce').
                                                                                - "dose": dosaggio numerico (es. '80mg').
                                                                                - "type": CATEGORIA TERAPEUTICA. Scegli SOLO tra: Antibiotico, Antimicrobico, Antidolorifico, Analgesico, Antinfiammatorio, Antiacido, Anticoagulante, Antidepressivo, Antistaminico, Anticonvulsivante, Cardiovascolare, Integratore, Vitamine, Gastroprotettore. Se incerto usa stringa vuota.
                                                                                - "usage": breve descrizione a cosa serve.
                                                                                - "blister_count": numero intero di blister visibili (o null).
                                                                                - "pills_per_blister": numero intero di pillole per blister (o null).`;

                const payload = {
                    contents: [{
                        role: "user",
                        parts: [
                            { text: prompt },
                            { inlineData: { mimeType: "image/png", data: base64Image } }
                        ]
                    }],
                    generationConfig: {
                        responseMimeType: "application/json"
                    }
                };

                try {
                    // --- MODIFICA FONDAMENTALE QUI SOTTO ---
                    // Usiamo 'gemini-1.5-flash' invece di '2.0'. Il 1.5 non dà errore 429 così facilmente.
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.data.apiKey}`;

                    const result = await this.fetchWithRetry(url, payload);

                    if (!result || !result.candidates || result.candidates.length === 0) {
                        throw new Error("Nessuna risposta dal modello AI.");
                    }

                    let text = result.candidates[0].content.parts[0].text;

                    // Pulizia JSON
                    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
                    const jsonMatch = text.match(/\{[\s\S]*\}/);
                    if (jsonMatch) text = jsonMatch[0];

                    const parsedData = JSON.parse(text);

                    // Popolamento campi
                    if (parsedData.name) {
                        document.getElementById('input-med-name').value = parsedData.name;
                        document.getElementById('input-med-category').value = parsedData.form || "";
                        document.getElementById('input-med-dose').value = parsedData.dose || "";
                        document.getElementById('input-med-usage').value = parsedData.usage || "";
                        document.getElementById('input-med-type').value = parsedData.type || "";

                        // Blister
                        if (parsedData.blister_count) document.getElementById('med-blister-count').value = parsedData.blister_count;
                        if (parsedData.pills_per_blister) document.getElementById('med-pills-per-blister').value = parsedData.pills_per_blister;

                        if (parsedData.blister_count && parsedData.pills_per_blister) {
                            this.calculateTotalStock();
                        }

                        this.showAlert("Analisi Completata", `Ho identificato: ${parsedData.name}`);
                    } else {
                        this.showAlert("Attenzione", "L'AI non ha trovato dati validi.");
                    }

                } catch (err) {
                    console.error("ERRORE SCANNER:", err);
                    let msg = "Errore generico.";
                    // Gestione specifica errore 429
                    if (err.message.includes("429")) msg = "Troppe richieste. Riprova tra poco.";
                    if (err.message.includes("403")) msg = "API Key non valida.";
                    this.showAlert("Errore Analisi", msg);
                } finally {
                    this.toggleLoading(false);
                }
            },

            async fetchWithRetry(url, options, retries = 3, backoff = 1000) {
                try {
                    const response = await fetch(url, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(options)
                    });

                    // Se è 429 (Too Many Requests), lancia errore per attivare il retry
                    if (response.status === 429) {
                        throw new Error("429 Too Many Requests");
                    }

                    if (!response.ok) {
                        throw new Error(`HTTP error! status: ${response.status}`);
                    }

                    return await response.json();
                } catch (error) {
                    if (retries > 0) {
                        console.warn(`Retrying... attempts left: ${retries}. Error: ${error.message}`);
                        // Aspetta (backoff) ms prima di riprovare
                        await new Promise(resolve => setTimeout(resolve, backoff));
                        return this.fetchWithRetry(url, options, retries - 1, backoff * 2); // Raddoppia l'attesa
                    } else {
                        throw error;
                    }
                }
            },

            toggleLoading(show, text = "") {
                const overlay = document.getElementById('loading-overlay');
                const loadingText = document.getElementById('loading-text');
                loadingText.textContent = text;
                overlay.style.display = show ? 'flex' : 'none';
            },

            // --- NAVIGATION ---

            goBack() {
                this.goHome();
            },

            goHome() {
                this.currentProfileId = null;

                // 1. Mostra la Home
                document.getElementById('view-profiles').classList.remove('hidden');

                // 2. Nascondi TUTTE le altre viste (inclusa la nuova view-management)
                document.getElementById('view-medications').classList.add('hidden');
                document.getElementById('view-settings').classList.add('hidden');
                document.getElementById('view-management').classList.add('hidden'); // <--- QUESTA RIGA MANCAVA

                // 3. Nascondi il tasto indietro
                document.getElementById('btn-back').classList.add('hidden');

                // 4. Aggiorna la lista profili e il tasto "Al Banco"
                this.renderProfiles();
            },

            showSettings() {
                this.currentProfileId = null;

                document.getElementById('view-profiles').classList.add('hidden');
                document.getElementById('view-medications').classList.add('hidden');
                document.getElementById('view-management').classList.add('hidden');

                const settingsView = document.getElementById('view-settings');
                settingsView.classList.remove('hidden');

                document.getElementById('btn-back').classList.remove('hidden');

                // Caricamento valori
                document.getElementById('input-settings-apikey').value = this.data.apiKey || "";
                const prefs = this.data.preferences || { showCart: true, showNotes: true, showEdit: true, showDelete: true };
                document.getElementById('pref-show-cart').checked = prefs.showCart;
                document.getElementById('pref-show-notes').checked = prefs.showNotes;
                document.getElementById('pref-show-edit').checked = prefs.showEdit;
                document.getElementById('pref-show-delete').checked = prefs.showDelete;

                // Nota: usiamo !== false così di default è ATTIVO per i nuovi utenti
                document.getElementById('pref-show-image').checked = (prefs.showImage !== false);
                // ----------------------------

                window.scrollTo(0, 0);
            },

            showManagement() {
                this.currentProfileId = null;

                // Nascondi tutto il resto
                document.getElementById('view-profiles').classList.add('hidden');
                document.getElementById('view-medications').classList.add('hidden');
                document.getElementById('view-settings').classList.add('hidden');

                // Mostra Gestione
                const mgmtView = document.getElementById('view-management');
                mgmtView.classList.remove('hidden');

                document.getElementById('btn-back').classList.remove('hidden');

                // Aggiorna lo stato del pulsante spesa (colori testo)
                this.updateShoppingBtnState();

                window.scrollTo(0, 0);
            },

            goToSettingsFromModal() {
                this.closeModal('modal-no-api');
                // Chiudi anche il modale farmaco se aperto
                this.closeModal('modal-med');
                this.showSettings();
            },

            saveSettings() {
                this.data.apiKey = document.getElementById('input-settings-apikey').value.trim();

                // --- NUOVO: Salva Preferenze ---
                this.data.preferences = {
                    showCart: document.getElementById('pref-show-cart').checked,
                    showNotes: document.getElementById('pref-show-notes').checked,
                    showEdit: document.getElementById('pref-show-edit').checked,
                    showDelete: document.getElementById('pref-show-delete').checked,
                    showImage: document.getElementById('pref-show-image').checked
                };
                // -------------------------------

                this.saveData();
                this.showAlert("Successo", "Impostazioni salvate!");
                this.goHome(); // Torna alla home dopo il salvataggio
            },

            resetAllData() {
                this.showConfirm(
                    "Attenzione",
                    "Sei sicuro di voler resettare tutto? Tutti i dati andranno persi.",
                    () => {
                        this.resetData();
                        this.goHome();
                    }
                );
            },

            // --- DATA LOGIC ---
            // Modifica 2: loadData con idbKeyval
            // MODIFICA: app.loadData (Assicurati che drugDb esista)
            async loadData() {
                try {
                    let stored = null;

                    // 1. Prova a leggere dal database avanzato
                    if (window.idbKeyval) {
                        try {
                            stored = await window.idbKeyval.get('MedicineProData');
                        } catch (dbErr) {
                            console.warn("Lettura IDB fallita.", dbErr);
                        }
                    }

                    // 2. Se è vuoto o la libreria manca, cerca nel vecchio localStorage
                    if (!stored) {
                        try {
                            const localStored = localStorage.getItem('MedicineProData');
                            if (localStored) {
                                stored = JSON.parse(localStored);
                                console.log("Dati recuperati da localStorage (Migrazione...)");
                            }
                        } catch (e) {
                            console.warn("Lettura localStorage fallita.", e);
                        }
                    }

                    // 3. Se non c'è proprio nulla, partiamo da zero
                    if (!stored) {
                        this.resetData();
                        return;
                    }

                    this.data = stored;

                    // --- NORMALIZZAZIONI DI SICUREZZA ---
                    if (!this.data.apiKey) this.data.apiKey = "";
                    if (!this.data.preferences) this.data.preferences = { showCart: true, showNotes: true, showEdit: true, showDelete: true };
                    if (!Array.isArray(this.data.drugDb)) this.data.drugDb = [];

                    this.data.profiles.forEach((profile, index) => {
                        if (typeof profile.themeIndex === 'undefined') profile.themeIndex = index % this.profileThemes.length;
                        this.normalizeMedications(profile);

                        profile.meds.forEach(med => {
                            if (!Array.isArray(med.days)) med.days = [];
                            if (typeof med.boxQty !== "number") med.boxQty = 0;
                            if (typeof med.minQty !== "number") med.minQty = 0;
                            if (typeof med.alertShown !== "boolean") med.alertShown = false;
                            if (typeof med.taken !== "boolean") med.taken = false;
                            if (med.startDate === undefined) med.startDate = null;
                            if (med.durationDays === undefined) med.durationDays = null;
                            if (med.endDate === undefined) med.endDate = null;
                            if (typeof med.therapyEndedAlertShown !== "boolean") med.therapyEndedAlertShown = false;
                            if (!med.frequency) med.frequency = "daily";
                            if (!med.specificDays) med.specificDays = {};
                        });
                        if (!Array.isArray(profile.healthLogs)) profile.healthLogs = [];
                    });

                    // 4. Risalviamo tutto subito per assicurare la persistenza
                    await this.saveData();

                } catch (e) {
                    console.error("Errore fatale nel caricamento dati DB", e);
                    this.resetData();
                }
            },

            // MODIFICA: app.resetData (Aggiungi drugDb)
            resetData() {
                this.data = {
                    lastOpened: new Date().toISOString().slice(0, 10),
                    profiles: [],
                    drugDb: [], // <--- NUOVO: Database permanente farmaci
                    apiKey: "",
                    preferences: {
                        showCart: true,
                        showNotes: true,
                        showEdit: true,
                        showDelete: true
                    }
                };
                this.saveData();
            },

            // Modifica 3: saveData con idbKeyval
            async saveData() {
                try {
                    // 1. Prova a salvare nel Database Avanzato
                    if (typeof idbKeyval !== 'undefined') {
                        await idbKeyval.set('MedicineProData', this.data);
                        console.log("✅ Salvataggio su IndexedDB completato.");
                    } else {
                        // 2. Piano B
                        localStorage.setItem('MedicineProData', JSON.stringify(this.data));
                        console.warn("⚠️ Salvataggio su localStorage completato (IDB non disponibile).");
                    }
                    this.updateShoppingBtnState();
                } catch (err) {
                    console.error("Errore critico di salvataggio:", err);
                    // 3. SE FALLISCE, ORA CE LO DICE CHIARAMENTE!
                    alert("❌ IMPOSSIBILE SALVARE I DATI!\nMotivo: " + err.message + "\n\nSe il backup contiene foto, il file è troppo grande per la memoria base. Assicurati di aprire l'app tramite Live Server.");
                }
            },

            // Nuova logica di export (Stile ControlliPro)
            openBackupModal() {
                const safeData = JSON.parse(JSON.stringify(this.data));
                safeData.apiKey = ""; // Rimuovi chiave API per sicurezza

                const jsonContent = JSON.stringify(safeData, null, 2);
                this.currentBackupContent = jsonContent;

                // Gestione visibilità tasto share nativo
                const shareBtn = document.getElementById('btn-share-backup-native');
                const grid = document.getElementById('modal-backup-preview').querySelector('.grid');

                if (!navigator.share) {
                    shareBtn.style.display = 'none';
                    if (grid) grid.classList.replace('grid-cols-2', 'grid-cols-1');
                } else {
                    shareBtn.style.display = 'flex';
                    if (grid) grid.classList.replace('grid-cols-1', 'grid-cols-2');
                }

                this.showModal('modal-backup-preview');
            },

            // Rinominiamo la vecchia chiamata per puntare al nuovo modale
            exportData() {
                this.openBackupModal();
            },

            shareBackup() {
                if (navigator.share) {
                    navigator.share({
                        title: 'Backup MedicinePro',
                        text: this.currentBackupContent
                    }).catch(err => console.log('Condivisione annullata', err));
                }
            },

            confirmBackupDownload() {
                const content = this.currentBackupContent;
                const blob = new Blob([content], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                // Nome file aggiornato per MedicinePro
                a.download = `MedicinePro_Backup_${new Date().toISOString().slice(0, 10)}.json`;
                a.click();
                this.closeModal('modal-backup-preview');
            },

            exportProfileTxt() {
                const profile = this.data.profiles.find(x => x.id === this.currentProfileId);
                if (!profile) return;

                // Generazione contenuto Report
                let content = `TERAPIA: ${profile.name.toUpperCase()}\n`;
                content += `Esportata il: ${new Date().toLocaleDateString('it-IT')}\n`;
                content += `--------------------------------------------------\n\n`;
                const times = ['Mattina', 'Pomeriggio', 'Sera'];
                times.forEach(time => {
                    const meds = profile.meds.filter(m => m.time === time);
                    if (meds.length > 0) {
                        content += `[${time.toUpperCase()}]\n`;
                        meds.forEach(m => {
                            content += `- ${m.name}`;
                            //if (m.category) content += ` (${m.category})`;
                            if (m.dose) content += ` | Dose: ${m.dose}`;
                            //if (m.usage) content += ` | Uso: ${m.usage}`;
                            content += `\n`;
                        });
                        content += `\n`;
                    }
                });

                // Salva dati temporanei
                this.tempExport.content = content;
                this.tempExport.filename = `Terapia_${profile.name.replace(/\s+/g, '_')}.txt`;

                // Mostra anteprima
                document.getElementById('export-preview-content').textContent = content;

                // LOGICA PULSANTE CONDIVISIONE (Come nel Backup)
                const shareBtn = document.getElementById('btn-share-txt');
                const grid = document.getElementById('export-txt-buttons');

                if (!navigator.share) {
                    shareBtn.style.display = 'none';
                    if (grid) grid.classList.replace('grid-cols-2', 'grid-cols-1');
                } else {
                    shareBtn.style.display = 'flex';
                    if (grid) grid.classList.replace('grid-cols-1', 'grid-cols-2');
                }

                this.showModal('modal-export-preview');
            },

            // Nuova funzione per condividere il testo
            shareProfileTxt() {
                if (navigator.share && this.tempExport.content) {
                    navigator.share({
                        title: this.tempExport.filename.replace('.txt', ''),
                        text: this.tempExport.content
                    }).catch(err => console.log('Condivisione annullata', err));
                }
            },

            confirmExportTxt() {
                if (!this.tempExport.content) return;

                const blob = new Blob([this.tempExport.content], { type: "text/plain" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = this.tempExport.filename;
                a.click();

                this.closeModal('modal-export-preview');
            },

            triggerImport() { document.getElementById('import-file').click(); },
            
            async handleImport(input) {
                const file = input.files[0];
                if (!file) return;
                
                this.toggleLoading(true, "Lettura file in corso...");
                
                const reader = new FileReader();
                reader.onload = async (e) => {
                    try {
                        const json = JSON.parse(e.target.result);
                        if (json && Array.isArray(json.profiles)) {
                            this.currentProfileId = null;
                            document.getElementById('input-med-edit-id').value = '';

                            this.data = json;
                            
                            this.toggleLoading(true, "Scrittura nel database...");
                            
                            // Aspetta rigorosamente che il salvataggio sia finito
                            await this.saveData(); 
                            
                            this.toggleLoading(false);
                            alert("✅ Backup ripristinato con successo! L'app si riavvierà per applicare i dati.");
                            
                            // FORZA IL RIAVVIO DELLA PAGINA PER CARICARE I DATI NUOVI
                            window.location.reload(); 
                        } else {
                            this.toggleLoading(false);
                            alert("❌ Formato del file non valido per MedicinePro.");
                        }
                    } catch (err) {
                        this.toggleLoading(false);
                        alert("❌ Errore durante l'importazione: " + err.message);
                    }
                };
                reader.readAsText(file);
                input.value = '';
            },

            generateId() { return Date.now().toString(36) + Math.random().toString(36).substr(2); },

            openProfile(id) {
                this.currentProfileId = id;
                const profile = this.data.profiles.find(x => x.id === id);

                document.getElementById('view-profiles').classList.add('hidden');
                document.getElementById('view-medications').classList.remove('hidden');
                document.getElementById('btn-back').classList.remove('hidden');

                // Initialize expanded section based on time
                const hour = new Date().getHours();
                let activeTime = 'Mattina';
                if (hour >= 13) activeTime = 'Pomeriggio';
                if (hour >= 19) activeTime = 'Sera';
                this.expandedSections = [activeTime];

                this.renderMedications();
                if (profile) this.checkTherapyEnd(profile);
            },

            selectAvatar(type) {
                this.newProfileAvatar = type;
                document.querySelectorAll('.avatar-btn').forEach(btn => {
                    if (btn.dataset.avatar === type) {
                        btn.classList.add('selected');
                    } else {
                        btn.classList.remove('selected');
                    }
                });
            },

            createProfile() {
                const name = document.getElementById('input-profile-name').value.trim();
                const nickname = document.getElementById('input-profile-nickname').value.trim();
                const dob = document.getElementById('input-profile-dob').value; // Data di nascita ISO (YYYY-MM-DD)
                const address = document.getElementById('input-profile-address').value.trim();
                const birthplace = document.getElementById('input-profile-birthplace').value.trim();
                const cf = document.getElementById('input-profile-cf').value.trim().toUpperCase();

                if (!name) {
                    this.showAlert("Attenzione", "Il nome è obbligatorio.");
                    return;
                }

                // Calcolo età approssimativa per visualizzazione (Opzionale)
                let age = "";
                if (dob) {
                    const diff = Date.now() - new Date(dob).getTime();
                    age = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
                }

                const themeIndex = this.data.profiles.length % this.profileThemes.length;

                this.data.profiles.push({
                    id: this.generateId(),
                    name, nickname, dob, age, address, birthplace, cf,
                    meds: [],
                    healthLogs: [],
                    themeIndex,
                    avatar: this.newProfileAvatar,
                    image: this.tempProfileImage || null
                });

                this.saveData();

                // Reset e chiusura
                document.getElementById('input-profile-name').value = '';
                document.getElementById('input-profile-nickname').value = '';
                document.getElementById('input-profile-dob').value = '';
                document.getElementById('input-profile-address').value = '';
                document.getElementById('input-profile-birthplace').value = '';
                document.getElementById('input-profile-cf').value = '';

                // <-- NUOVO RESET FOTO -->
                this.tempProfileImage = null;
                document.getElementById('input-profile-image').value = '';
                document.getElementById('profile-img-preview').classList.add('hidden');
                document.getElementById('profile-img-icon').classList.remove('hidden');

                this.closeModal('modal-add-profile');
                this.renderProfiles();
            },

            openEditProfileModal() {
                const p = this.data.profiles.find(x => x.id === this.currentProfileId);
                if (p) {
                    // Carica i dati nei campi edit
                    document.getElementById('input-edit-profile-name').value = p.name || '';
                    document.getElementById('input-edit-profile-nickname').value = p.nickname || '';
                    document.getElementById('input-edit-profile-dob').value = p.dob || ''; // Data Nascita
                    document.getElementById('input-edit-profile-address').value = p.address || '';
                    document.getElementById('input-edit-profile-birthplace').value = p.birthplace || '';
                    document.getElementById('input-edit-profile-cf').value = p.cf || '';

                    // <-- NUOVA LOGICA CARICAMENTO FOTO -->
                    this.tempEditProfileImage = p.image || null;

                    const imgEl = document.getElementById('edit-profile-img-preview');
                    const iconEl = document.getElementById('edit-profile-img-icon');
                    const removeBtn = document.getElementById('btn-remove-edit-image');

                    if (this.tempEditProfileImage) {
                        imgEl.src = this.tempEditProfileImage;
                        imgEl.classList.remove('hidden');
                        iconEl.classList.add('hidden');
                        removeBtn.classList.remove('hidden');
                    } else {
                        imgEl.src = '';
                        imgEl.classList.add('hidden');
                        iconEl.classList.remove('hidden');
                        removeBtn.classList.add('hidden');
                    }
                    // <-- FINE NUOVA LOGICA -->

                    // Imposta visualmente l'avatar E aggiorna la variabile interna per il calcolo del sesso
                    this.selectAvatar(p.avatar || 'man');

                    this.showModal('modal-edit-profile');
                }
            },

            saveEditedProfile() {
                const p = this.data.profiles.find(x => x.id === this.currentProfileId);
                if (!p) return;

                // Leggi i valori
                const newName = document.getElementById('input-edit-profile-name').value.trim();
                const newNickname = document.getElementById('input-edit-profile-nickname').value.trim();
                const newDob = document.getElementById('input-edit-profile-dob').value;
                const newAddress = document.getElementById('input-edit-profile-address').value.trim();
                const newBirthplace = document.getElementById('input-edit-profile-birthplace').value.trim();
                const newCf = document.getElementById('input-edit-profile-cf').value.trim().toUpperCase();

                if (!newName) {
                    this.showAlert("Errore", "Il nome non può essere vuoto.");
                    return;
                }

                // Calcolo età (opzionale, per coerenza coi dati)
                let newAge = "";
                if (newDob) {
                    const diff = Date.now() - new Date(newDob).getTime();
                    newAge = Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
                }

                // Aggiorna Oggetto
                p.name = newName;
                p.nickname = newNickname;
                p.dob = newDob;
                p.age = newAge; // Aggiorniamo anche l'età calcolata
                p.address = newAddress;
                p.birthplace = newBirthplace;
                p.cf = newCf;
                p.avatar = this.newProfileAvatar;
                p.image = this.tempEditProfileImage;

                this.saveData();

                // Aggiorna UI
                // Usa il nickname se c'è, altrimenti il nome (come da tua logica precedente)
                const displayName = (p.nickname && p.nickname.trim() !== '') ? p.nickname : p.name;
                document.getElementById('current-profile-name').textContent = displayName;

                this.renderProfiles();
                this.closeModal('modal-edit-profile');
                this.showAlert("Salvato", "Profilo aggiornato.");
            },

            deleteCurrentProfile() {
                this.showConfirm("Elimina Profilo", "Eliminare definitivamente questo profilo?", () => {
                    this.data.profiles = this.data.profiles.filter(x => x.id !== this.currentProfileId);
                    this.saveData();
                    this.closeModal('modal-edit-profile'); // Chiudi il modale
                    this.goHome();
                });
            },

            renderProfiles() {
                const container = document.getElementById('profiles-list');
                container.innerHTML = '';

                if (this.data.profiles.length === 0) {
                    container.innerHTML = `<p class="text-center text-slate-400 py-10">Nessun profilo presente.</p>`;
                    const btnPharmacy = document.getElementById('btn-home-pharmacy');
                    if (btnPharmacy) btnPharmacy.classList.add('hidden');
                    return;
                }

                const avatarIcons = {
                    'man': 'fa-person', 'woman': 'fa-person-dress', 'dog': 'fa-dog', 'cat': 'fa-cat'
                };

                let hasActiveOrders = false;

                this.data.profiles.forEach(p => {
                    if (p.meds.some(m => m.isOTCOrdered)) hasActiveOrders = true;

                    if (typeof p.themeIndex === 'undefined') p.themeIndex = Math.floor(Math.random() * this.profileThemes.length);
                    const theme = this.profileThemes[p.themeIndex] || this.profileThemes[0];

                    const total = p.meds.length;
                    const taken = p.meds.filter(m => m.taken).length;
                    const perc = total === 0 ? 0 : Math.round((taken / total) * 100);
                    const hasDoctor = p.doctor && p.doctor.name && p.doctor.name.trim() !== '';

                    // SICUREZZA: Sanitizziamo il nome utente
                    const rawName = (p.nickname && p.nickname.trim() !== '') ? p.nickname : p.name;
                    const safeName = this.escapeHTML(rawName);

                    const div = document.createElement('div');
                    div.className = `${theme.bg} ${theme.border} p-4 rounded-xl card-shadow flex justify-between items-center cursor-pointer border hover:shadow-md transition-all`;
                    div.onclick = () => this.openProfile(p.id);

                    const percClass = perc === 100 ? 'text-green-600' : theme.progress;

                    let iconContent;
                    if (p.image) {
                        iconContent = `<img src="${p.image}" class="w-full h-full object-cover rounded-full" alt="Foto">`;
                    } else if (p.avatar && avatarIcons[p.avatar]) {
                        iconContent = `<i class="fa-solid ${avatarIcons[p.avatar]} text-3xl"></i>`;
                    } else {
                        iconContent = `<span class="text-2xl">${safeName.charAt(0).toUpperCase()}</span>`;
                    }

                    // UX: Rimosso title="Modifica Dottore" per evitare popup mobile
                    const doctorBadge = hasDoctor ? `
                        <div onclick="event.stopPropagation(); app.openDoctorModal('${p.id}')"
                                class="absolute -bottom-1 -right-1 w-6 h-6 bg-white border border-slate-200 rounded-full flex items-center justify-center shadow-sm cursor-pointer hover:scale-110 transition-transform z-10">
                            <i class="fa-solid fa-user-doctor text-[10px] text-blue-500"></i>
                        </div>
                    ` : '';

                    const doctorBtn = !hasDoctor ? `
                        <button onclick="event.stopPropagation(); app.openDoctorModal('${p.id}')" class="px-2 py-0.5 bg-white border border-slate-200 rounded-md text-[10px] font-bold text-slate-500 hover:text-blue-600 hover:border-blue-300 transition-colors shadow-sm ml-2 shrink-0">
                            <i class="fa-solid fa-user-doctor mr-1"></i> Medico
                        </button>
                    ` : '';

                    div.innerHTML = `
                        <div class="flex items-center gap-4 overflow-hidden">
                            <div class="w-16 h-16 rounded-full ${theme.iconBg} ${theme.iconText} flex items-center justify-center font-bold shadow-sm border border-white/50 relative shrink-0">
                                ${iconContent}
                                ${doctorBadge}
                            </div>
                            <div class="overflow-hidden">
                                <h3 class="font-bold text-slate-800 text-lg leading-tight truncate">${safeName}</h3>
                                <div class="flex items-center mt-1">
                                    <span class="text-xs text-slate-500 shrink-0">${total} farmaci</span>
                                    ${doctorBtn}
                                </div>
                            </div>
                        </div>
                        <span class="text-sm font-bold ${percClass} shrink-0 ml-2">${perc}%</span>
                    `;
                    container.appendChild(div);
                });

                const btnPharmacy = document.getElementById('btn-home-pharmacy');
                if (btnPharmacy) {
                    if (hasActiveOrders) btnPharmacy.classList.remove('hidden');
                    else btnPharmacy.classList.add('hidden');
                }
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

            // NUOVE FUNZIONI: Gestione Apertura/Selezione Archivio
            openArchiveModal() {
                const list = document.getElementById('archive-list-content');
                list.innerHTML = '';

                if (!this.data.drugDb || this.data.drugDb.length === 0) {
                    list.innerHTML = '<p class="text-center text-slate-400 p-4">Nessun farmaco in archivio.</p>';
                } else {
                    this.data.drugDb.forEach(drug => {
                        const el = document.createElement('div');
                        el.className = "p-3 border-b border-slate-100 last:border-0 flex justify-between items-center hover:bg-slate-50 cursor-pointer";
                        el.onclick = () => this.fillMedFormFromDB(drug);

                        el.innerHTML = `
                                        <div>
                                            <p class="font-bold text-slate-700">${drug.name}</p>
                                            <p class="text-xs text-slate-500">${drug.dose || ''} ${drug.type ? '• ' + drug.type : ''}</p>
                                        </div>
                                        <i class="fa-solid fa-plus text-blue-500 bg-blue-50 p-2 rounded-lg"></i>
                                    `;
                        list.appendChild(el);
                    });
                }
                this.showModal('modal-archive-select');
            },

            fillMedFormFromDB(drug) {
                document.getElementById('input-med-name').value = drug.name;
                document.getElementById('input-med-category').value = drug.category || "";
                document.getElementById('input-med-type').value = drug.type || "";
                document.getElementById('input-med-dose').value = drug.dose || "";
                document.getElementById('input-med-usage').value = drug.usage || "";

                if (drug.blisterCount) document.getElementById('med-blister-count').value = drug.blisterCount;
                if (drug.pillsPerBlister) document.getElementById('med-pills-per-blister').value = drug.pillsPerBlister;
                if (drug.minQty) document.getElementById('med-min-qty').value = drug.minQty;

                // Carica foto dall'archivio
                if (drug.image) {
                    this.tempMedImage = drug.image;
                    this.updateImagePreview();
                } else {
                    this.tempMedImage = null;
                    this.updateImagePreview();
                }

                // Ricalcola preview confezione
                if (drug.blisterCount && drug.pillsPerBlister) {
                    this.calculateTotalStock();
                }

                this.closeModal('modal-archive-select');
                this.showAlert("Caricato", "Dati recuperati dall'archivio.");
            },

            showModal(id) {
                if (id === 'modal-med') {
                    const editId = document.getElementById('input-med-edit-id').value;
                    if (!editId) {
                        this.resetMedModal();
                    }
                }

                if (id === 'modal-add-profile') {
                    this.selectAvatar(null);
                    this.newProfileAvatar = null;
                    // Resetta la foto se il modale viene riaperto
                    this.tempProfileImage = null;
                    const imgEl = document.getElementById('profile-img-preview');
                    const iconEl = document.getElementById('profile-img-icon');
                    if (imgEl) imgEl.classList.add('hidden');
                    if (iconEl) iconEl.classList.remove('hidden');
                    const fileInput = document.getElementById('input-profile-image');
                    if (fileInput) fileInput.value = '';
                }

                document.getElementById(id).classList.remove('hidden');
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
                    specificDays: this.currentEditingMed ? this.currentEditingMed.specificDays : {}
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
                    const dateString = med.startDate || new Date().toISOString().split('T')[0];
                    const start = this.parseLocalDate(dateString);

                    this.currentTherapyMonth = new Date(start.getFullYear(), start.getMonth(), 1);
                    this.currentEditingMed = med;
                    this.renderTherapyMonth(med);
                }
            },

            handleMedicationSubmit() {
                const name = document.getElementById('input-med-name').value.trim();
                const category = document.getElementById('input-med-category').value.trim(); // Questo è la FORMA
                const type = document.getElementById('input-med-type').value.trim(); // NUOVO: Categoria
                const dose = document.getElementById('input-med-dose').value.trim();
                const usage = document.getElementById('input-med-usage').value.trim();
                const specificTime = document.getElementById('input-med-specific-time').value;
                const frequency = document.getElementById('med-frequency').value;
                const editId = document.getElementById('input-med-edit-id').value;
                const startDate = document.getElementById('med-start-date')?.value || null;
                const durationDays = parseInt(document.getElementById('med-duration')?.value) || null;
                const endDate = this.calculateEndDate(startDate, durationDays, frequency);

                const boxQty = parseFloat(document.getElementById('med-box-qty').value) || 0;
                const minQty = parseFloat(document.getElementById('med-min-qty').value) || 0;
                const imageToSave = this.tempMedImage;

                // NUOVO: Leggi i valori dei blister
                const blisterCount = parseFloat(document.getElementById('med-blister-count').value) || 0;
                const pillsPerBlister = parseFloat(document.getElementById('med-pills-per-blister').value) || 0;

                if (!name || this.selectedTimes.length === 0) {
                    this.showAlert("Dati mancanti", "Inserisci almeno il Nome e l'Orario.");
                    return;
                }

                // NUOVO CONTROLLO VALIDAZIONE PERIODO TERAPIA
                if (startDate && durationDays <= 0) {
                    this.showAlert(
                        "Periodo Terapia Incompleto",
                        "Hai selezionato una data di inizio ma non la durata.\n\nInserisci il numero di giorni di terapia oppure clicca su 'Resetta date' se è una cura continuativa senza scadenza."
                    );
                    return; // Blocca il salvataggio
                }

                const profile = this.data.profiles.find(x => x.id === this.currentProfileId);

                // =========================
                // ✏️ MODIFICA FARMACO
                // =========================
                if (editId) {
                    const med = profile.meds.find(m => m.id === editId);
                    if (med) {
                        const sharedId = med.sharedId;
                        // PRESERVA LE ECCEZIONI: se stiamo modificando, manteniamo il calendario specifico
                        // Assumiamo che tutte le istanze abbiano le stesse eccezioni
                        const preservedSpecificDays = med.specificDays || {};

                        // 1. Aggiorna le proprietà comuni
                        profile.meds.forEach(m => {
                            if (m.sharedId === sharedId) {
                                m.name = name;
                                m.category = category;
                                m.type = type;
                                m.dose = dose;
                                m.usage = usage;
                                m.specificTime = specificTime;
                                m.startDate = startDate;
                                m.durationDays = durationDays;
                                m.endDate = endDate;
                                m.days = Array.isArray(this.selectedDays) ? [...this.selectedDays] : [];
                                m.frequency = frequency;
                                m.blisterCount = blisterCount;
                                m.pillsPerBlister = pillsPerBlister;
                                const oldQty = m.boxQty;
                                m.boxQty = boxQty;
                                m.minQty = minQty;
                                m.image = imageToSave;

                                // Assicurati che l'oggetto abbia la proprietà
                                m.specificDays = preservedSpecificDays;

                                if (boxQty > minQty && boxQty > oldQty) {
                                    m.alertShown = false;
                                }
                            }
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
                            profile.meds.push({
                                id: this.generateId(),
                                sharedId: sharedId,
                                name,
                                category,
                                type,
                                dose,
                                usage,
                                startDate,
                                durationDays,
                                endDate,
                                time: t,
                                days: Array.isArray(this.selectedDays) ? [...this.selectedDays] : [],
                                frequency,
                                taken: false,
                                boxQty,
                                minQty,
                                blisterCount,
                                pillsPerBlister,
                                therapyEndedAlertShown: false,
                                alertShown: false,
                                specificDays: preservedSpecificDays // Importante propagare
                            });
                        });
                        this.showAlert("Modificato", `Il farmaco ${name} è stato aggiornato correttamente.`);
                    }

                    // =========================
                    // ➕ NUOVO FARMACO
                    // =========================
                } else {
                    const sharedId = this.generateId();

                    this.selectedTimes.forEach(t => {
                        profile.meds.push({
                            id: this.generateId(),
                            sharedId: sharedId,
                            name,
                            category,
                            dose,
                            usage,
                            specificTime,
                            startDate,
                            durationDays,
                            endDate,
                            time: t,
                            days: Array.isArray(this.selectedDays) ? [...this.selectedDays] : [],
                            frequency,
                            taken: false,
                            boxQty,
                            minQty,
                            blisterCount,
                            pillsPerBlister,
                            therapyEndedAlertShown: false,
                            alertShown: false,
                            image: imageToSave,
                            specificDays: {} // Inizializza vuoto
                        });
                    });
                    this.showAlert("Creato", `Il farmaco ${name} è stato creato correttamente.`);
                }

                // --- LOGICA DATABASE PERMANENTE ---
                this.updateDrugDatabase({
                    name: name,
                    category: category, // Forma
                    type: type,         // Categoria Terapeutica
                    dose: dose,
                    usage: usage,
                    blisterCount: blisterCount,
                    pillsPerBlister: pillsPerBlister,
                    image: imageToSave,
                    minQty: minQty // Salviamo anche la soglia di avviso preferita
                });
                // ----------------------------------

                this.saveData();
                this.closeModal('modal-med');
                this.renderMedications();
                this.renderTherapyPreview({ startDate, frequency });
            },

            // 1. SINCRONIZZAZIONE: Copia farmaci dai profili al DB
            syncDrugsFromProfiles() {
                if (!this.data.profiles || this.data.profiles.length === 0) {
                    this.showAlert("Nessun Dato", "Non ci sono profili o farmaci da sincronizzare.");
                    return;
                }

                let count = 0;
                // Cicla tutti i profili e tutti i farmaci
                this.data.profiles.forEach(p => {
                    p.meds.forEach(m => {
                        // Usa la funzione updateDrugDatabase che gestisce già duplicati e aggiornamenti
                        this.updateDrugDatabase({
                            name: m.name,
                            category: m.category, // Forma
                            type: m.type,         // Categoria Terapeutica
                            dose: m.dose,
                            usage: m.usage,
                            blisterCount: m.blisterCount,
                            pillsPerBlister: m.pillsPerBlister,
                            minQty: m.minQty
                        });
                        count++;
                    });
                });

                this.saveData();
                this.showAlert("Sincronizzazione", `Analizzati ${count} farmaci attivi.\nL'archivio è stato aggiornato.`);

                // Se il modale di selezione archivio era aperto, aggiornalo
                // (opzionale, ma buona pratica se lo chiami da altri contesti)
            },

            // 2. GESTIONE: Apre il modale e renderizza la lista
            openDatabaseManagement() {
                this.renderDatabaseManagement();
                this.showModal('modal-database-view');
            },

            // 3. RENDER: Disegna la lista nel modale
            renderDatabaseManagement() {
                const container = document.getElementById('database-list-container');
                const countDisplay = document.getElementById('db-count-display');
                const searchTerm = document.getElementById('db-search-input').value.toLowerCase();

                container.innerHTML = '';

                if (!this.data.drugDb) this.data.drugDb = [];

                // Filtra in base alla ricerca
                const filtered = this.data.drugDb.filter(d => d.name.toLowerCase().includes(searchTerm));

                countDisplay.textContent = `${this.data.drugDb.length} farmaci salvati`;

                if (filtered.length === 0) {
                    container.innerHTML = `
                        <div class="flex flex-col items-center justify-center py-10 opacity-50">
                            <i class="fa-solid fa-box-open text-4xl mb-2 text-slate-300"></i>
                            <p class="text-sm text-slate-400">Nessun farmaco trovato</p>
                        </div>`;
                    return;
                }

                filtered.forEach((drug, index) => {
                    // Troviamo l'indice reale nell'array originale per l'eliminazione
                    const realIndex = this.data.drugDb.indexOf(drug);

                    const div = document.createElement('div');
                    div.className = "p-4 border-b border-slate-100 last:border-0 flex justify-between items-center hover:bg-slate-50 transition-colors";

                    div.innerHTML = `
                        <div class="overflow-hidden mr-3">
                            <h4 class="font-bold text-slate-700 text-sm truncate">${drug.name}</h4>
                            <div class="flex items-center gap-2 mt-0.5">
                                 ${drug.type ? `<span class="text-[9px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-100 uppercase font-bold tracking-wider">${drug.type}</span>` : ''}
                                 <span class="text-xs text-slate-500 truncate">${drug.dose || 'Dose non spec.'}</span>
                            </div>
                            ${drug.category ? `<p class="text-[10px] text-slate-400 mt-0.5 italic">${drug.category}</p>` : ''}
                        </div>
                        <button onclick="app.deleteFromDatabase(${realIndex})" class="w-8 h-8 rounded-lg bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-200 hover:bg-red-50 transition-all shadow-sm flex items-center justify-center shrink-0">
                            <i class="fa-solid fa-trash-can text-sm"></i>
                        </button>
                    `;
                    container.appendChild(div);
                });
            },

            // 4. ELIMINAZIONE: Rimuove dal DB
            deleteFromDatabase(index) {
                // Chiediamo conferma
                this.showConfirm("Elimina dall'Archivio", "Sei sicuro? Il farmaco non sarà più suggerito nei nuovi inserimenti (ma resterà nelle terapie attive).", () => {

                    this.data.drugDb.splice(index, 1);
                    this.saveData();
                    this.renderDatabaseManagement(); // Ridisegna la lista

                });
            },

            // 5. FILTRO: Helper per la barra di ricerca
            filterDatabaseList() {
                this.renderDatabaseManagement();
            },

            // NUOVA FUNZIONE: Aggiorna o Aggiunge al DB Permanente
            updateDrugDatabase(medData) {
                if (!this.data.drugDb) this.data.drugDb = [];

                // Cerchiamo se esiste già un farmaco con lo stesso nome (case insensitive)
                const index = this.data.drugDb.findIndex(d => d.name.toLowerCase() === medData.name.toLowerCase());

                if (index > -1) {
                    // Aggiorna esistente (così se hai corretto la dose, si aggiorna nel DB)
                    this.data.drugDb[index] = { ...this.data.drugDb[index], ...medData };
                } else {
                    // Aggiungi nuovo
                    this.data.drugDb.push(medData);
                }

                // Ordina alfabeticamente per comodità
                this.data.drugDb.sort((a, b) => a.name.localeCompare(b.name));
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

                // 1. Inverti stato
                med.taken = !med.taken;

                // 2. GESTIONE STORICO (Nuovo)
                // Se non esiste l'oggetto history, crealo
                if (!med.history) med.history = {};

                const todayISO = new Date().toISOString().slice(0, 10);

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

            // --- NUOVE FUNZIONI STATISTICHE (Aggiungi queste all'oggetto app) ---

            calculateStats(profile) {
                if (!profile || !profile.meds.length) return null;

                const today = new Date();
                today.setHours(0, 0, 0, 0);

                let totalScheduled = 0;
                let totalTaken = 0;
                let currentStreak = 0;
                let streakBroken = false;

                // 1. Calcolo Aderenza Globale (ultimi 30 giorni o dall'inizio)
                profile.meds.forEach(med => {
                    if (!med.history) med.history = {};

                    // Se il farmaco ha una data inizio, usala, altrimenti usa oggi
                    // (Per semplificare, calcoliamo sugli ultimi 30gg per evitare calcoli infiniti)
                    for (let i = 0; i < 30; i++) {
                        const d = new Date(today);
                        d.setDate(d.getDate() - i);
                        const iso = d.toISOString().slice(0, 10);

                        // Salta il futuro o oggi (se vogliamo statistiche consolidate, ma includiamo oggi per reattività)

                        // Controlla se il farmaco era previsto per quel giorno
                        const isScheduled = this.isMedicationDay(med, iso); // Usa la tua funzione esistente

                        if (isScheduled) {
                            totalScheduled++;
                            if (med.history[iso]) {
                                totalTaken++;
                            }
                        }
                    }
                });

                const adherencePct = totalScheduled === 0 ? 0 : Math.round((totalTaken / totalScheduled) * 100);

                // 2. Calcolo Streak (Giorni consecutivi perfetti)
                // Conta quanti giorni consecutivi INDIETRO da IERI sono stati perfetti (tutto preso)
                let dayOffset = 1; // Inizia da ieri
                while (true) {
                    const d = new Date(today);
                    d.setDate(d.getDate() - dayOffset);
                    const iso = d.toISOString().slice(0, 10);

                    let dayScheduled = 0;
                    let dayTaken = 0;

                    profile.meds.forEach(med => {
                        if (this.isMedicationDay(med, iso)) {
                            dayScheduled++;
                            if (med.history && med.history[iso]) dayTaken++;
                        }
                    });

                    // Se non c'era nulla di programmato, continua indietro (non rompe la streak)
                    if (dayScheduled === 0) {
                        dayOffset++;
                        if (dayOffset > 365) break; // Safety break
                        continue;
                    }

                    if (dayScheduled > 0 && dayTaken === dayScheduled) {
                        currentStreak++;
                        dayOffset++;
                    } else {
                        break; // Streak interrotta
                    }
                }

                // Se OGGI ho preso tutto, aggiungi 1 alla streak (gratificazione immediata)
                const todayISO = today.toISOString().slice(0, 10);
                let todaySched = 0;
                let todayT = 0;
                profile.meds.forEach(med => {
                    if (this.isMedicationDay(med, todayISO)) {
                        todaySched++;
                        if (med.taken) todayT++;
                    }
                });
                if (todaySched > 0 && todaySched === todayT) currentStreak++;


                // 3. Dati Grafico Settimanale (Ultimi 7 giorni)
                const weeklyData = [];
                const daysMap = ['D', 'L', 'M', 'M', 'G', 'V', 'S'];

                for (let i = 6; i >= 0; i--) {
                    const d = new Date(today);
                    d.setDate(d.getDate() - i);
                    const iso = d.toISOString().slice(0, 10);
                    const dayLabel = daysMap[d.getDay()];

                    let dSched = 0;
                    let dTaken = 0;

                    profile.meds.forEach(med => {
                        if (this.isMedicationDay(med, iso)) {
                            dSched++;
                            if (med.history && med.history[iso]) dTaken++; // Usa history anche per oggi per coerenza
                            // Fix per oggi: usa med.taken se è oggi e history non è ancora salvato (anche se toggle salva subito)
                            if (i === 0 && med.taken) dTaken = Math.max(dTaken, 1); // fallback
                        }
                    });

                    let pct = dSched === 0 ? -1 : Math.round((dTaken / dSched) * 100); // -1 indica "riposo"
                    weeklyData.push({ day: dayLabel, pct: pct, date: iso });
                }

                return { adherencePct, currentStreak, weeklyData, totalScheduled, totalTaken };
            },

            openStatsModal() {
                const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
                if (!profile) return;

                const stats = this.calculateStats(profile);
                if (!stats) return;

                // Popola UI
                document.getElementById('stat-adherence-val').textContent = stats.adherencePct + '%';
                document.getElementById('stat-streak-val').textContent = stats.currentStreak + ' gg';

                // Colore cerchio aderenza
                const ring = document.getElementById('stat-progress-ring');
                const circumference = 2 * Math.PI * 45; // raggio 45
                const offset = circumference - (stats.adherencePct / 100) * circumference;
                ring.style.strokeDasharray = `${circumference} ${circumference}`;
                ring.style.strokeDashoffset = offset;

                // Colore testo
                const textCol = stats.adherencePct >= 80 ? 'text-emerald-500' : (stats.adherencePct >= 50 ? 'text-orange-500' : 'text-red-500');
                document.getElementById('stat-adherence-val').className = `text-3xl font-bold ${textCol}`;
                ring.style.stroke = stats.adherencePct >= 80 ? '#10b981' : (stats.adherencePct >= 50 ? '#f97316' : '#ef4444');

                // Popola Grafico
                const chartContainer = document.getElementById('stat-weekly-chart');
                chartContainer.innerHTML = '';

                stats.weeklyData.forEach(d => {
                    let barColor = 'bg-slate-200';
                    let height = 'h-1';

                    if (d.pct === -1) {
                        height = 'h-full';
                        barColor = 'bg-slate-100 pattern-diagonal'; // Giorno di riposo
                    } else {
                        height = `h-[${d.pct}%]`; // Tailwind arbitrario potrebbe non andare, usiamo style inline
                        if (d.pct === 100) barColor = 'bg-emerald-500';
                        else if (d.pct >= 50) barColor = 'bg-orange-400';
                        else barColor = 'bg-red-400';
                    }

                    const barDiv = document.createElement('div');
                    barDiv.className = "flex flex-col items-center gap-1 flex-1";
                    // Style height dinamico
                    const barH = d.pct === -1 ? '100%' : (d.pct || 5) + '%'; // Minimo 5% per visibilità

                    barDiv.innerHTML = `
                                                            <div class="w-full bg-slate-100 rounded-lg h-24 flex items-end overflow-hidden relative">
                                                                 ${d.pct === -1 ? '<div class="absolute inset-0 bg-slate-100 opacity-50 flex items-center justify-center"><i class="fa-solid fa-minus text-slate-300"></i></div>' : ''}
                                                                 <div style="height: ${barH}" class="w-full ${barColor} rounded-t-sm transition-all duration-500"></div>
                                                            </div>
                                                            <span class="text-[10px] font-bold text-slate-500">${d.day}</span>
                                                        `;
                    chartContainer.appendChild(barDiv);
                });

                // Insight Testuale
                const insight = document.getElementById('stat-insight');
                const missed = stats.totalScheduled - stats.totalTaken;
                if (stats.adherencePct === 100) {
                    insight.innerHTML = `<span class="text-emerald-600 font-bold"><i class="fa-solid fa-trophy"></i> Perfetto!</span> Stai seguendo la terapia alla lettera.`;
                } else if (missed > 0) {
                    insight.innerHTML = `<span class="text-orange-600 font-bold"><i class="fa-solid fa-triangle-exclamation"></i> Attenzione.</span> Hai saltato ${missed} assunzioni negli ultimi 30 giorni.`;
                } else {
                    insight.textContent = "Dati insufficienti per un'analisi dettagliata.";
                }

                this.showModal('modal-stats');
            },

            takePrnMed(id) {
                const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
                const med = profile.meds.find(m => m.id === id);
                if (!med) return;

                // Inizializza l'array dello storico se non esiste
                if (!med.prnHistory) med.prnHistory = [];

                // Aggiungi il timestamp di adesso
                med.prnHistory.push(new Date().toISOString());

                // Scala la scorta se gestita
                if (med.boxQty > 0) {
                    const dose = this.parseDose(med.dose);
                    med.boxQty = Math.max(0, med.boxQty - dose);
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

                // 1. Rimuovi dalla terapia attiva (Profilo) - Succede in entrambi i casi
                profile.meds = profile.meds.filter(m => m.id !== this.medToDeleteId);

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

            quickAddToShoppingList(medId) {
                const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
                const med = profile.meds.find(m => m.id === medId);
                if (!med) return;

                // Controllo preventivo: se è già in lista, avvisa subito senza chiedere conferma
                if (med.isOTCOrdered) {
                    this.showAlert("Già in lista", "Questo farmaco è già presente nella lista da acquistare.");
                    return;
                }

                // --- AGGIUNTA RICHIESTA CONFERMA ---
                this.showConfirm(
                    "Aggiungi al carrello",
                    `Vuoi aggiungere <b>${med.name}</b> alla lista della spesa?`,
                    () => {
                        // --- LOGICA DI AGGIUNTA (eseguita solo se si preme Conferma) ---
                        const sharedId = med.sharedId;

                        profile.meds.forEach(m => {
                            if (m.sharedId === sharedId) {
                                m.isOTCOrdered = true;
                                // Se non ha una quantità impostata, metti 1
                                if (!m.otcOrderQty || m.otcOrderQty < 1) m.otcOrderQty = 1;
                            }
                        });

                        this.saveData();
                        this.updateShoppingBtnState(); // Aggiorna il colore del tasto home nella dashboard

                        // Feedback visivo finale
                        this.showAlert("Aggiunto", `${med.name} è stato aggiunto alla lista spesa.`);
                    }
                );
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

            renderMedications() {
                const profile = this.data.profiles.find(x => x.id === this.currentProfileId);
                if (!profile) return;

                const prefs = this.data.preferences || { showCart: true, showNotes: true, showEdit: true, showDelete: true };
                
                const rawName = (profile.nickname && profile.nickname.trim() !== '') ? profile.nickname : profile.name;
                document.getElementById('current-profile-name').textContent = this.escapeHTML(rawName);

                const toolbarContainer = document.getElementById('med-toolbar');
                if (toolbarContainer) {
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
                }

                const times = ['Mattina', 'Pomeriggio', 'Sera', 'Al Bisogno'];
                let hasMeds = false;

                const dayMap = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
                const now = new Date();
                const todayShort = dayMap[now.getDay()];
                const todayISO = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');

                times.forEach(time => {
                    const container = document.getElementById(`med-list-${time.toLowerCase()}`);
                    if (!container) return;

                    container.innerHTML = '';
                    const meds = profile.meds.filter(m => m.time === time);

                    if (meds.length > 0) {
                        hasMeds = true;

                        const totalCount = meds.length;
                        const takenCount = meds.filter(m => m.taken).length;
                        const isOpen = this.expandedSections.includes(time);
                        const hiddenClass = isOpen ? '' : 'hidden';
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
                        container.appendChild(header);

                        const listContainer = document.createElement('div');
                        listContainer.id = `list-${time}`;
                        listContainer.className = `space-y-3 ${hiddenClass}`;

                        meds.forEach(med => {
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

                            // SICUREZZA: Sanitizziamo le variabili immesse dall'utente
                            const safeMedName = this.escapeHTML(med.name);
                            const safeCategory = this.escapeHTML(med.category);
                            const safeDose = this.escapeHTML(med.dose);
                            const safeUsage = this.escapeHTML(med.usage);

                            // UX: Tolti gli attributi title
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

                            const card = document.createElement('div');
                            const categoryClass = `med-card-${time.toLowerCase()}`;

                            let visualClass = '';
                            if (!isToday) visualClass = 'med-card-inactive';
                            else if (isLocked) visualClass = 'opacity-60 bg-slate-100 border-slate-200';

                            const takenClass = med.taken ? 'med-card-taken' : '';

                            const therapy = this.getTherapyStatus(med);
                            let therapyBadge = '';
                            if (therapy) {
                                therapyBadge = `<div class="therapy-badge ${therapy.cls}"><span class="label">${therapy.label}</span><span class="dot">•</span><span class="sub">${therapy.sub}</span></div>`;
                            }
                            if (!isToday) {
                                therapyBadge += `<div class="therapy-badge gray"><span class="label">Oggi non previsto</span></div>`;
                            }

                            const timeDisplay = effectiveTime
                                ? `<span class="text-xs font-bold ${isLocked ? 'text-orange-500' : 'text-slate-600'} bg-white px-1.5 py-0.5 rounded border mr-2 flex-shrink-0">${isLocked ? '<i class="fa-solid fa-lock mr-1"></i>' : ''}${effectiveTime}</span>`
                                : '';

                            card.className = `p-4 rounded-xl card-shadow border mb-3 flex items-center justify-between transition-all ${categoryClass} ${takenClass} ${visualClass}`;

                            if (time === 'Al Bisogno') {
                                const countToday = (med.prnHistory || []).filter(ts => ts.slice(0, 10) === todayISO).length;

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
                                card.className = `p-4 rounded-xl card-shadow border ${activeBorder} mb-3 flex items-center justify-between transition-all`;

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
                                        <button onclick="app.takePrnMed('${med.id}')" class="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded-lg font-bold text-xs shadow-md active:scale-95 transition-all flex items-center gap-1 ml-1 mr-1">
                                            <i class="fa-solid fa-plus"></i> Prendi
                                        </button>
                                        <div class="flex flex-col gap-1 ml-1 border-l pl-2 border-slate-100">
                                            ${editBtnSmall}
                                            ${deleteBtnSmall}
                                        </div>
                                    </div>`;
                            } else {
                                card.innerHTML = `
                                    <div class="flex items-center gap-4 flex-1 overflow-hidden card-main-content">
                                        <input type="checkbox" class="med-checkbox" ${med.taken ? 'checked' : ''} ${isLocked || !isToday ? 'disabled' : ''} onchange="app.toggleMedication('${med.id}')">
                                        <div class="overflow-hidden ${med.taken ? 'opacity-40' : ''} ${!isLocked && isToday ? 'cursor-pointer' : ''}">
                                            <div class="flex items-center">
                                                ${timeDisplay}
                                                <h4 class="font-bold text-slate-800 leading-tight truncate">${safeMedName}</h4>
                                            </div>
                                            <div class="flex flex-col">
                                                ${safeCategory ? `<p class="text-[10px] font-semibold text-slate-500 uppercase tracking-tighter">${safeCategory}</p>` : ''}
                                                <div class="flex flex-col mt-0.5">
                                                    ${safeDose ? `<p class="text-xs text-blue-700 font-bold mb-0.5">${safeDose}</p>` : ''}
                                                    ${safeUsage ? `<p class="text-[10px] text-slate-400 italic truncate">${safeUsage}</p>` : ''}
                                                    ${therapyBadge}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="flex items-center card-actions">
                                        ${photoBtn}
                                        ${cartBtn}
                                        ${noteBtn}
                                        ${editBtn}
                                        ${deleteBtn}
                                    </div>`;
                            }

                            listContainer.appendChild(card);
                        });
                        container.appendChild(listContainer);
                    }
                });

                document.getElementById('med-empty-state').classList.toggle('hidden', hasMeds);
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

            closeModal(id) {
                document.getElementById(id).classList.add('hidden');
                if (id === 'modal-med') {
                    document.getElementById('input-med-edit-id').value = '';
                }
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

            handleSwipe(endX, endY) {
                if (!this.currentProfileId) return;
                if (!document.getElementById('view-settings').classList.contains('hidden')) return;
                if (document.querySelector('.modal-overlay:not(.hidden)')) return;

                const diffX = endX - this.touchStartX;
                const diffY = endY - this.touchStartY;

                // Prevenzione scroll verticale interpretato come swipe
                if (Math.abs(diffY) > Math.abs(diffX)) return;

                // Soglia minima movimento
                if (Math.abs(diffX) < 60) return;

                const edgeThreshold = 40; // Pixel dal bordo per attivare la gesture "Indietro"
                const isLeftEdge = this.touchStartX < edgeThreshold;
                const isRightEdge = this.touchStartX > (window.innerWidth - edgeThreshold);

                // --- GESTURE 1: SWIPE DAI BORDI (TORNA ALLA HOME) ---
                // Bordo SX verso DX  oppure  Bordo DX verso SX
                if ((isLeftEdge && diffX > 0) || (isRightEdge && diffX < 0)) {
                    this.goHome();
                    return; // Blocca qui per non scatenare il cambio profilo
                }

                // --- GESTURE 2: SWIPE CENTRALE (CAMBIO PROFILO) ---
                // Solo se NON siamo partiti dai bordi
                if (!isLeftEdge && !isRightEdge) {
                    const currentIndex = this.data.profiles.findIndex(p => p.id === this.currentProfileId);

                    if (diffX > 0) {
                        if (currentIndex > 0) {
                            this.openProfile(this.data.profiles[currentIndex - 1].id);
                        }
                    }

                    if (diffX < 0 && currentIndex < this.data.profiles.length - 1) {
                        this.openProfile(this.data.profiles[currentIndex + 1].id);
                    }
                }
            },

            // --- GESTIONE LISTA SPESA ---

            openShoppingListModal() {
                const container = document.getElementById('shopping-list-content');
                container.innerHTML = '';

                let hasAnyItem = false;

                // ============================================================
                // SEZIONE 1: DA ORDINARE
                // ============================================================
                this.data.profiles.forEach(profile => {
                    const allMedsToOrder = profile.meds.filter(m => m.minQty > 0 && m.boxQty <= m.minQty && !m.isOrdered);

                    // Filtro Duplicati
                    const uniqueMedsToOrder = [];
                    const seenIds = new Set();
                    allMedsToOrder.forEach(med => {
                        if (!seenIds.has(med.sharedId)) {
                            uniqueMedsToOrder.push(med);
                            seenIds.add(med.sharedId);
                        }
                    });

                    if (uniqueMedsToOrder.length > 0) {
                        hasAnyItem = true;

                        const section = document.createElement('div');
                        section.className = "bg-white mb-2 border-b border-slate-200 shadow-sm";

                        // Header
                        let docInfo = '<span class="text-slate-400 italic text-[10px] ml-2">(Nessun medico)</span>';

                        // Variabili per i pulsanti
                        let waButtonHtml = '';
                        let otcButtonHtml = '';

                        // 1. Logica Pulsante WhatsApp
                        if (profile.doctor && profile.doctor.phoneWa) {
                            docInfo = `<span class="text-blue-500 font-medium text-[10px] ml-2"><i class="fa-solid fa-user-doctor mr-1"></i>${profile.doctor.name}</span>`;

                            let defaultMsg = `👋 Buongiorno Dott. ${profile.doctor.name || ''},\n`;
                            defaultMsg += `Sono ${profile.name}, avrei bisogno di ordinare i seguenti farmaci:\n\n`;
                            uniqueMedsToOrder.forEach(m => defaultMsg += `- ${m.name}\n`);
                            defaultMsg += `\nGrazie mille.`;

                            waButtonHtml = `
                                                                <div class="mt-3"> <button id="btn-prep-${profile.id}" onclick="app.toggleOrderEditor('${profile.id}')" class="w-full flex items-center justify-center gap-2 py-1.5 bg-green-500 text-white font-bold rounded-lg shadow hover:bg-green-600 active:scale-95 transition-all text-xs">
                                                                        <i class="fa-brands fa-whatsapp text-sm"></i> Prepara Messaggio
                                                                    </button>
                                                                    <div id="editor-${profile.id}" class="hidden bg-slate-50 p-3 rounded-xl border border-slate-200 fade-in mt-2">
                                                                        <textarea id="msg-area-${profile.id}" rows="6" class="w-full p-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none resize-none mb-2 font-mono text-slate-700 leading-snug">${defaultMsg}</textarea>
                                                                        <div class="grid grid-cols-2 gap-2">
                                                                            <button onclick="app.toggleOrderEditor('${profile.id}')" class="py-1.5 bg-white text-slate-500 border border-slate-300 rounded-lg font-bold text-xs">Annulla</button>
                                                                            <button onclick="app.sendCustomOrder('${profile.id}')" class="py-1.5 bg-green-600 text-white rounded-lg font-bold text-xs shadow flex items-center justify-center gap-2"><i class="fa-regular fa-paper-plane"></i> Invia</button>
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            `;
                        } else {
                            waButtonHtml = `
                                                                    <button onclick="app.showAlert('Dati mancanti', 'Aggiungi il numero WhatsApp per ordinare.')" class="w-full flex items-center justify-center gap-2 py-2.5 bg-slate-100 text-slate-400 font-bold rounded-lg cursor-not-allowed text-xs">
                                                                        <i class="fa-brands fa-whatsapp"></i> Numero mancante
                                                                    </button>
                                                                `;
                        }

                        // 2. Logica Pulsante Acquisto da Banco (Sempre disponibile)
                        otcButtonHtml = `
                                                            <button onclick="app.markAsOrderedDirectly('${profile.id}')" class="w-full flex items-center justify-center gap-2 py-1.5 bg-blue-50 text-blue-600 border border-blue-100 font-bold rounded-lg hover:bg-blue-100 active:scale-95 transition-all text-xs">
                                                                <i class="fa-solid fa-basket-shopping"></i> Acquisto da banco
                                                            </button>
                                                        `;

                        // Lista Farmaci
                        let listHtml = '';
                        uniqueMedsToOrder.forEach(med => {
                            listHtml += `
                                                                    <div class="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">
                                                                        <i class="fa-solid fa-circle-exclamation text-orange-500 text-xs"></i>
                                                                        <div class="flex-1">
                                                                            <p class="font-bold text-slate-700 text-sm">${med.name}</p>
                                                                        </div>
                                                                    </div>
                                                                `;
                        });

                        section.innerHTML = `
                                                            <div class="p-4">
                                                                <div class="flex items-center justify-between mb-2">
                                                                    <h4 class="font-bold text-slate-800 flex items-center text-sm uppercase tracking-wider">
                                                                        <i class="fa-solid fa-user text-slate-400 mr-2"></i> ${profile.name}
                                                                    </h4>
                                                                    ${docInfo}
                                                                </div>

                                                                <div class="pl-2 border-l-2 border-orange-100 space-y-0 mb-4">
                                                                    ${listHtml}
                                                                </div>

                                                                <div class="space-y-2 border-t border-slate-100 pt-3">
                                                                    ${waButtonHtml}
                                                                    ${otcButtonHtml}
                                                                </div>
                                                            </div>
                                                        `;
                        container.appendChild(section);
                    }
                });

                // ============================================================
                // SEZIONE 2: FARMACI ORDINATI (Codice invariato)
                // ============================================================
                const anyOrdered = this.data.profiles.some(p => p.meds.some(m => m.isOrdered));

                if (anyOrdered) {
                    hasAnyItem = true;
                    const headerDiv = document.createElement('div');
                    headerDiv.className = "mt-6 px-4 pb-2";
                    headerDiv.innerHTML = `<h4 class="font-bold text-slate-400 text-xs uppercase flex items-center gap-2"><i class="fa-solid fa-box-archive"></i> Farmaci Ordinati (In arrivo)</h4><p class="text-[9px] text-slate-400 mt-1">Clicca su 'Ricevi' quando ritiri i farmaci per aggiornare il magazzino.</p>`;
                    container.appendChild(headerDiv);

                    this.data.profiles.forEach(profile => {
                        const orderedMeds = profile.meds.filter(m => m.isOrdered);
                        const uniqueOrdered = [];
                        const seenOrdIds = new Set();
                        orderedMeds.forEach(med => {
                            if (!seenOrdIds.has(med.sharedId)) {
                                uniqueOrdered.push(med);
                                seenOrdIds.add(med.sharedId);
                            }
                        });

                        if (uniqueOrdered.length > 0) {
                            const groupDiv = document.createElement('div');
                            groupDiv.className = "bg-slate-50 border-y border-slate-200 mb-4";
                            let listHtml = `<div class="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center gap-2"><i class="fa-solid fa-user text-slate-400 text-xs"></i><span class="font-bold text-slate-600 text-xs uppercase">${profile.name}</span></div>`;

                            uniqueOrdered.forEach(m => {
                                listHtml += `
                                                                <div class="flex items-center justify-between py-3 px-4 border-b border-slate-200/50 last:border-0 gap-2 bg-white">
                                                                    <div class="flex-1 min-w-0 mr-2">
                                                                        <div class="flex items-center gap-3">
                                                                            <div class="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs shrink-0"><i class="fa-solid fa-box-open"></i></div>
                                                                            <div><p class="font-bold text-slate-700 text-sm truncate leading-tight">${m.name}</p><p class="text-[9px] text-slate-400 mt-0.5">In attesa di ritiro...</p></div>
                                                                        </div>
                                                                    </div>
                                                                    <div class="flex items-center gap-2 shrink-0">
                                                                        <button onclick="app.askConfirmRestore('${m.id}')" class="w-9 h-9 rounded-lg bg-red-500 text-white shadow-md hover:bg-red-600 active:scale-95 transition-all flex items-center justify-center" title="Annulla Ordine">
                                                                            <i class="fa-solid fa-trash-can"></i>
                                                                        </button>

                                                                        <button onclick="app.receiveMedication('${m.id}')" class="h-9 px-3 rounded-lg bg-emerald-500 text-white font-bold text-[10px] uppercase shadow-md hover:bg-emerald-600 active:scale-95 transition-all flex items-center gap-1">
                                                                            <i class="fa-solid fa-check"></i> Ricevi
                                                                        </button>
                                                                    </div>
                                                                </div>`;
                            });
                            groupDiv.innerHTML = listHtml;
                            container.appendChild(groupDiv);
                        }
                    });
                }

                if (!hasAnyItem) {
                    container.innerHTML = `<div class="flex flex-col items-center justify-center py-12 text-center opacity-60"><div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-400 text-3xl"><i class="fa-solid fa-basket-shopping"></i></div><h3 class="text-lg font-bold text-slate-700">Tutto in ordine</h3><p class="text-sm text-slate-500 px-6">Non ci sono farmaci da acquistare o in arrivo.</p></div>`;
                }

                this.showModal('modal-shopping-list');
            },

            // --- GESTIONE FARMACI DA BANCO (OTC) ---

            openOTCList() {
                this.renderOTCList();
                this.showModal('modal-otc-list');
            },

            filterOTCList() {
                const term = document.getElementById('otc-search').value.toLowerCase();
                const items = document.querySelectorAll('.otc-item');
                items.forEach(item => {
                    const name = item.dataset.name.toLowerCase();
                    if (name.includes(term)) {
                        item.classList.remove('hidden');
                    } else {
                        item.classList.add('hidden');
                    }
                });
            },

            renderOTCList() {
                const orderedContainer = document.getElementById('otc-ordered-list');
                const allContainer = document.getElementById('otc-all-list');
                const orderedSection = document.getElementById('otc-ordered-section');

                orderedContainer.innerHTML = '';
                allContainer.innerHTML = '';

                // --- 1. SEZIONE ORDINATI (Raggruppati per Profilo) ---
                let hasOrderedGlobal = false;

                this.data.profiles.forEach(profile => {
                    // FILTRO DUPLICATI: Mostra solo un'istanza per sharedId
                    const uniqueOrderedMeds = [];
                    const seenIds = new Set();

                    profile.meds.forEach(m => {
                        if (m.isOTCOrdered && !seenIds.has(m.sharedId)) {
                            uniqueOrderedMeds.push(m);
                            seenIds.add(m.sharedId);
                        }
                    });

                    if (uniqueOrderedMeds.length > 0) {
                        hasOrderedGlobal = true;

                        // Intestazione Profilo
                        const header = document.createElement('div');
                        header.className = "px-2 py-1.5 bg-slate-100 rounded-lg mb-2 mt-3 flex items-center gap-2 border border-slate-200";
                        header.innerHTML = `
                                                                <i class="fa-solid fa-user text-slate-400 text-xs"></i>
                                                                <span class="text-xs font-bold text-slate-600 uppercase tracking-wide">${profile.name}</span>
                                                            `;
                        orderedContainer.appendChild(header);

                        // Lista farmaci unici del profilo
                        uniqueOrderedMeds.forEach(med => {
                            const qty = med.otcOrderQty || 1;
                            let displayName = med.name;
                            if (displayName.length > 18) {
                                displayName = displayName.substring(0, 18) + '...';
                            }

                            const div = document.createElement('div');
                            div.className = "bg-purple-50 border border-purple-200 rounded-xl p-3 flex justify-between items-center mb-2 last:mb-0";

                            // NOTA: Passiamo med.sharedId per cancellare TUTTE le istanze (mattina/pom/sera)
                            div.innerHTML = `
                                                                    <div class="flex items-center gap-3 overflow-hidden">
                                                                        <div class="w-8 h-8 rounded-full bg-purple-100 text-purple-600 flex items-center justify-center shrink-0">
                                                                            <i class="fa-solid fa-basket-shopping"></i>
                                                                        </div>
                                                                        <div class="truncate">
                                                                            <h4 class="font-bold text-slate-800 text-sm truncate">
                                                                                ${displayName}
                                                                            </h4>
                                                                            <p class="text-[10px] text-purple-600 font-bold uppercase flex items-center gap-2">
                                                                                <span class="px-1.5 py-0.5 rounded-md bg-white border border-purple-200 text-purple-600 text-[10px] font-black shadow-sm">
                                                                                    x${qty}
                                                                                </span>
                                                                                ${med.type || ''}
                                                                            </p>
                                                                        </div>
                                                                    </div>
                                                                    <div class="flex gap-2 shrink-0">
                                                                        <button onclick="app.cancelOTCOrder('${med.sharedId}')" class="w-8 h-8 rounded-lg bg-red-500 text-white shadow-md hover:bg-red-600 active:scale-95 transition-all flex items-center justify-center" title="Rimuovi">
                                                                            <i class="fa-solid fa-trash-can"></i>
                                                                        </button>
                                                                        <button onclick="app.receiveMedication('${med.id}')" class="h-8 px-3 rounded-lg bg-green-500 text-white font-bold text-[10px] uppercase shadow-md hover:bg-green-600 active:scale-95 transition-all flex items-center gap-1">
                                                                            <i class="fa-solid fa-check"></i> Ricevi
                                                                        </button>
                                                                    </div>
                                                                `;
                            orderedContainer.appendChild(div);
                        });
                    }
                });

                // Gestione visibilità sezione "Da Acquistare"
                if (hasOrderedGlobal) {
                    // 1. Crea il contenitore per i pulsanti
                    const btnContainer = document.createElement('div');
                    btnContainer.className = "grid grid-cols-2 gap-2 mt-4 mb-2"; // Margine sopra per staccare dalla lista

                    // 2. Inserisci l'HTML dei pulsanti (stile ridotto: py-2, text-xs)
                    btnContainer.innerHTML = `
                                                        <button onclick="app.shareOTCListWhatsApp()" class="flex items-center justify-center gap-2 py-2 bg-green-500 hover:bg-green-600 text-white font-bold rounded-lg transition-all active:scale-95 shadow-md text-xs">
                                                            <i class="fa-brands fa-whatsapp text-sm"></i> Prepara Messaggio
                                                        </button>
                                                        <button onclick="app.openPharmacyMode()" class="flex items-center justify-center gap-2 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg transition-all active:scale-95 shadow-md text-xs">
                                                            <i class="fa-solid fa-expand text-sm"></i> Al Banco
                                                        </button>
                                                    `;

                    // 3. Aggiungi i pulsanti alla fine della lista "orderedContainer"
                    orderedContainer.appendChild(btnContainer);

                    // 4. Mostra la sezione
                    orderedSection.classList.remove('hidden');
                } else {
                    // Nascondi la sezione se non c'è nulla
                    orderedSection.classList.add('hidden');
                }

                // --- INIZIO MODIFICA: Gestione visibilità bottoni azioni ---
                const actionBtns = document.getElementById('otc-action-buttons');
                if (actionBtns) {
                    if (hasOrderedGlobal) {
                        actionBtns.classList.remove('hidden');
                    } else {
                        actionBtns.classList.add('hidden');
                    }
                }

                // --- FINE MODIFICA ---
                // --- 2. SEZIONE CERCA E AGGIUNGI (Invariata) ---
                let seenAllIds = new Set();
                let allUniqueMeds = [];

                this.data.profiles.forEach(p => {
                    p.meds.forEach(m => {
                        if (!seenAllIds.has(m.sharedId)) {
                            allUniqueMeds.push(m);
                            seenAllIds.add(m.sharedId);
                        }
                    });
                });

                allUniqueMeds.sort((a, b) => a.name.localeCompare(b.name));

                allUniqueMeds.forEach(med => {
                    const div = document.createElement('div');
                    div.className = "otc-item bg-white border border-slate-200 rounded-xl p-3 flex justify-between items-center cursor-pointer hover:bg-slate-50 transition-colors";
                    div.dataset.name = med.name;
                    div.onclick = () => this.openOTCPurchaseModal(med.id);

                    div.innerHTML = `
                                                            <div class="flex items-center gap-3 overflow-hidden">
                                                                <div class="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center shrink-0">
                                                                    <i class="fa-solid fa-pills"></i>
                                                                </div>
                                                                <div class="truncate">
                                                                    <h4 class="font-bold text-slate-700 text-sm truncate">${med.name}</h4>
                                                                    <p class="text-[10px] text-slate-500 font-medium truncate">
                                                                        ${med.type || 'Generico'}
                                                                    </p>
                                                                </div>
                                                            </div>
                                                            <i class="fa-solid fa-chevron-right text-xs text-slate-300"></i>
                                                        `;
                    allContainer.appendChild(div);
                });

                if (allUniqueMeds.length === 0) {
                    allContainer.innerHTML = `<p class="text-center text-slate-400 text-xs py-4">Nessun farmaco registrato.</p>`;
                }
            },

            openOTCPurchaseModal(medId) {
                let med = null;
                for (let p of this.data.profiles) {
                    med = p.meds.find(m => m.id === medId);
                    if (med) break;
                }

                if (!med) return;

                document.getElementById('otc-detail-name').textContent = med.name;
                document.getElementById('otc-detail-form').textContent = med.category || "Forma non specificata";
                document.getElementById('otc-detail-dose').textContent = med.dose || "N/D";
                document.getElementById('otc-detail-usage').textContent = med.usage || "Nessuna descrizione disponibile.";

                // RESET QUANTITÀ A 1
                document.getElementById('otc-qty-input').value = 1;

                const btn = document.getElementById('btn-confirm-otc-buy');
                btn.onclick = () => this.confirmOTCPurchase(med.sharedId);

                this.showModal('modal-otc-detail');
            },

            confirmOTCPurchase(sharedId) {
                // Leggi la quantità scelta
                const qty = parseInt(document.getElementById('otc-qty-input').value) || 1;

                this.data.profiles.forEach(p => {
                    p.meds.forEach(m => {
                        if (m.sharedId === sharedId) {
                            m.isOTCOrdered = true;
                            m.otcOrderQty = qty; // SALVIAMO LA QUANTITÀ NELL'OGGETTO
                        }
                    });
                });

                this.saveData();
                this.closeModal('modal-otc-detail');
                document.getElementById('otc-search').value = '';
                this.renderOTCList();
                this.showAlert("Aggiunto", `Aggiunte ${qty} confezioni alla lista ordini.`);
            },

            cancelOTCOrder(sharedId) {
                // Cerchiamo il nome
                let medName = "farmaco";
                // Cerchiamo il farmaco in qualsiasi profilo per avere il nome
                for (const p of this.data.profiles) {
                    const found = p.meds.find(m => m.sharedId === sharedId);
                    if (found) {
                        medName = found.name;
                        break;
                    }
                }

                this.showConfirm("Rimuovi", `Rimuovere ${medName} dalla lista acquisti?`, () => {
                    // Rimuovi flag da TUTTE le istanze con questo sharedId
                    this.data.profiles.forEach(p => {
                        p.meds.forEach(m => {
                            if (m.sharedId === sharedId) {
                                m.isOTCOrdered = false;
                            }
                        });
                    });
                    this.saveData();
                    this.renderOTCList();
                    this.updateShoppingBtnState();
                });
            },

            getShoppingListText() {
                let text = "🛒 *LISTA FARMACI DA ACQUISTARE* 🛒\n\n";
                let count = 0;

                this.data.profiles.forEach(profile => {
                    let profileMeds = [];
                    // Set locale per questo profilo
                    const seenIds = new Set();

                    profile.meds.forEach(med => {
                        if (med.minQty > 0 && med.boxQty <= med.minQty && !med.isOrdered) {
                            // Controllo sharedId per evitare duplicati
                            if (!seenIds.has(med.sharedId)) {
                                profileMeds.push(med);
                                seenIds.add(med.sharedId);
                            }
                        }
                    });

                    if (profileMeds.length > 0) {
                        text += `👤 *${profile.name}*\n`;
                        profileMeds.forEach(m => {
                            count++;
                            // Solo Nome, niente dose
                            text += `- ${m.name}\n`;
                        });
                        text += "\n";
                    }
                });

                if (count === 0) return "Tutte le scorte sono sufficienti o i farmaci sono già stati ordinati! ✅";

                text += "--------------------------\nGenerato con MedicinePro";
                return text;
            },

            copyShoppingList() {
                const text = this.getShoppingListText();
                navigator.clipboard.writeText(text).then(() => {
                    this.showAlert("Copiato", "La lista completa è stata copiata negli appunti!");
                }).catch(err => {
                    console.error('Errore copia', err);
                    this.showAlert("Errore", "Impossibile copiare negli appunti.");
                });
            },

            shareShoppingList() {
                const text = this.getShoppingListText();
                if (navigator.share) {
                    navigator.share({
                        title: 'Lista Farmacia',
                        text: text
                    }).catch(console.error);
                } else {
                    this.copyShoppingList();
                }
            },

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
                        const cleanNum = profile.doctor.phoneWa.replace(/[^0-9]/g, '');
                        const waNum = cleanNum.startsWith('39') ? cleanNum : '39' + cleanNum;
                        btnWa.href = `https://wa.me/${waNum}`;
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

            // --- NUOVE FUNZIONI PER MODIFICA MESSAGGIO ---

            toggleOrderEditor(profileId) {
                const btn = document.getElementById(`btn-prep-${profileId}`);
                const editor = document.getElementById(`editor-${profileId}`);

                if (editor.classList.contains('hidden')) {
                    // Mostra editor, nascondi bottone grande
                    editor.classList.remove('hidden');
                    btn.classList.add('hidden');
                } else {
                    // Nascondi editor, mostra bottone grande
                    editor.classList.add('hidden');
                    btn.classList.remove('hidden');
                }
            },

            sendCustomOrder(profileId) {
                const profile = this.data.profiles.find(p => p.id === profileId);
                if (!profile) return;

                // 1. Recupera il testo modificato dall'utente
                const customText = document.getElementById(`msg-area-${profileId}`).value;

                // 2. Prepara il numero WhatsApp
                let phone = profile.doctor.phoneWa.replace(/[^0-9]/g, '');
                if (!phone.startsWith('39')) phone = '39' + phone;

                // 3. Invia (apre WhatsApp)
                const url = `https://wa.me/${phone}?text=${encodeURIComponent(customText)}`;
                window.open(url, '_blank');

                // 4. Marca i farmaci come ordinati
                const medsToOrder = profile.meds.filter(m => m.minQty > 0 && m.boxQty <= m.minQty && !m.isOrdered);
                medsToOrder.forEach(m => {
                    m.isOrdered = true;
                });

                this.saveData();

                // 5. Aggiorna interfaccia (ritardo per UX)
                setTimeout(() => {
                    this.openShoppingListModal();
                }, 500);
            },

            restoreFromOrdered(medId) {
                // 1. Trova il farmaco originale per ottenere il suo sharedId
                let targetSharedId = null;

                // Cerchiamo l'ID condiviso scandagliando i profili
                for (const profile of this.data.profiles) {
                    const found = profile.meds.find(m => m.id === medId);
                    if (found) {
                        targetSharedId = found.sharedId;
                        break;
                    }
                }

                if (!targetSharedId) return;

                // 2. Ripristina TUTTE le istanze con quello sharedId in TUTTI i profili
                let restoredCount = 0;
                this.data.profiles.forEach(profile => {
                    profile.meds.forEach(med => {
                        // Se ha lo stesso sharedId ed è marcato come ordinato -> Ripristina
                        if (med.sharedId === targetSharedId && med.isOrdered) {
                            med.isOrdered = false;
                            restoredCount++;
                        }
                    });
                });

                // 3. Salva e Aggiorna
                this.saveData();
                this.openShoppingListModal(); // Ricarica la lista

                // Feedback opzionale (se vuoi vedere quanti ne ha ripristinati in console)
                console.log(`Ripristinati ${restoredCount} farmaci collegati.`);
            },

            calculateTotalStock() {
                const blisters = parseFloat(document.getElementById('med-blister-count').value);
                const pills = parseFloat(document.getElementById('med-pills-per-blister').value);
                const previewBox = document.getElementById('calc-preview');

                if (!isNaN(blisters) && !isNaN(pills) && blisters > 0 && pills > 0) {
                    const total = blisters * pills;
                    document.getElementById('med-box-qty').value = total;
                    previewBox.textContent = total;

                    // Feedback visivo
                    const totalInput = document.getElementById('med-box-qty');
                    totalInput.classList.add('bg-blue-50', 'text-blue-600');
                    setTimeout(() => totalInput.classList.remove('bg-blue-50', 'text-blue-600'), 500);
                } else {
                    previewBox.textContent = "0";
                }
            },

            // Variabile temporanea per memorizzare cosa stiamo ricevendo
            tempReceiveData: null,

            receiveMedication(medId) {
                // 1. Trova il farmaco
                let foundMed = null;
                for (const p of this.data.profiles) {
                    foundMed = p.meds.find(m => m.id === medId);
                    if (foundMed) break;
                }

                if (!foundMed) return;

                // 2. Calcola il contenuto di UNA scatola
                let oneBoxContent = 0;
                let configText = "";

                if (foundMed.blisterCount && foundMed.blisterCount > 0 && foundMed.pillsPerBlister && foundMed.pillsPerBlister > 0) {
                    oneBoxContent = foundMed.blisterCount * foundMed.pillsPerBlister;
                    configText = `${foundMed.blisterCount} blister × ${foundMed.pillsPerBlister} compresse\n= ${oneBoxContent} unità per scatola`;
                } else {
                    // Fallback se non configurato
                    oneBoxContent = foundMed.minQty > 0 ? Math.max(20, foundMed.minQty * 2) : 20;
                    configText = `Configurazione standard (non impostata)\n= ${oneBoxContent} unità per scatola`;
                }

                // 3. Salva i dati temporanei per il modale
                this.tempReceiveData = {
                    medId: medId,
                    sharedId: foundMed.sharedId,
                    oneBoxContent: oneBoxContent
                };

                // 3.1. Se è un ordine OTC, preimposta la quantità
                let defaultQty = 1;
                if (foundMed.isOTCOrdered && foundMed.otcOrderQty) {
                    defaultQty = foundMed.otcOrderQty;
                }
                document.getElementById('receive-qty-input').value = defaultQty;
                // --------------------

                // 4. Popola e Apri il Modale
                document.getElementById('receive-med-name').textContent = foundMed.name;
                document.getElementById('receive-config-info').innerText = configText; // innerText gestisce \n
                document.getElementById('receive-qty-input').value = 1; // Reset a 1

                this.showModal('modal-receive');
            },

            // --- FUNZIONI PER IL MODALE RICEZIONE ---

            // Questa è la funzione che fa funzionare i tasti + e -
            adjustReceiveQty(delta) {
                const input = document.getElementById('receive-qty-input');
                if (!input) return;

                // Prendi il valore attuale (o 1 se vuoto)
                let val = parseInt(input.value) || 1;

                // Aggiungi o sottrai (delta è +1 o -1)
                val += delta;

                // Non scendere mai sotto 1
                if (val < 1) val = 1;

                // Aggiorna l'input
                input.value = val;
            },

            // Questa è la funzione che conferma l'arrivo della merce
            confirmReceive() {
                // Controllo sicurezza
                if (!this.tempReceiveData) {
                    this.closeModal('modal-receive');
                    return;
                }

                const inputVal = parseInt(document.getElementById('receive-qty-input').value);
                const numBoxes = (isNaN(inputVal) || inputVal < 1) ? 1 : inputVal;

                const oneBoxContent = this.tempReceiveData.oneBoxContent;
                const targetSharedId = this.tempReceiveData.sharedId;
                const totalToAdd = oneBoxContent * numBoxes;

                // Aggiorna le scorte
                this.data.profiles.forEach(p => {
                    p.meds.forEach(m => {
                        if (m.sharedId === targetSharedId) {
                            const currentQty = parseFloat(m.boxQty) || 0;
                            m.boxQty = currentQty + totalToAdd;

                            // MODIFICA: Resetta ENTRAMBI i flag di ordine
                            m.isOrdered = false;      // Rimuove da "Lista Spesa"
                            m.isOTCOrdered = false;   // Rimuove da "Farmaci da Banco"
                        }
                    });
                });

                this.saveData();
                this.closeModal('modal-receive');

                // Aggiorna entrambe le liste (se aperte) per riflettere il cambiamento
                if (!document.getElementById('modal-shopping-list').classList.contains('hidden')) {
                    this.openShoppingListModal();
                }
                if (!document.getElementById('modal-otc-list').classList.contains('hidden')) {
                    this.renderOTCList();
                }

                this.showAlert(
                    "Magazzino Aggiornato",
                    `Ho aggiunto ${totalToAdd} unità (${numBoxes} scatole) al magazzino.`
                );

                this.tempReceiveData = null;
            },

            // --- NUOVA FUNZIONE DI CONFERMA ANNULLAMENTO ---
            askConfirmRestore(medId) {
                // 1. Trova il nome del farmaco per un messaggio chiaro
                let medName = "questo farmaco";
                for (const p of this.data.profiles) {
                    const found = p.meds.find(m => m.id === medId);
                    if (found) {
                        medName = found.name;
                        break;
                    }
                }

                // 2. Imposta Testi del Modale 'modal-confirm'
                document.getElementById('confirm-title').textContent = "Annulla Ordine";
                document.getElementById('confirm-message').innerHTML = `Vuoi rimuovere <b>${medName}</b> dai farmaci in arrivo?<br>Tornerà nella lista "Da Ordinare".`;

                // 3. Configura il tasto "Conferma" (Sostituzione nodo per pulire eventi vecchi)
                const btnYes = document.getElementById('confirm-btn-yes');
                const newBtn = btnYes.cloneNode(true);
                btnYes.parentNode.replaceChild(newBtn, btnYes);

                // Assegna la nuova azione
                newBtn.onclick = () => {
                    this.restoreFromOrdered(medId); // Chiama la funzione originale
                    this.closeModal('modal-confirm');
                };

                // 4. Mostra il modale
                this.showModal('modal-confirm');
            },

            // --- NUOVA FUNZIONE PER ACQUISTO DA BANCO ---
            markAsOrderedDirectly(profileId) {
                const profile = this.data.profiles.find(p => p.id === profileId);
                if (!profile) return;

                // Trova i farmaci in lista "Da Ordinare"
                const medsToOrder = profile.meds.filter(m => m.minQty > 0 && m.boxQty <= m.minQty && !m.isOrdered);

                if (medsToOrder.length === 0) return;

                // Marcali tutti come ordinati
                medsToOrder.forEach(m => {
                    m.isOrdered = true;
                });

                this.saveData();

                // Aggiorna interfaccia con piccolo ritardo per effetto visivo
                setTimeout(() => {
                    this.openShoppingListModal();
                }, 200);

                // Feedback opzionale
                this.showAlert("Spostati", "I farmaci sono stati spostati nella lista 'In Arrivo'.");
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
                    console.log(`Nuovo giorno rilevato: ${today}. Reset in corso...`);

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
                // Usa il modale confirm esistente
                document.getElementById('confirm-title').textContent = "Tutto preso oggi?";
                document.getElementById('confirm-message').innerHTML = "Vuoi segnare come <b>presi</b> tutti i farmaci previsti per oggi?<br>L'operazione vale solo per la giornata odierna.";

                // Clona il bottone per pulire vecchi listener
                const btnYes = document.getElementById('confirm-btn-yes');
                const newBtn = btnYes.cloneNode(true);
                btnYes.parentNode.replaceChild(newBtn, btnYes);

                newBtn.onclick = () => {
                    this.confirmMarkAllTaken();
                    this.closeModal('modal-confirm');
                };

                this.showModal('modal-confirm');
            },

            confirmMarkAllTaken() {
                const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
                if (!profile) return;

                const today = new Date();
                const daysMap = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
                const currentDayName = daysMap[today.getDay()];
                let count = 0;

                profile.meds.forEach(med => {
                    // A. Controllo DATE (Inizio/Fine Terapia)
                    let isActiveDate = true;
                    if (med.startDate) {
                        const start = this.parseLocalDate(med.startDate); // Assicurati di avere questa f.ne
                        // Se c'è durata calcola fine, altrimenti assume sempre attivo
                        if (med.durationDays) {
                            const end = new Date(start);
                            end.setDate(start.getDate() + parseInt(med.durationDays));
                            // Reset orari per confronto puro
                            const checkToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                            if (checkToday < start || checkToday > end) isActiveDate = false;
                        } else {
                            // Solo data inizio, senza fine: controlla se oggi >= inizio
                            const checkToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                            if (checkToday < start) isActiveDate = false;
                        }
                    }

                    // B. Controllo GIORNI SETTIMANA
                    let isActiveDay = true;
                    if (med.days && Array.isArray(med.days) && med.days.length > 0) {
                        if (!med.days.includes(currentDayName)) isActiveDay = false;
                    }

                    // C. Se attivo e NON ancora preso -> Segna preso
                    if (isActiveDate && isActiveDay && !med.taken) {
                        med.taken = true;
                        count++;
                    }
                });

                this.saveData();
                this.renderMedications(); // Ricarica la lista per vedere le spunte verdi

                if (count > 0) {
                    this.showAlert("Fatto", `Segnati ${count} farmaci come presi!`);
                } else {
                    this.showAlert("Info", "Tutti i farmaci di oggi erano già segnati.");
                }
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
            },

            // --- GENERATORE CODICE FISCALE ---

            async generateFiscalCode(mode = 'add') {
                const prefix = mode === 'add' ? 'input-profile' : 'input-edit-profile';

                // 1. Recupera Dati
                const nameField = document.getElementById(`${prefix}-name`).value.trim().toUpperCase();
                const dob = document.getElementById(`${prefix}-dob`).value;
                const city = document.getElementById(`${prefix}-birthplace`).value.trim().toUpperCase();

                // Determina sesso dall'avatar selezionato (Man/Dog = M, Woman/Cat = F)
                // Se siamo in edit, dobbiamo recuperare l'avatar corrente dal profilo se non cambiato
                let gender = 'M';
                if (this.newProfileAvatar === 'woman' || this.newProfileAvatar === 'cat') gender = 'F';
                // (In edit mode potresti dover leggere this.currentProfileId, ma per ora usiamo la selezione attiva)

                if (!nameField || !dob || !city) {
                    this.showAlert("Dati mancanti", "Inserisci Nome, Data di Nascita e Comune per generare il codice.");
                    return;
                }

                this.toggleLoading(true, "Calcolo Codice Fiscale...");

                try {
                    // 2. Separa Nome e Cognome (Assumiamo l'ultimo spazio come separatore)
                    const parts = nameField.split(' ');
                    let surname = parts.length > 1 ? parts.pop() : parts[0];
                    let name = parts.length > 1 ? parts.join('') : parts[0]; // Fallback se solo una parola

                    // Helper Consonanti/Vocali
                    const getConsonants = (str) => str.replace(/[^BCDFGHJKLMNPQRSTVWXYZ]/g, '');
                    const getVowels = (str) => str.replace(/[^AEIOU]/g, '');
                    const normalize = (str) => (str + 'XXX').slice(0, 3);

                    // A. COGNOME (Prime 3 consonanti)
                    let codeSurname = getConsonants(surname);
                    if (codeSurname.length < 3) codeSurname += getVowels(surname);
                    codeSurname = normalize(codeSurname);

                    // B. NOME (1a, 3a, 4a cons se ce ne sono >=4, altrimenti prime 3)
                    let codeNameCons = getConsonants(name);
                    let codeName = "";
                    if (codeNameCons.length >= 4) {
                        codeName = codeNameCons[0] + codeNameCons[2] + codeNameCons[3];
                    } else {
                        codeName = codeNameCons + getVowels(name);
                    }
                    codeName = normalize(codeName);

                    // C. DATA E SESSO
                    const d = new Date(dob);
                    const year = String(d.getFullYear()).slice(-2);
                    const monthCodes = ['A', 'B', 'C', 'D', 'E', 'H', 'L', 'M', 'P', 'R', 'S', 'T'];
                    const month = monthCodes[d.getMonth()];
                    let day = d.getDate();
                    if (gender === 'F') day += 40;
                    const dayStr = String(day).padStart(2, '0');

                    // D. COMUNE (Fetch JSON Comuni)
                    const cityCode = await this.getCityCode(city);
                    if (!cityCode) throw new Error("Comune non trovato. Controlla l'ortografia.");

                    // E. CODICE PARZIALE (Primi 15 caratteri)
                    const partialCF = codeSurname + codeName + year + month + dayStr + cityCode;

                    // F. CARATTERE DI CONTROLLO (CIN)
                    const cin = this.calculateCIN(partialCF);

                    const finalCF = partialCF + cin;

                    // Risultato
                    document.getElementById(`${prefix}-cf`).value = finalCF;
                    this.showAlert("Fatto", "Codice Fiscale generato!");

                } catch (err) {
                    console.error(err);
                    this.showAlert("Errore", err.message || "Impossibile calcolare il codice.");
                } finally {
                    this.toggleLoading(false);
                }
            },

            async getCityCode(cityName) {
                try {
                    // Usa un repository pubblico leggero per i comuni
                    const response = await fetch('https://raw.githubusercontent.com/matteocontrini/comuni-json/master/comuni.json');
                    const comuni = await response.json();

                    const found = comuni.find(c => c.nome.toUpperCase() === cityName);
                    return found ? found.codiceCatastale : null;
                } catch (e) {
                    return null; // Fallback manuale
                }
            },

            calculateCIN(cf15) {
                const oddValues = {
                    '0': 1, '1': 0, '2': 5, '3': 7, '4': 9, '5': 13, '6': 15, '7': 17, '8': 19, '9': 21,
                    'A': 1, 'B': 0, 'C': 5, 'D': 7, 'E': 9, 'F': 13, 'G': 15, 'H': 17, 'I': 19, 'J': 21,
                    'K': 2, 'L': 4, 'M': 18, 'N': 20, 'O': 11, 'P': 3, 'Q': 6, 'R': 8, 'S': 12, 'T': 14,
                    'U': 16, 'V': 10, 'W': 22, 'X': 25, 'Y': 24, 'Z': 23
                };
                const evenValues = {
                    '0': 0, '1': 1, '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9,
                    'A': 0, 'B': 1, 'C': 2, 'D': 3, 'E': 4, 'F': 5, 'G': 6, 'H': 7, 'I': 8, 'J': 9,
                    'K': 10, 'L': 11, 'M': 12, 'N': 13, 'O': 14, 'P': 15, 'Q': 16, 'R': 17, 'S': 18, 'T': 19,
                    'U': 20, 'V': 21, 'W': 22, 'X': 23, 'Y': 24, 'Z': 25
                };

                let sum = 0;
                for (let i = 0; i < 15; i++) {
                    const char = cf15[i];
                    if ((i + 1) % 2 !== 0) { // Dispari (1°, 3°...)
                        sum += oddValues[char];
                    } else { // Pari (2°, 4°...)
                        sum += evenValues[char];
                    }
                }
                return String.fromCharCode((sum % 26) + 65);
            },

            adjustOTCQty(delta) {
                const input = document.getElementById('otc-qty-input');
                let val = parseInt(input.value) || 1;
                val += delta;
                if (val < 1) val = 1;
                input.value = val;
            },

            // --- FUNZIONI MODALITÀ FARMACIA E WHATSAPP ---

            getOTCListText() {
                let text = "💊 *LISTA FARMACI DA ACQUISTARE* 💊\n\n";
                let count = 0;
                let medsToBuy = [];

                // Usiamo un Set per tracciare gli ID univoci ed evitare duplicati
                let seenIds = new Set();

                // Cerca tutti i farmaci con isOTCOrdered = true
                this.data.profiles.forEach(p => {
                    p.meds.forEach(m => {
                        // MODIFICA QUI: Aggiungi solo se è ordinato E se non l'abbiamo già messo in lista
                        if (m.isOTCOrdered && !seenIds.has(m.sharedId)) {
                            medsToBuy.push(m);
                            seenIds.add(m.sharedId); // Segniamo questo farmaco come "preso"
                        }
                    });
                });

                if (medsToBuy.length === 0) return null;

                // Ordina alfabeticamente
                medsToBuy.sort((a, b) => a.name.localeCompare(b.name));

                // Genera il testo per WhatsApp
                medsToBuy.forEach(m => {
                    const qty = m.otcOrderQty || 1;
                    text += `- ${m.name}`;
                    if (qty > 1) text += ` (x${qty})`;
                    if (m.type) text += ` [${m.type}]`; // Mostra categoria
                    text += "\n";
                    count++;
                });

                text += "\nGrazie!";
                return { text, count, medsToBuy }; // Ritorna l'array pulito senza duplicati
            },

            shareOTCListWhatsApp() {
                let text = "💊 *LISTA FARMACI DA ACQUISTARE* 💊\n\n";
                let totalItems = 0;

                this.data.profiles.forEach(profile => {
                    // Filtro duplicati anche per WhatsApp
                    const uniqueMeds = [];
                    const seenIds = new Set();

                    profile.meds.forEach(m => {
                        if (m.isOTCOrdered && !seenIds.has(m.sharedId)) {
                            uniqueMeds.push(m);
                            seenIds.add(m.sharedId);
                        }
                    });

                    if (uniqueMeds.length > 0) {
                        text += `👤 *${profile.name}*\n`;
                        uniqueMeds.forEach(m => {
                            const qty = m.otcOrderQty || 1;
                            text += `- ${m.name}`;
                            if (qty > 1) text += ` (x${qty})`;
                            if (m.type) text += ` [${m.type}]`;
                            text += "\n";
                            totalItems++;
                        });
                        text += "\n";
                    }
                });

                if (totalItems === 0) {
                    this.showAlert("Lista Vuota", "Non hai selezionato nessun farmaco da acquistare.");
                    return;
                }

                text += "Grazie!";
                const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
                window.open(url, '_blank');
            },

            openPharmacyMode() {
                const data = this.getOTCListText();
                const container = document.getElementById('pharmacy-view-content');
                container.innerHTML = '';

                if (!data || data.count === 0) {
                    this.showAlert("Lista Vuota", "Aggiungi dei farmaci alla lista manuale prima di andare in farmacia.");
                    return;
                }

                // Genera la lista con grafica grande e leggibile
                data.medsToBuy.forEach(med => {
                    const qty = med.otcOrderQty || 1;

                    const div = document.createElement('div');
                    div.className = "bg-white p-5 rounded-2xl border-l-8 border-indigo-500 shadow-sm flex justify-between items-center";

                    // MODIFICA QUI: Sostituito category/dose con med.type (Categoria Terapeutica)
                    div.innerHTML = `
                                                    <div>
                                                        <h2 class="text-2xl font-bold text-slate-800 leading-tight mb-1">${med.name}</h2>
                                                        <p class="text-slate-500 font-medium text-sm uppercase tracking-wide">
                                                            ${med.type || 'Categoria non specificata'}
                                                        </p>
                                                    </div>
                                                    <div class="flex flex-col items-center justify-center bg-indigo-50 text-indigo-700 w-16 h-16 rounded-xl border border-indigo-100 shrink-0 ml-4">
                                                        <span class="text-xs font-bold uppercase opacity-70">Qta</span>
                                                        <span class="text-3xl font-black">${qty}</span>
                                                    </div>
                                                `;
                    container.appendChild(div);
                });

                this.showModal('modal-pharmacy-view');
            },

            updateShoppingBtnState() {
                const subtitleEl = document.getElementById('shopping-btn-subtitle');
                if (!subtitleEl) return;

                let hasItems = false;

                // Controlla se c'è almeno un farmaco da ordinare O in arrivo
                for (const p of this.data.profiles) {
                    for (const m of p.meds) {
                        // Caso 1: Da ordinare (Sotto scorta E non già ordinato)
                        if (m.minQty > 0 && m.boxQty <= m.minQty && !m.isOrdered) {
                            hasItems = true;
                            break;
                        }
                        // Caso 2: Già ordinato (In arrivo)
                        if (m.isOrdered) {
                            hasItems = true;
                            break;
                        }
                    }
                    if (hasItems) break;
                }

                // Imposta il testo in base al risultato
                if (hasItems) {
                    subtitleEl.textContent = "Farmaci in esaurimento o in arrivo";
                    subtitleEl.classList.remove('text-slate-400');
                    subtitleEl.classList.add('text-emerald-600/70'); // Colore verde (attivo)
                } else {
                    subtitleEl.textContent = "Non ci sono farmaci da acquistare o in arrivo";
                    subtitleEl.classList.remove('text-emerald-600/70');
                    subtitleEl.classList.add('text-slate-400'); // Colore grigio (spento)
                }
            },

            printReport() {
                const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
                if (!profile) return;

                // Calcola Statistiche aggiornate
                const stats = this.calculateStats(profile); // Usa la funzione creata nello step precedente

                // 1. Compila Intestazione
                document.getElementById('print-date').textContent = new Date().toLocaleDateString('it-IT');
                document.getElementById('print-patient-name').textContent = profile.name + " " + (profile.surname || "");
                document.getElementById('print-cf').textContent = profile.cf || "Non specificato";
                document.getElementById('print-age').textContent = profile.birthDate ? this.calculateAge(profile.birthDate) + " anni" : "-";

                // Medico
                let docText = "Non assegnato";
                if (profile.doctor && profile.doctor.name) {
                    docText = profile.doctor.name;
                    if (profile.doctor.phoneMobile) docText += ` (${profile.doctor.phoneMobile})`;
                }
                document.getElementById('print-doctor').textContent = docText;

                // Aderenza Globale
                const adhEl = document.getElementById('print-adherence');
                adhEl.textContent = (stats ? stats.adherencePct : 0) + '%';

                // Icona Avatar
                const iconMap = { 'man': 'fa-user', 'woman': 'fa-user-nurse', 'dog': 'fa-dog', 'cat': 'fa-cat' };
                const avatarClass = iconMap[profile.avatar] || 'fa-user';
                document.getElementById('print-avatar-icon').className = `fa-solid ${avatarClass}`;

                // 2. Compila Tabella Farmaci
                const tbody = document.getElementById('print-meds-list');
                tbody.innerHTML = '';

                // Ordina: prima i farmaci attivi, poi al bisogno
                const sortedMeds = [...profile.meds].sort((a, b) => (a.usage === 'Al Bisogno' ? 1 : -1));

                sortedMeds.forEach(med => {
                    // Calcolo aderenza specifica per farmaco (semplificata)
                    let medAdherence = 0;
                    let takenCount = 0;
                    let schedCount = 0;
                    const today = new Date();
                    // Calcola ultimi 30gg per questo farmaco
                    for (let i = 0; i < 30; i++) {
                        const d = new Date(); d.setDate(today.getDate() - i);
                        const iso = d.toISOString().slice(0, 10);
                        if (this.isMedicationDay(med, iso)) {
                            schedCount++;
                            if (med.history && med.history[iso]) takenCount++;
                        }
                    }
                    if (schedCount > 0) medAdherence = Math.round((takenCount / schedCount) * 100);

                    // Colore barra
                    let barColor = 'bg-red-500';
                    if (medAdherence >= 80) barColor = 'bg-emerald-500';
                    else if (medAdherence >= 50) barColor = 'bg-orange-400';

                    // Formattazione riga
                    const tr = document.createElement('tr');
                    tr.className = "border-b border-slate-100";
                    tr.innerHTML = `
                                                        <td class="py-3 pr-2 align-top">
                                                            <div class="font-bold text-slate-800">${med.name}</div>
                                                            <div class="text-xs text-slate-500">${med.category || ''}</div>
                                                        </td>
                                                        <td class="py-3 pr-2 align-top">
                                                            <div class="font-semibold text-slate-700">${med.dose || '-'}</div>
                                                            <div class="text-xs text-slate-500 italic">${med.form || ''}</div>
                                                        </td>
                                                        <td class="py-3 pr-2 align-top">
                                                            <div class="text-xs font-bold bg-slate-100 inline-block px-2 py-1 rounded text-slate-600">
                                                                ${med.usage === 'Al Bisogno' ? 'Al Bisogno' : (med.specificTime || med.usage)}
                                                            </div>
                                                            <div class="text-[10px] text-slate-400 mt-1">
                                                                ${med.frequency === 'everyday' ? 'Tutti i giorni' : 'Giorni specifici'}
                                                            </div>
                                                        </td>
                                                        <td class="py-3 align-middle text-right w-32">
                                                            ${med.usage === 'Al Bisogno'
                            ? `<span class="text-xs text-slate-400">N.A. (Al bisogno)</span>`
                            : `
                                                                <div class="flex items-center justify-end gap-2">
                                                                    <span class="text-xs font-bold text-slate-600">${medAdherence}%</span>
                                                                    <div class="w-16 h-2 bg-slate-200 rounded-full overflow-hidden">
                                                                        <div class="${barColor} h-full" style="width: ${medAdherence}%"></div>
                                                                    </div>
                                                                </div>
                                                                <div class="text-[10px] text-slate-400 mt-0.5">${takenCount}/${schedCount} assunzioni</div>
                                                                `
                        }
                                                        </td>
                                                    `;
                    tbody.appendChild(tr);
                });

                // 3. Lancia Stampa
                window.print();
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
                                                                    <i class="fa-solid fa-user"></i> ${item.profileName}
                                                                </span>
                                                                <h4 class="font-bold text-slate-800 text-sm">${m.name}</h4>
                                                                <p class="text-xs text-slate-500 mt-1 line-clamp-2 italic">
                                                                    "${m.usage || m.type || 'Nessuna descrizione'}"
                                                                </p>
                                                            </div>
                                                            <i class="fa-solid fa-chevron-right text-slate-300 group-hover:text-teal-500 text-xs mt-4"></i>
                                                        </div>
                                                    `;
                    container.appendChild(div);
                });
            },

            // --- DIARIO SALUTE LOGIC ---

            openHealthDiary() {
                this.renderHealthLog();
                this.showModal('modal-health-diary');
            },

            renderHealthLog() {
                const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
                if (!profile) return;

                const container = document.getElementById('health-diary-list');
                container.innerHTML = '';

                if (!profile.healthLogs || profile.healthLogs.length === 0) {
                    container.innerHTML = `
                                <div class="flex flex-col items-center justify-center py-10 opacity-50">
                                    <div class="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-3 text-slate-400 text-2xl">
                                        <i class="fa-solid fa-notes-medical"></i>
                                    </div>
                                    <p class="text-sm font-bold text-slate-500">Nessuna misurazione</p>
                                    <p class="text-xs text-slate-400">Inizia a registrare i tuoi parametri.</p>
                                </div>
                            `;
                    return;
                }

                // Ordina dal più recente
                const sortedLogs = [...profile.healthLogs].sort((a, b) => new Date(b.date) - new Date(a.date));

                sortedLogs.forEach((log, index) => {
                    const dateObj = new Date(log.date);
                    const dateStr = dateObj.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
                    const timeStr = dateObj.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

                    let icon = '', colorClass = '', valDisplay = '';

                    switch (log.type) {
                        case 'pressure':
                            icon = 'fa-heart-pulse'; colorClass = 'text-rose-500 bg-rose-50 border-rose-100';
                            valDisplay = `<span class="text-lg font-black text-rose-600">${log.values.sys}/${log.values.dia}</span> <span class="text-xs text-slate-400">mmHg</span>`;
                            if (log.values.pulse) valDisplay += `<div class="text-xs text-slate-400 mt-1"><i class="fa-solid fa-heart-crack mr-1"></i>${log.values.pulse} bpm</div>`;
                            break;
                        case 'weight':
                            icon = 'fa-weight-scale'; colorClass = 'text-blue-500 bg-blue-50 border-blue-100';
                            valDisplay = `<span class="text-lg font-black text-blue-600">${log.values.weight}</span> <span class="text-xs text-slate-400">Kg</span>`;
                            break;
                        case 'glucose':
                            icon = 'fa-droplet'; colorClass = 'text-purple-500 bg-purple-50 border-purple-100';
                            valDisplay = `<span class="text-lg font-black text-purple-600">${log.values.glucose}</span> <span class="text-xs text-slate-400">mg/dL</span>`;
                            if (log.values.tag) valDisplay += `<span class="ml-2 text-[9px] uppercase px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded">${log.values.tag}</span>`;
                            break;
                        case 'temp':
                            icon = 'fa-temperature-half'; colorClass = 'text-orange-500 bg-orange-50 border-orange-100';
                            valDisplay = `<span class="text-lg font-black text-orange-600">${log.values.temp}°</span> <span class="text-xs text-slate-400">C</span>`;
                            break;
                        case 'spo2':
                            icon = 'fa-lungs'; colorClass = 'text-cyan-500 bg-cyan-50 border-cyan-100';
                            valDisplay = `<span class="text-lg font-black text-cyan-600">${log.values.spo2}%</span>`;
                            break;
                    }

                    const div = document.createElement('div');
                    div.className = "bg-white p-3 rounded-xl border border-slate-200 shadow-sm flex items-center justify-between relative overflow-hidden";
                    // Click per eliminare (con conferma)
                    div.onclick = () => this.deleteHealthEntry(log.id);

                    div.innerHTML = `
                                <div class="flex items-center gap-3">
                                    <div class="w-10 h-10 rounded-full flex items-center justify-center text-lg border ${colorClass}">
                                        <i class="fa-solid ${icon}"></i>
                                    </div>
                                    <div>
                                        <div class="leading-none mb-1">${valDisplay}</div>
                                        <div class="text-[10px] text-slate-400 font-bold uppercase tracking-wider">${dateStr} • ${timeStr}</div>
                                    </div>
                                </div>
                                <i class="fa-solid fa-trash-can text-slate-200 hover:text-red-400 transition-colors ml-2 p-2"></i>
                            `;
                    container.appendChild(div);
                });
            },

            currentHealthType: 'pressure',

            openAddHealthEntry() {
                this.setHealthType('pressure'); // Default
                // Reset campi
                document.querySelectorAll('#modal-add-health input').forEach(i => i.value = '');
                document.getElementById('health-glucose-tag').value = '';
                document.querySelectorAll('.glucose-tag').forEach(b => b.classList.remove('selected'));

                this.showModal('modal-add-health');
            },

            setHealthType(type) {
                this.currentHealthType = type;

                // Aggiorna UI bottoni
                document.querySelectorAll('.health-type-btn').forEach(btn => {
                    if (btn.dataset.type === type) btn.classList.add('selected');
                    else btn.classList.remove('selected');
                });

                // Mostra input corretti
                document.querySelectorAll('.health-input-group').forEach(grp => grp.classList.add('hidden'));
                document.getElementById(`input-group-${type}`).classList.remove('hidden');
            },

            setGlucoseTag(tag) {
                document.getElementById('health-glucose-tag').value = tag;
                // UI bottoni tag
                const btns = document.querySelectorAll('.glucose-tag'); // Assumendo che aggiungi questa classe ai bottoni glicemia
                btns.forEach(b => {
                    if (b.textContent.toLowerCase().includes(tag)) b.classList.add('selected');
                    else b.classList.remove('selected');
                });
            },

            saveHealthEntry() {
                const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
                if (!profile) return;
                if (!profile.healthLogs) profile.healthLogs = [];

                const type = this.currentHealthType;
                let values = {};
                let isValid = false;

                // Recupera valori in base al tipo
                if (type === 'pressure') {
                    const sys = document.getElementById('health-sys').value;
                    const dia = document.getElementById('health-dia').value;
                    const pulse = document.getElementById('health-pulse').value;
                    if (sys && dia) { values = { sys, dia, pulse }; isValid = true; }
                }
                else if (type === 'weight') {
                    const w = document.getElementById('health-weight').value;
                    if (w) { values = { weight: w }; isValid = true; }
                }
                else if (type === 'glucose') {
                    const g = document.getElementById('health-glucose').value;
                    const tag = document.getElementById('health-glucose-tag').value;
                    if (g) { values = { glucose: g, tag }; isValid = true; }
                }
                else if (type === 'temp') {
                    const t = document.getElementById('health-temp').value;
                    if (t) { values = { temp: t }; isValid = true; }
                }
                else if (type === 'spo2') {
                    const s = document.getElementById('health-spo2').value;
                    if (s) { values = { spo2: s }; isValid = true; }
                }

                if (!isValid) {
                    this.showAlert("Errore", "Inserisci i valori richiesti.");
                    return;
                }

                // Salva
                profile.healthLogs.push({
                    id: Date.now().toString(),
                    date: new Date().toISOString(),
                    type: type,
                    values: values
                });

                this.saveData();
                this.closeModal('modal-add-health');
                this.renderHealthLog(); // Aggiorna la lista
                this.showAlert("Salvato", "Misurazione registrata.");
            },

            deleteHealthEntry(id) {
                this.showConfirm("Elimina", "Vuoi cancellare questa misurazione?", () => {
                    const profile = this.data.profiles.find(p => p.id === this.currentProfileId);
                    if (profile) {
                        profile.healthLogs = profile.healthLogs.filter(x => x.id !== id);
                        this.saveData();
                        this.renderHealthLog();
                    }
                });
            },

            // --- LOGICA CALENDARIO RAGGRUPPATA ---

            exportToCalendar(method = 'PUBLISH') {
                let events = [];
                const now = new Date();
                const todayStr = now.toISOString().slice(0, 10);

                // Mappa Orari Standard
                const STANDARD_TIMES = {
                    'Mattina': '08:00',
                    'Pomeriggio': '14:00', // Spostato alle 14:00 per differenziarlo dal pranzo
                    'Sera': '20:00'
                };

                // Mappa Giorni della settimana per formato ICS
                const ICS_DAYS = {
                    'Dom': 'SU', 'Lun': 'MO', 'Mar': 'TU', 'Mer': 'WE',
                    'Gio': 'TH', 'Ven': 'FR', 'Sab': 'SA'
                };

                // Cicla per ogni profilo
                this.data.profiles.forEach(profile => {
                    profile.meds.forEach(med => {
                        // 1. Escludi farmaci "Al Bisogno" o già terminati
                        if (med.usage === 'Al Bisogno') return;
                        if (med.endDate && med.endDate < todayStr) return;

                        // 2. Calcola Data di Inizio Evento
                        // Se la terapia è iniziata nel passato, il calendario nativo 
                        // la gestirà senza suonare per i giorni vecchi
                        let startD = med.startDate ? new Date(med.startDate) : new Date();

                        // 3. Imposta l'orario (Specifico o Standard)
                        const timeStr = med.specificTime || STANDARD_TIMES[med.time] || '08:00';

                        // Creazione stringhe data-ora in formato ICS (es: 20231012T080000)
                        // Senza la "Z" finale: crea un orario "locale" (se viaggi, suona sempre alle 8 del mattino locali)
                        const startDateTime = startD.toISOString().slice(0, 10).replace(/-/g, '') + 'T' + timeStr.replace(':', '') + '00';

                        let endObj = new Date(startD.toISOString().slice(0, 10) + 'T' + timeStr);
                        endObj.setMinutes(endObj.getMinutes() + 15); // Durata evento: 15 min
                        const endDateTime = endObj.toISOString().slice(0, 19).replace(/-/g, '').replace(/:/g, '');

                        // 4. COSTRUZIONE REGOLA DI RIPETIZIONE (RRULE)
                        let rrule = '';
                        if (med.days && med.days.length > 0) {
                            // Giorni specifici (es. solo Lun e Mer)
                            const daysList = med.days.map(d => ICS_DAYS[d]).join(',');
                            rrule = `FREQ=WEEKLY;BYDAY=${daysList}`;
                        } else if (med.frequency === 'alternate') {
                            // Giorni alterni
                            rrule = `FREQ=DAILY;INTERVAL=2`;
                        } else {
                            // Tutti i giorni
                            rrule = `FREQ=DAILY`;
                        }

                        // Se c'è una data di fine, aggiungi la clausola UNTIL
                        if (med.endDate) {
                            // UNTIL richiede formato UTC assoluto (Z)
                            const untilD = new Date(med.endDate + 'T23:59:59Z');
                            const untilStr = untilD.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
                            rrule += `;UNTIL=${untilStr}`;
                        }

                        // ID univoco per il farmaco (Essenziale per poterlo cancellare in futuro)
                        const uid = `medpro-${profile.id}-${med.sharedId || med.id}@medicinepro.app`;

                        events.push({
                            uid: uid,
                            title: `💊 ${profile.name}: ${med.name}`,
                            description: `Dose: ${med.dose || 'Standard'}\\nNote: ${med.usage || ''}\\nGenerato da MedicinePro`,
                            start: startDateTime,
                            end: endDateTime,
                            rrule: rrule,
                            stamp: now.toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z'
                        });
                    });
                });

                if (events.length === 0) {
                    this.showAlert("Nessun Evento", "Non ci sono farmaci attivi e programmati da esportare.");
                    return;
                }

                this.generateICSFile(events, method);
            },

            async generateICSFile(events, method) {
                let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//MedicinePro//IT\nCALSCALE:GREGORIAN\n";

                // Gestione Eliminazione/Aggiunta
                icsContent += method === 'CANCEL' ? "METHOD:CANCEL\n" : "METHOD:PUBLISH\n";

                events.forEach(ev => {
                    icsContent += "BEGIN:VEVENT\n";
                    icsContent += `UID:${ev.uid}\n`;
                    icsContent += `DTSTAMP:${ev.stamp}\n`;
                    icsContent += `DTSTART:${ev.start}\n`;
                    icsContent += `DTEND:${ev.end}\n`;

                    // Inserisce la regola di ripetizione ottimizzata
                    if (ev.rrule) {
                        icsContent += `RRULE:${ev.rrule}\n`;
                    }

                    if (method === 'CANCEL') {
                        icsContent += `STATUS:CANCELLED\n`;
                        icsContent += `SUMMARY:CANCELLATO: ${ev.title}\n`;
                    } else {
                        icsContent += `SUMMARY:${ev.title}\n`;
                        icsContent += `DESCRIPTION:${ev.description}\n`;
                        icsContent += `STATUS:CONFIRMED\n`;

                        // DOPPIO ALLARME (Migliora l'aderenza)
                        // 1. Suona 10 minuti prima per prepararsi
                        icsContent += `BEGIN:VALARM\nTRIGGER:-PT10M\nACTION:DISPLAY\nDESCRIPTION:Tra poco: ${ev.title}\nEND:VALARM\n`;
                        // 2. Suona all'orario esatto
                        icsContent += `BEGIN:VALARM\nTRIGGER:PT0M\nACTION:DISPLAY\nDESCRIPTION:Assumi ora: ${ev.title}\nEND:VALARM\n`;
                    }

                    icsContent += "END:VEVENT\n";
                });

                icsContent += "END:VCALENDAR";

                const fileName = method === 'CANCEL' ? 'Rimuovi_Terapia.ics' : 'Terapia_MedPro.ics';
                const file = new File([icsContent], fileName, { type: 'text/calendar' });

                // TENTA LA CONDIVISIONE NATIVA (Android/iOS)
                if (navigator.canShare && navigator.canShare({ files: [file] })) {
                    try {
                        await navigator.share({
                            files: [file],
                            title: 'Terapia MedicinePro',
                            text: 'Aggiungi la terapia al calendario'
                        });
                        return;
                    } catch (error) {
                        console.log("Condivisione annullata, passo al download manuale.");
                    }
                }

                // FALLBACK: DOWNLOAD MANUALE + MODALE ISTRUZIONI
                const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
                const link = document.createElement('a');
                link.href = window.URL.createObjectURL(blob);
                link.setAttribute('download', fileName);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);

                this.showModal('modal-ics-instruction');
            },

            // Nuova funzione per gestire il caricamento della foto profilo
            async handleProfileImageUpload(event) {
                const file = event.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = async (e) => {
                    const rawBase64 = e.target.result;

                    // Usiamo la tua funzione di compressione (impostata a 400px per i profili)
                    const compressedImage = await this.resizeImage(rawBase64, 400, 0.7);

                    this.tempProfileImage = compressedImage;

                    // Aggiorna l'interfaccia
                    const imgEl = document.getElementById('profile-img-preview');
                    const iconEl = document.getElementById('profile-img-icon');

                    imgEl.src = compressedImage;
                    imgEl.classList.remove('hidden');
                    iconEl.classList.add('hidden');
                };
                reader.readAsDataURL(file);
            },

            async handleEditProfileImageUpload(event) {
                const file = event.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = async (e) => {
                    const rawBase64 = e.target.result;
                    // Comprimi l'immagine come fatto in precedenza
                    const compressedImage = await this.resizeImage(rawBase64, 400, 0.7);

                    this.tempEditProfileImage = compressedImage;

                    // Aggiorna l'interfaccia del modale di Modifica
                    document.getElementById('edit-profile-img-preview').src = compressedImage;
                    document.getElementById('edit-profile-img-preview').classList.remove('hidden');
                    document.getElementById('edit-profile-img-icon').classList.add('hidden');
                    document.getElementById('btn-remove-edit-image').classList.remove('hidden');
                };
                reader.readAsDataURL(file);
            },

            removeEditProfileImage() {
                this.tempEditProfileImage = null; // Svuota la variabile

                // Ripristina l'interfaccia all'icona della fotocamera
                document.getElementById('edit-profile-img-preview').src = '';
                document.getElementById('edit-profile-img-preview').classList.add('hidden');
                document.getElementById('edit-profile-img-icon').classList.remove('hidden');
                document.getElementById('input-edit-profile-image').value = ''; // Resetta l'input
                document.getElementById('btn-remove-edit-image').classList.add('hidden');
            },

        };
