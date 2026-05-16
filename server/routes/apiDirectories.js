const express = require('express');
const dirs = require('../models/directories');

const router = express.Router();

router.get('/', async (_req, res, next) => {
  try {
    const list = await dirs.listDirectories();
    res.json({
      ok: true,
      directories: list.map((d) => ({ id: d.id, areaKey: d.area_key })),
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
