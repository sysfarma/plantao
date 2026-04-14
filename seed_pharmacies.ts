import { initializeApp } from 'firebase/app';
import { getFirestore, doc, setDoc, collection, addDoc, writeBatch } from 'firebase/firestore';
import fs from 'fs';

const config = JSON.parse(fs.readFileSync('firebase-applet-config.json', 'utf-8'));
const app = initializeApp(config);
const db = getFirestore(app, config.firestoreDatabaseId);

const pharmacies = [
    {
      "id": "f7250ea2-261b-4d52-9d30-bca4a8174141",
      "user_id": "9bfac410-0819-4c32-b82c-4e4914b41034",
      "name": "BIA DROGARIA",
      "phone": "3542-4632",
      "whatsapp": "(28)99904-8682",
      "email": "biadrogaria@farmacia.com",
      "website": "",
      "street": "Centro",
      "number": "S/N",
      "neighborhood": "Centro",
      "city": "Castelo",
      "state": "ES",
      "zip": "",
      "is_active": 1,
      "created_at": "2026-04-12T13:28:15.787Z"
    },
    {
      "id": "7fffb1c9-6a2f-41ed-abec-5c1280e4dfe2",
      "user_id": "fec90a49-0b29-400b-b59e-0f007fe9042d",
      "name": "FARMA EM VIDA",
      "phone": "3542-4656",
      "whatsapp": "(28)99969-6198",
      "email": "farmaemvida@farmacia.com",
      "website": "",
      "street": "Centro",
      "number": "S/N",
      "neighborhood": "Centro",
      "city": "Castelo",
      "state": "ES",
      "zip": "",
      "is_active": 1,
      "created_at": "2026-04-12T13:28:15.787Z"
    },
    {
      "id": "66c8cc2c-3034-41e0-9a2b-7707be1b66c3",
      "user_id": "8fb234b1-9776-4aa1-8108-78faad39184e",
      "name": "FARMACIA POPULAR",
      "phone": "3542-1328",
      "whatsapp": "(28)99933-4888",
      "email": "farmaciapopular@farmacia.com",
      "website": "",
      "street": "Centro",
      "number": "S/N",
      "neighborhood": "Centro",
      "city": "Castelo",
      "state": "ES",
      "zip": "",
      "is_active": 1,
      "created_at": "2026-04-12T13:28:15.787Z"
    },
    {
      "id": "7afa4749-b1df-48b0-bdb1-f3eb84296a15",
      "user_id": "5b0c6fc9-1941-4333-8f73-3fa61db2cfc1",
      "name": "BIA DROGARIA- FILIAL",
      "phone": "3310-3546",
      "whatsapp": "(28)99904-8682",
      "email": "biadrogariafilial@farmacia.com",
      "website": "",
      "street": "Centro",
      "number": "S/N",
      "neighborhood": "Centro",
      "city": "Castelo",
      "state": "ES",
      "zip": "",
      "is_active": 1,
      "created_at": "2026-04-12T13:28:15.787Z"
    },
    {
      "id": "645b0e2b-c5f4-428d-8dc4-bd7f65704b64",
      "user_id": "7490a38e-ea9f-4f22-a0f1-c66ed8e3aba4",
      "name": "DROGARIA MISFARMA",
      "phone": "99999-3112",
      "whatsapp": "(28)99985-8746",
      "email": "drogariamisfarma@farmacia.com",
      "website": "",
      "street": "Centro",
      "number": "S/N",
      "neighborhood": "Centro",
      "city": "Castelo",
      "state": "ES",
      "zip": "",
      "is_active": 1,
      "created_at": "2026-04-12T13:28:15.787Z"
    },
    {
      "id": "2b16ecac-0859-4035-a0d8-f2f3a0087e4d",
      "user_id": "1b92b47e-6f75-45df-a680-7025becea1ed",
      "name": "FARMÁCIA INDIANA",
      "phone": "",
      "whatsapp": "(27)99992-0554",
      "email": "farmciaindiana@farmacia.com",
      "website": "",
      "street": "Centro",
      "number": "S/N",
      "neighborhood": "Centro",
      "city": "Castelo",
      "state": "ES",
      "zip": "",
      "is_active": 1,
      "created_at": "2026-04-12T13:28:15.787Z"
    },
    {
      "id": "6adcdfd1-a825-4b17-b604-38cda56ecadb",
      "user_id": "cb4396e1-0711-407c-a850-3a988fdbb749",
      "name": "MATOS",
      "phone": "3542-1312",
      "whatsapp": "(28)99945-5640",
      "email": "matos@farmacia.com",
      "website": "",
      "street": "Centro",
      "number": "S/N",
      "neighborhood": "Centro",
      "city": "Castelo",
      "state": "ES",
      "zip": "",
      "is_active": 1,
      "created_at": "2026-04-12T13:28:15.787Z"
    },
    {
      "id": "35876d87-7582-4856-a4e2-3c52c98f6cef",
      "user_id": "22f87ee9-8633-4db7-a7e7-220dcdaa181d",
      "name": "FARMÁCIA VIVA BEM",
      "phone": "",
      "whatsapp": "(28)99933-4117",
      "email": "farmciavivabem@farmacia.com",
      "website": "",
      "street": "Centro",
      "number": "S/N",
      "neighborhood": "Centro",
      "city": "Castelo",
      "state": "ES",
      "zip": "",
      "is_active": 1,
      "created_at": "2026-04-12T13:28:15.787Z"
    },
    {
      "id": "9fc79686-6858-448d-9758-e2e2f1c2acc5",
      "user_id": "dc03e67d-dce5-4a35-84aa-fac08c72ac6d",
      "name": "DROGARIA ULTRA POPULAR",
      "phone": "",
      "whatsapp": "(28)99913-8205",
      "email": "drogariaultrapopular@farmacia.com",
      "website": "",
      "street": "Centro",
      "number": "S/N",
      "neighborhood": "Centro",
      "city": "Castelo",
      "state": "ES",
      "zip": "",
      "is_active": 1,
      "created_at": "2026-04-12T13:28:15.787Z"
    },
    {
      "id": "09ef5fe8-b434-40cd-9681-860e81f18917",
      "user_id": "c28a6a0c-dccb-4d95-a4ee-170b9830284d",
      "name": "HIPER CENTRAL",
      "phone": "3542-6268",
      "whatsapp": "(28)98808-1117",
      "email": "hipercentral@farmacia.com",
      "website": "",
      "street": "Centro",
      "number": "S/N",
      "neighborhood": "Centro",
      "city": "Castelo",
      "state": "ES",
      "zip": "",
      "is_active": 1,
      "created_at": "2026-04-12T13:28:15.787Z"
    },
    {
      "id": "17d59894-4fea-49d0-b132-5379a34dfa99",
      "user_id": "57523758-2e01-4a92-bb97-37b8ce4dd960",
      "name": "DROGARIA CASTELO",
      "phone": "3310-3040",
      "whatsapp": "(28)99957-5721",
      "email": "drogariacastelo@farmacia.com",
      "website": "",
      "street": "Centro",
      "number": "S/N",
      "neighborhood": "Centro",
      "city": "Castelo",
      "state": "ES",
      "zip": "",
      "is_active": 1,
      "created_at": "2026-04-12T13:28:15.787Z"
    },
    {
      "id": "0a604a8d-bf4e-497d-9314-de4c783cbdeb",
      "user_id": "9b312e24-36b2-4ec8-a15d-c02a6a6b281e",
      "name": "SAÚDE",
      "phone": "3542-3365",
      "whatsapp": "(28)99985-6894",
      "email": "sade@farmacia.com",
      "website": "",
      "street": "Centro",
      "number": "S/N",
      "neighborhood": "Centro",
      "city": "Castelo",
      "state": "ES",
      "zip": "",
      "is_active": 1,
      "created_at": "2026-04-12T13:28:15.787Z"
    },
    {
      "id": "52c312b8-5266-4372-8d5e-09cc6a8f1755",
      "user_id": "ec512102-8b4c-4783-ae09-365b73e36870",
      "name": "MINEIRA",
      "phone": "3542-1181",
      "whatsapp": "(28)99926-6126",
      "email": "mineira@farmacia.com",
      "website": "",
      "street": "Centro",
      "number": "S/N",
      "neighborhood": "Centro",
      "city": "Castelo",
      "state": "ES",
      "zip": "",
      "is_active": 1,
      "created_at": "2026-04-12T13:28:15.787Z"
    },
    {
      "id": "23f41b53-7da3-4cf1-8fd2-6ec226a0a5a9",
      "user_id": "97fedd8a-a936-459d-9fb5-2001f0acc4ef",
      "name": "DROGARIA ESPLANADA",
      "phone": "3310-6260",
      "whatsapp": "(28)99940-5152",
      "email": "drogariaesplanada@farmacia.com",
      "website": "",
      "street": "Centro",
      "number": "S/N",
      "neighborhood": "Centro",
      "city": "Castelo",
      "state": "ES",
      "zip": "",
      "is_active": 1,
      "created_at": "2026-04-12T13:28:15.787Z"
    },
    {
      "id": "cb4863c8-ec3c-4985-b35e-9473a4b86f90",
      "user_id": "61fe6985-63e7-49bf-9945-4cb132247a8c",
      "name": "AVENIDA (01)",
      "phone": "3542-1554",
      "whatsapp": "(28)99912-1554",
      "email": "avenida01@farmacia.com",
      "website": "",
      "street": "Centro",
      "number": "S/N",
      "neighborhood": "Centro",
      "city": "Castelo",
      "state": "ES",
      "zip": "",
      "is_active": 1,
      "created_at": "2026-04-12T13:28:15.787Z"
    },
    {
      "id": "1b6f94bc-20b0-4305-bb46-9c91c517d35d",
      "user_id": "1ea54c79-002b-4e92-a1d3-0f1715499f72",
      "name": "FARMANIA",
      "phone": "",
      "whatsapp": "(28)99999-2523",
      "email": "farmania@farmacia.com",
      "website": "",
      "street": "Centro",
      "number": "S/N",
      "neighborhood": "Centro",
      "city": "Castelo",
      "state": "ES",
      "zip": "",
      "is_active": 1,
      "created_at": "2026-04-12T13:28:15.787Z"
    },
    {
      "id": "3ac8859c-6fae-4b30-9dff-15631668fbc8",
      "user_id": "db5a7b4b-e2c8-4149-8b33-dc3a710de495",
      "name": "CENTRAL",
      "phone": "3542-4623",
      "whatsapp": "(28)99962-7328",
      "email": "central@farmacia.com",
      "website": "",
      "street": "Centro",
      "number": "S/N",
      "neighborhood": "Centro",
      "city": "Castelo",
      "state": "ES",
      "zip": "",
      "is_active": 1,
      "created_at": "2026-04-12T13:28:15.787Z"
    }
];

async function seed() {
  try {
    const batch = writeBatch(db);
    
    for (const p of pharmacies) {
      // 1. Create user document
      const userRef = doc(db, 'users', p.user_id);
      batch.set(userRef, {
        email: p.email,
        role: 'pharmacy',
        created_at: p.created_at
      });
      
      // 2. Create pharmacy document
      const pharmacyRef = doc(db, 'pharmacies', p.id);
      batch.set(pharmacyRef, {
        user_id: p.user_id,
        name: p.name,
        phone: p.phone,
        whatsapp: p.whatsapp,
        email: p.email,
        website: p.website,
        street: p.street,
        number: p.number,
        neighborhood: p.neighborhood,
        city: p.city,
        state: p.state,
        zip: p.zip,
        is_active: p.is_active,
        created_at: p.created_at
      });
      
      // 3. Create active subscription
      const subRef = doc(collection(db, 'subscriptions'));
      batch.set(subRef, {
        pharmacy_id: p.id,
        status: 'active',
        expires_at: '2027-04-12T13:28:15.787Z', // 1 year from now
        created_at: p.created_at
      });
    }
    
    await batch.commit();
    console.log('Successfully seeded ' + pharmacies.length + ' pharmacies');
    process.exit(0);
  } catch (e) {
    console.error('Error seeding:', e);
    process.exit(1);
  }
}

seed();
