import tl = require('vsts-task-lib/task');
import fs = require('fs');
import path = require('path');
import { TaskParameters } from './TaskParameters';
import { WebDeployArguments, WebDeployResult } from 'webdeployment-common/msdeployutility';
import {  executeWebDeploy } from 'webdeployment-common/deployusingmsdeploy';
import { Package } from 'webdeployment-common/packageUtility';
import { copySetParamFileIfItExists } from 'webdeployment-common/utility';
import { AzureAppServiceUtility } from './AzureAppServiceUtility';
const DEFAULT_RETRY_COUNT = 3;

export class WebDeployUtility {
    public static async publishUsingWebDeploy(taskParameters: TaskParameters, webDeployArguments: WebDeployArguments, azureAppServiceUtility: AzureAppServiceUtility) {
        var retryCountParam = tl.getVariable("appservice.msdeployretrycount");
        var retryCount = (retryCountParam && !(isNaN(Number(retryCountParam)))) ? Number(retryCountParam): DEFAULT_RETRY_COUNT;
        let webDeployResult: WebDeployResult;
        while(retryCount > 0) {
                webDeployResult= await executeWebDeploy(webDeployArguments, await azureAppServiceUtility.getWebDeployPublishingProfile());
                if(!webDeployResult.isSuccess) {
                    WebDeployUtility.webDeployRecommendationForIssue(taskParameters, webDeployResult.errorCode, azureAppServiceUtility, false);
                }
                else {
                    break;
                }

                retryCount -= 1;
        }

        if(!webDeployResult.isSuccess) {
            WebDeployUtility.webDeployRecommendationForIssue(taskParameters, webDeployResult.errorCode, azureAppServiceUtility, true);
            throw new Error(webDeployResult.error);
        }
        
    }

    public static constructWebDeployArguments(taskParameters: TaskParameters, publishProfile: any): WebDeployArguments {
        let webDeployArguments: any = {};
        webDeployArguments.package = new Package(taskParameters.Package);
        webDeployArguments.additionalArguments = taskParameters.AdditionalArguments;
        webDeployArguments.appName = taskParameters.WebAppName;
        webDeployArguments.excludeFilesFromAppDataFlag = taskParameters.ExcludeFilesFromAppDataFlag;
        webDeployArguments.publishUrl = publishProfile.publishUrl;
        webDeployArguments.password = publishProfile.userPWD;
        webDeployArguments.removeAdditionalFilesFlag = taskParameters.RemoveAdditionalFilesFlag;
        let setParametersFile = copySetParamFileIfItExists(taskParameters.SetParametersFile);
        if(setParametersFile) {
            webDeployArguments.setParametersFile = setParametersFile.slice(setParametersFile.lastIndexOf('\\') + 1, setParametersFile.length);
        }

        webDeployArguments.takeAppOfflineFlag = taskParameters.TakeAppOfflineFlag;
        webDeployArguments.userName = publishProfile.userName;
        webDeployArguments.useWebDeploy = taskParameters.UseWebDeploy;
        webDeployArguments.virtualApplication = taskParameters.VirtualApplication;

        return webDeployArguments as WebDeployArguments;
    }

    public static async webDeployRecommendationForIssue(taskParameters: TaskParameters, errorCode: string, azureAppServiceUtility: AzureAppServiceUtility, isRecommendation: boolean) {
        switch(errorCode) {
            case 'ERROR_CONNECTION_TERMINATED': {
                if(!isRecommendation) {
                    await azureAppServiceUtility.pingApplication();
                }
                break;
            }
            case 'ERROR_INSUFFICIENT_ACCESS_TO_SITE_FOLDER': {
                tl.warning(tl.loc("Trytodeploywebappagainwithappofflineoptionselected"));
                break;
            }
            case 'WebJobsInProgressIssue': {
                tl.warning(tl.loc('WebJobsInProgressIssue'));
                break;
            }
            case 'FILE_IN_USE': {
                if(!isRecommendation && taskParameters.RenameFilesFlag) {
                    await azureAppServiceUtility.enableRenameLockedFiles();
                }
                tl.warning(tl.loc("Trytodeploywebappagainwithrenamefileoptionselected"));
                break;
            }
            case 'transport connection': {
                tl.warning(tl.loc("Updatemachinetoenablesecuretlsprotocol"));
                break;
            }
            default:
                break;
        }
    }
}