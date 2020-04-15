"use strict";

import * as fs from "fs";
import * as path from "path";
import * as tl from "azure-pipelines-task-lib/task";
import RegistryAuthenticationToken from "./docker-common-v2/registryauthenticationprovider/registryauthenticationtoken";
import ContainerConnection from "./docker-common-v2/containerconnection";
import { getDockerRegistryEndpointAuthenticationToken } from "./docker-common-v2/registryauthenticationprovider/registryauthenticationtoken";
import * as dockerCommandUtils from "./docker-common-v2/dockercommandutils";
import * as pipelineUtils from "./docker-common-v2/pipelineutils";
import * as fileUtils from "./docker-common-v2/fileutils";
import * as helpers from "./helpers";
import DockerComposeConnection from "./docker-compose-common/dockercomposeconnection";

export async function run(connection: ContainerConnection, outputUpdate: (data: string) => any, isBuildAndPushCommand?: boolean): Promise<void> {
    console.log("\nStarting Docker Compose Cache Pull...");
    let cacheImagePostfix = tl.getInput("cacheImagePostfix")!;

    // Change to any specified working directory
    const cwd = tl.getInput("cwd")!;
    console.log(`Changing directory to: ${cwd}`);
    tl.cd(cwd);

    console.log();

    console.log("Opening Docker-Compose connection...");
    var dockerComposeConnection = new DockerComposeConnection(connection);
    try {
        await dockerComposeConnection.open();
        console.log();
        
        console.log("Generating final compose file...")
        let finalComposeFile = fs.readFileSync(dockerComposeConnection.finalComposeFile, 'utf8');

        console.log(`Final compose file:\n${finalComposeFile}`);
        console.log();

        let imageNamesDockerCompose = helpers.findImageNamesInDockerComposeFile(finalComposeFile);

        let completeDockerComposeExtension = "version: '3.4'\n\nservices:\n";

        for (let y = 0; y < imageNamesDockerCompose.length; y++) {
            var curDockerComposeEntry = imageNamesDockerCompose[y];
            completeDockerComposeExtension += `  ${curDockerComposeEntry.serviceName}:\n  build:\n    cache_from:\n`

            let dockerFileContent = fs.readFileSync(curDockerComposeEntry.dockerFile, 'utf8');
            let stagesInDockerFile = helpers.countStagesInDockerFile(dockerFileContent);
        
            
            let stagingImageName = helpers.convertToCachedImageName(curDockerComposeEntry.imageName, cacheImagePostfix);
        
            //let cacheArgumentDockerBuild = "";
            let i = 0;
            try {
                for (i = 0; i < stagesInDockerFile; i++) {
                    let fullImageName = `${stagingImageName}:${i}`;
        
                    console.log(`Pulling ${fullImageName}`);
        
                    let totalOutput = "Output:";
                    await dockerCommandUtils.pull(connection, fullImageName, "", (thisOutput) => totalOutput += `${thisOutput}\n`)
                    console.log(totalOutput);        
        
                    //cacheArgumentDockerBuild += `--cache-from=${fullImageName} `;
                    completeDockerComposeExtension += `    - ${fullImageName}\n`;
                }
                completeDockerComposeExtension += '\n';
            } catch (ex) {
                console.log(`Warning, couldn't find cached container with name '${stagingImageName}:${i}. This could be because this is the first run. Exception: ${ex}`);
            }
            //console.log(`cacheArgumentDockerBuild: ${cacheArgumentDockerBuild}`);
        }
        console.log();
        console.log("Please ensure your docker-compose files has the following cache lines to make sure caching works:");
        console.log(completeDockerComposeExtension);
    }
    finally {
        dockerComposeConnection.close();
    }
}