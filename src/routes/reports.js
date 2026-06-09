const express = require('express');
const { requireLogin } = require('../middleware/auth');
const { exportCollection } = require('../services/reportService');
const allowed = require('../config/collections');
const router=express.Router();
router.get('/', requireLogin, (req,res)=>res.render('pages/reports',{title:'Reports',user:req.session.user,collections:allowed}));
router.get('/:collection.xlsx', requireLogin, async (req,res)=>{
  const buf=await exportCollection(req.params.collection);
  res.setHeader('Content-Type','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition',`attachment; filename=${req.params.collection}.xlsx`);
  res.send(Buffer.from(buf));
});
module.exports=router;
