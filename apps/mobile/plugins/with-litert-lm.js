const fs = require("node:fs");
const path = require("node:path");
const { withXcodeProject, IOSConfig } = require("expo/config-plugins");

const LEGACY_PACKAGE_URL = "https://github.com/google-ai-edge/LiteRT-LM.git";
const PACKAGE_RELATIVE_PATH = "../native/LiteRTLM";
const PRODUCT_NAME = "LiteRTLM";
const NATIVE_FILES = ["ContextLocalLLM.swift", "ContextLocalLLMBridge.m"];

function unquote(value) {
  return typeof value === "string" ? value.replace(/^"|"$/g, "") : value;
}

function ensureReference(list, value, comment) {
  const entries = Array.isArray(list) ? list : [];
  if (!entries.some((entry) => entry.value === value)) entries.push({ value, comment });
  return entries;
}

function ensureSwiftPackage(project) {
  const objects = project.hash.project.objects;
  const localPackageSection = (objects.XCLocalSwiftPackageReference ||= {});
  const remotePackageSection = (objects.XCRemoteSwiftPackageReference ||= {});
  const legacyPackageEntry = Object.entries(remotePackageSection).find(
    ([key, value]) => !key.endsWith("_comment") && unquote(value.repositoryURL) === LEGACY_PACKAGE_URL,
  );
  if (legacyPackageEntry) {
    delete remotePackageSection[legacyPackageEntry[0]];
    delete remotePackageSection[`${legacyPackageEntry[0]}_comment`];
  }
  const packageEntry = Object.entries(localPackageSection).find(
    ([key, value]) => !key.endsWith("_comment") && unquote(value.relativePath) === PACKAGE_RELATIVE_PATH,
  );
  const packageUuid = packageEntry?.[0] ?? project.generateUuid();
  localPackageSection[packageUuid] = {
    isa: "XCLocalSwiftPackageReference",
    relativePath: PACKAGE_RELATIVE_PATH,
  };
  localPackageSection[`${packageUuid}_comment`] = 'XCLocalSwiftPackageReference "LiteRTLM"';

  const productSection = (objects.XCSwiftPackageProductDependency ||= {});
  const productEntry = Object.entries(productSection).find(
    ([key, value]) => !key.endsWith("_comment") && unquote(value.productName) === PRODUCT_NAME,
  );
  const productUuid = productEntry?.[0] ?? project.generateUuid();
  productSection[productUuid] = {
    isa: "XCSwiftPackageProductDependency",
    package: packageUuid,
    package_comment: 'XCLocalSwiftPackageReference "LiteRTLM"',
    productName: PRODUCT_NAME,
  };
  productSection[`${productUuid}_comment`] = PRODUCT_NAME;

  const firstProject = project.getFirstProject();
  const projectObject = project.pbxProjectSection()[firstProject.uuid];
  if (legacyPackageEntry) {
    projectObject.packageReferences = (projectObject.packageReferences ?? []).filter(
      (entry) => entry.value !== legacyPackageEntry[0],
    );
  }
  projectObject.packageReferences = ensureReference(
    projectObject.packageReferences,
    packageUuid,
    'XCLocalSwiftPackageReference "LiteRTLM"',
  );

  const appTarget = project.getTarget("com.apple.product-type.application");
  if (!appTarget) throw new Error("Could not find the iOS application target for LiteRT-LM.");
  appTarget.target.packageProductDependencies = ensureReference(
    appTarget.target.packageProductDependencies,
    productUuid,
    PRODUCT_NAME,
  );

  const buildFileSection = project.pbxBuildFileSection();
  const buildFileEntry = Object.entries(buildFileSection).find(
    ([key, value]) => !key.endsWith("_comment") && value.productRef === productUuid,
  );
  const buildFileUuid = buildFileEntry?.[0] ?? project.generateUuid();
  buildFileSection[buildFileUuid] = {
    isa: "PBXBuildFile",
    productRef: productUuid,
    productRef_comment: PRODUCT_NAME,
  };
  buildFileSection[`${buildFileUuid}_comment`] = `${PRODUCT_NAME} in Frameworks`;
  const frameworks = project.pbxFrameworksBuildPhaseObj(appTarget.uuid);
  frameworks.files = ensureReference(frameworks.files, buildFileUuid, `${PRODUCT_NAME} in Frameworks`);
}

module.exports = function withLiteRTLM(config) {
  return withXcodeProject(config, (modConfig) => {
    const projectRoot = modConfig.modRequest.projectRoot;
    const iosRoot = modConfig.modRequest.platformProjectRoot;
    const projectName = IOSConfig.XcodeUtils.getProjectName(projectRoot);
    const sourceRoot = path.join(projectRoot, "native");
    const destinationRoot = path.join(iosRoot, projectName);
    fs.mkdirSync(destinationRoot, { recursive: true });

    for (const filename of NATIVE_FILES) {
      const source = path.join(sourceRoot, filename);
      const destination = path.join(destinationRoot, filename);
      fs.copyFileSync(source, destination);
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath: `${projectName}/${filename}`,
        groupName: projectName,
        project: modConfig.modResults,
      });
    }

    ensureSwiftPackage(modConfig.modResults);
    return modConfig;
  });
};
