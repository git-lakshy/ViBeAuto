// Camera virtualization and visibility spoofing patch

(function() {
  const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const originalEnumerate = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);

  let vcamEnabled = false;
  let vcamSource = null;
  let isDrawing = false;

  // Create virtual video elements
  const vcamVideo = document.createElement('video');
  const vcamCanvas = document.createElement('canvas');
  const vcamCtx = vcamCanvas.getContext('2d');
  vcamCanvas.width = 640;
  vcamCanvas.height = 480;
  vcamVideo.muted = true;
  vcamVideo.loop = true;
  vcamVideo.playsInline = true;

  // Load default image
  const patchEl = document.currentScript || document.getElementById('vibe-vcam-patch');
  const defaultImg = new Image();
  if (patchEl?.dataset.defaultUrl) {
    defaultImg.src = patchEl.dataset.defaultUrl;
    defaultImg.onload = () => {
      if (vcamEnabled && !isDrawing) drawFrame();
    };
  }

  const virtualDevice = { deviceId: 'vcam-virtual-01', kind: 'videoinput', label: 'Virtual Camera (ViBe Auto)', groupId: 'vcam-group' };

  // Draw default frame loop
  function drawFrame() {
    if (!vcamEnabled) { isDrawing = false; return; }
    isDrawing = true;
    vcamCtx.clearRect(0, 0, 640, 480);
    if (defaultImg.complete && defaultImg.naturalWidth) {
      vcamCtx.drawImage(defaultImg, 0, 0, 640, 480);
    } else {
      vcamCtx.fillStyle = '#000';
      vcamCtx.fillRect(0, 0, 640, 480);
    }
    requestAnimationFrame(drawFrame);
  }

  // Listen for vcam toggle events from content script
  window.addEventListener('vibe-update-vcam', (e) => {
    const { enabled, source } = e.detail;
    vcamEnabled = enabled;
    if (enabled && !isDrawing) drawFrame();
    if (source && source.startsWith('data:video/') && source !== vcamSource) {
      vcamSource = source;
      vcamVideo.src = source;
      vcamVideo.play().catch(() => {});
    } else if (!source) {
      vcamSource = null;
      vcamVideo.src = '';
    }
  });

  // Override enumerateDevices
  navigator.mediaDevices.enumerateDevices = async () => {
    const devices = await originalEnumerate();
    return vcamEnabled ? [virtualDevice, ...devices] : devices;
  };

  // Override getUserMedia
  navigator.mediaDevices.getUserMedia = async (constraints) => {
    if (!vcamEnabled || !constraints?.video) return originalGetUserMedia(constraints);
    
    try {
      let stream;
      
      // Use video source if provided, otherwise use canvas with default image
      if (vcamSource?.startsWith('data:video/')) {
        if (vcamVideo.readyState < 2) {
          await new Promise(resolve => {
            vcamVideo.oncanplay = resolve;
            setTimeout(resolve, 1000); // Fallback timeout
          });
        }
        stream = vcamVideo.captureStream?.() || vcamVideo.mozCaptureStream?.();
      } else {
        // Use canvas stream with default image
        if (!isDrawing) drawFrame();
        stream = vcamCanvas.captureStream(30);
      }
      
      if (constraints.audio) {
        const audioStream = await originalGetUserMedia({ audio: constraints.audio });
        audioStream.getAudioTracks().forEach(t => stream.addTrack(t));
      }
      return stream;
    } catch (err) { 
      console.warn('ViBe VCam failed:', err);
      return originalGetUserMedia(constraints); 
    }
  };

  // Visibility spoofing
  const alwaysVisible = () => 'visible';
  const alwaysFalse = () => false;
  
  Object.defineProperty(document, 'visibilityState', { get: alwaysVisible, configurable: true });
  Object.defineProperty(document, 'hidden', { get: alwaysFalse, configurable: true });

  const blockEvent = (e) => { e.stopImmediatePropagation(); e.preventDefault(); return false; };
  ['visibilitychange', 'blur', 'focusout', 'pagehide'].forEach(evt => {
    window.addEventListener(evt, blockEvent, true);
    document.addEventListener(evt, blockEvent, true);
  });

  // Prevent video auto-pause
  document.addEventListener('pause', (e) => {
    if (e.target.tagName === 'VIDEO' && !e.target.ended && !e.target.dataset.vibeManualPause) {
      e.target.play().catch(() => {});
    }
  }, true);

  console.log('ViBe Auto: Camera patch loaded');
})();
