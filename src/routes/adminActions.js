const express = require('express');
const { db } = require('../config/firebase');
const { requireLogin, requireRole } = require('../middleware/auth');
const { generatePassword, hashPassword } = require('../utils/password');
const { pushText } = require('../services/lineService');
const router=express.Router();
router.post('/users/:id/approve', requireLogin, requireRole('admin'), async (req,res)=>{
  const ref=db.collection('users').doc(req.params.id); const doc=await ref.get();
  if(!doc.exists) return res.redirect('/admin/users');
  const user=doc.data(); const prefix=user.role==='teacher'?'TCH':user.role==='staff'?'STF':'STU';
  const password=generatePassword(prefix);
  await ref.set({ status:'approved', passwordHash:await hashPassword(password), approvedAt:new Date().toISOString(), approvedBy:req.session.user.id, rawPasswordForFirstSend:password },{merge:true});
  if(user.lineUserId) await pushText(user.lineUserId, `บัญชีได้รับอนุมัติแล้ว\nรหัสผ่าน: ${password}\nเข้าสู่ระบบ: ${process.env.WEB_BASE_URL}`);
  req.flash('success',`อนุมัติแล้ว รหัสผ่าน: ${password}`);
  res.redirect('/admin/users');
});
module.exports=router;
