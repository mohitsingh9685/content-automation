process.env.NODE_ENV = 'test';

const assert = require('assert');
const http = require('http');
const { app } = require('../src/app');
const { runMigrations } = require('../src/db/migrate');
const { runSeed } = require('../src/db/seed');
const { processNextJobs, stopJobWorker } = require('../src/jobs/jobQueue');
const { pool } = require('../src/config/db');

function requestJson(serverUrl, method, path, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(path, serverUrl);
    const payload = body ? JSON.stringify(body) : null;

    const req = http.request(
      url,
      {
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, body: JSON.parse(data) });
          } catch (e) {
            resolve({ status: res.statusCode, body: data });
          }
        });
      }
    );

    req.on('error', reject);
    if (payload) req.write(payload);
    req.end();
  });
}

async function runPhase1Tests() {
  console.log('=== Starting Phase 1 Automated Verification Tests ===');
  await runMigrations();
  await runSeed();

  const server = app.listen(0);
  const { port } = server.address();
  const baseUrl = `http://127.0.0.1:${port}`;
  let createdTestTopicId = null;
  let createdTestVideoId = null;

  try {
    // 1. Health check
    const health = await requestJson(baseUrl, 'GET', '/api/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.body.success, true);
    console.log('✅ 1. GET /api/health passed');

    // 2. Dashboard Summary
    const summary = await requestJson(baseUrl, 'GET', '/api/dashboard/summary');
    assert.strictEqual(summary.status, 200);
    assert.ok(summary.body.data.metrics.totalTopicsDiscovered >= 5);
    console.log('✅ 2. GET /api/dashboard/summary passed');

    // 3. List Trending Topics
    const trends = await requestJson(baseUrl, 'GET', '/api/trends');
    assert.strictEqual(trends.status, 200);
    assert.ok(Array.isArray(trends.body.data.topics));
    const verifiedTopic = trends.body.data.topics.find((t) => t.verification_status === 'verified');
    const flaggedTopic = trends.body.data.topics.find((t) => t.verification_status === 'flagged');
    assert.ok(verifiedTopic, 'Expected at least one verified topic');
    assert.ok(flaggedTopic, 'Expected at least one flagged topic');
    console.log('✅ 3. GET /api/trends passed');

    // 4. Verify Flagged Topic is blocked from automatic generation
    const blockedGen = await requestJson(baseUrl, 'POST', `/api/trends/${flaggedTopic.id}/generate`, {});
    assert.strictEqual(blockedGen.status, 422);
    console.log('✅ 4. POST /api/trends/:id/generate blocks unverified/flagged topic as required');

    // 5. Create an isolated test topic and generate Roman Hinglish Video via Background Job Queue
    const customTopicRes = await requestJson(baseUrl, 'POST', '/api/trends/custom', {
      headline: 'UPI AutoPay Kya Hai? Recurring Payments Ka Asli Mechanism Explained',
      category: 'finance_economy',
      summary: 'Detailed 45-second explainer on how NPCI UPI AutoPay mandates work for subscriptions in India.',
      generateNow: false,
    });
    assert.strictEqual(customTopicRes.status, 201);
    createdTestTopicId = customTopicRes.body.data.topic.id;

    const genRes = await requestJson(baseUrl, 'POST', `/api/trends/${createdTestTopicId}/generate`, {
      customInstructions: 'Keep it ultra-interactive in casual Roman Hinglish for young Indian viewers',
      autoRender: false,
    });
    assert.strictEqual(genRes.status, 202);
    assert.ok(genRes.body.data.job.id);
    await processNextJobs();
    console.log('✅ 5. POST /api/trends/:id/generate & background job processing passed');

    // 6. List Videos & Get Video by ID
    const videosRes = await requestJson(baseUrl, 'GET', '/api/videos');
    assert.strictEqual(videosRes.status, 200);
    assert.ok(videosRes.body.data.videos.length >= 1);
    const createdVideo =
      videosRes.body.data.videos.find((v) => v.topic_id === createdTestTopicId) ||
      videosRes.body.data.videos[0];
    createdTestVideoId = createdVideo.id;

    const singleVideo = await requestJson(baseUrl, 'GET', `/api/videos/${createdTestVideoId}`);
    assert.strictEqual(singleVideo.status, 200);
    assert.strictEqual(singleVideo.body.data.video.id, createdTestVideoId);
    console.log('✅ 6. GET /api/videos & GET /api/videos/:id passed');

    // 7. Patch Roman Hinglish Script in Video Studio
    const patchRes = await requestJson(baseUrl, 'PATCH', `/api/videos/${createdTestVideoId}/script`, {
      opening_hook: 'Ruko! Kya aap jaante hain is bade faisle ka aapki jeb par kya asar hoga?',
    });
    assert.strictEqual(patchRes.status, 200);
    assert.strictEqual(
      patchRes.body.data.video.opening_hook,
      'Ruko! Kya aap jaante hain is bade faisle ka aapki jeb par kya asar hoga?'
    );
    console.log('✅ 7. PATCH /api/videos/:id/script passed');

    // 8. Render Video via Background Job Queue
    const renderRes = await requestJson(baseUrl, 'POST', `/api/videos/${createdTestVideoId}/render`, {});
    assert.strictEqual(renderRes.status, 202);
    await processNextJobs();
    console.log('✅ 8. POST /api/videos/:id/render passed');

    // 9. Verify Publishing is BLOCKED before explicit Human Approval
    await requestJson(baseUrl, 'POST', `/api/videos/${createdTestVideoId}/reject`, {
      reviewerNotes: 'Testing rejection state first',
    });
    const blockedPub = await requestJson(baseUrl, 'POST', `/api/videos/${createdTestVideoId}/publish`, {
      platforms: ['youtube_shorts'],
    });
    assert.strictEqual(blockedPub.status, 403);
    console.log('✅ 9. POST /api/videos/:id/publish blocks unapproved video as required');

    // 10. Approve Video and Publish
    const approveRes = await requestJson(baseUrl, 'POST', `/api/videos/${createdTestVideoId}/approve`, {
      reviewerNotes: 'Verified sources and Roman Hinglish script approved.',
    });
    assert.strictEqual(approveRes.status, 200);
    assert.strictEqual(approveRes.body.data.video.status, 'approved');

    const publishRes = await requestJson(baseUrl, 'POST', `/api/videos/${createdTestVideoId}/publish`, {
      platforms: ['youtube_shorts', 'instagram_reels'],
    });
    assert.strictEqual(publishRes.status, 202);
    await processNextJobs();
    console.log('✅ 10. POST /api/videos/:id/approve & POST /api/videos/:id/publish passed');

    // 11. Analytics endpoint
    const analyticsRes = await requestJson(baseUrl, 'GET', '/api/analytics');
    assert.strictEqual(analyticsRes.status, 200);
    assert.ok(analyticsRes.body.data.totals.total_views >= 0);
    assert.ok(Array.isArray(analyticsRes.body.data.recommendations));
    console.log('✅ 11. GET /api/analytics passed');

    console.log('=== All 11 Phase 1 Verification Assertions Passed! ===');
  } finally {
    if (createdTestTopicId) {
      await requestJson(baseUrl, 'DELETE', `/api/trends/${createdTestTopicId}`).catch(() => {});
    } else if (createdTestVideoId) {
      await requestJson(baseUrl, 'DELETE', `/api/videos/${createdTestVideoId}`).catch(() => {});
    }
    stopJobWorker();
    server.close();
    await pool.end();
  }
}

runPhase1Tests().catch((err) => {
  console.error('❌ Phase 1 tests failed:', err);
  process.exit(1);
});
