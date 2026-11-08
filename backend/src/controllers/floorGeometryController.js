const mongoose = require('mongoose');
const FloorGeometryFeature = require('../models/FloorGeometryFeature');
const { validateFloorGeometryFeature } = require('../utils/floorGeometryFeature');
const ALLOWED_PDFS = new Set([
 'BJI_BUILDING PLAN 01 GF MAIN BLOCK_04022026.pdf',
 'BJI_BUILDING PLAN 0000_1ST FLOOR MAIN BLOCK_04022026.pdf',
 'BJI_MAIN_BLOCK_2ND_&_3RD_FLOOR_BUILDING_PLAN_00000_04022026.pdf',
 'BJI_BUILDING_PLAN_0002_4TH_&_5TH_FLOOR_MAIN_BLOCK_04022026.pdf',
 'BJI_BUILDING_PLAN_003_6TH_&_7TH_FLOOR_MAIN_BLOCK_04022026.pdf',
]);
async function getFloorGeometryFeatures(req, res) {
 try {
  const filter = {};
  if (req.query.floor !== undefined) filter.floor = Number(req.query.floor);
  if (req.query.pageNumber !== undefined) filter.pageNumber = Number(req.query.pageNumber);
  if (req.query.sourcePdf) filter.sourcePdf = String(req.query.sourcePdf);
  return res.json(await FloorGeometryFeature.find(filter).sort({ createdAt: 1 }).lean());
 } catch { return res.status(500).json({ message: 'Unable to load floor geometry survey features.' }); }
}
async function createFloorGeometryFeature(req, res) {
 try {
  const input = req.body || {}, validation = validateFloorGeometryFeature(input);
  if (!validation.valid) return res.status(400).json({ message: 'Invalid floor geometry feature.', errors: validation.errors });
  if (!ALLOWED_PDFS.has(input.sourcePdf)) return res.status(400).json({ message: 'Select a registered source PDF.' });
  const feature = await FloorGeometryFeature.create({
   floor: Number(input.floor), sourcePdf: input.sourcePdf, pageNumber: Number(input.pageNumber),
   featureType: input.featureType, label: String(input.label || '').trim(),
   coordinateSystem: 'pdf_normalized', points: input.points.map(p => ({ x: Number(p.x), y: Number(p.y) })),
   status: 'candidate', notes: String(input.notes || '').trim(), createdBy: req.user?._id,
  });
  return res.status(201).json({ message: 'Survey candidate saved. It is not metric-calibrated or field-verified.', feature });
 } catch (error) { return res.status(500).json({ message: error.message || 'Unable to save floor geometry feature.' }); }
}
async function deleteFloorGeometryFeature(req, res) {
 try {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ message: 'Invalid feature ID.' });
  const deleted = await FloorGeometryFeature.findByIdAndDelete(req.params.id);
  if (!deleted) return res.status(404).json({ message: 'Survey feature not found.' });
  return res.json({ message: 'Survey feature deleted.' });
 } catch { return res.status(500).json({ message: 'Unable to delete floor geometry feature.' }); }
}
module.exports = { getFloorGeometryFeatures, createFloorGeometryFeature, deleteFloorGeometryFeature };
