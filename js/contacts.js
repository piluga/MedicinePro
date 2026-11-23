// MedicinePro - contacts.js
// Rubrica medica

Object.assign(app, {
    showContacts() {
        this.currentProfileId = null;
        document.getElementById('view-profiles').classList.add('hidden');
        document.getElementById('view-medications').classList.add('hidden');
        document.getElementById('view-settings').classList.add('hidden');
        document.getElementById('view-management').classList.add('hidden');

        const view = document.getElementById('view-contacts');
        view.classList.remove('hidden');
        document.getElementById('btn-back').classList.remove('hidden');

        this.renderContacts();
        window.scrollTo(0, 0);
    },
    // --- RUBRICA MEDICA (CONTATTI) ---

    openContactModal(id = null) {
        this.editingContactId = id;

        if (id) {
            const contact = this.data.contacts.find(c => c.id === id);
            if (contact) {
                document.getElementById('contact-modal-title').innerHTML = `<i class="fa-solid fa-address-card text-indigo-600"></i> Modifica Contatto`;
                document.getElementById('input-contact-type').value = contact.type || 'doctor';
                document.getElementById('input-contact-name').value = contact.name || '';
                document.getElementById('input-contact-spec').value = contact.spec || '';

                // Clona i campi dinamici per non modificare l'originale prima del salvataggio
                this.tempContactFields = JSON.parse(JSON.stringify(contact.fields || []));
            }
        } else {
            document.getElementById('contact-modal-title').innerHTML = `<i class="fa-solid fa-address-card text-indigo-600"></i> Nuovo Contatto`;
            document.getElementById('input-contact-type').value = 'doctor';
            document.getElementById('input-contact-name').value = '';
            document.getElementById('input-contact-spec').value = '';

            // Crea un campo di default (es. Telefono)
            this.tempContactFields = [
                { id: this.generateId(), type: 'phone', label: 'Cellulare', value: '' }
            ];
        }

        this.updateContactAvatarUI();
        this.renderContactFields();
        this.showModal('modal-contact');
    },
    updateContactAvatarUI() {
        const type = document.getElementById('input-contact-type').value;
        const iconContainer = document.getElementById('contact-avatar-icon');

        const styleMap = {
            'doctor': { icon: 'fa-user-doctor', cls: 'bg-blue-100 text-blue-600' },
            'pharmacy': { icon: 'fa-prescription-bottle-medical', cls: 'bg-emerald-100 text-emerald-600' },
            'hospital': { icon: 'fa-hospital', cls: 'bg-rose-100 text-rose-600' },
            'emergency': { icon: 'fa-truck-medical', cls: 'bg-red-100 text-red-600' }
        };

        const conf = styleMap[type] || styleMap['doctor'];
        iconContainer.className = `w-14 h-14 rounded-full flex items-center justify-center text-2xl shrink-0 shadow-sm border border-white ${conf.cls}`;
        iconContainer.innerHTML = `<i class="fa-solid ${conf.icon}"></i>`;
    },
    addContactField() {
        this.tempContactFields.push({
            id: this.generateId(),
            type: 'text',
            label: '',
            value: ''
        });
        this.renderContactFields();
    },
    removeContactField(id) {
        this.tempContactFields = this.tempContactFields.filter(f => f.id !== id);
        this.renderContactFields();
    },
    updateContactField(id, key, value) {
        const field = this.tempContactFields.find(f => f.id === id);
        if (field) {
            field[key] = value;
            // Se cambio il tipo, metto un placeholder coerente se la label è vuota
            if (key === 'type' && !field.label) {
                const map = { 'phone': 'Telefono', 'email': 'Email', 'link': 'Sito / Mappa', 'date': 'Data', 'text': 'Info' };
                field.label = map[value];
                this.renderContactFields(); // Forza re-render per mostrare la label nuova
            }
        }
    },
    renderContactFields() {
        const container = document.getElementById('contact-dynamic-fields-container');
        container.innerHTML = '';

        if (this.tempContactFields.length === 0) {
            container.innerHTML = `<p class="text-[10px] text-slate-400 text-center italic">Nessun campo personalizzato.</p>`;
            return;
        }

        this.tempContactFields.forEach(field => {
            const div = document.createElement('div');
            div.className = "flex gap-2 items-start bg-slate-50 p-2 rounded-xl border border-slate-200 relative";

            div.innerHTML = `

                        <div class="w-[30%]">

                            <select onchange="app.updateContactField('${field.id}', 'type', this.value)" class="w-full text-[10px] p-1.5 border border-slate-200 rounded-md bg-white font-bold text-slate-600 outline-none mb-1">

                                <option value="text" ${field.type === 'text' ? 'selected' : ''}>Testo</option>

                                <option value="phone" ${field.type === 'phone' ? 'selected' : ''}>Telefono</option>

                                <option value="email" ${field.type === 'email' ? 'selected' : ''}>Email</option>

                                <option value="link" ${field.type === 'link' ? 'selected' : ''}>Link / Maps</option>

                                <option value="date" ${field.type === 'date' ? 'selected' : ''}>Data</option>

                            </select>

                            <input type="text" oninput="app.updateContactField('${field.id}', 'label', this.value)" value="${app.escapeHTML(field.label)}" placeholder="Etichetta" class="w-full text-[10px] p-1.5 border border-slate-200 rounded-md bg-white outline-none">

                        </div>

                        <div class="w-[60%] flex-1 flex flex-col justify-end h-full">

                            ${field.type === 'date'
                    ? `<input type="date" oninput="app.updateContactField('${field.id}', 'value', this.value)" value="${app.escapeHTML(field.value)}" class="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white outline-none mt-auto">`
                    : `<input type="text" oninput="app.updateContactField('${field.id}', 'value', this.value)" value="${app.escapeHTML(field.value)}" placeholder="Valore..." class="w-full text-xs p-2 border border-slate-200 rounded-lg bg-white outline-none mt-auto">`
                }

                        </div>

                        <button onclick="app.removeContactField('${field.id}')" class="text-slate-400 hover:text-red-500 w-6 h-6 flex items-center justify-center shrink-0 mt-3 transition-colors">

                            <i class="fa-solid fa-trash-can text-xs"></i>

                        </button>

                    `;
            container.appendChild(div);
        });
    },
    saveContact() {
        const type = document.getElementById('input-contact-type').value;
        const name = document.getElementById('input-contact-name').value.trim();
        const spec = document.getElementById('input-contact-spec').value.trim();

        if (!name) {
            this.showAlert("Dati mancanti", "Il nome del contatto è obbligatorio.");
            return;
        }

        // Pulisce i campi dinamici vuoti
        const cleanedFields = this.tempContactFields.filter(f => String(f.label || '').trim() !== '' || String(f.value || '').trim() !== '');

        if (this.editingContactId) {
            // Aggiorna
            const index = this.data.contacts.findIndex(c => c.id === this.editingContactId);
            if (index > -1) {
                this.data.contacts[index] = {
                    ...this.data.contacts[index],
                    type, name, spec, fields: cleanedFields
                };
            }
        } else {
            // Crea Nuovo
            this.data.contacts.push({
                id: this.generateId(),
                type, name, spec, fields: cleanedFields
            });
        }

        this.saveData();
        this.renderContacts();
        this.closeModal('modal-contact');
        this.showAlert("Salvato", "Il contatto è stato aggiornato correttamente nella rubrica.");
    },
    deleteContact(id) {
        this.showConfirm("Elimina Contatto", "Sei sicuro di voler eliminare definitivamente questo contatto?", () => {
            this.data.contacts = this.data.contacts.filter(c => c.id !== id);
            this.saveData();
            this.renderContacts();
        });
    },
    renderContacts() {
        const container = document.getElementById('contacts-list');
        container.innerHTML = '';

        if (!this.data.contacts || this.data.contacts.length === 0) {
            container.innerHTML = `

                        <div class="text-center py-10 opacity-50">

                            <i class="fa-solid fa-address-book text-4xl mb-3 text-slate-300"></i>

                            <p class="text-sm font-bold text-slate-500">Rubrica vuota</p>

                            <p class="text-xs text-slate-400 mt-1">Aggiungi qui i tuoi riferimenti sanitari.</p>

                        </div>

                    `;
            return;
        }

        // Stili per categoria
        const styleMap = {
            'doctor': { icon: 'fa-user-doctor', badge: 'bg-blue-100 text-blue-700', bg: 'bg-blue-50/50' },
            'pharmacy': { icon: 'fa-prescription-bottle-medical', badge: 'bg-emerald-100 text-emerald-700', bg: 'bg-emerald-50/50' },
            'hospital': { icon: 'fa-hospital', badge: 'bg-rose-100 text-rose-700', bg: 'bg-rose-50/50' },
            'emergency': { icon: 'fa-truck-medical', badge: 'bg-red-100 text-red-700 border border-red-200', bg: 'bg-red-50/50' }
        };

        this.data.contacts.forEach(contact => {
            const conf = styleMap[contact.type] || styleMap['doctor'];
            container.appendChild(this.buildContactCard(contact, conf));
        });
    },

    // Scheda di un contatto: icona, nome, specializzazione, pulsanti e campi
    buildContactCard(contact, conf) {
        // Render dei campi dinamici come pulsanti cliccabili (se sono link/email/telefono)
        const fieldsHtml = this.buildContactFieldsHtml(contact.fields);

        const card = document.createElement('div');
        card.className = `bg-white p-4 rounded-2xl card-shadow border border-slate-100 relative ${conf.bg}`;

        card.innerHTML = `

                        <div class="absolute top-4 right-4 flex gap-2">

                            <button onclick="app.openContactModal('${contact.id}')" class="w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-blue-500 hover:shadow flex items-center justify-center transition-all">

                                <i class="fa-solid fa-pen text-xs"></i>

                            </button>

                            <button onclick="app.deleteContact('${contact.id}')" class="w-8 h-8 rounded-full bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:shadow flex items-center justify-center transition-all">

                                <i class="fa-solid fa-trash text-xs"></i>

                            </button>

                        </div>



                        <div class="flex items-center gap-3 pr-16">

                            <div class="w-12 h-12 rounded-full flex items-center justify-center text-xl shrink-0 ${conf.badge}">

                                <i class="fa-solid ${conf.icon}"></i>

                            </div>

                            <div>

                                <h4 class="font-bold text-slate-800 text-lg leading-tight">${app.escapeHTML(contact.name)}</h4>

                                ${contact.spec ? `<p class="text-xs text-slate-500 font-semibold uppercase tracking-wide mt-0.5">${app.escapeHTML(contact.spec)}</p>` : ''}

                            </div>

                        </div>



                        ${fieldsHtml}

                    `;
        return card;
    },

    // Griglia dei campi personalizzati (telefono, email, link, data, testo)
    buildContactFieldsHtml(fields) {
        if (!fields || fields.length === 0) return '';
        let fieldsHtml = `<div class="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-100">`;
        fields.forEach(f => fieldsHtml += this.buildContactFieldHtml(f));
        fieldsHtml += `</div>`;
        return fieldsHtml;
    },

    // Un campo: pulsante cliccabile per telefono/email/link, testo semplice per gli altri
    buildContactFieldHtml(f) {
        let displayValue = f.value;
        let btnClass = "flex items-center gap-2 p-2 rounded-lg bg-slate-50 hover:bg-slate-100 transition-colors border border-slate-200 text-xs text-slate-700";
        let icon = '<i class="fa-solid fa-circle-info text-slate-400"></i>';
        let action = '';
        let tag = 'div';

        if (f.type === 'phone') {
            icon = '<i class="fa-solid fa-phone text-green-500"></i>';
            action = `href="tel:${app.escapeHTML(f.value.replace(/\s+/g, ''))}"`;
            tag = 'a';
            btnClass += " font-bold shadow-sm";
        } else if (f.type === 'email') {
            icon = '<i class="fa-solid fa-envelope text-blue-500"></i>';
            action = `href="mailto:${app.escapeHTML(f.value)}"`;
            tag = 'a';
        } else if (f.type === 'link') {
            icon = '<i class="fa-solid fa-arrow-up-right-from-square text-indigo-500"></i>';
            action = `href="${app.escapeHTML(f.value.startsWith('http') ? f.value : 'https://' + f.value)}" target="_blank"`;
            tag = 'a';
        } else if (f.type === 'date') {
            icon = '<i class="fa-solid fa-calendar-day text-orange-500"></i>';
            // Data mostrata come gg/mm/aaaa SENZA modificare il dato salvato (che resta AAAA-MM-GG)
            displayValue = this.formatContactDate(f.value);
        }

        return `

                                <${tag} ${action} class="${btnClass}">

                                    <div class="w-6 flex justify-center">${icon}</div>

                                    <div class="flex-1 overflow-hidden">

                                        <span class="block text-[9px] text-slate-400 font-bold uppercase truncate">${app.escapeHTML(f.label)}</span>

                                        <span class="block truncate">${app.escapeHTML(displayValue)}</span>

                                    </div>

                                </${tag}>

                            `;
    },

    // "2026-12-01" -> "01/12/2026". Recupera anche date già rovinate dalle versioni precedenti
    // (es. "undefined/undefined/01/12/2026"), altrimenti mostra il testo così com'è.
    formatContactDate(value) {
        if (!value) return value;
        const iso = String(value).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
        const it = String(value).match(/(\d{2})\/(\d{2})\/(\d{4})$/);
        return it ? it[0] : value;
    }
});
