const express = require('express');
const { requireLogin } = require('../middleware/auth');
const svc = require('../services/firestoreService');

const router = express.Router();

router.use(requireLogin);

function requireCrudAccess(req, res, next) {
  const role = req.session.user.role;
  const collection = req.params.collection;

  if (role === 'admin') return next();

  if (role === 'staff' && ['rooms', 'room_usage_logs'].includes(collection)) {
    return next();
  }

  return res.redirect('/dashboard');
}

router.get('/', (req, res) => {
  const role = req.session.user.role;

  let collections = svc.allowed;

  if (role === 'staff') {
    collections = svc.allowed.filter(c =>
      ['rooms', 'room_usage_logs'].includes(c)
    );
  }

  if (!['admin', 'staff'].includes(role)) {
    return res.redirect('/dashboard');
  }

  res.render('pages/collections', {
    title: 'Collections',
    user: req.session.user,
    collections
  });
});

router.get('/:collection', requireCrudAccess, async (req, res) => {
  const rows = await svc.list(req.params.collection);

  res.render('pages/list', {
    title: req.params.collection,
    user: req.session.user,
    collection: req.params.collection,
    rows
  });
});

router.get('/:collection/new', requireCrudAccess, (req, res) => {
  res.render('pages/form', {
    title: 'New',
    user: req.session.user,
    collection: req.params.collection,
    row: {},
    json: '{}'
  });
});

router.post('/:collection', requireCrudAccess, async (req, res) => {
  await svc.create(
    req.params.collection,
    JSON.parse(req.body.json || '{}')
  );

  res.redirect(`/admin/${req.params.collection}`);
});

router.get('/:collection/:id/edit', requireCrudAccess, async (req, res) => {
  const row = await svc.get(req.params.collection, req.params.id);

  res.render('pages/form', {
    title: 'Edit',
    user: req.session.user,
    collection: req.params.collection,
    row,
    json: JSON.stringify(row, null, 2)
  });
});

router.put('/:collection/:id', requireCrudAccess, async (req, res) => {
  await svc.update(
    req.params.collection,
    req.params.id,
    JSON.parse(req.body.json || '{}')
  );

  res.redirect(`/admin/${req.params.collection}`);
});

router.delete('/:collection/:id', requireCrudAccess, async (req, res) => {
  await svc.remove(req.params.collection, req.params.id);

  res.redirect(`/admin/${req.params.collection}`);
});

module.exports = router;