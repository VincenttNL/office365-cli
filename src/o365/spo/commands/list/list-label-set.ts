import auth from '../../SpoAuth';
import config from '../../../../config';
import commands from '../../commands';
import GlobalOptions from '../../../../GlobalOptions';
import * as request from 'request-promise-native';
import {
  CommandOption,
  CommandValidate
} from '../../../../Command';
import SpoCommand from '../../SpoCommand';
import Utils from '../../../../Utils';
import { Auth } from '../../../../Auth';
import { ListInstance } from './ListInstance';

const vorpal: Vorpal = require('../../../../vorpal-init');

interface CommandArgs {
  options: Options;
}

interface Options extends GlobalOptions {
  webUrl: string;
  label: string;
  listId?: string;
  listTitle?: string;
  listUrl?: string;
  syncToItems?: boolean;
  blockDelete?: boolean;
  blockEdit?: boolean;
}

class SpoListLabelSetCommand extends SpoCommand {
  public get name(): string {
    return commands.LIST_LABEL_SET;
  }

  public get description(): string {
    return 'Sets classification label on the specified list';
  }

  public getTelemetryProperties(args: CommandArgs): any {
    const telemetryProps: any = super.getTelemetryProperties(args);
    telemetryProps.listId = (!(!args.options.listId)).toString();
    telemetryProps.listTitle = (!(!args.options.listTitle)).toString();
    telemetryProps.listUrl = (!(!args.options.listUrl)).toString();
    telemetryProps.syncToItems = args.options.syncToItems || false;
    telemetryProps.blockDelete = args.options.blockDelete || false;
    telemetryProps.blockEdit = args.options.blockEdit || false;
    return telemetryProps;
  }

  public commandAction(cmd: CommandInstance, args: CommandArgs, cb: () => void): void {
    const resource: string = Auth.getResourceFromUrl(args.options.webUrl);
    let siteAccessToken: string = '';

    if (this.debug) {
      cmd.log(`Retrieving access token for ${resource}...`);
    }

    auth
      .getAccessToken(resource, auth.service.refreshToken as string, cmd, this.debug)
      .then((accessToken: string): Promise<string> => {
        siteAccessToken = accessToken;

        if (this.debug) {
          cmd.log(`Retrieved access token ${accessToken}.`);
        }

        let listRestUrl: string = '';

        if (args.options.listUrl) {
          const listServerRelativeUrl: string = Utils.getServerRelativePath(args.options.webUrl, args.options.listUrl);

          return Promise.resolve(listServerRelativeUrl);
        }
        else if (args.options.listId) {
          listRestUrl = `lists(guid'${encodeURIComponent(args.options.listId)}')/`;
        }
        else {
          listRestUrl = `lists/getByTitle('${encodeURIComponent(args.options.listTitle as string)}')/`;
        }

        const requestOptions: any = {
          url: `${args.options.webUrl}/_api/web/${listRestUrl}?$expand=RootFolder&$select=RootFolder`,
          headers: Utils.getRequestHeaders({
            authorization: `Bearer ${siteAccessToken}`,
            'accept': 'application/json;odata=nometadata'
          }),
          json: true
        };

        if (this.debug) {
          cmd.log('Executing web request...');
          cmd.log(requestOptions);
          cmd.log('');
        }

        return request.get(requestOptions)
          .then((listInstance: ListInstance): Promise<string> => {
            if (this.debug) {
              cmd.log('Response:');
              cmd.log(listInstance);
              cmd.log('');
            }

            return Promise.resolve(listInstance.RootFolder.ServerRelativeUrl);
          });
      })
      .then((listServerRelativeUrl: string): request.RequestPromise => {
        const listAbsoluteUrl: string = Utils.getAbsoluteUrl(args.options.webUrl, listServerRelativeUrl);
        const requestUrl: string = `${args.options.webUrl}/_api/SP_CompliancePolicy_SPPolicyStoreProxy_SetListComplianceTag`;
        const requestOptions: any = {
          url: requestUrl,
          headers: Utils.getRequestHeaders({
            authorization: `Bearer ${siteAccessToken}`,
            'accept': 'application/json;odata=nometadata'
          }),
          body: {
            listUrl: listAbsoluteUrl,
            complianceTagValue: args.options.label,
            blockDelete: args.options.blockDelete || false,
            blockEdit: args.options.blockEdit || false,
            syncToItems: args.options.syncToItems || false
          },
          json: true
        };

        if (this.debug) {
          cmd.log('Executing web request...');
          cmd.log(requestOptions);
          cmd.log('');
        }

        return request.post(requestOptions);
      })
      .then((res: any): void => {
        if (this.verbose) {
          cmd.log(vorpal.chalk.green('DONE'));
        }

        cb();
      }, (err: any): void => this.handleRejectedODataJsonPromise(err, cmd, cb));
  }

  public options(): CommandOption[] {
    const options: CommandOption[] = [
      {
        option: '-u, --webUrl <webUrl>',
        description: 'The URL of the site where the list is located'
      },
      {
        option: '--label <label>',
        description: 'The label to set on the list'
      },
      {
        option: '-t, --listTitle [listTitle]',
        description: 'The title of the list on which to set the label. Specify only one of listTitle, listId or listUrl'
      },
      {
        option: '-l, --listId [listId]',
        description: 'The ID of the list on which to set the label. Specify only one of listTitle, listId or listUrl'
      },
      {
        option: '--listUrl [listUrl]',
        description: 'Server- or web-relative URL of the list on which to set the label. Specify only one of listTitle, listId or listUrl'
      },
      {
        option: '--syncToItems',
        description: 'Specify, to set the label on all items in the list'
      },
      {
        option: '--blockDelete',
        description: 'Specify, to disallow deleting items in the list'
      },
      {
        option: '--blockEdit',
        description: 'Specify, to disallow editing items in the list'
      }
    ];

    const parentOptions: CommandOption[] = super.options();
    return options.concat(parentOptions);
  }

  public validate(): CommandValidate {
    return (args: CommandArgs): boolean | string => {
      if (!args.options.label) {
        return 'Required parameter label missing';
      }

      if (!args.options.webUrl) {
        return 'Required parameter webUrl missing';
      }

      if (!args.options.listId && !args.options.listTitle && !args.options.listUrl) {
        return `Specify listId or listTitle or listUrl.`;
      }

      if (args.options.listId && !Utils.isValidGuid(args.options.listId)) {
        return `${args.options.listId} is not a valid GUID`;
      }

      return SpoCommand.isValidSharePointUrl(args.options.webUrl);
    };
  }

  public commandHelp(args: {}, log: (help: string) => void): void {
    const chalk = vorpal.chalk;
    log(vorpal.find(this.name).helpInformation());
    log(
      `  ${chalk.yellow('Important:')} before using this command, log in to a SharePoint Online site,
    using the ${chalk.blue(commands.LOGIN)} command.
  
  Remarks:
  
    To set a list classification label, you have to first log in to SharePoint
    using the ${chalk.blue(commands.LOGIN)} command,
    eg. ${chalk.grey(`${config.delimiter} ${commands.LOGIN} https://contoso.sharepoint.com`)}.
        
  Examples:
  
    Sets classification label "Confidential" for list ${chalk.grey('Shared Documents')}
    located in site ${chalk.grey('https://contoso.sharepoint.com/sites/project-x')}
      ${chalk.grey(config.delimiter)} ${commands.LIST_LABEL_SET} --webUrl https://contoso.sharepoint.com/sites/project-x --listUrl 'Shared Documents' --label 'Confidential'

    Sets classification label "Confidential" and disables editing and deleting
    items on the list and all existing items for list ${chalk.grey('Documents')}
    located in site ${chalk.grey('https://contoso.sharepoint.com/sites/project-x')}
      ${chalk.grey(config.delimiter)} ${commands.LIST_LABEL_SET} --webUrl https://contoso.sharepoint.com/sites/project-x --listTitle 'Documents' --label 'Confidential' --blockEdit --blockDelete --syncToItems
`);
  }
}

module.exports = new SpoListLabelSetCommand();