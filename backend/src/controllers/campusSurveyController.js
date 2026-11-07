const mongoose = require('mongoose');
const { GridFSBucket, ObjectId } = require('mongodb');
const { Transform } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const Survey = require('../models/CampusSurvey');

const MAX_VIDEO_BYTES = 250 * 1024 * 1024;
const bucket = () => new GridFSBucket(mongoose.connection.db, { bucketName: 'sicnWalkthroughVideos' });
const publicSurvey = (s) => ({
  id: String(s._id),
  title: s.title,
  description: s.description,
  startNodeId: s.startNodeId,
  endNodeId: s.endNodeId,
  floors: s.floors,
  checkpoints: s.checkpoints,
  videoContentType: s.videoContentType,
  videoSize: s.videoSize,
  durationMs: s.durationMs,
  status: s.status,
  createdAt: s.createdAt,
  publishedAt: s.publishedAt,
});

exports.list = async (req, res) => {
  const filter = req.user?.role === 'Admin' ? {} : { status: 'published' };
  const rows = await Survey.find(filter).sort({ createdAt: -1 }).limit(100).lean();
  res.json(rows.map(publicSurvey));
};

exports.create = async (req, res) => {
  const b = req.body || {};
  const title = String(b.title || '').trim();
  if (!title) return res.status(400).json({ message: 'Walkthrough title is required.' });
  if (title.length > 120) return res.status(400).json({ message: 'Title is too long.' });
  const floors = [...new Set((Array.isArray(b.floors) ? b.floors : []).map(Number))];
  if (floors.some((f) => !Number.isInteger(f) || f < 0 || f > 7)) {
    return res.status(400).json({ message: 'Floor values must be between 0 and 7.' });
  }
  const checkpoints = Array.isArray(b.checkpoints) ? b.checkpoints.slice(0, 200) : [];
  const trace = Array.isArray(b.trace) ? b.trace.slice(0, 2000) : [];
  if (checkpoints.some((x) => !String(x.name || '').trim() || !Number.isInteger(Number(x.floor)) || Number(x.floor) < 0 || Number(x.floor) > 7 || !Number.isFinite(Number(x.elapsedMs)) || Number(x.elapsedMs) < 0)) {
    return res.status(400).json({ message: 'One or more walkthrough checkpoints are invalid.' });
  }
  const survey = await Survey.create({
    title,
    description: String(b.description || '').slice(0, 1000),
    startNodeId: String(b.startNodeId || '').slice(0, 100),
    endNodeId: String(b.endNodeId || '').slice(0, 100),
    floors,
    checkpoints,
    trace,
    durationMs: Math.max(0, Number(b.durationMs) || 0),
    createdBy: req.user._id,
  });
  res.status(201).json(publicSurvey(survey));
};

exports.uploadVideo = async (req, res) => {
  const survey = await Survey.findById(req.params.id);
  if (!survey) return res.status(404).json({ message: 'Walkthrough not found.' });
  const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
  if (!['video/webm', 'video/mp4'].includes(contentType)) {
    return res.status(415).json({ message: 'Only WebM or MP4 video uploads are accepted.' });
  }
  const declaredSize = Number(req.headers['content-length'] || 0);
  if (declaredSize > MAX_VIDEO_BYTES) return res.status(413).json({ message: 'Video exceeds the 250 MB limit. Record a shorter segment.' });
  let size = 0;
  const limiter = new Transform({
    transform(chunk, encoding, callback) {
      size += chunk.length;
      if (size > MAX_VIDEO_BYTES) return callback(Object.assign(new Error('Video exceeds the 250 MB limit.'), { status: 413 }));
      callback(null, chunk);
    },
  });
  const filename = `walkthrough-${survey._id}-${Date.now()}.${contentType === 'video/mp4' ? 'mp4' : 'webm'}`;
  const upload = bucket().openUploadStream(filename, { contentType, metadata: { surveyId: String(survey._id) } });
  try {
    await pipeline(req, limiter, upload);
    if (!size) {
      await bucket().delete(upload.id).catch(() => {});
      return res.status(400).json({ message: 'Uploaded video is empty.' });
    }
    if (survey.videoFileId) await bucket().delete(survey.videoFileId).catch(() => {});
    survey.videoFileId = upload.id;
    survey.videoContentType = contentType;
    survey.videoSize = size;
    await survey.save();
    return res.json({ message: 'Video securely stored.', videoSize: size, survey: publicSurvey(survey) });
  } catch (error) {
    await bucket().delete(upload.id).catch(() => {});
    if (!res.headersSent) return res.status(error.status || 400).json({ message: error.message || 'Video upload failed.' });
    return undefined;
  }
};

exports.updateMetadata = async (req, res) => {
  const survey = await Survey.findById(req.params.id);
  if (!survey) return res.status(404).json({ message: 'Walkthrough not found.' });
  if (survey.status === 'published') return res.status(409).json({ message: 'Unpublish this walkthrough before editing it.' });
  const b = req.body || {};
  if (b.title !== undefined) {
    const title = String(b.title).trim();
    if (!title || title.length > 120) return res.status(400).json({ message: 'A title of 1–120 characters is required.' });
    survey.title = title;
  }
  if (b.description !== undefined) survey.description = String(b.description).slice(0, 1000);
  if (b.startNodeId !== undefined) survey.startNodeId = String(b.startNodeId).slice(0, 100);
  if (b.endNodeId !== undefined) survey.endNodeId = String(b.endNodeId).slice(0, 100);
  if (b.durationMs !== undefined) survey.durationMs = Math.max(0, Number(b.durationMs) || 0);
  if (Array.isArray(b.floors)) {
    const floors = [...new Set(b.floors.map(Number))];
    if (floors.some((f) => !Number.isInteger(f) || f < 0 || f > 7)) return res.status(400).json({ message: 'Floor values must be between 0 and 7.' });
    survey.floors = floors;
  }
  if (Array.isArray(b.checkpoints)) {
    if (b.checkpoints.length > 200 || b.checkpoints.some((x) => !String(x.name || '').trim() || !Number.isInteger(Number(x.floor)) || Number(x.floor) < 0 || Number(x.floor) > 7 || !Number.isFinite(Number(x.elapsedMs)) || Number(x.elapsedMs) < 0)) {
      return res.status(400).json({ message: 'One or more walkthrough checkpoints are invalid.' });
    }
    survey.checkpoints = b.checkpoints;
  }
  if (Array.isArray(b.trace)) {
    if (b.trace.length > 2000) return res.status(400).json({ message: 'Too many sensor samples. Split this walkthrough into shorter recordings.' });
    survey.trace = b.trace;
  }
  await survey.save();
  res.json(publicSurvey(survey));
};

exports.publish = async (req, res) => {
  const survey = await Survey.findById(req.params.id);
  if (!survey) return res.status(404).json({ message: 'Walkthrough not found.' });
  if (!survey.videoFileId || !survey.videoSize) return res.status(409).json({ message: 'Upload a video before publishing this walkthrough.' });
  if (!survey.checkpoints.length) return res.status(409).json({ message: 'Add at least one named checkpoint before publishing.' });
  survey.status = 'published';
  survey.publishedAt = new Date();
  await survey.save();
  res.json(publicSurvey(survey));
};

exports.streamVideo = async (req, res) => {
  const survey = await Survey.findById(req.params.id);
  if (!survey || (survey.status !== 'published' && req.user?.role !== 'Admin')) {
    return res.status(404).json({ message: 'Walkthrough video not found.' });
  }
  if (!survey.videoFileId) return res.status(404).json({ message: 'No video is attached to this walkthrough.' });
  const fileId = new ObjectId(String(survey.videoFileId));
  const total = Number(survey.videoSize);
  res.setHeader('Content-Type', survey.videoContentType || 'video/webm');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'private, max-age=300');

  let start = 0;
  let end = total - 1;
  const range = req.headers.range;
  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match || (!match[1] && !match[2])) {
      res.setHeader('Content-Range', `bytes */${total}`);
      return res.status(416).end();
    }
    if (!match[1]) {
      const suffixLength = Number(match[2]);
      start = Math.max(0, total - suffixLength);
    } else {
      start = Number(match[1]);
      if (match[2]) end = Math.min(total - 1, Number(match[2]));
    }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= total || end < start) {
      res.setHeader('Content-Range', `bytes */${total}`);
      return res.status(416).end();
    }
    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${end}/${total}`);
  }
  res.setHeader('Content-Length', end - start + 1);
  const stream = bucket().openDownloadStream(fileId, range ? { start, end: end + 1 } : {});
  stream.on('error', () => {
    if (!res.headersSent) res.status(404).json({ message: 'Video file is unavailable.' });
    else res.destroy();
  });
  stream.pipe(res);
};

exports.remove = async (req, res) => {
  const survey = await Survey.findById(req.params.id);
  if (!survey) return res.status(404).json({ message: 'Walkthrough not found.' });
  if (survey.videoFileId) await bucket().delete(survey.videoFileId).catch(() => {});
  await survey.deleteOne();
  res.json({ message: 'Walkthrough deleted.' });
};
