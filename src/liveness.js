var Liveness;
(() => {
    "use strict";

    class LivenessPlugin {
        constructor(videoWrapper, options) {
            // Estado Inicial
            this.uploadInProgress = 0;
            this.requestType = "b64";
            this.counterNotFoundFace = 0;
            this.faceapi = null;

            // Configurações Base
            this.token = options.token;
            this.videoWrapper = videoWrapper;
            this.configFrameBox = options.frameBox;
            this.faceapiPath = options.faceapiPath;
            this.livenessUrlBase = options.livenessUrlBase;
            this.livenessConfirmEndpoint = options.livenessConfirmEndpoint || "/liveness/v2";

            // Mensagens de Feedback
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

            // Configurações de Escala e Resolução
            this.scalingFactorForLiveness = (options.scalingFactorForLiveness && options.scalingFactorForLiveness <= 3) ? options.scalingFactorForLiveness : 1;

            this.config = {
                ellipseMaskWidth: options.ellipseMaskWidth,
                ellipseMaskHeight: options.ellipseMaskHeight,
                ellipseMaskTop: options.ellipseMaskTop,
                ellipseMaskLeft: options.ellipseMaskLeft,
                mobileFacingMode: options.mobileFacingMode || "user",
                width: options.width || this.getFullWidth(),
                height: options.height || this.getFullHeight(),
                useWebgl2: options.useWebgl2,
                isDebug: options.isDebug
            };

            // LÓGICA DE PROPORÇÃO DO SCRIPT MINIFICADO
            this.config.heightAspectRatio = this.isMobile() ?
                this.config.width * (4 / 3) :
                this.config.width / (4 / 3);

            // Injeção de CSS para Orientação
            const style = document.createElement("style");
            style.innerText = this.cssOrientationLock();
            document.head.appendChild(style);

            // Controles de Validação Técnica
            this.brightnessControl = options.brightnessControl || 95;
            this.luminanceControl = options.luminanceControl || 23;
            this.isShowPreview = options.isShowPreview;
            this.errorCallback = options.errorCallback;
            this.successCallback = options.successCallback;
            this.cameraPermissionErrorCallback = options.cameraPermissionErrorCallback || null;

            // Estilização da UI
            this.ellipseStrokeStyleDefault = options.ellipseStrokeStyle || "#D02780";
            this.activatedEllipseStrokeStyle = options.activatedEllipseStrokeStyle || "#46E3C3";
            this.boxMessageBackgroundColor = options.boxMessageBackgroundColor || "#D02780";
            this.boxMessageTextColor = options.boxMessageTextColor || "#f3f3f5";

            // Timers e Intervalos
            this.configEyesBoxHeight = options.configEyesBoxHeight || 20;
            this.requestAnimationFrame = window.requestAnimationFrame;
            this.shouldCheckNeutralFace = options.shouldCheckNeutralFace || false;
            this.facetimeInterval = options.facetimeInterval || 150;
            this.timeToDetectFace = options.timeToDetectFace || 6000;
            this.showNotFoundModal = options.showNotFoundModal || false;
        }

        // --- Helpers de Dimensão e Ambiente ---

        getFullWidth() {
            return Math.max(document.body.scrollWidth, document.documentElement.scrollWidth, document.body.offsetWidth, document.documentElement.offsetWidth, document.documentElement.clientWidth);
        }

        getFullHeight() {
            return Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, document.body.offsetHeight, document.documentElement.offsetHeight, document.documentElement.clientHeight);
        }

        isMobile() {
            return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
        }

        responsiveFrameBoxEyesOutterWidth(width) {
            // Valores exatos extraídos do seu script funcional
            return width <= 315 ? {
                eyesInner: 0.74,
                eyesOutter: 0.78,
                box: 0.55
            } : {
                eyesInner: 0.52,
                eyesOutter: 0.82,
                box: 0.6
            };
        }

        cssOrientationLock() {
            return "@media screen and (min-width: 320px) and (max-width: 767px) and (orientation: landscape) { html { transform: rotate(-90deg);transform-origin: left top;width: 100vh;overflow-x: hidden;position: absolute;top: 100%;left: 0;}}";
        }

        getDevicePixelRatio() {
            const isFirefox = navigator.userAgent.toLowerCase().indexOf("firefox") > -1;
            if (window.devicePixelRatio === undefined || isFirefox) {
                if (window.matchMedia) {
                    if (window.matchMedia("(-webkit-min-device-pixel-ratio: 2), (min-resolution: 2dppx)").matches) return 2;
                    if (window.matchMedia("(-webkit-min-device-pixel-ratio: 1.5), (min-resolution: 1.5dppx)").matches) return 1.5;
                }
                return 1;
            }
            return window.devicePixelRatio;
        }

        // --- Configurações de Execução ---

        setUseBase64() {
            this.requestType = "b64";
        }
        setUseFormData() {
            this.requestType = "formData";
        }
        setMinBrightness(val) {
            this.brightnessControl = val;
        }
        setMinLuminance(val) {
            this.luminanceControl = val;
        }
        setCheckNeutralFace(val) {
            this.shouldCheckNeutralFace = val;
        }
        setEyesBoxHeight(val) {
            this.configEyesBoxHeight = val;
        }

        setMobileFaceCam() {
            this.config.mobileFacingMode = "user";
            this.resetLiveness();
        }

        setMobileEnvironmentCam() {
            this.config.mobileFacingMode = "environment";
            this.resetLiveness();
        }

        setFrameBoxesWidth(inner, outter, box) {
            this.configFrameBox = {
                eyesInner: inner,
                eyesOutter: outter,
                box: box
            };
        }

        setDimensionsRequestImage(w, h) {
            this.config.dimensions = {
                width: w,
                height: h
            };
        }

        toggleDebug() {
            this.config.isDebug = !this.config.isDebug;
            if (!this.config.isDebug) {
                this.canvas.getContext("2d").clearRect(0, 0, this.canvas.width, this.canvas.height);
            }
        }

        // --- Ciclo de Vida ---

        async start(callback) {
            this.startCallbackFunction = callback;
            if (window.faceapi) {
                this.faceapi = window.faceapi;
                this.setLiveness();
            } else {
                await this.loadFaceApi();
            }
        }

        stop() {
            if (this.video) this.video.pause();
            if (this.stream) {
                this.stream.getTracks().forEach(track => track.stop());
            }
            clearInterval(this.timer);
            clearInterval(this.timerBackground);
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

        // --- Inicialização Técnica ---

        async loadFaceApi() {
            const script = document.createElement("script");
            script.src = `${this.faceapiPath}/face-api.min.js`;
            document.head.append(script);
            script.onload = async () => {
                await this.loadFaceApiModels();
            };
            return this;
        }

        async loadFaceApiModels() {
            try {
                if (!!this.config.useWebgl2) {
                    window.faceapi.tf.env().set('WEBGL_RENDER_FLOAT32_CAPABLE', false);
                    await window.faceapi.tf.setBackend('wasm');
                }

                await window.faceapi.tf.ready();

                await Promise.all([
                    window.faceapi.nets.faceLandmark68Net.loadFromUri(this.faceapiPath),
                    window.faceapi.nets.faceExpressionNet.loadFromUri(this.faceapiPath),
                    window.faceapi.nets.faceRecognitionNet.loadFromUri(this.faceapiPath),
                    window.faceapi.nets.tinyFaceDetector.loadFromUri(this.faceapiPath)
                ]);

                this.faceapi = window.faceapi;
                this.setLiveness();
            } catch (e) {
                console.error("Erro ao carregar FaceAPI:", e);
            }
            return this;
        }

        setLiveness() {
            this.setLoading();
            this.createVideoElement()
                .startVideo()
                .createModalConfirmationWrapper()
                .createModalConfirmation();
        }

        startVideo() {
            if (navigator.mediaDevices === undefined) navigator.mediaDevices = {};
            if (navigator.mediaDevices.getUserMedia === undefined) {
                navigator.mediaDevices.getUserMedia = (constraints) => {
                    const getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;
                    if (!getUserMedia) return Promise.reject(new Error("getUserMedia não implementado"));
                    return new Promise((res, rej) => getUserMedia.call(navigator, constraints, res, rej));
                };
            }

            navigator.mediaDevices.enumerateDevices().then(devices => {
                const constraints = {
                    video: {
                        width: this.config.width,
                        height: this.config.height,
                        frameRate: 24
                    }
                };
                if (this.isMobile()) {
                    constraints.video.facingMode = this.config.mobileFacingMode;
                } else {
                    const videoInput = devices.filter(d => d.kind === "videoinput" && !d.label.includes("m-de:vice"))[0];
                    if (videoInput) constraints.video.deviceId = videoInput.deviceId;
                }

                navigator.mediaDevices.getUserMedia(constraints).then(stream => {
                    const videoEl = this.video;
                    if (videoEl) {
                        this.stream = stream;
                        if ("srcObject" in videoEl) videoEl.srcObject = stream;
                        else videoEl.src = window.URL.createObjectURL(stream);
                        if (this.startCallbackFunction) this.startCallbackFunction();
                    }
                }).catch(err => {
                    if (this.cameraPermissionErrorCallback) this.cameraPermissionErrorCallback(err);
                    else throw new Error(err);
                });
            });
            return this;
        }

        createVideoElement() {
            this.videoWrapper.style.position = "relative";
            this.videoWrapper.style.width = this.config.width + "px";
            this.videoWrapper.style.height = (this.config.height < this.config.heightAspectRatio) ? this.config.height + "px" : this.config.heightAspectRatio + "px";

            this.video = document.createElement("video");
            this.video.ariaLabel = "Vídeo da face - Aproxime o rosto em posição de selfie e afaste-o lentamente para enquadrar";
            this.video.style.width = "inherit";
            this.video.style.height = "inherit";
            if (this.config.mobileFacingMode === "user") this.video.style.transform = "scaleX(-1)";
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

        // --- Processamento de Imagem e Analise ---

        createCanvasBackground() {
            this.canvasBackground = document.createElement("canvas");
            const dpr = window.devicePixelRatio || 2;

            this.canvasBackground.width = this.isMobile() ? this.video.clientWidth * dpr : this.config.width;
            this.canvasBackground.height = this.isMobile() ? this.config.heightAspectRatio * dpr : this.config.height;

            if (this.scalingFactorForLiveness) {
                this.canvasBackground.width *= this.scalingFactorForLiveness;
                this.canvasBackground.height *= this.scalingFactorForLiveness;
            }

            if (this.config.dimensions) {
                this.canvasBackground.width = this.config.dimensions.width;
                this.canvasBackground.height = this.config.dimensions.height;
            }
            this.canvasBackground.style.display = "none";
        }

        sweepVideo(data) {
            this.luminanceAvg = 0;
            this.brightnessSum = 0;
            this.luminanceArray = [];
            for (let i = 0; i < data.length; i += 4) {
                const r = data[i],
                    g = data[i + 1],
                    b = data[i + 2];
                // Brilho
                this.brightnessSum += Math.floor((r + g + b) / 3);
                // Luminância
                const lum = this.calcLuminance(r, g, b);
                this.luminanceAvg += lum;
                this.luminanceArray.push(lum);
            }
            this.brightness = Math.floor(this.brightnessSum / (this.canvasLuminance.width * this.canvasLuminance.height));
            this.luminance = (this.luminanceAvg / this.luminanceArray.length) * 100;
        }

        calcLuminance(r, g, b) {
            let colors = [r, g, b].map(v => {
                v /= 255;
                return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
            });
            return 0.2126 * colors[0] + 0.7152 * colors[1] + 0.0722 * colors[2] + 0.05;
        }

        checkBackground() {
            this.canvasLuminance = document.createElement("canvas");
            const ctx = this.canvasLuminance.getContext("2d");
            ctx.drawImage(this.video, 0, 0, this.canvasLuminance.width, this.canvasLuminance.height);
            const imageData = ctx.getImageData(0, 0, this.canvasLuminance.width, this.canvasLuminance.height);

            this.sweepVideo(imageData.data);
            this.isBackgroundOK = this.brightness >= this.brightnessControl && this.luminance >= this.luminanceControl;

            if (this.config.isDebug) {
                console.table({
                    brilho: {
                        atual: this.brightness,
                        minimo: this.brightnessControl
                    },
                    luminancia: {
                        atual: parseFloat(this.luminance.toFixed(2)),
                        minimo: this.luminanceControl
                    }
                });
            }
        }

        // --- Loop de Detecção Facial ---

        loop() {
            this.blockMaskMessage = this.boxMessages.unmatchedFace;
            this.canvas = this.faceapi.createCanvasFromMedia(this.video);
            this.canvas.style.position = "absolute";
            this.canvas.style.left = "0px";
            this.canvas.style.top = "0px";
            this.videoWrapper.append(this.canvas);

            const displaySize = {
                width: this.config.width,
                height: this.config.height < this.config.heightAspectRatio ? this.config.height : this.config.heightAspectRatio
            };

            this.faceapi.matchDimensions(this.canvas, displaySize);
            this.boxesWidth = this.responsiveFrameBoxEyesOutterWidth(window.innerWidth);
            if (this.configFrameBox) {
                this.boxesWidth = this.configFrameBox;
            }

            // CÁLCULO DO FRAMEBOX (O Retângulo de detecção)
            const frameBox = {
                width: Math.floor(this.config.width * this.boxesWidth.box),
                height: displaySize.height
            };

            if (this.configFrameBox?.height) {
                frameBox.height = this.configFrameBox.height;
            }

            frameBox.left = Math.floor(this.canvas.width / 2 - frameBox.width / 2);
            frameBox.top = Math.floor(this.videoWrapper.clientHeight / 2 - frameBox.height / 2);

            // CÁLCULO DA ELIPSE (O Círculo visual) - IDÊNTICO AO MINIFICADO
            this.ellipseMaskWidth = this.config.ellipseMaskWidth ?
                frameBox.width / this.config.ellipseMaskWidth : frameBox.width / 2;

            this.ellipseMaskHeight = this.config.ellipseMaskHeight ?
                frameBox.height / this.config.ellipseMaskHeight : frameBox.height / 2.5;

            this.ellipseMaskTop = this.config.ellipseMaskTop ?
                (frameBox.top + frameBox.height) / this.config.ellipseMaskTop : (frameBox.top + frameBox.height) / 1.9;

            this.ellipseMaskLeft = this.config.ellipseMaskLeft ?
                (frameBox.left + frameBox.width / 2) / this.config.ellipseMaskLeft : frameBox.left + frameBox.width / 2;

            this.ellipseMaskLineWidth = 2;

            const ctx = this.canvas.getContext("2d");
            ctx.translate(this.canvas.width, 0);
            ctx.scale(-1, 1);

            this.drawEllipse(ctx);

            const state = {
                counter: 0,
                inProgress: false,
                done: false
            };
            const rect = this.canvas.getBoundingClientRect();

            this.timer = setInterval(async () => {
                if (state.inProgress || state.done) return;
                state.inProgress = true;

                const detection = await this.faceapi.detectSingleFace(this.video, new this.faceapi.TinyFaceDetectorOptions({
                    inputSize: 160,
                    scoreThreshold: 0.25
                })).withFaceLandmarks().withFaceExpressions();

                if (!detection) {
                    this.blockMaskMessage = this.boxMessages.unmatchedFace;
                    this.deactivateEllipseMask();
                    state.inProgress = false;
                    return;
                }

                const resized = this.faceapi.resizeResults(detection, displaySize);

                // Validação de enquadramento (isInside) baseada no frameBox
                const jaw = resized.landmarks.getJawOutline();
                const leftPoint = [jaw[0].x, jaw[0].y];
                const rightPoint = [jaw[16].x, jaw[16].y];

                const isInside = this.isInside(leftPoint, frameBox) && this.isInside(rightPoint, frameBox);

                if (!isInside) {
                    this.blockMaskMessage = this.boxMessages.positionFaceWithinFrame;
                    this.deactivateEllipseMask();
                } else {
                    this.activateEllipseMask();
                    state.counter++;
                    if (state.counter >= 2) {
                        state.done = true;
                        this.takePicture();
                        clearInterval(this.timer);
                    }
                }
                state.inProgress = false;
            }, this.facetimeInterval);
        }

        // --- Desenho e Visualização ---

        drawEllipse(ctx, color) {
            ctx.beginPath();
            ctx.lineWidth = this.ellipseMaskLineWidth;
            ctx.ellipse(this.ellipseMaskLeft, this.ellipseMaskTop, this.ellipseMaskWidth, this.ellipseMaskHeight, 0, 0, 2 * Math.PI);
            ctx.strokeStyle = color || this.ellipseStrokeStyleDefault;
            ctx.stroke();
        }

        activateEllipseMask() {
            const ctx = this.canvas.getContext("2d");
            this.ellipseMaskLineWidth = 4;
            this.drawEllipse(ctx, this.activatedEllipseStrokeStyle);
        }

        deactivateEllipseMask() {
            const ctx = this.canvas.getContext("2d");
            this.ellipseMaskLineWidth = 2;
            this.drawEllipse(ctx);
        }

        // --- Analise de Marcos Faciais ---

        getExpression(expressions) {
            let sorted = Object.entries(expressions).sort((a, b) => a[1] - b[1]);
            return sorted.pop()[0];
        }

        getPose(result) {
            const rightEye = this.getMeanPosition(result.landmarks.getRightEye());
            const leftEye = this.getMeanPosition(result.landmarks.getLeftEye());
            const nose = this.getMeanPosition(result.landmarks.getNose());
            const mouth = this.getMeanPosition(result.landmarks.getMouth());
            const jawTop = this.getTop(result.landmarks.getJawOutline());

            const vertical = (jawTop - mouth[1]) / result.detection.box.height + 0.45;
            const horizontal = (leftEye[0] + (rightEye[0] - leftEye[0]) / 2 - nose[0]) / result.detection.box.width;

            let pose = "undetected";
            if (result.detection.score > 0.3) {
                pose = "front";
                if (vertical > 0.2) pose = "top";
                else if (vertical < -0.1) pose = "bottom";
                else if (horizontal < -0.04) pose = "left";
                else if (horizontal > 0.04) pose = "right";
            }
            return pose;
        }

        isRotatedFace(p1, p2) {
            return Math.abs(180 * Math.atan2(p2.y - p1.y, p2.x - p1.x) / Math.PI) > 7;
        }

        getMeanPosition(points) {
            return points.map(p => [p.x, p.y]).reduce((a, b) => [a[0] + b[0], a[1] + b[1]]).map(v => v / points.length);
        }

        getTop(points) {
            return points.map(p => p.y).reduce((a, b) => Math.min(a, b));
        }

        isInside(point, box) {
            return !(point[1] < box.top || point[0] < box.left || point[1] > box.top + box.height || point[0] > box.left + box.width);
        }

        // --- Gestão de UI e Captura ---

        blockMask(rect, left, top, height, width) {
            if (this.blockMaskMessage === this.cachedBlockMaskMessage) return;
            this.cachedBlockMaskMessage = this.blockMaskMessage;
            this.deactivateEllipseMask();
            this.msg.innerHTML = "";

            const span = document.createElement("span");
            span.ariaLabel = this.blockMaskMessage;
            span.role = "alert";
            span.ariaLive = "assertive";
            span.textContent = this.blockMaskMessage;
            span.style = `display: flex; color: ${this.boxMessageTextColor}; font-size: 1.1rem; padding: 10px 20px; text-align: center; align-items: center; background: ${this.boxMessageBackgroundColor}; border-radius: 7px; justify-content: center; width: 230px; font-family: Prompt, sans-serif;`;

            this.msg.style.display = "flex";
            this.msg.appendChild(span);
        }

        takePicture() {
            const ctx = this.canvasBackground.getContext("2d");
            this.createFlashMask();
            ctx.drawImage(this.video, 0, 0, this.canvasBackground.width, this.canvasBackground.height);

            // Pixels de Segurança/Controle
            ctx.fillStyle = "rgb(71,84,68)";
            ctx.fillRect(20, 50, 1, 1);
            ctx.fillStyle = "rgb(211,190,124)";
            ctx.fillRect(422, 522, 1, 1);

            this.base64 = this.canvasBackground.toDataURL("image/png");
            setTimeout(() => {
                this.removeFlashMask();
                this.isShowPreview ? this.openPreviewModal() : this.confirmPicture();
            }, 300);
        }

        // --- Componentes DOM ---

        createMessageBox() {
            const old = document.getElementById("liveness-box-message");
            if (old) old.remove();
            this.msg = document.createElement("div");
            this.msg.id = "liveness-box-message";
            this.msg.style = `display: flex; justify-content: center; align-items: center; width: 100%; z-index: 999; background: transparent; position: absolute; top: ${this.ellipseMaskTop + this.ellipseMaskHeight}px;`;
            this.videoWrapper.append(this.msg);
            return this;
        }

        createFlashMask() {
            const flash = document.createElement("div");
            flash.id = "flash";
            flash.style = "width: 100%; height: 100vh; position: fixed; background: white; z-index: 999; top: 0; left: 0;";
            document.body.append(flash);
        }

        removeFlashMask() {
            const flash = document.getElementById("flash");
            if (flash) flash.remove();
        }

        // --- Modais e Spinners ---

        setLoading() {
            if (document.getElementById("spinner")) return;
            this.videoWrapper.insertAdjacentHTML("beforeend", `
                <div id="spinner">
                    <div class="lds-ripple"><div></div><div></div></div>
                    <style>
                        #spinner { top: 0; z-index: 999; width: 100%; height: 100%; display: flex; position: absolute; align-items: center; flex-direction: column; justify-content: center; background: rgba(20, 20, 20, 1); }
                        .lds-ripple { width: 80px; height: 80px; position: relative; }
                        .lds-ripple div { position: absolute; border: 4px solid #fff; opacity: 1; border-radius: 50%; animation: lds-ripple 1s cubic-bezier(0, 0.2, 0.8, 1) infinite; }
                        .lds-ripple div:nth-child(2) { animation-delay: -0.5s; }
                        @keyframes lds-ripple { 0% { top: 36px; left: 36px; width: 0; height: 0; opacity: 1; } 100% { top: 0px; left: 0px; width: 72px; height: 72px; opacity: 0; } }
                    </style>
                </div>
            `);
        }

        removeLoading() {
            const el = document.getElementById("spinner");
            if (el) el.remove();
        }

        // --- Comunicação com API ---

        async sendPictureByXmlRequest() {
            const url = `${this.livenessUrlBase}${this.livenessConfirmEndpoint}`;
            const xhr = new XMLHttpRequest();
            xhr.open("POST", url, true);
            xhr.setRequestHeader("Authorization", `Bearer ${this.token}`);

            xhr.upload.addEventListener("progress", (e) => {
                this.uploadInProgress = (e.loaded / e.total) * 100;
                this.removeLoading();
                this.setLoadingProgress();
            });

            xhr.onreadystatechange = () => {
                if (xhr.readyState === XMLHttpRequest.DONE) {
                    const response = JSON.parse(xhr.response || "{}");
                    if (xhr.status === 200) {
                        this.successCallback({
                            ...response,
                            base64: this.base64
                        });
                    } else {
                        this.errorCallback({
                            error: response,
                            base64: this.base64
                        });
                    }
                    this.resetLiveness();
                    this.removeLoading();
                }
            };

            if (this.requestType === "b64") {
                xhr.setRequestHeader("Content-Type", "application/json");
                xhr.send(JSON.stringify({
                    base64: {
                        key: this.toB64()
                    }
                }));
            } else {
                const fd = await this.toFormData();
                xhr.send(fd);
            }
        }

        toB64() {
            return this.base64.split(",")[1];
        }

        async toFormData() {
            const res = await fetch(this.base64);
            const blob = await res.blob();
            const fd = new FormData();
            fd.append("selfie", blob, "image.png");
            return fd;
        }

        confirmPicture() {
            try {
                this.sendPictureByXmlRequest();
            } catch (e) {
                this.errorCallback({
                    error: e,
                    base64: this.base64
                });
            }
        }

        // --- Métodos de UI Adicionais (Reconstruídos) ---

        createModalConfirmationWrapper() {
            this.modalWrapper = document.createElement("div");
            this.modalWrapper.id = "modalWrapper";
            this.modalWrapper.style = `top: 0; left: 0; z-index: 999; width: ${this.videoWrapper.style.width}; height: ${this.videoWrapper.style.height}; display: none; position: fixed; align-items: flex-start; justify-content: center; background: rgba(20, 20, 20, 0.95);`;
            document.body.append(this.modalWrapper);
            return this;
        }

        createModalConfirmation() {
            this.modalConfirmation = document.createElement("div");
            this.modalConfirmation.role = "alert";
            this.modalConfirmation.style = `padding: 7px; display: flex; width: ${this.videoWrapper.style.width}; height: ${this.videoWrapper.style.height}; background: white; border-radius: 7px; position: relative; align-items: center; justify-content: center;`;

            const btnContainer = document.createElement("div");
            btnContainer.style = "right: 0; bottom: 0; z-index: 1; width: 100%; display: flex; padding: 10px 0; position: absolute; justify-content: center;";

            const confirmBtn = document.createElement("button");
            confirmBtn.textContent = "Confirmar";
            confirmBtn.style = "color: #555; width: 160px; height: 50px; cursor: pointer; background: #fff; font-weight: 600; border-radius: 7px; margin-right: 10px; border: 1px solid #222;";

            const cancelBtn = document.createElement("button");
            cancelBtn.textContent = "Cancelar";
            cancelBtn.style = "color: #444; width: 160px; height: 50px; cursor: pointer; background: #fff; font-weight: 600; border-radius: 7px; margin-right: 10px; border: 1px solid #222;";

            confirmBtn.addEventListener("click", () => {
                this.closePreviewModal();
                this.confirmPicture();
            });
            cancelBtn.addEventListener("click", () => this.cancelPicture());

            btnContainer.append(cancelBtn, confirmBtn);
            this.modalConfirmation.append(btnContainer);
            this.modalWrapper.append(this.modalConfirmation);
            return this;
        }

        openPreviewModal() {
            const img = document.createElement("img");
            img.src = this.base64;
            img.style = "width: 100%; height: 100%; object-fit: cover; border-radius: 7px; transform: scaleX(-1);";
            this.modalConfirmation.append(img);
            this.modalWrapper.style.display = "flex";
        }

        closePreviewModal() {
            const el = document.getElementById("modalWrapper");
            if (el) el.remove();
        }

        cancelPicture() {
            this.resetLiveness();
        }

        removeCanvas() {
            const canvas = document.getElementsByTagName("canvas")[0];
            if (canvas) canvas.remove();
        }

        resetVideoWrapper() {
            if (this.videoWrapper) this.videoWrapper.innerHTML = "";
        }

        setHasNoNetwork() {
            this.setLoading();
            const spinner = document.getElementById("spinner");
            if (spinner) {
                spinner.insertAdjacentHTML("beforeend", '<p style="color: white; text-align: center;">Estamos sem conexão<br />com a internet</p>');
            }
        }
    }

    Liveness = LivenessPlugin;
})();