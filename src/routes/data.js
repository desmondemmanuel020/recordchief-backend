const router   = require('express').Router();
const UserData = require('../models/Data');
const { protect } = require('../middleware/auth');

router.use(protect);

// GET /api/data — pull all user data
router.get('/', async (req, res, next) => {
  try {
    const data = await UserData.findOne({ userId: req.user._id });
    res.json({ data: data || null, syncedAt: data?.syncedAt || null });
  } catch (err) { next(err); }
});

// PUT /api/data — full sync (client sends all localStorage data)
router.put('/', async (req, res, next) => {
  try {
    const { inventory, shopSales, farmExpenses, salesFields, salesEntries, debtRecords, settings } = req.body;
    const data = await UserData.findOneAndUpdate(
      { userId: req.user._id },
      {
        $set: {
          ...(inventory    !== undefined && { inventory }),
          ...(shopSales    !== undefined && { shopSales }),
          ...(farmExpenses !== undefined && { farmExpenses }),
          ...(salesFields  !== undefined && { salesFields }),
          ...(salesEntries !== undefined && { salesEntries }),
          ...(debtRecords  !== undefined && { debtRecords }),
          ...(settings     !== undefined && { settings }),
          syncedAt: new Date(),
        }
      },
      { upsert: true, new: true }
    );
    res.json({ data, syncedAt: data.syncedAt });
  } catch (err) { next(err); }
});

// PATCH /api/data/:section — partial update (one section at a time)
router.patch('/:section', async (req, res, next) => {
  try {
    const allowed = ['inventory','shopSales','farmExpenses','salesFields','salesEntries','debtRecords','settings'];
    const section = req.params.section;
    if (!allowed.includes(section)) return res.status(400).json({ error: 'Invalid section.' });

    const data = await UserData.findOneAndUpdate(
      { userId: req.user._id },
      { $set: { [section]: req.body[section], syncedAt: new Date() } },
      { upsert: true, new: true }
    );
    res.json({ [section]: data[section], syncedAt: data.syncedAt });
  } catch (err) { next(err); }
});

module.exports = router;
