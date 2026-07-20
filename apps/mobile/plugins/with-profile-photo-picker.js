const fs = require("node:fs");
const path = require("node:path");
const { withXcodeProject, IOSConfig } = require("expo/config-plugins");

const NATIVE_FILES = ["ContextProfilePhotoPicker.swift", "ContextProfilePhotoPickerBridge.m"];

module.exports = function withProfilePhotoPicker(config) {
  return withXcodeProject(config, (modConfig) => {
    const projectRoot = modConfig.modRequest.projectRoot;
    const iosRoot = modConfig.modRequest.platformProjectRoot;
    const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
    const sourceRoot = path.join(projectRoot, "native");
    const destinationRoot = path.join(iosRoot, projectName);
    fs.mkdirSync(destinationRoot, { recursive: true });

    for (const filename of NATIVE_FILES) {
      const source = path.join(sourceRoot, filename);
      if (!fs.existsSync(source)) throw new Error(`Missing profile photo source: ${source}`);
      fs.copyFileSync(source, path.join(destinationRoot, filename));
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: `${projectName}/${filename}`,
        groupName: projectName,
        project: modConfig.modResults,
      });
    }
    return modConfig;
  });
};
