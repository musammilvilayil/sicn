# Admin Campus Survey & Walkthrough Mode

## Purpose
Let an authenticated SICN administrator record a real campus walkthrough from an entrance, label important places, save the video and its sensor/checkpoint timeline, review it, and publish it as a visual guide for visitors and students.

## Capture workflow
1. An Admin opens Record Walkthrough from the campus map.
2. Select the start node, current floor, optional destination, title and description.
3. Press Start Recording. The browser requests rear-camera permission from this explicit user action. Audio is disabled.
4. Walk the route and change the selected floor when moving between floors. Add named checkpoint markers at entrances, reception, rooms, labs, offices, lifts and stairs. Markers may optionally link to an existing map node.
5. SICN samples elapsed time, selected floor, compass heading when available, and a best-effort accelerometer step estimate. Coarse GPS samples are opt-in and disabled by default because GPS is unreliable indoors.
6. Stop the segment. Video is uploaded to MongoDB GridFS; metadata, checkpoints and trace are stored in the CampusSurvey collection.
7. Review the saved video, then publish. Draft videos are administrator-only. Published walkthroughs appear in the public Campus Walkthroughs library.

## Storage/API
- CampusSurvey stores descriptive metadata, floors, checkpoint timestamps, sensor samples, status and GridFS file reference.
- sicnWalkthroughVideos GridFS bucket stores video bytes outside the MongoDB document-size limit.
- POST /api/surveys, PUT /api/surveys/:id, PUT /api/surveys/:id/video, POST /api/surveys/:id/publish, and DELETE /api/surveys/:id are Admin-only.
- GET /api/surveys returns published guides to visitors and all drafts to authenticated Admins.
- GET /api/surveys/:id/video streams published videos publicly and drafts only to Admins.
- Maximum upload size is 250 MB per segment; browser recording automatically stops at four minutes so a long campus tour can be captured as multiple segments.

## Important limitations / next phase
- This is a recorded visual walkthrough library, not live public tracking of the administrator.
- GPS is optional and may drift badly indoors. Compass and accelerometer data are indicative only; they do not produce surveyed X/Y positions.
- The current UI records one video segment per walkthrough draft. A long route should be captured as separate named segments; stitching/playlist grouping is a future enhancement.
- Video is not yet overlaid with a calibrated floor-plan route or synchronized turn-by-turn map cursor.
- The admin must obtain appropriate permission before filming identifiable people or private spaces. Audio capture is disabled; GPS is opt-in. Drafts remain private until explicit publication.
- Deployment must use HTTPS and a MongoDB deployment with sufficient GridFS storage, backup and retention capacity. Confirm the hosting provider supports long-lived streaming uploads; enforce reverse-proxy request-size/time limits accordingly.
- A production deployment should define retention/deletion policy and audit log publication/deletion actions.

## Acceptance checklist
- Admin role can record; non-admin roles cannot create, upload, publish or delete.
- Browser camera permission is user initiated and camera tracks stop after recording.
- Video uploads to GridFS and survives application restarts.
- Draft is private; published video is available to visitor accounts.
- Checkpoint order, floor labels, heading samples and optional GPS samples are persisted.
- Test Android Chrome and iOS Safari over HTTPS, including large uploads and network interruption/retry.
