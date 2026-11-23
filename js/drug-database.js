// MedicinePro - drug-database.js
// Archivio farmaci permanente (riutilizzo dati e foto dei farmaci)

Object.assign(app, {
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

                                                    <p class="font-bold text-slate-700">${app.escapeHTML(drug.name)}</p>

                                                    <p class="text-xs text-slate-500">${app.escapeHTML(drug.dose || '')} ${drug.type ? '• ' + app.escapeHTML(drug.type) : ''}</p>

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

                                    <h4 class="font-bold text-slate-700 text-sm truncate">${app.escapeHTML(drug.name)}</h4>

                                    <div class="flex items-center gap-2 mt-0.5">

                                         ${drug.type ? `<span class="text-[9px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded border border-indigo-100 uppercase font-bold tracking-wider">${app.escapeHTML(drug.type)}</span>` : ''}

                                         <span class="text-xs text-slate-500 truncate">${app.escapeHTML(drug.dose || 'Dose non spec.')}</span>

                                    </div>

                                    ${drug.category ? `<p class="text-[10px] text-slate-400 mt-0.5 italic">${app.escapeHTML(drug.category)}</p>` : ''}

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
    }
});
