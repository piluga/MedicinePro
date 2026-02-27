const CACHE_NAME = 'medicinepro-cache-v21';

// 1. Risorse Locali
const localUrls = [
    './index.html',
    './manifest.json',
    './style.css',
    './app.js'
];

// 2. Risorse Esterne (CDN) che richiedono la modalità 'no-cors' per evitare blocchi
const externalUrls = [
    'https://cdn.tailwindcss.com', // Rimosso lo slash finale per coincidere con l'HTML
    'https://cdn.jsdelivr.net/npm/idb-keyval@6/dist/umd.js',
    'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;700&display=swap',
    'https://i.ibb.co/N6db36Sf/medicine.png'
];

// FASE DI INSTALLAZIONE
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => {
            console.log('[Service Worker] Salvataggio cache in corso...');
            
            // Salva il file locale in modo rigoroso
            cache.addAll(localUrls);

            // Salva i file esterni "forzando" il download senza controlli CORS
            return Promise.all(
                externalUrls.map(url => {
                    return fetch(new Request(url, { mode: 'no-cors' }))
                        .then(response => cache.put(url, response))
                        .catch(err => console.log('[Service Worker] Errore salvataggio CDN:', url, err));
                })
            );
        })
    );
    self.skipWaiting();
});

// FASE DI ATTIVAZIONE (Pulizia vecchie cache)
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Rimuovo vecchia cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// FASE DI FETCH (Intercetta il traffico)
self.addEventListener('fetch', event => {
    // IGNORA Firebase, Google Auth e Gemini
    if (event.request.url.includes('googleapis.com')) return;
    if (event.request.url.includes('firebase')) return;

    // Ignora estensioni di Chrome o protocolli strani (file://)
    if (!event.request.url.startsWith('http')) return;

    // 1. IGNORA le chiamate all'Intelligenza Artificiale (Google Gemini)
    if (event.request.url.includes('generativelanguage.googleapis.com')) return;

    // 2. NUOVO: IGNORA le estensioni di Chrome e protocolli non web
    // Se l'URL non inizia con "http" o "https", ignoralo completamente
    if (!event.request.url.startsWith('http')) return;

    event.respondWith(
        caches.match(event.request).then(response => {
            // Se c'è in cache (anche in no-cors), restituiscilo
            if (response) return response;
            
            // Altrimenti scarica dalla rete
            return fetch(event.request).then(networkResponse => {
                // Accettiamo status 200 (File normali) e status 0 (File esterni senza CORS)
                if (!networkResponse || (networkResponse.status !== 200 && networkResponse.status !== 0)) {
                    return networkResponse;
                }

                // Salva una copia in cache per la prossima volta (solo per richieste sicure HTTP/HTTPS)
                if (event.request.url.startsWith('http')) {
                    let responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }

                return networkResponse;
            }).catch(() => {
                console.log('[Service Worker] Sei offline e la risorsa non è in cache:', event.request.url);
            });
        })
    );
});











