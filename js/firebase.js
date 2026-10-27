// WORKZENITH FIREBASE CONFIGURATION — replace only with values from your Firebase web app.
// These web config values identify a Firebase project; Firestore Rules and trusted backend
// code enforce security. Never put service-account credentials or private keys here.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/13.1.0/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyAx8TstI9Ys-1-7flUetUgRsFY1oLtpfCog',
  authDomain: 'workzenith-8cc11.firebaseapp.com',
  projectId: 'workzenith-8cc11',
  storageBucket: 'workzenith-8cc11.firebasestorage.app',
  messagingSenderId: '103770721298',
  appId: '1:103770721298:web:48e3362a0b30bbcd56dccb',
  measurementId: 'G-2QSEZSDF8M'
};

export function isFirebaseConfigured(config = firebaseConfig) {
  return Boolean(config.apiKey && !config.apiKey.startsWith('PASTE_') && config.projectId && !config.projectId.startsWith('YOUR_') && config.appId && !config.appId.startsWith('YOUR_'));
}

export async function initializeWorkZenithFirebase(config = firebaseConfig) {
  if (!isFirebaseConfigured(config)) {
    throw new Error('Firebase is not configured. Add your Firebase web app settings in js/firebase.js, then reload.');
  }
  const app = initializeApp(config);
  let analytics = null;
  if (config.measurementId) {
    try {
      const analyticsSdk = await import('https://www.gstatic.com/firebasejs/13.1.0/firebase-analytics.js');
      if (await analyticsSdk.isSupported()) analytics = analyticsSdk.getAnalytics(app);
    } catch {
      // Analytics is optional and must never block Authentication or Firestore.
    }
  }
  return { app, auth: getAuth(app), db: getFirestore(app), analytics };
}
