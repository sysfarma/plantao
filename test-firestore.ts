import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const firebaseConfig = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));

admin.initializeApp();

const db = getFirestore(firebaseConfig.firestoreDatabaseId);

async function test() {
  try {
    console.log('Fetching users...');
    const snapshot = await db.collection('users').limit(1).get();
    console.log('Success! Found', snapshot.size, 'users.');
  } catch (error) {
    console.error('Error fetching users:');
    console.error(error);
  }
}

test();
