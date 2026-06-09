const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { requireLogin, requireRole } = require('../middleware/auth');
const { importStudents } = require('../services/importService');
const router=express.Router();
const upload=multer({ dest:'uploads/' });
router.get('/students', requireLogin, requireRole('admin'), (req,res)=>res.render('pages/importStudents',{title:'Import Students',user:req.session.user,result:null}));
router.post('/students', requireLogin, requireRole('admin'), upload.single('file'), async (req,res)=>{
  const result = await importStudents(req.file.path);
  fs.unlinkSync(req.file.path);
  res.render('pages/importStudents',{title:'Import Students',user:req.session.user,result});
});
module.exports=router;
