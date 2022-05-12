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
import { errorMessage, icons, makeLink } from './lib/terminal';
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

    console.log(kleur.white().italic('Welcome to:'));
    console.log(kleur.red('   ___      __  __          ___  ___ '));
    console.log(kleur.yellow('  / _ )___ / /_/ /____ ____/ _ \\/ _ \\'));
    console.log(kleur.green(' / _  / -_) __/ __/ -_) __/ ___/ , _/'));
    console.log(kleur.cyan('/____/\\__/\\__/\\__/\\__/_/ /_/  /_/|_| \n'));
    console.log(
        kleur.italic(
            `${' '.repeat(7)}${kleur.magenta(`v${localVersion}`)}${kleur.white(
                ' by '
            )}${kleur.blue(name)}`
        )
    );
    // Show New Version Banner
    if (newerVersionAvailable) {
        console.log(
            kleur.italic(
                `\n${' '.repeat(6)}Version ${kleur.green(
                    npmVersion
                )} available!`
            )
        );
        console.log(kleur.yellow('   npm up -g @hunterparks/betterpr'));
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
            console.log(
                '\n' +
                    kleur.green().bold('[Open] ') +
                    kleur
                        .white()
                        .bold(`PRs for ${kleur.italic(repo.name || '')}`)
            );

            const { data: prData } =
                await bitbucket.repositories.listPullRequests({
                    repo_slug: repo.uuid || '',
                    state: 'OPEN',
                    workspace: workspace.uuid || '',
                    pagelen: 50,
                });
            let openPrs = prData.values as Array<Schema.Pullrequest>;
            if (openPrs.length <= 0) {
                console.log(kleur.italic('No open PRs! 🎉'));
                continue;
            }
            const organizedPrs: Array<{
                pr: Schema.Pullrequest;
                order: number;
            }> = [];
            const load = loading({
                text: kleur.italic('Loading PRs...'),
                color: 'magenta',
            }).start();
            for (let pr of openPrs) {
                const { data } = await bitbucket.repositories.getPullRequest({
                    pull_request_id: pr.id || 0,
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
                    data.title &&
                    data.title.toLocaleLowerCase().indexOf('[wip]') !== -1
                ) {
                    organizedPrs.push({
                        order: 50,
                        pr: data,
                    });
                } else if (data.author && data.author.uuid === user.uuid) {
                    organizedPrs.push({
                        order: 40,
                        pr: data,
                    });
                } else {
                    const participation = data.participants?.find(
                        (participant) => participant.user?.uuid === user.uuid
                    ) as Schema.Participant;
                    if (!participation) {
                        organizedPrs.push({
                            order: 30,
                            pr: data,
                        });
                    } else {
                        if (participation.approved) {
                            organizedPrs.push({
                                order: 20,
                                pr: data,
                            });
                        } else {
                            organizedPrs.push({
                                order: 10,
                                pr: data,
                            });
                        }
                    }
                }
            }
            organizedPrs
                .sort((prA, prB) => prA.order - prB.order)
                .forEach((organizedPr, index) => {
                    load.stop();
                    let prepend = '';
                    switch (organizedPr.order) {
                        case 10: {
                            // Reviewer Unapproved
                            counts.reviewerUnapproved += 1;
                            prepend = icons.redEx();
                            break;
                        }
                        case 20: {
                            // Reviewer Approved
                            counts.reviewerApproved += 1;
                            prepend = icons.greenCheck();
                            break;
                        }
                        case 30: {
                            // Not Reviewer
                            counts.notReviewer += 1;
                            prepend = icons.magentaQuestion();
                            break;
                        }
                        case 40: {
                            // Author
                            counts.author += 1;
                            prepend = icons.blueCircle();
                            break;
                        }
                        case 50: {
                            // WIP
                            counts.wip += 1;
                            prepend = ' ';
                            break;
                        }
                        default: {
                            prepend = kleur.white('-');
                        }
                    }
                    if (
                        organizedPr.pr.participants
                            ?.map((participant) => participant.state || '')
                            .some((state) => state === 'changes_requested')
                    ) {
                        prepend = `${icons.yellowTri()} ${prepend}`;
                    } else {
                        prepend = `  ${prepend}`;
                    }
                    const approvedCount = organizedPr.pr.participants?.reduce(
                        (prev, curr) => {
                            if (curr.role === 'REVIEWER') {
                                return prev + (curr.approved ? 1 : 0);
                            }
                            return prev;
                        },
                        0
                    ) as number;
                    const approvalsNeeded = 2;
                    let approvalText = `[${approvedCount}/${approvalsNeeded}]`;
                    if (approvedCount <= 0) {
                        approvalText = kleur.red(approvalText);
                    } else if (approvedCount >= approvalsNeeded) {
                        approvalText = kleur.green(approvalText);
                    } else {
                        approvalText = kleur.yellow(approvalText);
                    }
                    if (organizedPr.pr.title) {
                        console.log(
                            (index > 0 ? '' : '\n') +
                                `${prepend} ` +
                                `${approvalText} ` +
                                makeLink(
                                    organizedPr.pr.title,
                                    organizedPr.pr.links?.html?.href || ''
                                )
                        );
                    }
                });
        }
        const anyCountOver9 = Object.values(counts).some((count) => count > 9);
        console.log('');
        console.log(
            kleur.red(
                `${icons.redEx()} ${
                    counts.reviewerUnapproved < 10 && anyCountOver9
                        ? ` ${counts.reviewerUnapproved}`
                        : counts.reviewerUnapproved
                } - Reviewer, Not Approved`
            )
        );
        console.log(
            kleur.green(
                `${icons.greenCheck()} ${
                    counts.reviewerApproved < 10 && anyCountOver9
                        ? ` ${counts.reviewerApproved}`
                        : counts.reviewerApproved
                } - Reviewer, Approved`
            )
        );
        console.log(
            kleur.magenta(
                `${icons.magentaQuestion()} ${
                    counts.notReviewer < 10 && anyCountOver9
                        ? ` ${counts.notReviewer}`
                        : counts.notReviewer
                } - Not Reviewer`
            )
        );
        console.log(
            kleur.blue(
                `${icons.blueCircle()} ${
                    counts.author < 10 && anyCountOver9
                        ? ` ${counts.author}`
                        : counts.author
                } - Author`
            )
        );
        console.log(
            `  ${
                counts.wip < 10 && anyCountOver9 ? ` ${counts.wip}` : counts.wip
            } - Work In Progress`
        );
        console.log(
            kleur.yellow(
                `${icons.yellowTri()} ${
                    anyCountOver9 ? '  ' : ' '
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

const sayGoodbye = () =>
    console.log(
        kleur.white().italic('\nGoodbye!'),
        kleur.red('■'),
        kleur.yellow('■'),
        kleur.green('■'),
        kleur.cyan('■'),
        kleur.blue('■'),
        kleur.magenta('■'),
        kleur.white('■'),
        kleur.grey('■'),
        kleur.black('■')
    );

const saveCache = (cache: BetterPrCache) =>
    fs.writeFileSync(cacheFilePath, JSON.stringify(cache));

main();
