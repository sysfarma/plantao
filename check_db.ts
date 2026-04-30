
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: config.projectId,
  });
}

const db = getFirestore(admin.apps[0], config.firestoreDatabaseId);

async function checkPharmacies() {
  const snapshot = await db.collection('pharmacies').get();
  console.log(`Total pharmacies: ${snapshot.size}`);
  
  const activeCount = snapshot.docs.filter(doc => doc.data().is_active === 1).length;
  console.log(`Active pharmacies (is_active === 1): ${activeCount}`);
  
  const activeNumberCount = snapshot.docs.filter(doc => typeof doc.data().is_active === 'number').length;
  console.log(`Pharmacies with is_active as number: ${activeNumberCount}`);

  const activeTrueCount = snapshot.docs.filter(doc => doc.data().is_active === true).length;
  console.log(`Pharmacies with is_active as true (boolean): ${activeTrueCount}`);

  if (snapshot.size > 0) {
    console.log('Sample pharmacy data:', JSON.stringify(snapshot.docs[0].data(), null, 2));
  }

  const shiftsSnapshot = await db.collection('shifts').get();
  console.log(`Total shifts: ${shiftsSnapshot.size}`);
  if (shiftsSnapshot.size > 0) {
    console.log('Sample shift data:', JSON.stringify(shiftsSnapshot.docs[0].data(), null, 2));
  }
}

checkPharmacies().catch(console.error);
