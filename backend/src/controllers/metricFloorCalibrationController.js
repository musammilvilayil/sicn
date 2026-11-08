const MetricFloorCalibration = require('../models/MetricFloorCalibration');
const { calculateMetricScale } = require('../utils/metricFloorCalibration');
const ALLOWED_PDFS = new Set(['BJI_BUILDING PLAN 01 GF MAIN BLOCK_04022026.pdf','BJI_BUILDING PLAN 0000_1ST FLOOR MAIN BLOCK_04022026.pdf','BJI_MAIN_BLOCK_2ND_&_3RD_FLOOR_BUILDING_PLAN_00000_04022026.pdf','BJI_BUILDING_PLAN_0002_4TH_&_5TH_FLOOR_MAIN_BLOCK_04022026.pdf','BJI_BUILDING_PLAN_003_6TH_&_7TH_FLOOR_MAIN_BLOCK_04022026.pdf']);
async function getMetricFloorCalibration(req,res) {
 try { const filter={floor:Number(req.query.floor),pageNumber:Number(req.query.pageNumber),sourcePdf:String(req.query.sourcePdf||'')}; return res.json(await MetricFloorCalibration.findOne(filter).lean()); }
 catch { return res.status(500).json({message:'Unable to load metric floor calibration.'}); }
}
async function saveMetricFloorCalibration(req,res) {
 try {
  const input=req.body||{}, floor=Number(req.params.floor);
  if(!Number.isInteger(floor)||floor<0||floor>7) return res.status(400).json({message:'Floor must be an integer from 0 through 7.'});
  if(!ALLOWED_PDFS.has(input.sourcePdf)) return res.status(400).json({message:'Select a registered source PDF.'});
  if(!Number.isInteger(Number(input.pageNumber))||Number(input.pageNumber)<1) return res.status(400).json({message:'A valid page number is required.'});
  const scale=calculateMetricScale(input);
  if(!scale.valid) return res.status(400).json({message:'Metric scale calibration is invalid.',errors:scale.errors});
  const calibration=await MetricFloorCalibration.findOneAndUpdate({floor,sourcePdf:input.sourcePdf,pageNumber:Number(input.pageNumber)},{$set:{floor,sourcePdf:input.sourcePdf,pageNumber:Number(input.pageNumber),pageWidth:Number(input.pageWidth),pageHeight:Number(input.pageHeight),calibrationPoints:input.calibrationPoints,knownDistanceMeters:Number(input.knownDistanceMeters),metersPerPdfPoint:scale.metersPerPdfPoint,reference:String(input.reference).trim(),calibratedBy:req.user?._id}},{new:true,upsert:true,runValidators:true});
  return res.json({message:'Plan-derived metric scale saved. It is not a physical site verification.',calibration});
 } catch(error) { return res.status(500).json({message:error.message||'Unable to save metric floor calibration.'}); }
}
module.exports={getMetricFloorCalibration,saveMetricFloorCalibration};
