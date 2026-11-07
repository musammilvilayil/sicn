const fs = require('fs');
const path = require('path');
const { auditCampusGraph } = require('../utils/campusGraphAudit');

const dataPath = path.join(__dirname, '../data/seedData.json');
const graph = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
const report = auditCampusGraph(graph);

console.log(JSON.stringify(report, null, 2));
if (!report.valid) process.exitCode = 1;
