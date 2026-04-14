import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, updateDoc, doc } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

async function backfill() {
  try {
    const pharmaciesSnapshot = await getDocs(collection(db, 'pharmacies'));
    const pharmacyUserMap: Record<string, string> = {};
    pharmaciesSnapshot.forEach(d => {
      pharmacyUserMap[d.id] = d.data().user_id;
    });

    const collectionsToUpdate = ['subscriptions', 'payments', 'clicks', 'shifts'];
    
    for (const coll of collectionsToUpdate) {
      const snap = await getDocs(collection(db, coll));
      let count = 0;
      for (const d of snap.docs) {
        const data = d.data();
        if (data.pharmacy_id && pharmacyUserMap[data.pharmacy_id]) {
          await updateDoc(doc(db, coll, d.id), {
            user_id: pharmacyUserMap[data.pharmacy_id]
          });
          count++;
        }
      }
      console.log(`Updated ${count} documents in ${coll}`);
    }
    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
backfill();
