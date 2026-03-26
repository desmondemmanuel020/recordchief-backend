const router   = require('express').Router();
const UserData = require('../models/Data');
const { protect } = require('../middleware/auth');

router.use(protect);

// GET /api/data — pull all user data (staff gets owner's data)
router.get('/', async (req, res, next) => {
  try {
    // If staff, fetch owner's data instead
    const targetId = req.user.businessId || req.user._id;
    const data = await UserData.findOne({ userId: targetId });
    res.json({ data: data || null, syncedAt: data?.syncedAt || null, role: req.user.role, businessId: req.user.businessId });
  } catch (err) { next(err); }
});

// PUT /api/data — full sync (staff writes to owner's data)
router.put('/', async (req, res, next) => {
  try {
    const { inventory, shopSales, farmExpenses, salesFields, salesEntries, debtRecords, settings } = req.body;
    const targetId = req.user.businessId || req.user._id;
    const data = await UserData.findOneAndUpdate(
      { userId: targetId },
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

    const targetId = req.user.businessId || req.user._id;
    const data = await UserData.findOneAndUpdate(
      { userId: targetId },
      { $set: { [section]: req.body[section], syncedAt: new Date() } },
      { upsert: true, new: true }
    );
    res.json({ [section]: data[section], syncedAt: data.syncedAt });
  } catch (err) { next(err); }
});

module.exports = router;
