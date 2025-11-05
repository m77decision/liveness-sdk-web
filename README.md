# MULTIDECISION - LIVENESS SDK WEB

Detecção e captura de fotos da face

### Requerimentos:

- Baixar os arquivos de faceapi e modelos da pasta [/libs](https://github.com/multidecision/liveness-sdk-web/blob/master/libs)

### Ambientes:

- **Desenvolvimento**: **`HTTP`** só é possível rodar a aplicação em `localhost`. Exemplo: `http://localhost:7700`
- **Produção**: **`OBRIGATÓRIO`** ser `HTTPS` devido às restrições dos navegadores

### Procedimentos de utilização:

1. Referenciar a bibioteca liveness-web na página

`<script src="https://cdn.jsdelivr.net/gh/m77decision/liveness-sdk-web/dist/<VERSION>/liveness.js"></script>`

2. Apontar a pasta que os modelos e o faceapi foram salvos em `configuration.faceapiPath`
3. Definir qual elemento da DOM terá a câmera injetada pela biblioteca
4. Fazer demais configurações:

```javascript
  const config = {
    isDebug: true // (opcional) - padrão false,
    faceapiPath: "/libs", // caminho para a faceapi e modelos baixados
    livenessUrlBase: "https://hmg.multidecision.com.br", // endpoint da api liveness - você pode setar a url base do seu backend
    isShowPreview: true | false, // exibir um preview da foto que será enviada
    errorCallback: error, // metodo de callback em caso de erro na requisição
    successCallback: success, // metodo de callback em caso de sucesso (status: 200 com isAlive = true ou false)
    brightnessControl: 108, // somente desktop - padrão 108 - controla a tolerancia do brilho para submeter a selfie
    luminanceControl: 23, // somente desktop - padrão 23 - controla a tolerancia da luminância para submeter a selfie
    ellipseStrokeStyle: "#D02780", // padrão '#D02780' - cor da elipse que encaixa o rosto - pode ser o nome da cor ou hexadecimal
    activatedEllipseStrokeStyle: "#46E3C3", // padrão '#46E3C3' - cor da elipse ao detectar o rosto - pode ser o nome da cor ou hexadecimal
    boxMessageBackgroundColor: "#D02780", // padrão '#D02780' - cor de fundo da caixa de mensagem - pode ser o nome da cor ou hexadecimal
    boxMessageTextColor: "#f3f3f5", // padrão '#f3f3f5' - cor a fonte da caixa de mensagem - pode ser o nome da cor ou hexadecimal
    cameraPermissionErrorCallback: permissionErrorFunction // permite fazer a tratativa adequeada caso o usuário não tenha dado a permissão para usar a câmera
  };
```

Após a configuração, instanciar e injetar o Liveness:

```javascript
const videoWrapper = document.getElementById("video-wrapper");
const liveness = new Liveness(videoWrapper, config);
```

Iniciar o uso da câmera:

```javascript
liveness.start();
```

Parar o uso da câmera:

```javascript
liveness.stop();
```

# Release notes

### 1.0.0

1. Ajuste envio de foto para API
2. Adicionada a flag useWebgl2 que força o tensorflow a usar o WebAssembly(wasm)

```javascript
this.faceapi.tf.setBackend("wasm");
this.faceapi.tf.ready();
```