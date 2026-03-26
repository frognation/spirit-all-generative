//==============================================================
//  EXPORT
//  - Functions to export images or other data from the
//    simulation.
//==============================================================

import parameterValues from './parameterValues';
import { simulationUniforms, displayUniforms } from './uniforms';
import * as THREE from 'three';
import JSZip from 'jszip';

let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let recordingStoppedCallback = null; // optional callback (e.g. to update UI labels)
let screenshotInterval;

export function exportImage() {
  let link = document.createElement('a');
  link.download = 'reaction-diffusion.png';
  link.href = renderer.domElement.toDataURL();
  link.click();
  link.remove();
}

export function startVideoRecording(onStopCb) {
  if (isRecording) {
    stopVideoRecording();
    return;
  }

  if (!('MediaRecorder' in window)) {
    alert('MediaRecorder API not supported in this browser.');
    return;
  }

  recordingStoppedCallback = onStopCb;

  // Get the canvas stream
  const canvas = renderer.domElement;
  // Try higher frame rate if possible; fall back to 30
  const stream = canvas.captureStream(60) || canvas.captureStream(30);

  recordedChunks = [];
  try {
    mediaRecorder = new MediaRecorder(stream, {
      mimeType: 'video/webm;codecs=vp9'
    });
  } catch(e) {
    try {
      mediaRecorder = new MediaRecorder(stream, {
        mimeType: 'video/webm;codecs=vp8'
      });
    } catch(err) {
      alert('Unable to start recording: ' + err.message);
      return;
    }
  }

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = () => {
    const blob = new Blob(recordedChunks, {
      type: 'video/webm'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = 'reaction-diffusion-recording.webm';
    link.href = url;
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    if (recordingStoppedCallback) recordingStoppedCallback();
  };

  mediaRecorder.start();
  isRecording = true;

  const screenshots = [];
  // Capture screenshots at 30 FPS
  screenshotInterval = setInterval(() => {
    canvas.toBlob((blob) => {
      if (blob) {
        screenshots.push(blob);
      }
    }, 'image/png');
  }, 1000 / 30);

  // Stop recording logic
  window.stopRecording = () => {
    clearInterval(screenshotInterval);

    if (screenshots.length > 0) {
      // Create a ZIP file containing all screenshots
      const zip = new JSZip();
      screenshots.forEach((blob, index) => {
        zip.file(`frame-${index + 1}.png`, blob);
      });

      zip.generateAsync({ type: 'blob' }).then((content) => {
        const downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(content);
        downloadLink.download = 'screenshots.zip';
        downloadLink.click();
      });
    }

    if (onStopCb) onStopCb();
  };
}

export function stopVideoRecording() {
  if (mediaRecorder && isRecording) {
    mediaRecorder.stop();
    isRecording = false;
  }
}

export function isVideoRecording() {
  return isRecording;
}

// Apply current parameterValues to GPU uniforms (used after loading settings)
export function applySettingsToUniforms() {
  // Core parameters
  simulationUniforms.f.value = parameterValues.f;
  simulationUniforms.k.value = parameterValues.k;
  simulationUniforms.dA.value = parameterValues.dA;
  simulationUniforms.dB.value = parameterValues.dB;
  simulationUniforms.timestep.value = parameterValues.timestep;

  // Style map related (only if image loaded)
  simulationUniforms.styleMapParameters.value.set(
    parameterValues.styleMap.f,
    parameterValues.styleMap.k,
    parameterValues.styleMap.dA,
    parameterValues.styleMap.dB
  );
  simulationUniforms.bias.value.set(parameterValues.bias.x, parameterValues.bias.y);
  simulationUniforms.styleMapTransforms.value.set(
    parameterValues.styleMap.scale,
    parameterValues.styleMap.rotation * Math.PI/180,
    parameterValues.styleMap.translate.x,
    parameterValues.styleMap.translate.y
  );

  // Rendering style
  displayUniforms.renderingStyle.value = parseInt(parameterValues.renderingStyle) || 0;

  // Gradient colors
  const gc = parameterValues.gradientColors;
  const stops = [1,2,3,4,5];
  stops.forEach(i => {
    if (gc['color'+i+'Enabled']) {
      displayUniforms['colorStop'+i].value = new THREE.Vector4(
        gc['color'+i+'RGB'].r/255,
        gc['color'+i+'RGB'].g/255,
        gc['color'+i+'RGB'].b/255,
        gc['color'+i+'Stop']
      );
    } else {
      displayUniforms['colorStop'+i].value = new THREE.Vector4(-1,-1,-1,-1);
    }
  });

  // HSL mapping
  displayUniforms.hslFrom.value.set(parameterValues.hsl.from.min, parameterValues.hsl.from.max);
  displayUniforms.hslTo.value.set(parameterValues.hsl.to.min, parameterValues.hsl.to.max);
  displayUniforms.hslSaturation.value = parameterValues.hsl.saturation;
  displayUniforms.hslLuminosity.value = parameterValues.hsl.luminosity;
}

export function saveSettings() {
  const settings = {
    timestamp: new Date().toISOString(),
    parameters: {
      f: parameterValues.f,
      k: parameterValues.k,
      dA: parameterValues.dA,
      dB: parameterValues.dB,
      timestep: parameterValues.timestep,
      renderingStyle: parameterValues.renderingStyle,
      useSmoothing: parameterValues.useSmoothing,
      seed: { ...parameterValues.seed },
      gradientColors: { ...parameterValues.gradientColors },
      hsl: { ...parameterValues.hsl },
      canvas: { ...parameterValues.canvas },
      styleMap: { ...parameterValues.styleMap },
      bias: { ...parameterValues.bias }
    }
  };

  const dataStr = JSON.stringify(settings, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  
  const link = document.createElement('a');
  link.download = `reaction-diffusion-settings-${Date.now()}.json`;
  link.href = URL.createObjectURL(dataBlob);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

export function loadSettings(rebuildUICallback) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  
  input.onchange = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const settings = JSON.parse(e.target.result);
        
        if (settings.parameters) {
          // Apply the loaded settings to parameterValues
          Object.assign(parameterValues, settings.parameters);
          // Apply to uniforms
            applySettingsToUniforms();
          
          // Trigger UI rebuild callback if provided
          if (rebuildUICallback) {
            rebuildUICallback();
          }
          
          console.log('Settings loaded successfully');
        } else {
          console.error('Invalid settings file format');
          alert('Invalid settings file format');
        }
      } catch (error) {
        console.error('Error loading settings:', error);
        alert('Error loading settings file. Please check the file format.');
      }
    };
    
    reader.readAsText(file);
  };
  
  input.click();
}