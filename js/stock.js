// MedicinePro - stock.js
// Scorte, lista spesa, farmaci da banco, ordini e ricezione, modalità farmacia

Object.assign(app, {
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
            `Vuoi aggiungere <b>${app.escapeHTML(med.name)}</b> alla lista della spesa?`,
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
    // --- GESTIONE LISTA SPESA ---

    // Lista spesa: farmaci sotto la soglia da ordinare (per profilo) e farmaci già ordinati
    openShoppingListModal() {
        const container = document.getElementById('shopping-list-content');
        container.innerHTML = '';

        let hasAnyItem = false;

        // SEZIONE 1: DA ORDINARE (scorta sotto la soglia minima)
        this.data.profiles.forEach(profile => {
            const toOrder = this.uniqueBySharedId(profile.meds.filter(m => this.needsReorder(m)));
            if (toOrder.length === 0) return;
            hasAnyItem = true;
            container.appendChild(this.buildToOrderSection(profile, toOrder));
        });

        // SEZIONE 2: FARMACI ORDINATI (in arrivo)
        const anyOrdered = this.data.profiles.some(p => p.meds.some(m => m.isOrdered));
        if (anyOrdered) {
            hasAnyItem = true;
            container.appendChild(this.buildOrderedHeader());
            this.data.profiles.forEach(profile => {
                const ordered = this.uniqueBySharedId(profile.meds.filter(m => m.isOrdered));
                if (ordered.length > 0) container.appendChild(this.buildOrderedGroup(profile, ordered));
            });
        }

        if (!hasAnyItem) {
            container.innerHTML = `<div class="flex flex-col items-center justify-center py-12 text-center opacity-60"><div class="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-400 text-3xl"><i class="fa-solid fa-basket-shopping"></i></div><h3 class="text-lg font-bold text-slate-700">Tutto in ordine</h3><p class="text-sm text-slate-500 px-6">Non ci sono farmaci da acquistare o in arrivo.</p></div>`;
        }

        this.showModal('modal-shopping-list');
    },

    // Da ordinare: scorta sotto la soglia minima, non già ordinato e non sospeso
    needsReorder(m) {
        return m.minQty > 0 && m.boxQty <= m.minQty && !m.isOrdered && !this.isSuspended(m);
    },

    // Un farmaco preso in più fasce orarie compare più volte (stesso sharedId): tienine uno
    uniqueBySharedId(meds) {
        const seen = new Set();
        return meds.filter(m => {
            if (seen.has(m.sharedId)) return false;
            seen.add(m.sharedId);
            return true;
        });
    },

    // Blocco di un profilo nella sezione "da ordinare": medico, elenco farmaci, pulsanti
    buildToOrderSection(profile, uniqueMedsToOrder) {
        const section = document.createElement('div');
        section.className = "bg-white mb-2 border-b border-slate-200 shadow-sm";

        // Header
        let docInfo = '<span class="text-slate-400 italic text-[10px] ml-2">(Nessun medico)</span>';
        if (profile.doctor && profile.doctor.phoneWa) {
            docInfo = `<span class="text-blue-500 font-medium text-[10px] ml-2"><i class="fa-solid fa-user-doctor mr-1"></i>${app.escapeHTML(profile.doctor.name)}</span>`;
        }

        const { waButtonHtml, otcButtonHtml } = this.buildOrderButtons(profile, uniqueMedsToOrder);

        // Lista Farmaci
        let listHtml = '';
        uniqueMedsToOrder.forEach(med => {
            listHtml += `

                                                                            <div class="flex items-center gap-3 py-2 border-b border-slate-50 last:border-0">

                                                                                <i class="fa-solid fa-circle-exclamation text-orange-500 text-xs"></i>

                                                                                <div class="flex-1">

                                                                                    <p class="font-bold text-slate-700 text-sm">${app.escapeHTML(med.name)}</p>

                                                                                </div>

                                                                            </div>

                                                                        `;
        });

        section.innerHTML = `

                                                                    <div class="p-4">

                                                                        <div class="flex items-center justify-between mb-2">

                                                                            <h4 class="font-bold text-slate-800 flex items-center text-sm uppercase tracking-wider">

                                                                                <i class="fa-solid fa-user text-slate-400 mr-2"></i> ${app.escapeHTML(profile.name)}

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
        return section;
    },

    // Testo precompilato del messaggio WhatsApp per il medico
    buildOrderMessage(profile, meds) {
        // Se il nome contiene già il titolo ("Dott. Rossi", "Dott.ssa Bianchi", "Dr. Verdi") non lo ripete
        const docName = (profile.doctor.name || '').trim();
        const hasTitle = /^(dott|dottor|dottoressa|dr|dr\.ssa|prof)\b/i.test(docName);
        let defaultMsg = `👋 Buongiorno ${hasTitle ? docName : ('Dott. ' + docName).trim()},\n`;
        defaultMsg += `Sono ${profile.name}, avrei bisogno di ordinare i seguenti farmaci:\n\n`;
        meds.forEach(m => defaultMsg += `- ${m.name}\n`);
        defaultMsg += `\nGrazie mille.`;
        return defaultMsg;
    },

    // Pulsanti "Prepara Messaggio" WhatsApp (o "Numero mancante") e "Acquisto da banco"
    buildOrderButtons(profile, uniqueMedsToOrder) {
        let waButtonHtml = '';
        let otcButtonHtml = '';

        // 1. Logica Pulsante WhatsApp
        if (profile.doctor && profile.doctor.phoneWa) {
            const defaultMsg = this.buildOrderMessage(profile, uniqueMedsToOrder);
            waButtonHtml = `

                                                                        <div class="mt-3"> <button id="btn-prep-${profile.id}" onclick="app.toggleOrderEditor('${profile.id}')" class="w-full flex items-center justify-center gap-2 py-1.5 bg-green-500 text-white font-bold rounded-lg shadow hover:bg-green-600 active:scale-95 transition-all text-xs">

                                                                                <i class="fa-brands fa-whatsapp text-sm"></i> Prepara Messaggio

                                                                            </button>

                                                                            <div id="editor-${profile.id}" class="hidden bg-slate-50 p-3 rounded-xl border border-slate-200 fade-in mt-2">

                                                                                <textarea id="msg-area-${profile.id}" rows="6" class="w-full p-2 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-green-500 outline-none resize-none mb-2 font-mono text-slate-700 leading-snug">${app.escapeHTML(defaultMsg)}</textarea>

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
        return { waButtonHtml, otcButtonHtml };
    },

    // Titolo della sezione "Farmaci Ordinati (In arrivo)"
    buildOrderedHeader() {
        const headerDiv = document.createElement('div');
        headerDiv.className = "mt-6 px-4 pb-2";
        headerDiv.innerHTML = `<h4 class="font-bold text-slate-400 text-xs uppercase flex items-center gap-2"><i class="fa-solid fa-box-archive"></i> Farmaci Ordinati (In arrivo)</h4><p class="text-[9px] text-slate-400 mt-1">Clicca su 'Ricevi' quando ritiri i farmaci per aggiornare il magazzino.</p>`;
        return headerDiv;
    },

    // Blocco di un profilo nella sezione "ordinati": per ogni farmaco Annulla / Ricevi
    buildOrderedGroup(profile, uniqueOrdered) {
        const groupDiv = document.createElement('div');
        groupDiv.className = "bg-slate-50 border-y border-slate-200 mb-4";
        let listHtml = `<div class="px-4 py-2 bg-slate-100 border-b border-slate-200 flex items-center gap-2"><i class="fa-solid fa-user text-slate-400 text-xs"></i><span class="font-bold text-slate-600 text-xs uppercase">${app.escapeHTML(profile.name)}</span></div>`;

        uniqueOrdered.forEach(m => {
            listHtml += `

                                                                        <div class="flex items-center justify-between py-3 px-4 border-b border-slate-200/50 last:border-0 gap-2 bg-white">

                                                                            <div class="flex-1 min-w-0 mr-2">

                                                                                <div class="flex items-center gap-3">

                                                                                    <div class="w-8 h-8 rounded-full bg-green-100 text-green-600 flex items-center justify-center text-xs shrink-0"><i class="fa-solid fa-box-open"></i></div>

                                                                                    <div><p class="font-bold text-slate-700 text-sm truncate leading-tight">${app.escapeHTML(m.name)}</p><p class="text-[9px] text-slate-400 mt-0.5">In attesa di ritiro...</p></div>

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
        return groupDiv;
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
    // Farmaci da banco: in alto quelli ordinati (per profilo), sotto l'elenco per cercarne e aggiungerne
    renderOTCList() {
        const orderedContainer = document.getElementById('otc-ordered-list');
        const allContainer = document.getElementById('otc-all-list');
        const orderedSection = document.getElementById('otc-ordered-section');

        orderedContainer.innerHTML = '';
        allContainer.innerHTML = '';

        this.renderOTCOrderedSection(orderedContainer, orderedSection);
        this.renderOTCAllSection(allContainer);
    },

    // Sezione "da acquistare": farmaci da banco ordinati, raggruppati per profilo
    renderOTCOrderedSection(orderedContainer, orderedSection) {
        let hasOrderedGlobal = false;

        this.data.profiles.forEach(profile => {
            // Una sola scheda per farmaco anche se preso in più fasce (stesso sharedId)
            const uniqueOrderedMeds = this.uniqueBySharedId(profile.meds.filter(m => m.isOTCOrdered));
            if (uniqueOrderedMeds.length === 0) return;
            hasOrderedGlobal = true;

            orderedContainer.appendChild(this.buildOTCProfileHeader(profile));
            uniqueOrderedMeds.forEach(med => orderedContainer.appendChild(this.buildOTCOrderedItem(med)));
        });

        // Pulsanti "Prepara Messaggio" / "Al Banco" in fondo, e sezione visibile solo se serve
        if (hasOrderedGlobal) {
            orderedContainer.appendChild(this.buildOTCOrderButtons());
            orderedSection.classList.remove('hidden');
        } else {
            orderedSection.classList.add('hidden');
        }
    },

    // Intestazione con il nome del profilo
    buildOTCProfileHeader(profile) {
        const header = document.createElement('div');
        header.className = "px-2 py-1.5 bg-slate-100 rounded-lg mb-2 mt-3 flex items-center gap-2 border border-slate-200";
        header.innerHTML = `

                                                                        <i class="fa-solid fa-user text-slate-400 text-xs"></i>

                                                                        <span class="text-xs font-bold text-slate-600 uppercase tracking-wide">${app.escapeHTML(profile.name)}</span>

                                                                    `;
        return header;
    },

    // Scheda di un farmaco ordinato: quantità, categoria, pulsanti Annulla / Ricevi
    buildOTCOrderedItem(med) {
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

                                                                                        ${app.escapeHTML(displayName)}

                                                                                    </h4>

                                                                                    <p class="text-[10px] text-purple-600 font-bold uppercase flex items-center gap-2">

                                                                                        <span class="px-1.5 py-0.5 rounded-md bg-white border border-purple-200 text-purple-600 text-[10px] font-black shadow-sm">

                                                                                            x${qty}

                                                                                        </span>

                                                                                        ${app.escapeHTML(med.type || '')}

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
        return div;
    },

    // Pulsanti in fondo alla sezione ordinati
    buildOTCOrderButtons() {
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
        return btnContainer;
    },

    // Sezione "cerca e aggiungi": tutti i farmaci (senza doppioni) in ordine alfabetico
    renderOTCAllSection(allContainer) {
        const allUniqueMeds = this.uniqueBySharedId(this.data.profiles.flatMap(p => p.meds));
        allUniqueMeds.sort((a, b) => a.name.localeCompare(b.name));

        allUniqueMeds.forEach(med => allContainer.appendChild(this.buildOTCSearchItem(med)));

        if (allUniqueMeds.length === 0) {
            allContainer.innerHTML = `<p class="text-center text-slate-400 text-xs py-4">Nessun farmaco registrato.</p>`;
        }
    },

    // Riga cliccabile di un farmaco nell'elenco di ricerca
    buildOTCSearchItem(med) {
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

                                                                            <h4 class="font-bold text-slate-700 text-sm truncate">${app.escapeHTML(med.name)}</h4>

                                                                            <p class="text-[10px] text-slate-500 font-medium truncate">

                                                                                ${app.escapeHTML(med.type || 'Generico')}

                                                                            </p>

                                                                        </div>

                                                                    </div>

                                                                    <i class="fa-solid fa-chevron-right text-xs text-slate-300"></i>

                                                                `;
        return div;
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

        this.showConfirm("Rimuovi", `Rimuovere ${app.escapeHTML(medName)} dalla lista acquisti?`, () => {
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
                if (this.needsReorder(med)) {
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
        const phone = this.toWhatsAppNumber(profile.doctor.phoneWa);

        // 3. Invia (apre WhatsApp)
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(customText)}`;
        window.open(url, '_blank');

        // 4. Marca i farmaci come ordinati
        const medsToOrder = profile.meds.filter(m => this.needsReorder(m));
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

        // 2. Conferma standard (non clonare #confirm-btn-yes: romperebbe le conferme successive)
        this.showConfirm(
            "Annulla Ordine",
            `Vuoi rimuovere <b>${app.escapeHTML(medName)}</b> dai farmaci in arrivo?<br>Tornerà nella lista "Da Ordinare".`,
            () => this.restoreFromOrdered(medId)
        );
    },
    // --- NUOVA FUNZIONE PER ACQUISTO DA BANCO ---
    markAsOrderedDirectly(profileId) {
        const profile = this.data.profiles.find(p => p.id === profileId);
        if (!profile) return;

        // Trova i farmaci in lista "Da Ordinare"
        const medsToOrder = profile.meds.filter(m => this.needsReorder(m));

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

                                                                <h2 class="text-2xl font-bold text-slate-800 leading-tight mb-1">${app.escapeHTML(med.name)}</h2>

                                                                <p class="text-slate-500 font-medium text-sm uppercase tracking-wide">

                                                                    ${app.escapeHTML(med.type || 'Categoria non specificata')}

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
                if (this.needsReorder(m)) {
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
    }
});
