exports.createSchemaCustomization = ({ actions }) => {
  const { createTypes } = actions;

  createTypes(`
    type InstallConfig @dontInfer {
      id: ID!
      agentName: String!
      agentType: String!
      title: String!
      intro: MDXConfig
      appInfo: [AppInfoOption!]!
      steps: [InstallStep]
      mdxFiles: [Mdx]
      whatsNext: MDXConfig
      agentConfigFile: File
    }
    type allInstallConfig @dontInfer {
      id: ID!
      nodes: [InstallConfig]
    }
    type MDXConfig @dontInfer {
      filePath: String
      mdx: Mdx
    }
    type AppInfoOption @dontInfer {
      optionType: String!
      label: String!
      options: [AppInfoOptionValue!]!
    }
    type AppInfoOptionValue @dontInfer {
      value: String!
      displayName: String!
      recommendedGuided: Boolean
    }
    type InstallStep @dontInfer {
      filePath: String
      mdx: Mdx
      overrides: [StepOverride]
    }
    type StepOverride @dontInfer {
      optionType: String!
      overrideConfig: [StepOverrideConfig]
    }
    type StepOverrideConfig @dontInfer {
      value: String!
      filePath: String
      mdx: Mdx
      skip: Boolean
      overrides: [StepOverride]
    }
    type Mdx implements Node {
      frontmatter: Frontmatter
    }
    type Frontmatter {
      componentType: String!
      headingText: String
      descriptionText: String
      inputOptions: [InputOption]
      agentConfigFilePath: String
      optionType: String
    }
    type InputOption @dontInfer {
      name: String!
      codeLine: String!
      label: String!
      defaultValue: String!
      toolTip: String,
      url: InputUrl,
    }
    type InputUrl {
      title: String!
      href: String!
    }
  `);
};

exports.createResolvers = ({ createResolvers, createNodeId }) => {
  createResolvers({
    Query: {
      installConfig: {
        type: 'InstallConfig',
        args: {
          agentName: 'String!',
          id: 'String!',
        },
        resolve: async (_source, args, context) => {
          const { agentName, id } = args;
          const { nodeModel } = context;
          let installConfigYaml;

          if (!agentName && !id) {
            return null;
          }

          if (id && !agentName) {
            installConfigYaml = await nodeModel.findOne({
              type: 'ConfigYaml',
              query: {
                filter: {
                  id: { eq: id },
                },
              },
            });
          } else {
            installConfigYaml = await nodeModel.findOne({
              type: 'ConfigYaml',
              query: {
                filter: {
                  agentName: { eq: agentName },
                },
              },
            });
          }

          if (!installConfigYaml) {
            return null;
          }

          const returnVal = await getReturnPayload(
            nodeModel,
            createNodeId,
            installConfigYaml
          );

          return returnVal;
        },
      },
      allInstallConfig: {
        type: 'allInstallConfig',
        resolve: async (_source, args, context) => {
          const { nodeModel } = context;
          const returnData = [];

          const { entries: installConfigYamls } = await nodeModel.findAll({
            type: 'ConfigYaml',
          });

          for (const installConfigYaml of installConfigYamls) {
            returnData.push(
              await getReturnPayload(nodeModel, createNodeId, installConfigYaml)
            );
          }

          return { nodes: returnData };
        },
      },
    },
  });
};

// const findAgentConfigFiles = (mdxFiles) => mdxFiles.flatMa((mdx) => {

// });

// const isAgentConfigFile = ({ frontmatter: { componentType } }) =>
//   componentType === 'agentConfig';

const mapFileNametoFile = (step, files) => {
  const { filePath, overrides } = step;
  const mdx = findMdxFile(filePath, files);

  if (!overrides) {
    return { ...step, mdx };
  }

  const newOverrides = overrides.map((override) => {
    const { overrideConfig } = override;
    const newOverrideConfig = overrideConfig.map((config) =>
      mapFileNametoFile(config, files)
    );
    return { ...override, overrideConfig: newOverrideConfig };
  });

  return { ...step, mdx, overrides: newOverrides };
};

const findMdxFile = (filePath, files) =>
  files.find(({ fileAbsolutePath }) => fileAbsolutePath.includes(filePath));

const getReturnPayload = async (nodeModel, createNodeId, installConfigYaml) => {
  const { entries: allMdx } = await nodeModel.findAll({
    type: 'Mdx',
    query: {
      filter: {
        fileAbsolutePath: {
          regex: `/src/install/${installConfigYaml.agentName.toLowerCase()}/`,
        },
      },
    },
  });

  const mdxFiles = Array.from(allMdx);

  const {
    introFilePath,
    whatsNextFilePath,
    agentConfigFilePath,
    steps: installSteps,
    ...installConfigYamlContent
  } = installConfigYaml;

  const agentConfigFile = await nodeModel.findOne({
    type: 'File',
    query: {
      filter: {
        absolutePath: {
          regex: `/${agentConfigFilePath}/`,
        },
      },
    },
  });

  const introMdx = findMdxFile(introFilePath, mdxFiles);
  const whatsNextMdx = findMdxFile(whatsNextFilePath, mdxFiles);

  const intro = { filePath: introFilePath, mdx: introMdx };
  const whatsNext = { filePath: whatsNextFilePath, mdx: whatsNextMdx };

  const steps = installSteps?.map((step) =>
    mapFileNametoFile(step, Array.from(mdxFiles))
  );

  return {
    ...installConfigYamlContent,
    whatsNext,
    agentConfigFile,
    intro,
    steps,
    mdxFiles,
    id: createNodeId('installConfig'),
  };
};