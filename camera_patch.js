(function() {
    // --- Phase 1: Camera Virtualization ---
    const originalGetUserMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    const originalEnumerateDevices = navigator.mediaDevices.enumerateDevices.bind(navigator.mediaDevices);

    let vcamEnabled = false;
    let vcamSource = null;
    let isImageSource = false;

    const vcamVideo = document.createElement('video');
    const vcamImage = new Image();
    const vcamCanvas = document.createElement('canvas');
    const vcamCtx = vcamCanvas.getContext('2d');

    vcamVideo.muted = true;
    vcamVideo.loop = true;
    vcamVideo.playsInline = true;
    vcamVideo.crossOrigin = "anonymous";
    
    function renderImageToCanvas() {
        if (vcamEnabled && isImageSource) {
            vcamCtx.drawImage(vcamImage, 0, 0, vcamCanvas.width, vcamCanvas.height);
            requestAnimationFrame(renderImageToCanvas);
        }
    }

    const virtualDevice = {
        deviceId: "vcam-virtual-01",
        kind: "videoinput",
        label: "Virtual Camera (ViBe Auto)",
        groupId: "vcam-group"
    };

    window.addEventListener('vibe-update-vcam', (event) => {
        const { enabled, source } = event.detail;
        vcamEnabled = enabled;
        if (source && source !== vcamSource) {
            vcamSource = source;
            if (source.startsWith('data:image/')) {
                isImageSource = true;
                vcamImage.src = source;
                vcamImage.onload = () => {
                   vcamCanvas.width = vcamImage.width || 640;
                   vcamCanvas.height = vcamImage.height || 480;
                   renderImageToCanvas();
                };
            } else {
                isImageSource = false;
                vcamVideo.src = source;
                vcamVideo.play().catch(e => console.warn("ViBe VCam: Playback failed", e));
            }
        }
    });

    navigator.mediaDevices.enumerateDevices = async function() {
        const devices = await originalEnumerateDevices();
        if (vcamEnabled) return [virtualDevice, ...devices];
        return devices;
    };

    navigator.mediaDevices.getUserMedia = async function(constraints) {
        if (vcamEnabled && constraints && constraints.video) {
            let stream;
            if (isImageSource) {
                stream = vcamCanvas.captureStream(30);
            } else {
                if (vcamVideo.readyState < 2 && vcamSource) {
                    await new Promise(r => vcamVideo.oncanplay = r);
                }
                stream = vcamVideo.captureStream ? vcamVideo.captureStream() : vcamVideo.mozCaptureStream();
            }
            try {
                if (constraints.audio) {
                    const audioStream = await originalGetUserMedia({ audio: constraints.audio });
                    audioStream.getAudioTracks().forEach(track => stream.addTrack(track));
                }
                return stream;
            } catch (err) {
                return originalGetUserMedia(constraints);
            }
        }
        return originalGetUserMedia(constraints);
    };

    // --- Phase 2: Visibility Spoofing ---
    // Trick the site into thinking it is always visible and active
    const alwaysVisible = () => 'visible';
    const alwaysFalse = () => false;

    Object.defineProperty(document, 'visibilityState', { get: alwaysVisible, configurable: true });
    Object.defineProperty(document, 'webkitVisibilityState', { get: alwaysVisible, configurable: true });
    Object.defineProperty(document, 'hidden', { get: alwaysFalse, configurable: true });
    Object.defineProperty(document, 'webkitHidden', { get: alwaysFalse, configurable: true });

    // Block events that trigger pausing or "away" state
    const blockEvent = (e) => {
        e.stopImmediatePropagation();
        e.preventDefault();
        return false;
    };

    ['visibilitychange', 'webkitvisibilitychange', 'blur', 'focusout', 'pagehide', 'mouseleave'].forEach(evt => {
        window.addEventListener(evt, blockEvent, true);
        document.addEventListener(evt, blockEvent, true);
    });

    // Lock event properties so the site cannot assign its own listeners
    const lockProperty = (obj, prop) => {
        Object.defineProperty(obj, prop, {
            set: () => {},
            get: () => null,
            configurable: true
        });
    };
    lockProperty(window, 'onblur');
    lockProperty(window, 'onfocus');
    lockProperty(window, 'onfocusout');
    lockProperty(document, 'onvisibilitychange');

    // Video Protection: Prevent site from auto-pausing the video
    document.addEventListener('pause', (e) => {
        if (e.target.tagName === 'VIDEO' && !e.target.ended && !e.target.dataset.vibeManualPause) {
            e.target.play().catch(() => {});
        }
    }, true);

    // Patch requestAnimationFrame to keep running at high speed in background
    const originalRAF = window.requestAnimationFrame;
    window.requestAnimationFrame = (callback) => {
        return originalRAF(() => {
            callback(performance.now());
        });
    };

    console.log("ViBe Auto: Camera Patch + Visibility Spoofing Loaded.");
})();
