require('dotenv').config();
const { db } = require('../config/firebase');
const { hashPassword } = require('./password');

(async()=>{
  const email=process.env.ADMIN_EMAIL || 'admin@example.com';
  const snap=await db.collection('users').where('email','==',email).limit(1).get();
  if(!snap.empty){ console.log('Admin already exists:', email); process.exit(0); }
  const ref=await db.collection('users').add({
    role:'admin', name:process.env.ADMIN_NAME || 'System Admin', email,
    phone:process.env.ADMIN_PHONE || '', passwordHash:await hashPassword(process.env.ADMIN_PASSWORD || 'admin1234'),
    status:'approved', createdAt:new Date().toISOString(), approvedAt:new Date().toISOString()
  });
  console.log('Admin created:', ref.id, email);
  process.exit(0);
})().catch(e=>{ console.error(e); process.exit(1); });
