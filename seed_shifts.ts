
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));

if (!admin.apps.length) {
  admin.initializeApp({
    projectId: config.projectId,
  });
}

const db = getFirestore(admin.apps[0], config.firestoreDatabaseId);

async function seedShifts() {
  const today = new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());

  console.log('Seeding shifts for date:', today);

  try {
    const pharmaciesSnap = await db.collection('pharmacies').get();
    if (pharmaciesSnap.empty) {
      console.log('No pharmacies found to seed shifts for. Run seed_pharmacies.ts first.');
      process.exit(1);
    }

    const batch = db.batch();
    let count = 0;

    pharmaciesSnap.docs.forEach((pharmacyDoc) => {
      const p = pharmacyDoc.data();
      if (p.city === 'Castelo') {
        const shiftRef = db.collection('shifts').doc();
        batch.set(shiftRef, {
          pharmacy_id: pharmacyDoc.id,
          date: today,
          start_time: '08:00',
          end_time: '22:00',
          is_24h: Math.random() > 0.7 ? 1 : 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
        count++;
      }
    });

    await batch.commit();
    console.log(`Successfully seeded ${count} shifts for ${today}`);
    process.exit(0);
  } catch (e) {
    console.error('Error seeding shifts:', e);
    process.exit(1);
  }
}

seedShifts();
