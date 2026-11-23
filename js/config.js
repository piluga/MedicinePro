// MedicinePro - config.js
// Configurazione Firebase e costanti globali

// --- CONFIGURAZIONE FIREBASE ---
const firebaseConfig = {
    apiKey: "AIzaSyCBLfJWPUuGq5hV37q69QRR_rDUt3fb2bg",
    authDomain: "medicinepro-cloud.firebaseapp.com",
    projectId: "medicinepro-cloud",
    storageBucket: "medicinepro-cloud.firebasestorage.app",
    messagingSenderId: "79559479409",
    appId: "1:79559479409:web:7ab1b2564e80165fd08bd0"
};

// Inizializza l'app Firebase e i servizi
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
// -------------------------------

// Librerie caricate solo quando servono (stesso URL precaricato in sw.js)
const TESSERACT_URL = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';
