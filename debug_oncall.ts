
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function checkData() {
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

  console.log('Checking for shifts on date:', today);

  const shiftsQ = query(collection(db, 'shifts'), where('date', '==', today));
  const shiftsSnap = await getDocs(shiftsQ);
  console.log(`Found ${shiftsSnap.size} shifts for today`);
  shiftsSnap.docs.forEach(doc => {
    console.log(`Shift ID: ${doc.id}, Pharmacy ID: ${doc.data().pharmacy_id}`);
  });

  const casteloPharmacies = await getDocs(query(collection(db, 'pharmacies'), where('city', '==', 'Castelo')));
  const casteloIds = casteloPharmacies.docs.map(d => d.id);
  console.log(`Pharmacy IDs in Castelo: ${casteloIds.join(', ')}`);
}

checkData().catch(console.error);
