#!/usr/bin/env node

import { Bitbucket } from "bitbucket";
import crypto from "crypto";
import fs from "fs";
import kleur from "kleur";
import loading from "loading-cli";
import { Options, Schema } from "bitbucket/lib/bitbucket";
import path from "path";
import prompts from "prompts";

type BetterPrCache = {
    username?: string;
    password?: BetterPrCachePassword;
    workspace?: string;
    repositories?: Array<string>;
};
type BetterPrCachePassword = {
    iv: string;
    content: string;
};
const baseClientOptions: Options = {
    baseUrl: "https://api.bitbucket.org/2.0",
    notice: false,
};
const cacheFileName = "betterpr_cache.json";
const cacheFilePath = path.join(__dirname, cacheFileName);
const algo = "aes-256-ctr";
const key = "NSCcA4wvkQxTKaJp7fFJsQM7mR8WEghn";

const blueCircle = () => kleur.blue("●");

const errorMessage = (message: string) =>
    console.log(`${kleur.red().bold("Error:")} ${message}`);

const greenCheck = () => kleur.green("✔");

const main = async () => {
    // Get State Configuration
    if (!fs.existsSync(cacheFilePath)) {
        fs.writeFileSync(cacheFilePath, JSON.stringify({}));
    }
    let betterPrCache: BetterPrCache = JSON.parse(
        fs.readFileSync(cacheFilePath, { encoding: "utf8" })
    );
    // Version and Header
    const packageJsonPath = path.join(__dirname, "..", "package.json");
    const {
        version,
        author: { name },
    } = require(packageJsonPath);
    console.log(kleur.white().italic("Welcome to:"));
    console.log(kleur.red("   ___      __  __          ___  ___ "));
    console.log(kleur.yellow("  / _ )___ / /_/ /____ ____/ _ \\/ _ \\"));
    console.log(kleur.green(" / _  / -_) __/ __/ -_) __/ ___/ , _/"));
    console.log(kleur.cyan("/____/\\__/\\__/\\__/\\__/_/ /_/  /_/|_| \n"));
    console.log(
        kleur.italic(
            `${" ".repeat(7)}${kleur.magenta(`v${version}`)}${kleur.white(
                " by "
            )}${kleur.blue(name)}`
        )
    );
    // Check Username and Password
    console.log("");
    let useStoredCreds = false;
    if (betterPrCache.username && betterPrCache.password) {
        const { useCreds } = await prompts([
            {
                type: "toggle",
                name: "useCreds",
                message: "Use stored credentials?",
                initial: true,
                active: "Yes",
                inactive: "No",
            },
        ]);
        useStoredCreds = useCreds;
    }
    let username = "";
    let password = "";
    if (useStoredCreds === true && betterPrCache.password) {
        username = betterPrCache.username || "";
        password = passwordDecrypt(betterPrCache.password);
        console.log(
            `${greenCheck()}${kleur
                .white()
                .bold(" Using Bitbucket username:")} ${username}`
        );
        console.log(
            `${greenCheck()}${kleur.white().bold(" Using stored password! 🎉")}`
        );
    } else if (useStoredCreds === false) {
        // Get Username and App Password
        const { enteredUsername, enteredAppPassword } = await prompts([
            {
                type: "text",
                name: "enteredUsername",
                message: "Enter your Bitbucket username>",
                validate: (value) =>
                    !value ? "Must provide a username" : true,
            },
            {
                type: "invisible",
                name: "enteredAppPassword",
                message: "Enter your Bitbucket APP password>",
                validate: (value) =>
                    !value ? "Must provide an app password" : true,
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
        console.log("");
        let useStoredWorkspace = false;
        if (betterPrCache.workspace) {
            const { useWorkspace } = await prompts([
                {
                    type: "toggle",
                    name: "useWorkspace",
                    message: "Use stored workspace?",
                    initial: true,
                    active: "Yes",
                    inactive: "No",
                },
            ]);
            useStoredWorkspace = useWorkspace;
        }
        let workspace: Schema.Workspace;
        if (useStoredWorkspace === true) {
            const { data: availableWorkspace } =
                await bitbucket.workspaces.getWorkspace({
                    workspace: betterPrCache.workspace || "",
                });
            workspace = availableWorkspace;
            console.log(
                `${greenCheck()}${kleur
                    .white()
                    .bold(" Using stored workspace:")} ${workspace.name || ""}`
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
                    type: "select",
                    name: "selectedWorkspace",
                    message: "Pick a workspace>",
                    choices: availableWorkspaces.map((availableWorkspace) => {
                        return {
                            title: availableWorkspace.name || "",
                            value: availableWorkspace.uuid || "",
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
            betterPrCache.workspace = workspace.uuid;
            betterPrCache.repositories = undefined;
            saveCache(betterPrCache);
        } else {
            sayGoodbye();
            return;
        }
        // Check Repos
        console.log("");
        let useStoredRepos = false;
        if (betterPrCache.repositories) {
            const { useRepos } = await prompts([
                {
                    type: "toggle",
                    name: "useRepos",
                    message: "Use stored repositories?",
                    initial: true,
                    active: "Yes",
                    inactive: "No",
                },
            ]);
            useStoredRepos = useRepos;
        }
        let repos: Array<Schema.Repository> = [];
        if (useStoredRepos === true) {
            await Promise.all(
                (betterPrCache.repositories as Array<string>).map(
                    async (repo) => {
                        const { data: repoData } =
                            await bitbucket.repositories.get({
                                repo_slug: repo,
                                workspace: workspace.uuid || "",
                            });
                        repos.push(repoData);
                    }
                )
            );
            console.log(
                `${greenCheck()}${kleur
                    .white()
                    .bold(" Using stored repositories:")} ${repos
                    .map((repo) => repo.name || "")
                    .join(", ")}`
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
                    type: "multiselect",
                    name: "selectedRepos",
                    message: "Pick repositories>",
                    choices: availableRepos.map((availableRepo) => {
                        return {
                            title: availableRepo.name || "",
                            value: availableRepo.uuid || "",
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
            betterPrCache.repositories = repos.map((repo) => repo.uuid || "");
            saveCache(betterPrCache);
        } else {
            sayGoodbye();
        }
        for (let repo of repos) {
            console.log(
                "\n" +
                    kleur.green().bold("[Open] ") +
                    kleur
                        .white()
                        .bold(`PRs for ${kleur.italic(repo.name || "")}`)
            );

            const { data: prData } =
                await bitbucket.repositories.listPullRequests({
                    repo_slug: repo.uuid || "",
                    state: "OPEN",
                    workspace: workspace.uuid || "",
                    pagelen: 50,
                });
            let openPrs = prData.values as Array<Schema.Pullrequest>;
            if (openPrs.length <= 0) {
                console.log(kleur.italic("No open PRs! 🎉"));
                continue;
            }
            const organizedPrs: Array<{
                pr: Schema.Pullrequest;
                order: number;
            }> = [];
            const load = loading({
                text: kleur.italic("Loading PRs..."),
                color: "magenta",
            }).start();
            for (let pr of openPrs) {
                const { data } = await bitbucket.repositories.getPullRequest({
                    pull_request_id: pr.id || 0,
                    repo_slug: repo.uuid || "",
                    workspace: workspace.uuid || "",
                });
                // Order:
                //   10 - Reviewer Unapproved
                //   20 - Reviewer Approved
                //   30 - Not Reviewer
                //   40 - Author with Changes
                //   50 - Author
                //   60 - WIP
                if (
                    data.title &&
                    data.title.toLocaleLowerCase().indexOf("[wip]") !== -1
                ) {
                    organizedPrs.push({
                        order: 60,
                        pr: data,
                    });
                } else if (data.author && data.author.uuid === user.uuid) {
                    if (
                        data.participants
                            ?.map((participant) => participant.state || "")
                            .some((state) => state === "changes_requested")
                    ) {
                        organizedPrs.push({
                            order: 40,
                            pr: data,
                        });
                    } else {
                        organizedPrs.push({
                            order: 50,
                            pr: data,
                        });
                    }
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
                    let prepend = "";
                    switch (organizedPr.order) {
                        case 10: {
                            // Reviewer Unapproved
                            prepend = redEx();
                            break;
                        }
                        case 20: {
                            // Reviewer Approved
                            prepend = greenCheck();
                            break;
                        }
                        case 30: {
                            // Not Reviewer
                            prepend = magentaQuestion();
                            break;
                        }
                        case 40: {
                            // Author with Changes
                            prepend = yellowTri();
                            break;
                        }
                        case 50: {
                            // Author
                            prepend = blueCircle();
                            break;
                        }
                        case 60: {
                            // WIP
                            prepend = " ";
                            break;
                        }
                        default: {
                            prepend = kleur.white("-");
                        }
                    }
                    load.stop();
                    const approvedCount = organizedPr.pr.participants?.reduce(
                        (prev, curr) => {
                            if (curr.role === "REVIEWER") {
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
                            (index > 0 ? "" : "\n") +
                                `${prepend} ` +
                                `${approvalText} ` +
                                makeLink(
                                    organizedPr.pr.title,
                                    organizedPr.pr.links?.html?.href || ""
                                )
                        );
                    }
                });
        }
    } catch (error) {
        errorMessage((error as any).message);
        betterPrCache = {};
        saveCache(betterPrCache);
    } finally {
        sayGoodbye();
        return;
    }
};

const makeLink = (text: string, url: string) => {
    const OSC = "\u001B]";
    const SEP = ";";
    const BEL = "\u0007";
    return [OSC, "8", SEP, SEP, url, BEL, text, OSC, "8", SEP, SEP, BEL].join(
        ""
    );
};

const passwordDecrypt = (cyphertext: BetterPrCachePassword) => {
    const decipher = crypto.createDecipheriv(
        algo,
        key,
        Buffer.from(cyphertext.iv, "hex")
    );
    const decrpyted = Buffer.concat([
        decipher.update(Buffer.from(cyphertext.content, "hex")),
        decipher.final(),
    ]);
    return decrpyted.toString();
};

const passwordEncrypt = (plaintext: string): BetterPrCachePassword => {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv(algo, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return {
        iv: iv.toString("hex"),
        content: encrypted.toString("hex"),
    };
};

const magentaQuestion = () => kleur.magenta("?");

const redEx = () => kleur.red("✖");

const sayGoodbye = () =>
    console.log(
        kleur.white().italic("\nGoodbye!"),
        redEx(),
        yellowTri(),
        greenCheck(),
        blueCircle(),
        magentaQuestion()
    );

const saveCache = (cache: BetterPrCache) =>
    fs.writeFileSync(cacheFilePath, JSON.stringify(cache));

const yellowTri = () => kleur.yellow("▲");

main();
