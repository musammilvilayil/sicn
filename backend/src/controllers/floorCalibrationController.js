const FloorCalibration = require('../models/FloorCalibration');
const { solveAffineCalibration } = require('../utils/floorCalibration');

const ALLOWED_PDFS = new Set([
  'BJI_BUILDING PLAN 01 GF MAIN BLOCK_04022026.pdf',
  'BJI BUILDING PLAN 0000_1ST FLOOR MAIN BLOCK_04022026.pdf',
  'BJI_MAIN_BLOCK_2ND_&_3RD_FLOOR_BUILDING_PLAN_00000_04022026.pdf',
  'BJI_BUILDING_PLAN_0002_4TH_&_5TH_FLOOR_MAIN_BLOCK_04022026.pdf',
  'BJI_BUILDING_PLAN_003_6TH_&_7TH_FLOOR_MAIN_BLOCK_04022026.pdf',
]);

async function getFloorCalibrations(req, res) {
  try {
    const calibrations = await FloorCalibration.find({}).sort({ floor: 1 }).lean();
    return res.json(calibrations);
  } catch (error) {
    return res.status(500).json({ message: 'Unable to load floor calibrations.' });
  }
}

async function saveFloorCalibration(req, res) {
  try {
    const floor = Number(req.params.floor);
    const { sourcePdf, pageNumber, pageWidth, pageHeight, controlPoints } = req.body || {};
    if (!Number.isInteger(floor) || floor < 0 || floor > 7) {
      return res.status(400).json({ message: 'Floor must be an integer from 0 through 7.' });
    }
    if (!ALLOWED_PDFS.has(sourcePdf)) {
      return res.status(400).json({ message: 'Select one of the registered architectural source PDFs.' });
    }
    if (!Number.isInteger(Number(pageNumber)) || Number(pageNumber) < 1 ||
        !Number.isFinite(Number(pageWidth)) || Number(pageWidth) <= 0 ||
        !Number.isFinite(Number(pageHeight)) || Number(pageHeight) <= 0) {
      return res.status(400).json({ message: 'A valid PDF page number and page dimensions are required.' });
    }
    if (!Array.isArray(controlPoints) || controlPoints.length < 3 || controlPoints.length > 30) {
      return res.status(400).json({ message: 'Provide between 3 and 30 control points.' });
    }
    const normalized = controlPoints.map((point) => ({
      nodeId: String(point.nodeId || '').trim().toUpperCase(),
      mapX: Number(point.mapX),
      mapY: Number(point.mapY),
      pdfX: Number(point.pdfX),
      pdfY: Number(point.pdfY),
    }));
    if (normalized.some((point) => !point.nodeId)) {
      return res.status(400).json({ message: 'Every control point must reference an existing map node.' });
    }
    const Node = require('../models/Node');
    const nodeIds = [...new Set(normalized.map((point) => point.nodeId))];
    const nodes = await Node.find({ nodeId: { $in: nodeIds }, floor }).select('nodeId').lean();
    if (nodes.length !== nodeIds.length) {
      return res.status(400).json({ message: 'All control-point nodes must exist on the selected floor.' });
    }
    const transform = solveAffineCalibration(normalized);
    const calibration = await FloorCalibration.findOneAndUpdate(
      { floor },
      {
        $set: {
          sourcePdf,
          pageNumber: Number(pageNumber),
          pageWidth: Number(pageWidth),
          pageHeight: Number(pageHeight),
          controlPoints: normalized,
          transform: {
            xCoefficients: transform.xCoefficients,
            yCoefficients: transform.yCoefficients,
          },
          rmsError: transform.rmsError,
          status: 'registered',
          // Registration is not proof of on-site measurement.
          fieldVerified: false,
          fieldVerificationNote: '',
          fieldVerifiedAt: null,
        },
      },
      { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
    );
    return res.json({
      message: 'Floor plan registration saved. It is not field-verified yet.',
      calibration,
    });
  } catch (error) {
    const status = error.message?.includes('collinear') || error.message?.includes('Control point') ? 400 : 500;
    return res.status(status).json({ message: error.message || 'Unable to save floor calibration.' });
  }
}


async function verifyFloorCalibration(req, res) {
  try {
    const floor = Number(req.params.floor);
    const { confirmation, verificationNote } = req.body || {};
    if (confirmation !== true || typeof verificationNote !== 'string' || verificationNote.trim().length < 20) {
      return res.status(400).json({
        message: 'Confirm the physical walkthrough and provide a verification note of at least 20 characters.',
      });
    }
    const calibration = await FloorCalibration.findOneAndUpdate(
      { floor },
      {
        $set: {
          fieldVerified: true,
          fieldVerificationNote: verificationNote.trim(),
          fieldVerifiedAt: new Date(),
        },
      },
      { new: true, runValidators: true }
    );
    if (!calibration) return res.status(404).json({ message: 'Register this floor plan before field verification.' });
    return res.json({ message: 'Field verification attestation saved.', calibration });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to save field verification.' });
  }
}

async function deleteFloorCalibration(req, res) {
  try {
    const floor = Number(req.params.floor);
    const deleted = await FloorCalibration.findOneAndDelete({ floor });
    if (!deleted) return res.status(404).json({ message: 'No calibration exists for this floor.' });
    return res.json({ message: 'Floor calibration removed.' });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to remove floor calibration.' });
  }
}

module.exports = { getFloorCalibrations, saveFloorCalibration, verifyFloorCalibration, deleteFloorCalibration };
