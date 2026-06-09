const express = require('express');
const { db } = require('../config/firebase');
const { requireLogin } = require('../middleware/auth');
const router = express.Router();
async function count(col){ const s=await db.collection(col).count().get(); return s.data().count; }
router.get('/', requireLogin, async (req,res)=>{
  const role=req.session.user.role;
  const stats = {
    users: await count('users'), students: await count('students'), teachers: await count('teachers'),
    courses: await count('courses'), attendance: await count('attendance'), submissions: await count('submissions'), bookings: await count('bookings')
  };
  res.render('pages/dashboard',{title:'Dashboard',user:req.session.user,stats,role});
});
module.exports=router;
