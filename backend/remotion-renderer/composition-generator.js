const fs = require('fs');
const path = require('path');

/**
 * Generate a Remotion composition from designcombo timeline data
 */
async function generateCompositionFromTimeline(design, options = {}) {
  try {
    console.log('🎬 Generating composition from timeline data...');
    
    // Extract timeline information
    const {
      trackItemsMap = {},
      duration = 30000, // Default 30 seconds in ms
      size = { width: 1920, height: 1080 }
    } = design;

    const fps = options.fps || 30;
    const durationInFrames = Math.ceil((duration / 1000) * fps);

    console.log(`📊 Timeline info:`, {
      itemCount: Object.keys(trackItemsMap).length,
      duration: `${duration}ms`,
      durationInFrames,
      size,
      fps
    });

    // Generate composition code
    const compositionCode = generateCompositionCode({
      trackItemsMap,
      duration,
      durationInFrames,
      size,
      fps,
      options
    });

    // Save composition to temp file
    const timestamp = Date.now();
    const compositionPath = path.join(__dirname, 'temp-compositions', `composition-${timestamp}.jsx`);
    
    // Ensure temp-compositions directory exists
    const tempDir = path.dirname(compositionPath);
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }

    fs.writeFileSync(compositionPath, compositionCode);
    console.log(`✅ Composition saved: ${compositionPath}`);

    return compositionPath;

  } catch (error) {
    console.error('❌ Error generating composition:', error);
    throw error;
  }
}

/**
 * Generate the actual Remotion composition JSX code
 */
function generateCompositionCode({ trackItemsMap, duration, durationInFrames, size, fps, options }) {
  const videoBlocks = [];
  const textBlocks = [];
  
  // Process timeline items
  Object.entries(trackItemsMap).forEach(([id, item]) => {
    if (item.type === 'video') {
      videoBlocks.push(generateVideoBlock(item, fps));
    } else if (item.type === 'text' || item.type === 'caption') {
      textBlocks.push(generateTextBlock(item, fps));
    }
  });

  // Generate the composition JSX
  const compositionCode = `
import React from 'react';
import { Composition, AbsoluteFill, Video, useCurrentFrame, interpolate, Sequence, registerRoot } from 'remotion';

// Helper function to convert API URLs to file paths
function resolveVideoPath(url) {
  if (url.startsWith('/api/segment/')) {
    // Extract analysis ID and file path from URL
    // Format: /api/segment/{analysis_id}/mezzanine/{filename}
    const urlParts = url.split('/');
    if (urlParts.length >= 5) {
      const analysisId = urlParts[3];
      const quality = urlParts[4]; // 'mezzanine' or 'proxy'
      const filename = urlParts[5];

      // Convert to direct file path (using string concatenation instead of path.join)
      const filePath = \`../analyzed_videos_store/\${analysisId}/segments/\${quality}/\${filename}\`;
      console.log('🎬 Resolved video path:', filePath);
      return filePath;
    }
  }
  return url;
}

// Text component for subtitles and captions
const TextOverlay = ({ text, style, frame }) => {
  return (
    <div
      style={{
        ...style,
        zIndex: 1000,
        // Ensure text is visible and properly styled
        wordWrap: 'break-word',
        whiteSpace: 'pre-wrap'
      }}
    >
      {text}
    </div>
  );
};

// Main timeline composition
const TimelineComposition = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: '#000000' }}>
      {/* Video layers */}
      ${videoBlocks.join('\n      ')}
      
      {/* Text/Caption layers */}
      ${textBlocks.join('\n      ')}
      
      {/* Debug frame counter */}
      <div style={{
        position: 'absolute',
        top: 10,
        right: 10,
        color: 'white',
        fontSize: 12,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        padding: '4px 8px',
        borderRadius: '4px',
        zIndex: 2000
      }}>
        Frame: {frame}
      </div>
    </AbsoluteFill>
  );
};

// Register the composition
registerRoot(() => {
  return (
    <Composition
      id="TimelineComposition"
      component={TimelineComposition}
      durationInFrames={${durationInFrames}}
      fps={${fps}}
      width={${size.width}}
      height={${size.height}}
    />
  );
});
`;

  return compositionCode;
}

/**
 * Generate video block JSX
 */
function generateVideoBlock(item, fps) {
  const startFrame = Math.round((item.display?.from || 0) / 1000 * fps);
  const durationFrames = Math.round(((item.display?.to || item.display?.from || 0) - (item.display?.from || 0)) / 1000 * fps);
  
  // Handle video trimming
  const trimStart = item.trim?.from || 0;
  const startFrom = Math.round(trimStart / 1000 * fps);

  return `
      <Sequence from={${startFrame}} durationInFrames={${durationFrames}}>
        <Video
          src={resolveVideoPath("${item.details?.src || ''}")}
          startFrom={${startFrom}}
          volume={${item.volume || 1}}
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            transform: \`scale(\${${item.display?.scaleX || 1}}, \${${item.display?.scaleY || 1}}) translate(\${${item.display?.x || 0}}px, \${${item.display?.y || 0}}px)\`
          }}
        />
      </Sequence>`;
}

/**
 * Generate text/caption block JSX
 */
function generateTextBlock(item, fps) {
  const startFrame = Math.round((item.display?.from || 0) / 1000 * fps);
  const durationFrames = Math.round(((item.display?.to || item.display?.from || 0) - (item.display?.from || 0)) / 1000 * fps);

  const text = item.details?.text || item.text || '';

  // Handle subtitle positioning - use details properties for proper positioning
  const isSubtitle = item.type === 'caption' || item.name === 'AI Subtitle';

  let style;
  if (isSubtitle) {
    // For subtitles, use proper bottom-center positioning
    style = {
      position: 'absolute',
      bottom: '60px', // Position from bottom
      left: '50%',
      transform: 'translateX(-50%)', // Center horizontally
      width: '80%', // Responsive width
      maxWidth: '800px',
      fontSize: item.details?.fontSize || 28,
      color: item.details?.color || 'white',
      fontFamily: item.details?.fontFamily || 'Arial, sans-serif',
      textAlign: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.8)',
      padding: '12px 20px',
      borderRadius: '8px',
      lineHeight: '1.4',
      fontWeight: '600',
      textShadow: '2px 2px 4px rgba(0, 0, 0, 1)',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
      border: '1px solid rgba(255, 255, 255, 0.2)'
    };
  } else {
    // For regular text, use timeline positioning
    style = {
      position: 'absolute',
      left: `${item.details?.left || item.display?.x || 0}px`,
      top: `${item.details?.top || item.display?.y || 0}px`,
      width: `${item.details?.width || item.display?.width || 'auto'}`,
      height: `${item.details?.height || item.display?.height || 'auto'}`,
      fontSize: item.details?.fontSize || 24,
      color: item.details?.color || 'white',
      fontFamily: item.details?.fontFamily || 'Arial, sans-serif',
      textAlign: item.details?.textAlign || 'center'
    };
  }

  return `
      <Sequence from={${startFrame}} durationInFrames={${durationFrames}}>
        <TextOverlay
          text="${text.replace(/"/g, '\\"')}"
          style={${JSON.stringify(style)}}
          frame={frame}
        />
      </Sequence>`;
}

module.exports = {
  generateCompositionFromTimeline
};
