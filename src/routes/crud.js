const express = require('express');
const { requireLogin, requireRole } = require('../middleware/auth');
const svc = require('../services/firestoreService');
const router = express.Router();
router.use(requireLogin);
router.get('/', requireRole('admin'), (req,res)=>res.render('pages/collections',{title:'Collections',user:req.session.user,collections:svc.allowed}));
router.get('/:collection', requireRole('admin'), async (req,res)=>{
  const rows=await svc.list(req.params.collection);
  res.render('pages/list',{title:req.params.collection,user:req.session.user,collection:req.params.collection,rows});
});
router.get('/:collection/new', requireRole('admin'), (req,res)=>res.render('pages/form',{title:'New',user:req.session.user,collection:req.params.collection,row:{},json:'{}'}));
router.post('/:collection', requireRole('admin'), async (req,res)=>{ await svc.create(req.params.collection, JSON.parse(req.body.json || '{}')); res.redirect(`/admin/${req.params.collection}`); });
router.get('/:collection/:id/edit', requireRole('admin'), async (req,res)=>{ const row=await svc.get(req.params.collection,req.params.id); res.render('pages/form',{title:'Edit',user:req.session.user,collection:req.params.collection,row,json:JSON.stringify(row,null,2)}); });
router.put('/:collection/:id', requireRole('admin'), async (req,res)=>{ await svc.update(req.params.collection,req.params.id,JSON.parse(req.body.json || '{}')); res.redirect(`/admin/${req.params.collection}`); });
router.delete('/:collection/:id', requireRole('admin'), async (req,res)=>{ await svc.remove(req.params.collection,req.params.id); res.redirect(`/admin/${req.params.collection}`); });
module.exports=router;
