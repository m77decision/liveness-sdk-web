class Liveness {
  constructor(videoWrapper, options) {
    this.uploadInProgress = 0;
    this.requestType = "b64";
    this.counterNotFoundFace = 0;
    this.faceapi = null;
    this.token = options.token;
    this.videoWrapper = videoWrapper;
    this.configFrameBox = options.frameBox;
    
    this.boxMessages = {
      unmatchedFace: "Face não encaixada",
      keepNeutralFace: "Mantenha expressão neutra",
      centerYourFace: "Centralize seu rosto",
      darkEnvironment: "O ambiente está escuro",
      positionFaceWithinFrame: "Posicione seu rosto dentro da moldura",
      moveFaceAway: "Afaste seu rosto",
      moveFaceCloser: "Aproxime seu rosto",
      moveFaceDown: "Mova o rosto para baixo",
      moveFaceUp: "Mova o rosto para cima"
    };

    if (options.scalingFactorForLiveness && options.scalingFactorForLiveness !== 0 && options.scalingFactorForLiveness <= 3) {
      this.scalingFactorForLiveness = options.scalingFactorForLiveness;
    } else {
      this.scalingFactorForLiveness = 1;
    }

    this.config = {
      ellipseMaskWidth: options.ellipseMaskWidth,
      ellipseMaskHeight: options.ellipseMaskHeight,
      ellipseMaskTop: options.ellipseMaskTop,
      ellipseMaskLeft: options.ellipseMaskLeft,
      mobileFacingMode: options.mobileFacingMode || "user",
      width: options.width || this.getFullWidth(),
      height: options.height || this.getFullHeight(),
      useWebgl2: options.useWebgl2
    };

    this.config.heightAspectRatio = this.isMobile() ? this.config.width * (4 / 3) : this.config.width / (4 / 3);
    this.config.isDebug = options.isDebug;

    const style = document.createElement("style");
    style.innerText = this.cssOrientationLock();
    document.head.appendChild(style);

    this.brightnessControl = options.brightnessControl ? options.brightnessControl : 95;
    this.luminanceControl = options.luminanceControl ? options.luminanceControl : 23;

    this.faceapiPath = options.faceapiPath;
    this.isShowPreview = options.isShowPreview;
    this.errorCallback = options.errorCallback;
    this.successCallback = options.successCallback;
    this.livenessUrlBase = options.livenessUrlBase;
    this.livenessConfirmEndpoint = options.livenessConfirmEndpoint || "/liveness/v2";
    this.ellipseStrokeStyleDefault = options.ellipseStrokeStyle || "#D02780";
    this.activatedEllipseStrokeStyle = options.activatedEllipseStrokeStyle || "#46E3C3";
    this.boxMessageBackgroundColor = options.boxMessageBackgroundColor || "#D02780";
    this.boxMessageTextColor = options.boxMessageTextColor || "#f3f3f5";
    this.configEyesBoxHeight = options.configEyesBoxHeight || 20;

    this.requestAnimationFrame = window.requestAnimationFrame;
    this.shouldCheckNeutralFace = options.shouldCheckNeutralFace || false;
    this.facetimeInterval = options.facetimeInterval || 150;
    this.timeToDetectFace = options.timeToDetectFace || 6000;
    this.showNotFoundModal = options.showNotFoundModal || false;
    this.cameraPermissionErrorCallback = options.cameraPermissionErrorCallback || null;
  }

  getFullWidth() {
    return Math.max(document.body.scrollWidth, document.documentElement.scrollWidth, document.body.offsetWidth, document.documentElement.offsetWidth, document.documentElement.clientWidth);
  }

  getFullHeight() {
    return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.body.offsetHeight, document.documentElement.offsetHeight, document.documentElement.clientHeight);
  }

  setUseBase64() {
    this.requestType = "b64";
  }

  setUseFormData() {
    this.requestType = "formData";
  }

  setMinBrightness(brightness) {
    this.brightnessControl = brightness;
  }

  setMinLuminance(luminance) {
    this.luminanceControl = luminance;
  }

  setMobileFaceCam() {
    this.config.mobileFacingMode = "user";
    this.resetLiveness();
  }

  setMobileEnvironmentCam() {
    this.config.mobileFacingMode = "environment";
    this.resetLiveness();
  }

  setFrameBoxesWidth(eyesInner, eyesOutter, box) {
    this.configFrameBox = { eyesInner, eyesOutter, box };
  }

  setDimensionsRequestImage(width, height) {
    this.config.dimensions = { width, height };
  }

  toggleDebug() {
    this.config.isDebug = !this.config.isDebug;
    if (!this.config.isDebug) {
      this.canvas.getContext("2d").clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
  }

  setEyesBoxHeight(height) {
    this.configEyesBoxHeight = height;
  }

  stop() {
    this.video.pause();
    this.stream.getTracks().forEach(track => track.stop());
    clearInterval(this.timer);
    clearInterval(this.timerBackground);
  }

  setCheckNeutralFace(shouldCheck) {
    this.shouldCheckNeutralFace = shouldCheck;
  }

  async start(callback) {
    this.startCallbackFunction = callback;
    if (window.faceapi) {
      this.faceapi = window.faceapi;
      this.setLiveness();
    } else {
      await this.loadFaceApi();
    }
  }

  setLiveness() {
    this.setLoading();
    this.createVideoElement().startVideo().createModalConfirmationWrapper().createModalConfirmation();
  }

  destroyLiveness() {
    this.stop();
    this.removeCanvas();
    this.resetVideoWrapper();
  }

  resetLiveness() {
    this.stop();
    this.removeCanvas();
    this.resetVideoWrapper();
    this.closePreviewModal();
    this.base64 = "";
    this.removeLoading();
    this.setLiveness();
  }

  cssOrientationLock() {
    return "@media screen and (min-width: 320px) and (max-width: 767px) and (orientation: landscape) { html { transform: rotate(-90deg);transform-origin: left top;width: 100vh;overflow-x: hidden;position: absolute;top: 100%;left: 0;}}";
  }

  createCanvasBackground() {
    this.canvasBackground = document.createElement("canvas");
    this.videoWrapper.clientWidth;
    this.getDevicePixelRatio();
    this.videoWrapper.clientHeight;
    this.getDevicePixelRatio();
    
    this.canvasBackground.width = this.isMobile() ? this.video.clientWidth * (window.devicePixelRatio || 2) : this.config.width;
    this.canvasBackground.height = this.isMobile() ? this.config.heightAspectRatio * (window.devicePixelRatio || 2) : this.config.height;
    
    if (this.scalingFactorForLiveness) {
      this.canvasBackground.width = this.canvasBackground.width * this.scalingFactorForLiveness;
      this.canvasBackground.height = this.canvasBackground.height * this.scalingFactorForLiveness;
    }
    
    if (this.config.dimensions) {
      this.canvasBackground.width = this.config.dimensions.width;
      this.canvasBackground.height = this.config.dimensions.height;
    }
    
    this.canvasBackground.style.display = "none";
  }

  sweepVideo(imageData) {
    this.luminanceAvg = 0;
    this.brightnessSum = 0;
    this.luminanceArray = [];
    for (let i = 0; i < imageData.length; i += 4) {
      const r = imageData[i];
      const g = imageData[i + 1];
      const b = imageData[i + 2];
      this.sweepBrightness(r, g, b);
      this.sweepLuminance(r, g, b);
    }
    this.checkBrightness();
  }

  isMobile() {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  }

  checkBrightness() {
    this.brightness = Math.floor(this.brightnessSum / (this.canvasLuminance.width * this.canvasLuminance.height));
  }

  sweepBrightness(r, g, b) {
    this.brightnessSum += Math.floor((r + g + b) / 3);
  }

  sweepLuminance(r, g, b) {
    const luminance = this.calcLuminance(r, g, b);
    this.luminanceAvg += luminance;
    this.luminanceArray.push(luminance);
    this.luminance = (this.luminanceAvg / this.luminanceArray?.length) * 100;
  }

  calcLuminance(r, g, b) {
    let s;
    let n = [r, g, b];
    for (let i = 0; i < n.length; i++) {
      s = n[i] / 255;
      if (s <= 0.03928) {
        s /= 12.92;
      } else {
        s = Math.pow((s + 0.055) / 1.055, 2.4);
      }
      n[i] = s;
    }
    return 0.2126 * n[0] + 0.7152 * n[1] + 0.0722 * n[2] + 0.05;
  }

  getDevicePixelRatio() {
    let query;
    const isFirefox = navigator.userAgent.toLowerCase().indexOf("firefox") > -1;
    if (window.devicePixelRatio === undefined || isFirefox) {
      if (window.matchMedia) {
        query = "(-webkit-min-device-pixel-ratio: 1.5), (min--moz-device-pixel-ratio: 1.5), (-o-min-device-pixel-ratio: 3/2), (min-resolution: 1.5dppx)";
        if (window.matchMedia(query).matches) return 1.5;
        
        query = "(-webkit-min-device-pixel-ratio: 2), (min--moz-device-pixel-ratio: 2), (-o-min-device-pixel-ratio: 2/1), (min-resolution: 2dppx)";
        if (window.matchMedia(query).matches) return 2;
        
        query = "(-webkit-min-device-pixel-ratio: 0.75), (min--moz-device-pixel-ratio: 0.75), (-o-min-device-pixel-ratio: 3/4), (min-resolution: 0.75dppx)";
        if (window.matchMedia(query).matches) return 1.5;
        
        return undefined;
      }
      return 1;
    }
    return window.devicePixelRatio;
  }

  async loadFaceApi() {
    const script = document.createElement("script");
    const src = `${this.faceapiPath}/face-api.min.js`;
    script.src = src;
    document.head.append(script);
    script.onload = async () => {
      await this.loadFaceApiModels();
    };
    return this;
  }

  async loadFaceApiModels() {
    try {
      await window.faceapi.tf.setBackend("wasm");
      await window.faceapi.tf.ready();
      console.log(`Usando backend: ${window.faceapi.tf.getBackend()}`);
      
      await Promise.all([
        window.faceapi.nets.faceLandmark68Net.loadFromUri(this.faceapiPath),
        window.faceapi.nets.faceExpressionNet.loadFromUri(this.faceapiPath),
        window.faceapi.nets.faceRecognitionNet.loadFromUri(this.faceapiPath),
        window.faceapi.nets.tinyFaceDetector.loadFromUri(this.faceapiPath)
      ]);
      
      console.log("Models were loaded");
      this.faceapi = window.faceapi;
      this.setLiveness();
    } catch (e) {
      console.error("Erro ao carregar FaceAPI:", e);
    }
    return this;
  }

  startVideo() {
    if (navigator.mediaDevices === undefined) {
      navigator.mediaDevices = {};
    }
    if (navigator.mediaDevices.getUserMedia === undefined) {
      navigator.mediaDevices.getUserMedia = function(constraints) {
        const getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
        if (!getUserMedia) {
          return Promise.reject(new Error("getUserMedia não implementado nesse browser"));
        }
        return new Promise(function(resolve, reject) {
          getUserMedia.call(navigator, constraints, resolve, reject);
        });
      };
    }
    
    navigator.mediaDevices.enumerateDevices().then(devices => {
      const constraints = {
        video: { width: this.config.width, height: this.config.height, frameRate: 24 }
      };
      
      if (this.isMobile()) {
        constraints.video = { facingMode: this.config.mobileFacingMode };
      } else {
        const videoInput = devices.filter(d => d.kind === "videoinput" && !d.label.includes("m-de:vice"))[0];
        if (videoInput) {
          constraints.video.deviceId = videoInput.deviceId;
        }
      }
      
      navigator.mediaDevices.getUserMedia(constraints).then(stream => {
        const video = document.querySelector("video");
        if (video) {
          this.stream = stream;
          navigator.streamLiveness = stream;
          if ("srcObject" in video) {
            video.srcObject = stream;
          } else {
            video.src = window.URL.createObjectURL(stream);
          }
          if (this.startCallbackFunction) {
            this.startCallbackFunction();
          }
        }
      }).catch(error => {
        if (!this.cameraPermissionErrorCallback) {
          throw new Error(error);
        }
        this.cameraPermissionErrorCallback(error);
      });
    });
    return this;
  }

  createVideoElement() {
    this.videoWrapper.style.position = "relative";
    this.videoWrapper.style.width = this.config.width + "px";
    this.videoWrapper.style.height = this.config.height < this.config.heightAspectRatio ? this.config.height + "px" : this.config.heightAspectRatio + "px";
    
    this.video = document.createElement("video");
    this.video.ariaLabel = "Vídeo da face - Aproxime o rosto em posição de selfie e afaste-o lentamente para enquadrar";
    this.video.style.width = "inherit";
    this.video.style.height = "inherit";
    
    if (this.config.mobileFacingMode === "user") {
      this.video.style.transform = "scaleX(-1)";
    }
    
    this.video.setAttribute("muted", true);
    this.video.setAttribute("autoplay", true);
    this.video.setAttribute("playsinline", "");
    
    this.videoWrapper.append(this.video);
    this.video.addEventListener("play", () => {
      this.loop();
      this.createCanvasBackground();
    });
    return this;
  }

  resetVideoWrapper() {
    const wrapper = document.getElementById("video-wrapper");
    if (wrapper) {
      wrapper.innerHTML = "";
    }
  }

  removeCanvas() {
    const canvas = document.getElementsByTagName("canvas")[0];
    if (canvas) {
      canvas.remove();
    }
  }

  responsiveFrameBoxEyesOutterWidth(width) {
    if (width === 315) {
      return { eyesInner: 0.74, eyesOutter: 0.78, box: 0.55 };
    }
    return { eyesInner: 0.52, eyesOutter: 0.82, box: 0.6 };
  }

  async loop() {
    this.blockMaskMessage = this.boxMessages.unmatchedFace;
    this.canvas = await this.faceapi.createCanvasFromMedia(this.video);
    this.canvas.style.position = "absolute";
    this.canvas.style.left = 0;
    this.canvas.style.top = 0;
    this.videoWrapper.append(this.canvas);
    
    const dimensions = {
      width: this.config.width,
      height: this.config.height < this.config.heightAspectRatio ? this.config.height : this.config.heightAspectRatio
    };
    this.faceapi.matchDimensions(this.canvas, dimensions);
    
    this.boxesWidth = this.responsiveFrameBoxEyesOutterWidth(window.innerWidth);
    if (this.configFrameBox) {
      this.boxesWidth = this.configFrameBox;
    }
    
    const frameBox = {
      width: Math.floor(this.config.width * this.boxesWidth.box),
      height: this.config.height < this.config.heightAspectRatio ? this.config.height : this.config.heightAspectRatio
    };
    if (this.configFrameBox?.height) {
      frameBox.height = this.configFrameBox.height;
    }
    frameBox.left = Math.floor(this.canvas.width / 2 - frameBox.width / 2);
    frameBox.top = Math.floor(this.videoWrapper.clientHeight / 2 - frameBox.height / 2);
    
    const eyeBoxHeightBase = frameBox.height + this.configEyesBoxHeight;
    
    const outterBox = {
      width: Math.floor(frameBox.width * this.boxesWidth.eyesOutter),
      height: Math.floor(eyeBoxHeightBase / 5)
    };
    outterBox.left = Math.floor(frameBox.left + frameBox.width / 1.95 - outterBox.width / 1.95);
    outterBox.top = Math.floor(frameBox.top + 0.3 * frameBox.height);
    
    const innerBox = {
      width: Math.floor(frameBox.width * this.boxesWidth.eyesInner),
      height: Math.floor(eyeBoxHeightBase / 5)
    };
    innerBox.left = Math.floor(frameBox.left + frameBox.width / 1.96 - innerBox.width / 1.96);
    innerBox.top = Math.floor(frameBox.top + 0.3 * frameBox.height);
    
    this.ellipseMaskWidth = this.config.ellipseMaskWidth ? frameBox.width / this.config.ellipseMaskWidth : frameBox.width / 2;
    this.ellipseMaskHeight = this.config.ellipseMaskHeight ? frameBox.height / this.config.ellipseMaskHeight : frameBox.height / 2.5;
    this.ellipseMaskTop = this.config.ellipseMaskTop ? (frameBox.top + frameBox.height) / this.config.ellipseMaskTop : (frameBox.top + frameBox.height) / 1.9;
    this.ellipseMaskLeft = this.config.ellipseMaskLeft ? outterBox.left + outterBox.width / this.config.ellipseMaskLeft : outterBox.left + outterBox.width / 2;
    this.ellipseMaskLineWidth = 2;
    
    this.createMessageBox();
    
    const context = this.canvas.getContext("2d");
    context.translate(this.canvas.width, 0);
    context.scale(-1, 1);
    this.drawEllipse(context);
    
    if (this.config.isDebug) {
      this.draw(context, this.canvas, frameBox, innerBox, outterBox);
    }
    
    if (this.isMobile()) {
      this.isBackgroundOK = true;
    } else {
      this.timerBackground = setInterval(() => {
        this.checkBackground();
      }, 1000);
    }
    
    const state = { counter: 0, inProgress: false, done: false };
    const rect = this.canvas.getBoundingClientRect();
    
    this.timer = setInterval(async () => {
      if (!navigator.onLine) {
        this.setHasNoNetwork();
        return;
      }
      if (state.inProgress || state.done) return;
      state.inProgress = true;
      
      const detectionResult = await this.faceapi.detectSingleFace(
        this.video, 
        new this.faceapi.TinyFaceDetectorOptions({ inputSize: 160, scoreThreshold: 0.25 })
      ).withFaceLandmarks().withFaceExpressions();
      
      this.removeLoading();
      
      const detectionThreshold = this.timeToDetectFace / this.facetimeInterval;
      if (this.showNotFoundModal && this.counterNotFoundFace > detectionThreshold) {
        this.toggleModalFaceNotFound();
      }
      
      if (!detectionResult) {
        this.blockMaskMessage = this.boxMessages.unmatchedFace;
        this.blockMask(rect, frameBox.left, frameBox.top, frameBox.height, frameBox.width);
        state.counter = 0;
        state.inProgress = false;
        this.counterNotFoundFace++;
        return;
      }
      
      this.counterNotFoundFace = 0;
      
      const resizedResult = this.faceapi.resizeResults(detectionResult, {
        width: this.config.width,
        height: this.config.height < this.config.heightAspectRatio ? this.config.height : this.config.heightAspectRatio
      });
      
      if (resizedResult && resizedResult.expressions && this.shouldCheckNeutralFace) {
        const expression = this.getExpression(resizedResult.expressions);
        if (expression !== "neutral") {
          if (this.config.isDebug) {
            this.blockMaskMessage = `${this.boxMessages.keepNeutralFace} >> ${expression}`;
          } else {
            this.blockMaskMessage = this.boxMessages.keepNeutralFace;
          }
          this.blockMask(rect, frameBox.left, frameBox.top, frameBox.height, frameBox.width);
          state.counter = 0;
          state.inProgress = false;
          return;
        }
      }
      
      if (resizedResult.detection) {
        const pose = this.getPose(resizedResult);
        if (pose !== "front") {
          if (this.config.isDebug) {
            this.blockMaskMessage = `${this.boxMessages.centerYourFace} >> ${pose}`;
          } else {
            this.blockMaskMessage = this.boxMessages.centerYourFace;
          }
          this.blockMask(rect, frameBox.left, frameBox.top, frameBox.height, frameBox.width);
          state.counter = 0;
          state.inProgress = false;
          return;
        }
        
        const jawLine = resizedResult.landmarks.getJawOutline();
        if (this.isRotatedFace(jawLine[0], jawLine[16])) {
          if (this.config.isDebug) {
            this.blockMaskMessage = `${this.boxMessages.centerYourFace} >> rotacionado`;
          } else {
            this.blockMaskMessage = this.boxMessages.centerYourFace;
          }
          this.blockMask(rect, frameBox.left, frameBox.top, frameBox.height, frameBox.width);
          state.counter = 0;
          state.inProgress = false;
          return;
        }
        
        if (this.config.isDebug) {
          this.draw(context, this.canvas, frameBox, innerBox, outterBox);
          context.beginPath();
          context.lineWidth = "5";
          context.strokeStyle = "#FFFF00";
          context.moveTo(jawLine[0].x, jawLine[0].y);
          context.lineTo(jawLine[16].x, jawLine[16].y);
          context.stroke();
        }
        
        const leftJaw = {
          meanPosition: [jawLine[0].x, jawLine[0].y],
          frameBox: { isInside: false },
          outterBox: { isInside: false },
          innerBox: { isInside: false }
        };
        const rightJaw = {
          meanPosition: [jawLine[16].x, jawLine[16].y],
          frameBox: { isInside: false },
          outterBox: { isInside: false },
          innerBox: { isInside: false }
        };
        
        leftJaw.frameBox.isInside = this.isInside(leftJaw.meanPosition, { top: frameBox.top, left: frameBox.left, width: frameBox.width, height: frameBox.height });
        rightJaw.frameBox.isInside = this.isInside(rightJaw.meanPosition, { top: frameBox.top, left: frameBox.left, width: frameBox.width, height: frameBox.height });
        leftJaw.outterBox.isInside = this.isInside(leftJaw.meanPosition, { top: outterBox.top, left: outterBox.left, width: outterBox.width, height: outterBox.height });
        rightJaw.outterBox.isInside = this.isInside(rightJaw.meanPosition, { top: outterBox.top, left: outterBox.left, width: outterBox.width, height: outterBox.height });
        leftJaw.innerBox.isInside = this.isInside(leftJaw.meanPosition, { top: innerBox.top, left: innerBox.left, width: innerBox.width, height: innerBox.height });
        rightJaw.innerBox.isInside = this.isInside(rightJaw.meanPosition, { top: innerBox.top, left: innerBox.left, width: innerBox.width, height: innerBox.height });
        
        if (!this.isBackgroundOK) {
          this.blockMaskMessage = this.boxMessages.darkEnvironment;
          this.blockMask(rect, frameBox.left, frameBox.top, frameBox.height, frameBox.width);
          state.counter = 0;
          state.inProgress = false;
          return;
        }
        
        if (!leftJaw.frameBox.isInside || !rightJaw.frameBox.isInside) {
          this.blockMaskMessage = this.boxMessages.positionFaceWithinFrame;
          this.blockMask(rect, frameBox.left, frameBox.top, frameBox.height, frameBox.width);
          state.counter = 0;
          state.inProgress = false;
          return;
        }
        
        if (!leftJaw.outterBox.isInside || !rightJaw.outterBox.isInside) {
          this.blockMaskMessage = this.boxMessages.moveFaceAway;
          this.blockMask(rect, frameBox.left, frameBox.top, frameBox.height, frameBox.width);
          state.counter = 0;
          state.inProgress = false;
          return;
        }
        
        if (leftJaw.innerBox.isInside || rightJaw.innerBox.isInside) {
          this.blockMaskMessage = this.boxMessages.moveFaceCloser;
          this.blockMask(rect, frameBox.left, frameBox.top, frameBox.height, frameBox.width);
          state.counter = 0;
          state.inProgress = false;
          return;
        }
        
        this.ellipseMaskLineWidth *= 2;
        this.activateEllipseMask();
        state.counter += 1;
        state.inProgress = false;
        
        if (state.counter >= 2) {
          state.done = true;
          this.takePicture();
          clearInterval(this.timer);
          if (this.timerBackground) {
            clearInterval(this.timerBackground);
          }
        }
      }
    }, this.facetimeInterval);
  }

  activateEllipseMask() {
    const context = this.canvas.getContext("2d");
    this.drawEllipse(context, this.activatedEllipseStrokeStyle);
  }

  deactivateEllipseMask() {
    const context = this.canvas.getContext("2d");
    this.ellipseMaskLineWidth = 3;
    this.drawEllipse(context);
  }

  draw(context, canvas, frameBox, innerBox, outterBox) {
    context.clearRect(0, 0, canvas.width, canvas.height);
    
    context.beginPath();
    context.lineWidth = 3;
    context.strokeStyle = "blue";
    context.rect(frameBox.left, frameBox.top, frameBox.width, frameBox.height);
    context.stroke();
    
    context.beginPath();
    context.lineWidth = 2;
    context.strokeStyle = "yellow";
    context.rect(outterBox.left, outterBox.top, outterBox.width, outterBox.height);
    context.stroke();
    
    context.beginPath();
    context.lineWidth = 2;
    context.strokeStyle = "red";
    context.rect(innerBox.left, innerBox.top, innerBox.width, innerBox.height);
    context.stroke();
    
    this.drawEllipse(context);
  }

  drawEllipse(context, strokeStyle) {
    const x = this.ellipseMaskLeft;
    const y = this.ellipseMaskTop;
    const radiusX = this.ellipseMaskWidth;
    const radiusY = this.ellipseMaskHeight;
    
    context.beginPath();
    context.lineWidth = this.ellipseMaskLineWidth;
    context.ellipse(x, y, radiusX, radiusY, 0, 0, 2 * Math.PI);
    context.strokeStyle = strokeStyle || this.ellipseStrokeStyleDefault;
    context.stroke();
  }

  getExpression(expressions) {
    const expArray = [];
    for (const [expression, confidence] of Object.entries(expressions)) {
      expArray.push({ expression, confidence });
    }
    const result = expArray.sort((a, b) => a.confidence - b.confidence).pop();
    return result && result.expression ? result.expression : null;
  }

  getPose(detectionResult) {
    const rightEye = this.getMeanPosition(detectionResult.landmarks.getRightEye());
    const leftEye = this.getMeanPosition(detectionResult.landmarks.getLeftEye());
    const nose = this.getMeanPosition(detectionResult.landmarks.getNose());
    const mouth = this.getMeanPosition(detectionResult.landmarks.getMouth());
    
    const verticalPos = (this.getTop(detectionResult.landmarks.getJawOutline()) - mouth[1]) / detectionResult.detection.box.height + 0.45;
    const horizontalPos = (leftEye[0] + (rightEye[0] - leftEye[0]) / 2 - nose[0]) / detectionResult.detection.box.width;
    
    let pose = "undetected";
    if (detectionResult.detection.score > 0.3) {
      pose = "front";
      if (verticalPos > 0.2) {
        pose = "top";
      } else if (verticalPos < -0.1) {
        pose = "bottom";
      } else if (horizontalPos < -0.04) {
        pose = "left";
      } else if (horizontalPos > 0.04) {
        pose = "right";
      }
    }
    return pose;
  }

  isRotatedFace(point1, point2) {
    return Math.abs(180 * Math.atan2(point2.y - point1.y, point2.x - point1.x) / Math.PI) > 7;
  }

  getMeanPosition(points) {
    return points.map(p => [p.x, p.y]).reduce((acc, curr) => [acc[0] + curr[0], acc[1] + curr[1]]).map(val => val / points.length);
  }

  getTop(points) {
    return points.map(p => p.y).reduce((acc, curr) => Math.min(acc, curr));
  }

  isInside(point = [], box = {}) {
    return !(point[1] < box.top || point[0] < box.left || point[1] > box.top + box.height || point[0] > box.left + box.width);
  }

  blockMask(rect, left, top, height, width) {
    const mask = { width: 230, height: 35 };
    mask.top = top + height + 20;
    mask.left = left + width / 2 - mask.width / 2;
    
    if (this.blockMaskMessage === this.cachedBlockMaskMessage) return;
    
    this.cachedBlockMaskMessage = this.blockMaskMessage;
    this.deactivateEllipseMask();
    this.msg.innerHTML = "";
    
    const span = document.createElement("span");
    span.ariaLabel = this.blockMaskMessage;
    span.role = "alert";
    span.ariaLive = "assertive";
    span.textContent = this.blockMaskMessage;
    span.style = `
      display: flex;
      color: ${this.boxMessageTextColor};
      font-size: 1.1rem;
      padding: 10px 20px;
      text-align: center;
      align-items: center;
      background: ${this.boxMessageBackgroundColor};
      border-radius: 7px;
      justify-content: center;
      width: ${mask.width}px;
      font-family: Prompt, sans-serif;
    `;
    
    this.msg.style.display = "flex";
    this.msg.appendChild(span);
  }

  takePicture() {
    const context = this.canvasBackground.getContext("2d");
    this.canvasBackground.style.display = "none;";
    this.createFlashMask();
    
    context.drawImage(this.video, 0, 0, this.canvasBackground.width, this.canvasBackground.height);
    context.fillStyle = "rgb(71,84,68)";
    context.fillRect(20, 50, 1, 1);
    context.fillStyle = "rgb(211,190,124)";
    context.fillRect(422, 522, 1, 1);
    
    const imageData = context.getImageData(0, 0, this.canvasBackground.width, this.canvasBackground.height);
    context.putImageData(imageData, 0, 0);
    
    this.base64 = this.canvasBackground.toDataURL("image/png");
    
    setTimeout(() => {
      this.removeFlashMask();
      if (this.isShowPreview) {
        this.openPreviewModal();
      } else {
        this.confirmPicture();
      }
    }, 300);
  }

  checkBackground() {
    this.canvasLuminance = document.createElement("canvas");
    this.videoWrapper.clientWidth;
    this.videoWrapper.clientHeight;
    
    const context = this.canvasLuminance.getContext("2d");
    context.drawImage(this.video, 0, 0, this.canvasLuminance.width, this.canvasLuminance.height);
    
    const imageData = context.getImageData(0, 0, this.canvasLuminance.width, this.canvasLuminance.height);
    this.sweepVideo(imageData.data);
    this.isBackgroundOK = this.brightness >= this.brightnessControl && this.luminance >= this.luminanceControl;
    
    if (this.config.isDebug) {
      const logData = {
        brilho: { atual: this.brightness, "mín aceitável": this.brightnessControl },
        "luminância": { atual: parseFloat(this.luminance.toFixed(2)), "mín aceitável": this.luminanceControl }
      };
      console.table(logData);
    }
  }

  createFlashMask() {
    const flash = document.createElement("div");
    flash.style.width = "100%";
    flash.style.height = "100vh";
    flash.style.position = "fixed";
    flash.style.background = "white";
    flash.style.zIndex = 999;
    flash.style.top = 0;
    flash.style.left = 0;
    flash.id = "flash";
    document.body.append(flash);
  }

  removeFlashMask() {
    document.getElementById("flash").remove();
  }

  createMessageBox() {
    const existingBox = document.getElementById("liveness-box-message");
    if (existingBox) existingBox.remove();
    
    this.msg = document.createElement("div");
    this.msg.id = "liveness-box-message";
    this.msg.style = `
      display: flex;
      justify-content: center;
      align-items: center;
      width: 100%;
      z-index: 999;
      background: transparent;
      position: absolute;
      top: ${this.ellipseMaskTop + this.ellipseMaskHeight}px;
    `;
    this.videoWrapper.append(this.msg);
    return this;
  }

  toggleModalFaceNotFound() {
    if (document.getElementById("modal-liveness-face-not-found")) return;
    
    const overlay = document.createElement("div");
    overlay.id = "modal-liveness-face-not-found";
    overlay.style = `
      top: 0; left: 0; z-index: 21; width: 100%; height: 100%; position: fixed;
      display: grid; align-items: flex-start; justify-content: center;
      background: rgba(20, 20, 20, 0.95);
    `;
    
    const modal = document.createElement("div");
    modal.style = `
      gap: 10px; margin-top: 50px; padding: 15px 10px; display: grid;
      background: white; border-radius: 7px; position: relative;
      align-items: center; justify-content: center; font-family: Prompt, sans-serif;
    `;
    modal.innerHTML = `
      <h3>Atenção</h3>
      <p role="alert" style="width: 100%">Não foi possível realizar a captura, tente novamente:</p>
      <ul style="width: 100%; display: grid; gap: 5px;">
        <li>Em um fundo neutro, de preferência com uma parede clara</li>
        <li>Em um ambiente com iluminação neutra (nem muito claro nem muito escuro)</li>
        <li>Removendo os adereços que prejudiquem a visualização da sua face, como cachecol, tocas, bonés e fones</li>
      </ul>
    `;
    
    const btn = document.createElement("button");
    btn.textContent = "OK";
    btn.style = `
      color: #555; right: 10px; width: 130px; height: 30px; bottom: 10px;
      cursor: pointer; background: #fff; font-weight: 600; border-radius: 7px;
      margin-right: 10px; border: 1px solid #222;
    `;
    
    const btnContainer = document.createElement("div");
    btnContainer.style = `
      z-index: 1; width: 100%; display: flex; padding: 10px 0; justify-content: center;
    `;
    
    btnContainer.append(btn);
    modal.append(btnContainer);
    overlay.append(modal);
    
    btn.addEventListener("click", () => {
      this.counterNotFoundFace = 0;
      const foundModal = document.getElementById("modal-liveness-face-not-found");
      if (foundModal) foundModal.remove();
    });
    
    document.body.append(overlay);
    btn.focus();
    return this;
  }

  createModalConfirmationWrapper() {
    this.modalWrapper = document.createElement("div");
    this.modalWrapper.style = `
      top: 0; left: 0; z-index: 999;
      width: ${this.videoWrapper.style.width};
      height: ${this.videoWrapper.style.height};
      display: none; position: fixed; align-items: flex-start;
      justify-content: center; background: rgba(20, 20, 20, 0.95);
    `;
    this.modalWrapper.id = "modalWrapper";
    document.body.append(this.modalWrapper);
    return this;
  }

  createModalConfirmation() {
    this.modalConfirmation = document.createElement("div");
    this.modalConfirmation.ariaLabel = "Foto tirada com sucesso";
    this.modalConfirmation.role = "alert";
    this.modalConfirmation.style = `
      padding: 7px; display: flex;
      width: ${this.videoWrapper.style.width};
      height: ${this.videoWrapper.style.height};
      background: white; border-radius: 7px; position: relative;
      align-items: center; justify-content: center;
    `;
    
    const confirmBtn = document.createElement("button");
    confirmBtn.textContent = "Confirmar";
    confirmBtn.style = `
      color: #555; right: 10px; width: 160px; height: 50px; bottom: 10px;
      cursor: pointer; background: #fff; font-weight: 600; border-radius: 7px;
      margin-right: 10px; border: 1px solid #222;
    `;
    
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Cancelar";
    cancelBtn.style = `
      color: #444; right: 10px; width: 160px; height: 50px; bottom: 10px;
      cursor: pointer; background: #fff; font-weight: 600; border-radius: 7px;
      margin-right: 10px; border: 1px solid #222;
    `;
    
    const actionsContainer = document.createElement("div");
    actionsContainer.style = `
      right: 0; bottom: 0; z-index: 1; width: 100%; display: flex;
      padding: 10px 0; position: absolute; justify-content: center;
    `;
    
    actionsContainer.append(cancelBtn);
    actionsContainer.append(confirmBtn);
    this.modalConfirmation.append(actionsContainer);
    this.modalWrapper.append(this.modalConfirmation);
    
    confirmBtn.addEventListener("click", () => {
      this.closePreviewModal();
      this.confirmPicture();
    });
    
    cancelBtn.addEventListener("click", () => {
      this.cancelPicture();
    });
    
    confirmBtn.focus();
    return this;
  }

  openPreviewModal() {
    const img = document.createElement("img");
    img.src = this.base64;
    img.style = `
      width: 100%; height: 100%;
      max-width: ${this.videoWrapper.clientWidth};
      object-fit: cover; border-radius: 7px; transform: scaleX(-1);
    `;
    this.modalConfirmation.append(img);
    this.modalWrapper.style.display = "flex";
  }

  closePreviewModal() {
    const wrapper = document.getElementById("modalWrapper");
    if (wrapper) wrapper.remove();
  }

  cancelPicture() {
    this.resetLiveness();
  }

  downloadImage() {
    const link = document.createElement("a");
    link.setAttribute("download", "image.png");
    link.setAttribute("href", this.base64);
    link.click();
    setTimeout(() => {
      link.remove();
    }, 1000);
  }

  setLoading() {
    if (!document.getElementById("spinner")) {
      this.videoWrapper.insertAdjacentHTML("beforeend", `
        <div id="spinner">
          <div class="lds-ripple">
            <div style="color: white"></div>
            <div style="color: white"></div>
          </div>
          <div id="spinner-message" />
          <style>
          #spinner { top: 0; z-index: 999; width: 100%; height: 100%; display: flex; position: absolute; align-items: center; flex-direction: column; justify-content: center; background: rgba(20, 20, 20, 1); }
          #spinner-message { width: 100%; display: flex; }
          .lds-ripple { width: 80px; height: 80px; position: relative; }
          .lds-ripple div { position: absolute; border: 4px solid #000; opacity: 1; border-radius: 50%; border-color: white; animation: lds-ripple 1s cubic-bezier(0, 0.2, 0.8, 1) infinite; }
          .lds-ripple div:nth-child(2) { animation-delay: -0.5s; }
          @keyframes lds-ripple {
            0% { top: 36px; left: 36px; width: 0; height: 0; opacity: 1; color: white; }
            100% { top: 0px; left: 0px; width: 72px; height: 72px; opacity: 0; }
          }
          </style>
        </div>
      `);
    }
  }

  setLoadingAccessibilityProgress() {
    this.removeLoadingAccessibilityProgress();
    this.videoWrapper.insertAdjacentHTML("beforeend", `
      <div id="spinneracc" role="alert" style="opacity: 0">
        <p class="liveness-progress-text-accessibility">
          Aguarde enquanto estamos carregando e analisando a sua selfie
        </p>
      </div>
    `);
  }

  removeLoadingAccessibilityProgress() {
    const spinnerAcc = document.getElementById("spinneracc");
    if (spinnerAcc) spinnerAcc.remove();
  }

  setLoadingProgress() {
    if (document.getElementById("spinner")) return;
    
    const message = this.uploadInProgress === 100 
      ? "<strong>Aguarde enquanto estamos <br /> analisando a sua selfie</strong>" 
      : `Fazendo upload da selfie...<br /> (${this.uploadInProgress?.toFixed(0)}% enviados)`;

    const html = `
      <div id="spinner">
        <p class="liveness-progress-text">${message}</p>
        <style>
        #spinner { top: 0; z-index: 999; width: 100%; height: 100%; display: flex; position: absolute; align-items: center; flex-direction: column; justify-content: center; background: rgba(20, 20, 20, 1); }
        .liveness-progress-text { color: white; text-align: center; }
        .liveness-progress-text strong { opacity: 1; animation: blink-text 1s ease infinite alternate; }
        @keyframes blink-text { from { opacity: 1; } to { opacity: 0.4; } }
        </style>
      </div>
    `;
    this.videoWrapper.insertAdjacentHTML("beforeend", html);
  }

  getTips() {
    const tips = [];
    tips.push(`Tamanho do video: ${this.videoWrapper.style.width} x ${this.videoWrapper.style.height}. Tamanho enviado para a API: ${this.canvasBackground.width}px x ${this.canvasBackground.height}px`);
    
    if ((this.canvasBackground.width / this.canvasBackground.height).toFixed(2) !== "1.33") {
      tips.push("A imagem não está com a proporção adequada. Tente a proporção 4/3 | Por ex.: 640x480, 800x600, 960x720 ou 1024x768");
    }
    
    if (!this.isMobile() && this.canvasBackground.width <= 320) {
      tips.push("O tamanho da imagem está com tamanho e proporção adequados para desktop, porém não para o liveness. Tente usar na configuração inicial o config.scalingFactorForLiveness = 3");
    }
    
    if (!this.isMobile() && this.canvasBackground.width > 320 && this.canvasBackground.width <= 515) {
      tips.push("O tamanho da imagem está com tamanho e proporção adequados para desktop, porém não para o liveness. Tente usar na configuração inicial o config.scalingFactorForLiveness = 2");
    }
    
    if (!this.isMobile() && this.canvasBackground.width > 515 && this.canvasBackground.width < 700) {
      tips.push("O tamanho da imagem está com tamanho e proporção adequados para desktop, porém não para o liveness. Tente usar na configuração inicial o config.scalingFactorForLiveness = 1.5");
    }
    
    return tips.join(", ");
  }

  removeLoading() {
    const spinner = document.getElementById("spinner");
    if (spinner) spinner.remove();
  }

  setHasNoNetwork() {
    if (!document.getElementById("spinner")) {
      this.videoWrapper.insertAdjacentHTML("beforeend", `
        <div id="spinner">
          <div class="lds-ripple">
            <div style="color: white"></div>
            <div style="color: white"></div>
          </div>
          <p>Estamos sem conexão<br />com a internet</p>
          <style>
          #spinner { top: 0; z-index: 999; width: 100%; height: 100%; display: flex; position: absolute; align-items: center; flex-direction: column; justify-content: center; background: rgba(20, 20, 20, 1); }
          .lds-ripple { width: 80px; height: 80px; position: relative; }
          .lds-ripple div { position: absolute; border: 4px solid #000; opacity: 1; border-radius: 50%; border-color: white; animation: lds-ripple 1s cubic-bezier(0, 0.2, 0.8, 1) infinite; }
          .lds-ripple div:nth-child(2) { animation-delay: -0.5s; }
          #spinner p { color: white; text-align: center; animation: blink 1s linear infinite; }
          @keyframes blink { 0% { opacity: 1; } 100% { opacity: 0.2; } }
          @keyframes lds-ripple {
            0% { top: 36px; left: 36px; width: 0; height: 0; opacity: 1; color: white; }
            100% { top: 0px; left: 0px; width: 72px; height: 72px; opacity: 0; }
          }
          </style>
        </div>
      `);
    }
  }

  async sendPictureByXmlRequest() {
    const url = `${this.livenessUrlBase}${this.livenessConfirmEndpoint}`;
    const xhr = new XMLHttpRequest();
    
    xhr.open("POST", url, true);
    xhr.setRequestHeader("Authorization", `Bearer ${this.token}`);
    
    xhr.upload.addEventListener("loadstart", () => {
      this.setLoadingAccessibilityProgress();
    });
    
    xhr.upload.addEventListener("loadend", () => {
      this.removeLoadingAccessibilityProgress();
    });
    
    xhr.upload.addEventListener("progress", (event) => {
      this.uploadInProgress = (event.loaded / event.total) * 100;
      this.removeLoading();
      this.setLoadingProgress();
    });
    
    xhr.onreadystatechange = () => {
      if (xhr.readyState === XMLHttpRequest.DONE) {
        const responseData = JSON.parse(xhr?.response);
        if (xhr.status === 200) {
          if (!responseData?.data?.isAlive) {
            responseData.tips = this.getTips();
          }
          this.successCallback({ ...responseData, base64: this.base64 });
        } else {
          this.errorCallback({ error: responseData, base64: this.base64 });
        }
        this.resetLiveness();
        this.removeLoading();
      }
    };
    
    if (this.requestType === "b64") {
      await this.sendBase64(xhr);
    } else {
      await this.sendFormData(xhr);
    }
  }

  async sendBase64(xhr) {
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify({ base64: { key: this.toB64() } }));
  }

  async sendFormData(xhr) {
    const formData = await this.toFormData();
    xhr.send(formData);
  }

  async toFormData() {
    const formData = new FormData();
    const response = await fetch(this.base64);
    const blob = await response.blob();
    formData.append("selfie", blob, "image.png");
    return formData;
  }

  toB64() {
    return this.base64.split(",")[1];
  }

  confirmPicture() {
    try {
      this.sendPictureByXmlRequest();
    } catch (error) {
      this.errorCallback({ error: error, base64: this.base64 });
    }
  }
}

export default Liveness;