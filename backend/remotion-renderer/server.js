const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const { bundle } = require('@remotion/bundler');
const { renderMedia, selectComposition } = require('@remotion/renderer');
const { generateCompositionFromTimeline } = require('./composition-generator');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Store for tracking render jobs
const renderJobs = new Map();

// Generate unique job ID
function generateJobId() {
  return Date.now().toString() + Math.random().toString(36).substr(2, 9);
}

// POST /api/render - Start rendering process
app.post('/api/render', async (req, res) => {
  try {
    console.log('🎬 Received render request');
    const { design, options } = req.body;
    
    if (!design) {
      return res.status(400).json({ error: 'Design data is required' });
    }

    const jobId = generateJobId();
    const videoId = jobId;

    // Initialize job tracking
    renderJobs.set(jobId, {
      id: jobId,
      status: 'PENDING',
      progress: 0,
      startTime: Date.now(),
      design,
      options: options || {}
    });

    console.log(`🎬 Started render job ${jobId}`);

    // Start async rendering process
    processRenderJob(jobId, design, options).catch(error => {
      console.error(`❌ Render job ${jobId} failed:`, error);
      renderJobs.set(jobId, {
        ...renderJobs.get(jobId),
        status: 'FAILED',
        error: error.message
      });
    });

    // Return job info immediately
    res.json({
      video: {
        id: videoId,
        status: 'PENDING',
        progress: 0
      }
    });

  } catch (error) {
    console.error('❌ Error starting render:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/render - Check render status
app.get('/api/render', (req, res) => {
  try {
    const { id, type } = req.query;
    
    if (!id) {
      return res.status(400).json({ error: 'Job ID is required' });
    }

    const job = renderJobs.get(id);
    if (!job) {
      return res.status(404).json({ error: 'Job not found' });
    }

    res.json({
      video: {
        id: job.id,
        status: job.status,
        progress: job.progress,
        url: job.url || null,
        error: job.error || null
      }
    });

  } catch (error) {
    console.error('❌ Error checking render status:', error);
    res.status(500).json({ error: error.message });
  }
});

// Main rendering process
async function processRenderJob(jobId, design, options) {
  try {
    console.log(`🎬 Processing render job ${jobId}`);
    
    // Update progress
    updateJobProgress(jobId, 10, 'Generating composition...');

    // Generate Remotion composition from timeline data
    const compositionPath = await generateCompositionFromTimeline(design, options);
    console.log(`✅ Generated composition: ${compositionPath}`);

    updateJobProgress(jobId, 30, 'Bundling composition...');

    // Bundle the composition
    const bundleLocation = await bundle({
      entryPoint: compositionPath,
      webpackOverride: (config) => config,
    });

    updateJobProgress(jobId, 50, 'Selecting composition...');

    // Get composition details
    const compositions = await selectComposition({
      serveUrl: bundleLocation,
      id: 'TimelineComposition',
    });

    updateJobProgress(jobId, 70, 'Rendering video...');

    // Set up output path
    const outputDir = path.join(__dirname, '..', 'exported_videos');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const outputPath = path.join(outputDir, `render_${jobId}.mp4`);

    // Render the video
    await renderMedia({
      composition: compositions,
      serveUrl: bundleLocation,
      codec: 'h264',
      outputLocation: outputPath,
      inputProps: {},
      onProgress: ({ progress }) => {
        const renderProgress = 70 + (progress * 30); // 70-100%
        updateJobProgress(jobId, Math.round(renderProgress), 'Rendering video...');
      },
    });

    // Complete the job
    const downloadUrl = `/api/download/${path.basename(outputPath)}`;
    renderJobs.set(jobId, {
      ...renderJobs.get(jobId),
      status: 'COMPLETED',
      progress: 100,
      url: downloadUrl,
      outputPath
    });

    console.log(`✅ Render job ${jobId} completed: ${outputPath}`);

  } catch (error) {
    console.error(`❌ Render job ${jobId} failed:`, error);
    renderJobs.set(jobId, {
      ...renderJobs.get(jobId),
      status: 'FAILED',
      error: error.message
    });
    throw error;
  }
}

// Helper function to update job progress
function updateJobProgress(jobId, progress, message) {
  const job = renderJobs.get(jobId);
  if (job) {
    renderJobs.set(jobId, {
      ...job,
      progress,
      message
    });
    console.log(`🎬 Job ${jobId}: ${progress}% - ${message}`);
  }
}

// Serve rendered videos
app.get('/api/download/:filename', (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(__dirname, '..', 'exported_videos', filename);
    
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    res.download(filePath);
  } catch (error) {
    console.error('❌ Error serving download:', error);
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'remotion-renderer' });
});

app.listen(PORT, () => {
  console.log(`🎬 Remotion renderer server running on port ${PORT}`);
});
