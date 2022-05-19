#!/usr/bin/env node

import { Bitbucket } from 'bitbucket';
import fs from 'fs';
import kleur from 'kleur';
import loading from 'loading-cli';
import { Options, Schema } from 'bitbucket/lib/bitbucket';
const fetch = require('node-fetch');
import path from 'path';
import prompts from 'prompts';
import { compareVersions } from './lib/utils';
import { passwordDecrypt, passwordEncrypt } from './lib/crypto';
import {
    errorMessage,
    icons,
    printHeader,
    printNewVersionNotice,
    printRepoHeader,
    printRepoLine,
    printTotalLine,
    sayGoodbye,
} from './lib/terminal';
import type {
    BetterPrCache,
    BetterPrCacheRepository,
    BetterPrCacheWorkspace,
    RegistryResponse,
} from './lib/types';

const baseClientOptions: Options = {
    baseUrl: 'https://api.bitbucket.org/2.0',
    notice: false,
};
const cacheFileName = 'betterpr_cache.json';
const cacheFilePath = path.join(__dirname, cacheFileName);
const NPM_REGISTRY_URL = 'https://registry.npmjs.com/';

const main = async () => {
    // Version and Header
    const packageJsonPath = path.join(__dirname, '..', 'package.json');
    const {
        name: packageName,
        version: localVersion,
        author: { name },
    } = require(packageJsonPath);
    // Get State Configuration
    if (!fs.existsSync(cacheFilePath)) {
        fs.writeFileSync(
            cacheFilePath,
            JSON.stringify({
                version: localVersion,
            })
        );
    }
    let betterPrCache: BetterPrCache = JSON.parse(
        fs.readFileSync(cacheFilePath, { encoding: 'utf8' })
    );

    const response = await fetch(`${NPM_REGISTRY_URL}${packageName}`);
    const data = (await response.json()) as RegistryResponse;
    const npmVersion = data['dist-tags'].latest;
    const newerVersionAvailable =
        compareVersions(npmVersion, localVersion) >= 1;

    printHeader(localVersion, name);
    if (newerVersionAvailable) {
        printNewVersionNotice(npmVersion);
    }

    if (
        !betterPrCache.version ||
        compareVersions(localVersion, betterPrCache.version) >= 1
    ) {
        betterPrCache.version = localVersion;
        betterPrCache.workspace = undefined;
        betterPrCache.repositories = undefined;
        saveCache(betterPrCache);
    }
    // Check Username and Password
    console.log('');
    let useStoredCreds = false;
    if (betterPrCache.username && betterPrCache.password) {
        const { useCreds } = await prompts([
            {
                type: 'toggle',
                name: 'useCreds',
                message: 'Use stored credentials?',
                initial: true,
                active: 'Yes',
                inactive: 'No',
            },
        ]);
        useStoredCreds = useCreds;
    }
    let username = '';
    let password = '';
    if (useStoredCreds === true && betterPrCache.password) {
        username = betterPrCache.username || '';
        password = passwordDecrypt(betterPrCache.password);
        console.log(
            `${icons.greenCheck()}${kleur
                .white()
                .bold(' Using Bitbucket username:')} ${username}`
        );
        console.log(
            `${icons.greenCheck()}${kleur
                .white()
                .bold(' Using stored password! 🎉')}`
        );
    } else if (useStoredCreds === false) {
        // Get Username and App Password
        const { enteredUsername, enteredAppPassword } = await prompts([
            {
                type: 'text',
                name: 'enteredUsername',
                message: 'Enter your Bitbucket username>',
                validate: (value) =>
                    !value ? 'Must provide a username' : true,
            },
            {
                type: 'invisible',
                name: 'enteredAppPassword',
                message: 'Enter your Bitbucket APP password>',
                validate: (value) =>
                    !value ? 'Must provide an app password' : true,
            },
        ]);
        if (!enteredUsername || !enteredAppPassword) {
            sayGoodbye();
            return;
        }
        // Save Username and App Password
        betterPrCache.username = enteredUsername;
        username = enteredUsername;
        betterPrCache.password = passwordEncrypt(enteredAppPassword);
        password = enteredAppPassword;
        betterPrCache.workspace = undefined;
        betterPrCache.repositories = undefined;
        saveCache(betterPrCache);
    } else {
        sayGoodbye();
        return;
    }
    try {
        // Setup Bitbucket Client
        const bitbucket = new Bitbucket({
            ...baseClientOptions,
            auth: {
                username,
                password,
            },
        });
        // Get User
        const { data: user } = await bitbucket.user.get({});
        // Check Workspace
        console.log('');
        let useStoredWorkspace = false;
        if (betterPrCache.workspace) {
            const { useWorkspace } = await prompts([
                {
                    type: 'toggle',
                    name: 'useWorkspace',
                    message: 'Use stored workspace?',
                    initial: true,
                    active: 'Yes',
                    inactive: 'No',
                },
            ]);
            useStoredWorkspace = useWorkspace;
        }
        let workspace: Schema.Workspace | BetterPrCacheWorkspace;
        if (useStoredWorkspace === true) {
            workspace = betterPrCache.workspace as BetterPrCacheWorkspace;
            console.log(
                `${icons.greenCheck()}${kleur
                    .white()
                    .bold(' Using stored workspace:')} ${workspace.name || ''}`
            );
        } else if (useStoredWorkspace === false) {
            // Workspaces
            const availableWorkspaces: Array<Schema.Workspace> = [];
            const { data: workspaceData } =
                await bitbucket.workspaces.getWorkspaces({});
            workspaceData.values?.forEach((workspaceDatum) => {
                if (workspaceDatum) {
                    availableWorkspaces.push(workspaceDatum);
                }
            });
            const { selectedWorkspace } = await prompts([
                {
                    type: 'select',
                    name: 'selectedWorkspace',
                    message: 'Pick a workspace>',
                    choices: availableWorkspaces.map((availableWorkspace) => {
                        return {
                            title: availableWorkspace.name || '',
                            value: availableWorkspace.uuid || '',
                        };
                    }),
                },
            ]);
            if (!selectedWorkspace) {
                sayGoodbye();
                return;
            }
            workspace = availableWorkspaces.find(
                (availableWorkspace) =>
                    availableWorkspace.uuid === selectedWorkspace
            ) as Schema.Workspace;
            betterPrCache.workspace = {
                uuid: workspace.uuid || '',
                name: workspace.name || '',
            };
            betterPrCache.repositories = undefined;
            saveCache(betterPrCache);
        } else {
            sayGoodbye();
            return;
        }
        // Check Repos
        console.log('');
        let useStoredRepos = false;
        if (betterPrCache.repositories) {
            const { useRepos } = await prompts([
                {
                    type: 'toggle',
                    name: 'useRepos',
                    message: 'Use stored repositories?',
                    initial: true,
                    active: 'Yes',
                    inactive: 'No',
                },
            ]);
            useStoredRepos = useRepos;
        }
        let repos: Array<Schema.Repository> | Array<BetterPrCacheRepository> =
            [];
        if (useStoredRepos === true) {
            repos =
                betterPrCache.repositories as Array<BetterPrCacheRepository>;
            console.log(
                `${icons.greenCheck()}${kleur
                    .white()
                    .bold(' Using stored repositories:')} ${repos
                    .map((repo) => repo.name || '')
                    .join(', ')}`
            );
        } else if (useStoredRepos === false) {
            // Repositories
            const availableRepos: Array<Schema.Repository> = [];
            const { data: repoData } = await bitbucket.repositories.list({
                workspace: workspace.uuid as string,
                pagelen: 50,
            });
            repoData.values?.forEach((repoDatum) => {
                if (repoDatum) {
                    availableRepos.push(repoDatum);
                }
            });
            const { selectedRepos } = await prompts([
                {
                    type: 'multiselect',
                    name: 'selectedRepos',
                    message: 'Pick repositories>',
                    choices: availableRepos.map((availableRepo) => {
                        return {
                            title: availableRepo.name || '',
                            value: availableRepo.uuid || '',
                        };
                    }),
                },
            ]);
            if (!selectedRepos) {
                sayGoodbye();
                return;
            }
            repos = availableRepos.filter((availableRepo) =>
                selectedRepos.includes(availableRepo.uuid)
            ) as Array<Schema.Repository>;
            betterPrCache.repositories = repos.map((repo) => {
                return {
                    uuid: repo.uuid || '',
                    name: repo.name || '',
                };
            });
            saveCache(betterPrCache);
        } else {
            sayGoodbye();
        }
        let counts = {
            reviewerUnapproved: 0,
            reviewerApproved: 0,
            notReviewer: 0,
            author: 0,
            wip: 0,
        };
        for (let repo of repos) {
            printRepoHeader(repo.name);
            const { data: rawPrs } =
                await bitbucket.repositories.listPullRequests({
                    repo_slug: repo.uuid || '',
                    state: 'OPEN',
                    workspace: workspace.uuid || '',
                    pagelen: 50,
                });
            let openPrs = rawPrs.values as Array<Schema.Pullrequest>;
            if (openPrs.length <= 0) {
                console.log(kleur.italic('No open PRs! 🎉'));
                continue;
            }
            const load = loading({
                text: kleur.italic('Loading PRs...'),
                color: 'magenta',
            }).start();
            const formattedPrs = (
                await Promise.all(
                    openPrs.map(async (openPr) => {
                        const { data: rawPr } =
                            await bitbucket.repositories.getPullRequest({
                                pull_request_id: openPr.id || 0,
                                repo_slug: repo.uuid || '',
                                workspace: workspace.uuid || '',
                            });
                        // Order:
                        //   10 - Reviewer Unapproved
                        //   20 - Reviewer Approved
                        //   30 - Not Reviewer
                        //   40 - Author
                        //   50 - WIP
                        if (
                            rawPr.title &&
                            rawPr.title.toLowerCase().indexOf('[wip]') !== -1
                        ) {
                            counts.wip += 1;
                            return {
                                order: 50,
                                display: printRepoLine(50, rawPr),
                            };
                        } else if (
                            rawPr.author &&
                            rawPr.author.uuid === user.uuid
                        ) {
                            counts.author += 1;
                            return {
                                order: 40,
                                display: printRepoLine(40, rawPr),
                            };
                        } else {
                            const participation = rawPr.participants?.find(
                                (participant) =>
                                    participant.user?.uuid === user.uuid
                            ) as Schema.Participant;
                            if (!participation) {
                                counts.notReviewer += 1;
                                return {
                                    order: 30,
                                    display: printRepoLine(30, rawPr),
                                };
                            } else {
                                if (participation.approved) {
                                    counts.reviewerApproved += 1;
                                    return {
                                        order: 20,
                                        display: printRepoLine(20, rawPr),
                                    };
                                } else {
                                    counts.reviewerUnapproved += 1;
                                    return {
                                        order: 10,
                                        display: printRepoLine(10, rawPr),
                                    };
                                }
                            }
                        }
                    })
                )
            ).sort((a, b) => a.order - b.order);
            load.stop();
            console.log(formattedPrs.map((pr) => pr.display).join('\n'));
        }

        const needPadding = Object.values(counts).some((count) => count > 9);
        console.log('');
        printTotalLine(
            kleur.red,
            icons.redEx(),
            counts.reviewerUnapproved,
            needPadding,
            '- Reviewer, Not Approved'
        );
        printTotalLine(
            kleur.green,
            icons.greenCheck(),
            counts.reviewerApproved,
            needPadding,
            '- Reviewer, Approved'
        );
        printTotalLine(
            kleur.magenta,
            icons.magentaQuestion(),
            counts.notReviewer,
            needPadding,
            '- Not Reviewer'
        );
        printTotalLine(
            kleur.blue,
            icons.blueCircle(),
            counts.author,
            needPadding,
            '- Author'
        );
        printTotalLine(
            kleur.white,
            ' ',
            counts.wip,
            needPadding,
            '- Work In Progress'
        );
        console.log(
            kleur.yellow(
                `${icons.yellowTri()} ${
                    needPadding ? '  ' : ' '
                } - Requested Changes`
            )
        );
    } catch (error) {
        errorMessage((error as any).message);
        betterPrCache = {
            version: localVersion,
        };
        saveCache(betterPrCache);
    } finally {
        sayGoodbye();
        return;
    }
};

const saveCache = (cache: BetterPrCache) =>
    fs.writeFileSync(cacheFilePath, JSON.stringify(cache));

main();
