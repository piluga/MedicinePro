const CACHE_NAME = 'medicinepro-cache-v9';

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

// FASE DI ATTIVAZIONE (CANCELLA LA VECCHIA CACHE)
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    // Se il nome della cache è diverso da v6, cancellala!
                    if (cacheName !== CACHE_NAME) {
                        console.log('[Service Worker] Elimino vecchia cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => {
            // PRENDE IL CONTROLLO DELLA PAGINA E FA SCATTARE IL MODALE IN APP.JS
            return self.clients.claim(); 
        })
    );
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


