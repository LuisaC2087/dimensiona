/**
 * CR-04: copia los modelos de assets/models/*.onnx a android/app/src/main/assets durante el prebuild,
 * para que ViroObjectDetector los cargue por nombre. Evita editar android/ a mano (CNG).
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withAppBuildGradle } = require('expo/config-plugins');

const withOnnxModel = (config) => {
  config = withDangerousMod(config, ['android', async (cfg) => {
    const src = path.join(cfg.modRequest.projectRoot, 'assets', 'models');
    const dest = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'assets');
    if (fs.existsSync(src)) {
      fs.mkdirSync(dest, { recursive: true });
      for (const f of fs.readdirSync(src).filter((n) => n.endsWith('.onnx'))) {
        fs.copyFileSync(path.join(src, f), path.join(dest, f));
      }
    }
    return cfg;
  }]);
  // El modelo se lee tal cual: que el empaquetado no lo comprima.
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes("noCompress 'onnx'")) {
      cfg.modResults.contents = cfg.modResults.contents.replace(
        /android\s*\{/,
        "android {\n    androidResources { noCompress 'onnx' }",
      );
    }
    return cfg;
  });
};

module.exports = withOnnxModel;
