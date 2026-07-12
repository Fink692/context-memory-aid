const fs = require("node:fs");
const path = require("node:path");
const { withXcodeProject, IOSConfig } = require("expo/config-plugins");

const NATIVE_FILES = ["ContextPDFTextExtractor.swift", "ContextPDFTextExtractorBridge.m"];

module.exports = function withContextPDFImport(config) {
  return withXcodeProject(config, (modConfig) => {
    const projectRoot = modConfig.modRequest.projectRoot;
    const iosRoot = modConfig.modRequest.platformProjectRoot;
    const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
    const sourceRoot = path.join(projectRoot, "native");
    const destinationRoot = path.join(iosRoot, projectName);
    fs.mkdirSync(destinationRoot, { recursive: true });

    for (const filename of NATIVE_FILES) {
      const source = path.join(sourceRoot, filename);
      if (!fs.existsSync(source)) throw new Error(`Missing PDF import source: ${source}`);
      const destination = path.join(destinationRoot, filename);
      fs.copyFileSync(source, destination);
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: `${projectName}/${filename}`,
        groupName: projectName,
        project: modConfig.modResults,
      });
    }

    IOSConfig.XcodeUtils.addFramework({
      framework: "PDFKit.framework",
      project: modConfig.modResults,
      projectName,
    });
    return modConfig;
  });
};

module.exports.NATIVE_FILES = NATIVE_FILES;
