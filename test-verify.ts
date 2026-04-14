import admin from 'firebase-admin';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));

admin.initializeApp({
  projectId: firebaseConfig.projectId,
});

async function test() {
  try {
    // We don't have a token to test, but we can check if it throws an initialization error
    console.log('Firebase Admin initialized successfully.');
  } catch (error) {
    console.error('Error:', error);
  }
}

test();
