const { db } = require('../config/firebase');
const allowed = require('../config/collections');
function ensureCollection(name){ if(!allowed.includes(name)) throw new Error('Collection not allowed'); }
async function list(collection){ ensureCollection(collection); const snap=await db.collection(collection).orderBy('createdAt','desc').limit(500).get(); return snap.docs.map(d=>({id:d.id,...d.data()})); }
async function get(collection,id){ ensureCollection(collection); const doc=await db.collection(collection).doc(id).get(); return doc.exists?{id:doc.id,...doc.data()}:null; }
async function create(collection,data){ ensureCollection(collection); const ref=await db.collection(collection).add({...data,createdAt:new Date().toISOString()}); return ref.id; }
async function update(collection,id,data){ ensureCollection(collection); delete data.id; await db.collection(collection).doc(id).set({...data,updatedAt:new Date().toISOString()},{merge:true}); }
async function remove(collection,id){ ensureCollection(collection); await db.collection(collection).doc(id).delete(); }
module.exports={allowed,list,get,create,update,remove};
