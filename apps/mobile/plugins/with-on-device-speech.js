const fs = require("node:fs");
const path = require("node:path");
const { withInfoPlist, withXcodeProject, IOSConfig } = require("expo/config-plugins");

const MICROPHONE_PERMISSION = "Allow Context to use the microphone while you dictate relationship details. Audio is not saved.";
const SPEECH_PERMISSION = "Allow Context to turn dictation into editable text.";
const NATIVE_FILES = ["ContextSpeechToText.swift", "ContextSpeechToTextBridge.m"];

function withSpeechPurposeStrings(config) {
  return withInfoPlist(config, (modConfig) => {
    modConfig.modResults.NSMicrophoneUsageDescription = MICROPHONE_PERMISSION;
    modConfig.modResults.NSSpeechRecognitionUsageDescription = SPEECH_PERMISSION;
    return modConfig;
  });
}

function withSpeechSources(config) {
  return withXcodeProject(config, (modConfig) => {
    const projectRoot = modConfig.modRequest.projectRoot;
    const iosRoot = modConfig.modRequest.platformProjectRoot;
    const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
    const sourceRoot = path.join(projectRoot, "native");
    const destinationRoot = path.join(iosRoot, projectName);
    fs.mkdirSync(destinationRoot, { recursive: true });

    for (const filename of NATIVE_FILES) {
      const source = path.join(sourceRoot, filename);
      if (!fs.existsSync(source)) throw new Error(`Missing on-device speech source: ${source}`);
      const destination = path.join(destinationRoot, filename);
      fs.copyFileSync(source, destination);
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: `${projectName}/${filename}`,
        groupName: projectName,
        project: modConfig.modResults,
      });
    }
    return modConfig;
  });
}

module.exports = function withOnDeviceSpeech(config) {
  return withSpeechSources(withSpeechPurposeStrings(config));
};

module.exports.MICROPHONE_PERMISSION = MICROPHONE_PERMISSION;
module.exports.SPEECH_PERMISSION = SPEECH_PERMISSION;
