import {
  addProjectConfiguration,
  formatFiles,
  generateFiles,
  getWorkspaceLayout,
  names,
  offsetFromRoot,
  Tree,
} from '@nrwl/devkit';
import * as path from 'path';
import { XmlDocument } from 'xmldoc';
import { normalizeName } from '../../utils/command';
import { LinterType } from '../../utils/types';
import { readXmlTree, xmlToString } from '../../utils/xml';
import { NxBootMavenAppGeneratorSchema } from './schema';

interface NormalizedSchema extends NxBootMavenAppGeneratorSchema {
  projectName: string;
  projectRoot: string;
  projectDirectory: string;
  parsedTags: string[];
  appClassName: string;
  packageName: string;
  packageDirectory: string;
  linter: LinterType;
  parentGroupId: string;
  parentProjectName: string;
  parentProjectVersion: string;
  relativePath: string;
}

function normalizeOptions(
  tree: Tree,
  options: NxBootMavenAppGeneratorSchema
): NormalizedSchema {
  const simpleProjectName = names(normalizeName(options.name)).fileName;
  const projectName = options.directory
    ? `${normalizeName(names(options.directory).fileName)}-${simpleProjectName}`
    : simpleProjectName;
  const projectDirectory = options.directory
    ? `${names(options.directory).fileName}/${simpleProjectName}`
    : simpleProjectName;
  const projectRoot = `${getWorkspaceLayout(tree).appsDir}/${projectDirectory}`;
  const parsedTags = options.tags
    ? options.tags.split(',').map((s) => s.trim())
    : [];

  const appClassName = `${names(projectName).className}Application`;

  const packageName2 = `${options.groupId}.${
    options.packageNameType === 'long' && options.directory
      ? `${names(options.directory).fileName.replace(
          new RegExp(/\//, 'g'),
          '.'
        )}.${names(simpleProjectName).className.toLocaleLowerCase()}`
      : names(simpleProjectName).className.toLocaleLowerCase()
  }`;

  //remove dash from packageName
  const packageName = packageName2.replace(new RegExp(/-/, 'g'), '');

  const packageDirectory = packageName.replace(new RegExp(/\./, 'g'), '/');

  const linter = options.language === 'java' ? 'checkstyle' : 'ktlint';

  const relativePath = path
    .relative(projectRoot, tree.root)
    .replace(new RegExp(/\\/, 'g'), '/');

  const pomXmlContent = readXmlTree(tree, 'pom.xml');
  const parentGroupId = pomXmlContent.childNamed('groupId').val;
  const parentProjectName = pomXmlContent.childNamed('artifactId').val;
  const parentProjectVersion = pomXmlContent.childNamed('version').val;

  return {
    ...options,
    projectName,
    projectRoot,
    projectDirectory,
    parsedTags,
    appClassName,
    packageName,
    packageDirectory,
    linter,
    parentGroupId,
    parentProjectName,
    parentProjectVersion,
    relativePath,
  };
}

function addFiles(tree: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    ...names(options.name),
    offsetFromRoot: offsetFromRoot(options.projectRoot),
    template: '',
  };
  generateFiles(
    tree,
    path.join(__dirname, 'files', options.language),
    options.projectRoot,
    templateOptions
  );
}

 async function applicationGenerator (
  tree: Tree,
  options: NxBootMavenAppGeneratorSchema
) {
  const normalizedOptions = normalizeOptions(tree, options);

  if (options.language === 'java') {
    addProjectConfiguration(tree, normalizedOptions.projectName, {
      root: normalizedOptions.projectRoot,
      projectType: 'application',
      sourceRoot: `${normalizedOptions.projectRoot}/src`,
      targets: {
        build: {
          executor: '@jnxplus/nx-boot-maven:build',
          outputs: [`${normalizedOptions.projectRoot}/target`],
        },
        'build-image': {
          executor: '@jnxplus/nx-boot-maven:build-image',
        },
        serve: {
          executor: '@jnxplus/nx-boot-maven:serve',
          dependsOn: [
            {
              target: 'build',
              projects: 'self',
            },
          ],
        },
        lint: {
          executor: '@jnxplus/nx-boot-maven:lint',
          options: {
            linter: `${normalizedOptions.linter}`,
          },
        },
        test: {
          executor: '@jnxplus/nx-boot-maven:test',
          dependsOn: [
            {
              target: 'build',
              projects: 'self',
            },
          ],
        },
      },
      tags: normalizedOptions.parsedTags,
    });
  } else {
    addProjectConfiguration(tree, normalizedOptions.projectName, {
      root: normalizedOptions.projectRoot,
      projectType: 'application',
      sourceRoot: `${normalizedOptions.projectRoot}/src`,
      targets: {
        build: {
          executor: '@jnxplus/nx-boot-maven:build',
          outputs: [`${normalizedOptions.projectRoot}/target`],
        },
        'build-image': {
          executor: '@jnxplus/nx-boot-maven:build-image',
        },
        serve: {
          executor: '@jnxplus/nx-boot-maven:serve',
          dependsOn: [
            {
              target: 'build',
              projects: 'self',
            },
          ],
        },
        lint: {
          executor: '@jnxplus/nx-boot-maven:lint',
          options: {
            linter: `${normalizedOptions.linter}`,
          },
        },
        test: {
          executor: '@jnxplus/nx-boot-maven:test',
          dependsOn: [
            {
              target: 'build',
              projects: 'self',
            },
          ],
        },
        kformat: {
          executor: '@jnxplus/nx-boot-maven:kformat',
        },
      },
      tags: normalizedOptions.parsedTags,
    });
  }

  addFiles(tree, normalizedOptions);
  addProjectToParentPomXml(tree, normalizedOptions);
  await formatFiles(tree);
}

function addProjectToParentPomXml(tree: Tree, options: NormalizedSchema) {
  const filePath = `pom.xml`;
  const xmldoc = readXmlTree(tree, filePath);
  const fragment = new XmlDocument(`<module>${options.projectRoot}</module>`);
  xmldoc.childNamed('modules').children.push(fragment);
  tree.write(filePath, xmlToString(xmldoc));
}

export default applicationGenerator;

