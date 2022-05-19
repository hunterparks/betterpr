import { Schema } from 'bitbucket';
import kleur from 'kleur';
import type { Color } from 'kleur';

export const errorMessage = (message: string) =>
    console.log(`${kleur.red().bold('Error:')} ${message}`);

export const icons = {
    blueCircle: () => kleur.blue('●'),
    greenCheck: () => kleur.green('✔'),
    magentaQuestion: () => kleur.magenta('?'),
    redEx: () => kleur.red('✖'),
    yellowTri: () => kleur.yellow('▲'),
};

export const makeLink = (text: string, url: string) => {
    const OSC = '\u001B]';
    const SEP = ';';
    const BEL = '\u0007';
    return [OSC, '8', SEP, SEP, url, BEL, text, OSC, '8', SEP, SEP, BEL].join(
        ''
    );
};

export const printHeader = (localVersion: string, name: string) => {
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
};

export const printNewVersionNotice = (npmVersion: string) => {
    console.log(
        kleur.italic(
            `\n${' '.repeat(6)}Version ${kleur.green(npmVersion)} available!`
        )
    );
    console.log(kleur.yellow('   npm up -g @hunterparks/betterpr'));
};

export const printRepoHeader = (repoName = '') =>
    console.log(
        `\n${kleur.bold(
            `${kleur.green('[Open]')} ${kleur.white(
                `PRs for ${kleur.italic(repoName)}`
            )}`
        )}`
    );

export const printRepoLine = (
    order: number,
    rawPr: Schema.Pullrequest
): string => {
    let prepend = '';
    switch (order) {
        case 10: {
            // Reviewer Unapproved
            prepend = icons.redEx();
            break;
        }
        case 20: {
            // Reviewer Approved
            prepend = icons.greenCheck();
            break;
        }
        case 30: {
            // Not Reviwer
            prepend = icons.magentaQuestion();
            break;
        }
        case 40: {
            // Author
            prepend = icons.blueCircle();
            break;
        }
        case 50: {
            // WIP
            prepend = ' ';
            break;
        }
        default: {
            prepend = '-';
        }
    }
    if (
        rawPr.participants?.some(
            (participant) => participant.state === 'changes_requested'
        )
    ) {
        prepend = `${icons.yellowTri()} ${prepend}`;
    } else {
        prepend = `  ${prepend}`;
    }
    const approvedCount = rawPr.participants?.reduce(
        (acc, participant) =>
            acc +
            (participant.role === 'REVIEWER' && participant.approved ? 1 : 0),
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
    return `${prepend} ${approvalText} ${makeLink(
        rawPr.title || '',
        rawPr.links?.html?.href || ''
    )}`;
};

export const printTotalLine = (
    color: Color,
    icon: string,
    count: number,
    needPadding: boolean,
    text: string
) =>
    console.log(
        color(
            `${icon} ${count < 10 && needPadding ? ` ${count}` : count} ${text}`
        )
    );

export const sayGoodbye = () =>
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
